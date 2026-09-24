"use client";

import * as stylex from "@stylexjs/stylex";
import { ArrowsOut, DownloadSimple, Graph as GraphIcon, Minus, Plus, X } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { EmptyState, ErrorState, Button, LinkButton, PageHeader, Skeleton, surface } from "@/components/ui";
import { WikiGraph, type GNode, type GraphHandle } from "@/components/WikiGraph";
import { keys, type GraphData } from "@/lib/api";
import { useTitle } from "@/lib/useTitle";
import { pageHref } from "@/lib/wiki";
import { color, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";

const s = stylex.create({
  controls: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  segment: { display: "inline-flex", padding: 3, gap: 2, borderRadius: radius.control, backgroundColor: color.hover },
  segBtn: {
    height: 30,
    paddingInline: 12,
    borderWidth: 0,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    color: { default: color.textMuted, ":hover": color.text },
    backgroundColor: "transparent",
  },
  segOn: { color: color.text, backgroundColor: color.fieldHover, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" },
  select: {
    height: 36,
    paddingInline: 10,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.hairlineStrong,
    backgroundColor: color.field,
    color: color.text,
    fontSize: 13.5,
  },
  check: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, color: color.textMuted, cursor: "pointer" },
  checkbox: { accentColor: color.accent, width: 16, height: 16 },
  focusChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 30,
    paddingInlineStart: 12,
    paddingInlineEnd: 4,
    borderRadius: radius.pill,
    backgroundColor: color.accentSoft,
    color: color.text,
    fontSize: 13,
    fontWeight: 500,
  },
  chipX: {
    display: "grid",
    placeItems: "center",
    width: 22,
    height: 22,
    borderWidth: 0,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
    color: color.textMuted,
    cursor: "pointer",
  },
  spacer: { flexGrow: 1 },
  panel: {
    position: "relative",
    height: { default: "68dvh", [media.lg]: "calc(100dvh - 240px)" },
    minHeight: 380,
    overflow: "hidden",
  },
  tools: {
    position: "absolute",
    right: 12,
    top: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  legend: {
    position: "absolute",
    left: 14,
    bottom: 12,
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    paddingBlock: 6,
    paddingInline: 10,
    borderRadius: radius.control,
    fontSize: 12,
    color: color.textMuted,
  },
  key: { display: "inline-flex", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: color.textMuted },
  dotFocus: { backgroundColor: color.accent },
  dotMissing: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: color.textFaint,
  },
  hint: { fontSize: 13, color: color.textFaint, marginTop: 10 },
});

type Depth = 1 | 2 | 0;

