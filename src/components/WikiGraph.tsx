"use client";

import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { drag } from "d3-drag";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import "d3-transition"; // adds selection.transition()
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { useReducedMotion } from "motion/react";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

import { color, font } from "@/styles/tokens.stylex";

export type GNode = SimulationNodeDatum & {
  id: string;
  title: string;
  missing: boolean;
  degree: number;
  focus: boolean;
};
type GLink = SimulationLinkDatum<GNode> & { source: string | GNode; target: string | GNode };

export type GraphHandle = { zoomBy: (k: number) => void; fit: () => void; svg: () => SVGSVGElement | null };

const s = stylex.create({
  svg: { display: "block", width: "100%", height: "100%", cursor: "grab", touchAction: "none" },
  link: { stroke: color.hairlineStrong, strokeWidth: 1.2, transitionProperty: "opacity, stroke", transitionDuration: "150ms" },
  linkHot: { stroke: color.accent, strokeWidth: 1.8 },
  node: { fill: color.textMuted, stroke: color.paper, strokeWidth: 1.5, cursor: "pointer" },
  nodeFocus: { fill: color.accent },
  nodeMissing: { fill: color.paper, stroke: color.textFaint, strokeDasharray: "2.5 2" },
  nodeHot: { fill: color.accent },
  label: {
    fill: color.text,
    fontFamily: font.sans,
    fontSize: 11,
    pointerEvents: "none",
    paintOrder: "stroke",
    stroke: color.paper,
    strokeWidth: 3,
    strokeLinejoin: "round",
  },
  labelMissing: { fill: color.textFaint, fontStyle: "italic" },
  dim: { opacity: 0.12 },
});

const cls = (...styles: Array<StyleXStyles | false | null | undefined>) =>
  stylex.props(...styles).className ?? "";