/** Downloads the current graph as a standalone SVG (styles inlined). */
function downloadSvg(svg: SVGSVGElement, name: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll("*");
  const dst = clone.querySelectorAll("*");
  const props = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-family", "font-size", "font-style", "paint-order", "stroke-linejoin"];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const target = dst[i] as SVGElement;
    target.removeAttribute("class");
    for (const p of props) target.style.setProperty(p, cs.getPropertyValue(p));
  });
  const { width, height } = svg.getBoundingClientRect();
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.removeAttribute("class");
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", getComputedStyle(svg.parentElement!).backgroundColor || "#ffffff");
  clone.insertBefore(bg, clone.firstChild);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.svg` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GraphView() {
  const router = useRouter();
  const params = useSearchParams();
  const focus = params.get("p");
  const { data, error, mutate } = useSWR<GraphData>(keys.graph());
  const [depth, setDepth] = useState<Depth>(focus ? 1 : 0);
  const [tag, setTag] = useState("");
  const [showMissing, setShowMissing] = useState(false);
  const graph = useRef<GraphHandle>(null);
  useTitle("Graph");

  const tags = useMemo(() => [...new Set(data?.nodes.flatMap((n) => n.tags) ?? [])].sort(), [data]);

  const view = useMemo(() => {
    if (!data) return null;
    const existing = new Map(data.nodes.map((n) => [n.slug, n]));
    let links = data.links.filter((l) => showMissing || existing.has(l.to));
    let ids = new Set<string>([...existing.keys(), ...links.map((l) => l.to)]);

    if (tag) {
      const tagged = new Set(data.nodes.filter((n) => n.tags.includes(tag)).map((n) => n.slug));
      links = links.filter((l) => tagged.has(l.from) && (tagged.has(l.to) || !existing.has(l.to)));
      ids = new Set([...tagged, ...links.map((l) => l.to)]);
    }

    // Local graph: everything within `depth` hops of the focused page.
    if (focus && depth > 0 && ids.has(focus)) {
      const adj = new Map<string, string[]>();
      for (const l of links) {
        adj.set(l.from, [...(adj.get(l.from) ?? []), l.to]);
        adj.set(l.to, [...(adj.get(l.to) ?? []), l.from]);
      }
      const keep = new Set([focus]);
      let frontier = [focus];
      for (let d = 0; d < depth; d++) {
        frontier = frontier.flatMap((id) => adj.get(id) ?? []).filter((id) => !keep.has(id) && keep.add(id));
      }
      ids = keep;
      links = links.filter((l) => keep.has(l.from) && keep.has(l.to));
    }

    const degree = new Map<string, number>();
    for (const l of links) {
      degree.set(l.from, (degree.get(l.from) ?? 0) + 1);
      degree.set(l.to, (degree.get(l.to) ?? 0) + 1);
    }
    const nodes: GNode[] = [...ids].map((id) => ({
      id,
      title: existing.get(id)?.title ?? id.replace(/-/g, " "),
      missing: !existing.has(id),
      degree: degree.get(id) ?? 0,
      focus: id === focus,
    }));
    const orphans = nodes.filter((n) => !n.missing && n.degree === 0).length;
    return { nodes, links: links.map((l) => ({ source: l.from, target: l.to })), orphans };
  }, [data, tag, showMissing, focus, depth]);

  const focusTitle = data?.nodes.find((n) => n.slug === focus)?.title ?? focus;

  return (
    <>
      <PageHeader
        title="Graph"
        sub={
          view ? (
            <>
              {view.nodes.filter((n) => !n.missing).length} pages, {view.links.length} links
              {view.orphans > 0 && `, ${view.orphans} without links`}
            </>
          ) : (
            <Skeleton width="160px" />
          )
        }
      />

      <div {...stylex.props(s.controls)}>
        {focus && (
          <>
            <span {...stylex.props(s.focusChip)}>
              Around: {focusTitle}
              <button
                type="button"
                aria-label="Show the whole wiki"
                onClick={() => router.replace("/graph")}
                {...stylex.props(s.chipX)}
              >
                <X size={14} />
              </button>
            </span>
            <div role="group" aria-label="Distance from page" {...stylex.props(s.segment)}>
              {([1, 2, 0] as Depth[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={depth === d}
                  onClick={() => setDepth(d)}
                  {...stylex.props(s.segBtn, depth === d && s.segOn)}
                >
                  {d === 0 ? "All" : `${d} ${d === 1 ? "step" : "steps"}`}
                </button>
              ))}
            </div>
          </>
        )}
        {tags.length > 0 && (
          <select
            aria-label="Filter by tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            {...stylex.props(s.select)}
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        )}
        <label {...stylex.props(s.check)}>
          <input
            type="checkbox"
            checked={showMissing}
            onChange={(e) => setShowMissing(e.target.checked)}
            {...stylex.props(s.checkbox)}
          />
          Unwritten pages
        </label>
      </div>

      {error ? (
        <ErrorState error={error} retry={() => mutate()} />
      ) : !view ? (
        <div {...stylex.props(surface.paper, s.panel)} aria-busy />
      ) : view.nodes.length === 0 ? (
        <div {...stylex.props(surface.paper)}>
          <div style={{ padding: 24 }}>
            <EmptyState
              icon={<GraphIcon size={30} />}
              title="Nothing to map yet"
              action={<LinkButton href="/">Go home</LinkButton>}
            >
              Pages appear here once they exist; links between them come from [[Page Title]] in the text.
            </EmptyState>
          </div>
        </div>
      ) : (
        <>
          <div {...stylex.props(surface.paper, s.panel)}>
            <WikiGraph
              ref={graph}
              nodes={view.nodes}
              links={view.links}
              onOpen={(slug) => router.push(pageHref(slug))}
            />
            <div {...stylex.props(s.tools)}>
              <Button iconOnly size="sm" aria-label="Zoom in" onClick={() => graph.current?.zoomBy(1.4)}>
                <Plus size={16} />
              </Button>
              <Button iconOnly size="sm" aria-label="Zoom out" onClick={() => graph.current?.zoomBy(1 / 1.4)}>
                <Minus size={16} />
              </Button>
              <Button iconOnly size="sm" aria-label="Fit to screen" onClick={() => graph.current?.fit()}>
                <ArrowsOut size={16} />
              </Button>
              <Button
                iconOnly
                size="sm"
                aria-label="Download as SVG"
                title="Download as SVG (for docs)"
                onClick={() => {
                  const svg = graph.current?.svg();
                  if (svg) downloadSvg(svg, focus ? `graph-${focus}` : "wiki-graph");
                }}
              >
                <DownloadSimple size={16} />
              </Button>
            </div>
            <div {...stylex.props(surface.glass, s.legend)} aria-hidden>
              <span {...stylex.props(s.key)}>
                <span {...stylex.props(s.dot)} /> Page
              </span>
              {focus && (
                <span {...stylex.props(s.key)}>
                  <span {...stylex.props(s.dot, s.dotFocus)} /> This page
                </span>
              )}
              {showMissing && (
                <span {...stylex.props(s.key)}>
                  <span {...stylex.props(s.dot, s.dotMissing)} /> Not written yet
                </span>
              )}
            </div>
          </div>
          <p {...stylex.props(s.hint)}>
            Hover a page to see its links, drag to rearrange, scroll or pinch to zoom, click to open.
          </p>
        </>
      )}
    </>
  );
}