export function WikiGraph({
  nodes,
  links,
  onOpen,
  ref,
}: {
  nodes: GNode[];
  links: GLink[];
  onOpen: (slug: string) => void;
  ref?: Ref<GraphHandle>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const reduce = useReducedMotion();
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  }, [onOpen]);

  useImperativeHandle(ref, () => ({
    zoomBy: (k) => {
      if (svgRef.current && zoomRef.current) select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, k);
    },
    fit: () => fitRef.current(),
    svg: () => svgRef.current,
  }));

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const { width, height } = svgEl.getBoundingClientRect();
    const svg = select(svgEl);
    svg.selectAll("*").remove();

    // Copies: d3 mutates nodes/links in place.
    const N: GNode[] = nodes.map((n) => ({ ...n }));
    const L: GLink[] = links.map((l) => ({ ...l }));
    const neighbors = new Map<string, Set<string>>();
    for (const l of L) {
      const a = l.source as string, b = l.target as string;
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
    const radius = (n: GNode) => 4 + Math.sqrt(n.degree) * 2.4 + (n.focus ? 3 : 0);

    const root = svg.append("g");
    const linkSel = root
      .append("g")
      .selectAll("line")
      .data(L)
      .join("line")
      .attr("class", cls(s.link));
    const nodeSel = root
      .append("g")
      .selectAll<SVGCircleElement, GNode>("circle")
      .data(N)
      .join("circle")
      .attr("r", radius)
      .attr("class", (d) => cls(s.node, d.focus && s.nodeFocus, d.missing && s.nodeMissing));
    nodeSel.append("title").text((d) => (d.missing ? `${d.title} (not written yet)` : d.title));
    const labelSel = root
      .append("g")
      .selectAll<SVGTextElement, GNode>("text")
      .data(N)
      .join("text")
      .text((d) => d.title)
      .attr("text-anchor", "middle")
      .attr("class", (d) => cls(s.label, d.missing && s.labelMissing));

    // Labels get noisy on big graphs: show them when zoomed in, for hubs,
    // and for whatever is focused or hovered.
    let scale = 1;
    const labelVisible = (d: GNode) => N.length <= 40 || d.focus || d.degree >= 4 || scale >= 1.4;
    const refreshLabels = () => labelSel.attr("display", (d) => (labelVisible(d) ? null : "none"));

    const sim = forceSimulation(N)
      .force(
        "link",
        forceLink<GNode, GLink>(L)
          .id((d) => d.id)
          .distance(95)
          .strength(0.5),
      )
      .force("charge", forceManyBody().strength(-340))
      .force("center", forceCenter(width / 2, height / 2))
      // Stronger pull keeps unlinked pages from drifting to the far edges.
      .force("x", forceX(width / 2).strength(0.08))
      .force("y", forceY(height / 2).strength(0.08))
      // Leave room for the label under each node.
      .force("collide", forceCollide<GNode>().radius((d) => radius(d) + Math.min(d.title.length * 3, 45)));

    const render = () => {
      linkSel
        .attr("x1", (d) => (d.source as GNode).x!)
        .attr("y1", (d) => (d.source as GNode).y!)
        .attr("x2", (d) => (d.target as GNode).x!)
        .attr("y2", (d) => (d.target as GNode).y!);
      nodeSel.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      labelSel.attr("x", (d) => d.x!).attr("y", (d) => d.y! + radius(d) + 13);
    };

    const zb = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on("zoom", (e) => {
        root.attr("transform", e.transform.toString());
        scale = e.transform.k;
        refreshLabels();
      });
    zoomRef.current = zb;
    svg.call(zb).on("dblclick.zoom", null);

    fitRef.current = () => {
      if (!N.length) return;
      const xs = N.map((n) => n.x ?? 0), ys = N.map((n) => n.y ?? 0);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      // Room for labels: they hang below nodes and can be wide.
      const padX = 160, padTop = 40, padBottom = 70;
      const k = Math.min(2, (width - padX) / Math.max(x1 - x0, 1), (height - padTop - padBottom) / Math.max(y1 - y0, 1));
      const t = zoomIdentity
        .translate(width / 2 - (k * (x0 + x1)) / 2, (height + padTop - padBottom) / 2 - (k * (y0 + y1)) / 2)
        .scale(k);
      svg.transition().duration(reduce ? 0 : 400).call(zb.transform, t);
    };

    // Hover: highlight a node's direct neighbourhood.
    const setHot = (id: string | null) => {
      const near = id ? neighbors.get(id) ?? new Set() : null;
      const on = (n: string) => !near || n === id || near.has(n);
      nodeSel.attr("class", (d) =>
        cls(s.node, d.focus && s.nodeFocus, d.missing && s.nodeMissing, d.id === id && s.nodeHot, !on(d.id) && s.dim),
      );
      labelSel
        .attr("class", (d) => cls(s.label, d.missing && s.labelMissing, !on(d.id) && s.dim))
        .attr("display", (d) => (labelVisible(d) || (near && on(d.id)) ? null : "none"));
      linkSel.attr("class", (d) => {
        const a = (d.source as GNode).id, b = (d.target as GNode).id;
        const hot = !!id && (a === id || b === id);
        return cls(s.link, hot && s.linkHot, !!id && !hot && s.dim);
      });
    };
    nodeSel
      .on("pointerenter", (_, d) => setHot(d.id))
      .on("pointerleave", () => setHot(null))
      .on("click", (e, d) => {
        if (!e.defaultPrevented) openRef.current(d.id);
      });

    nodeSel.call(
      drag<SVGCircleElement, GNode>()
        .on("start", (e, d) => {
          if (!e.active && !reduce) sim.alphaTarget(0.25).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
          if (reduce) {
            d.x = e.x;
            d.y = e.y;
            render();
          }
        })
        .on("end", (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    // Settle most of the layout up front so the first paint isn't chaos.
    sim.stop();
    sim.tick(reduce ? 300 : 120);
    render();
    refreshLabels();
    fitRef.current();
    if (!reduce) {
      // Short, gentle settle; stopping at a higher alphaMin means the layout
      // goes fully still after a few seconds instead of creeping for ages.
      sim.alphaMin(0.02).on("tick", render).alpha(0.2).restart();
    }
    return () => {
      sim.stop();
    };
  }, [nodes, links, reduce]);

  return <svg ref={svgRef} role="img" aria-label="Graph of pages and the links between them" {...stylex.props(s.svg)} />;
}
