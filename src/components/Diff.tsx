"use client";

import * as stylex from "@stylexjs/stylex";
import { diffLines } from "diff";
import { useMemo } from "react";

import { color, font, radius } from "@/styles/tokens.stylex";

type Line = { kind: "add" | "del" | "same"; text: string } | { kind: "skip"; count: number };

const CONTEXT = 3;

function toLines(before: string, after: string): Line[] {
  const out: Line[] = [];
  for (const part of diffLines(before, after)) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    const kind = part.added ? "add" : part.removed ? "del" : "same";
    if (kind !== "same") {
      lines.forEach((text) => out.push({ kind, text }));
      continue;
    }
    // Collapse long unchanged runs, keeping a few lines of context.
    if (lines.length > CONTEXT * 2 + 1) {
      const isFirst = out.length === 0;
      const head = isFirst ? [] : lines.slice(0, CONTEXT);
      const tail = lines.slice(-CONTEXT);
      head.forEach((text) => out.push({ kind, text }));
      out.push({ kind: "skip", count: lines.length - head.length - tail.length });
      tail.forEach((text) => out.push({ kind, text }));
    } else {
      lines.forEach((text) => out.push({ kind, text }));
    }
  }
  // Drop trailing context after the last change.
  const lastChange = out.findLastIndex((l) => l.kind === "add" || l.kind === "del");
  if (lastChange >= 0 && out.length - lastChange > CONTEXT + 1) {
    const hidden = out.slice(lastChange + 1 + CONTEXT);
    const count = hidden.reduce((n, l) => n + (l.kind === "skip" ? l.count : 1), 0);
    out.splice(lastChange + 1 + CONTEXT, hidden.length, { kind: "skip", count });
  }
  return out;
}

const s = stylex.create({
  root: {
    fontFamily: font.mono,
    fontSize: 13,
    lineHeight: 1.65,
    borderRadius: radius.control,
    overflowX: "auto",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.hairline,
    backgroundColor: color.field,
  },
  line: { display: "flex" },
  gutter: {
    flexShrink: 0,
    width: 28,
    textAlign: "center",
    userSelect: "none",
    color: color.textFaint,
  },
  // Wiki text is prose, so wrap long lines instead of scrolling sideways.
  text: { flexGrow: 1, minWidth: 0, paddingInlineEnd: 16, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  add: { backgroundColor: color.accentSoft },
  addGutter: { color: color.accent },
  del: { backgroundColor: color.dangerSoft, textDecorationLine: "line-through", textDecorationColor: color.hairlineStrong },
  delGutter: { color: color.danger },
  skip: {
    paddingBlock: 4,
    paddingInline: 12,
    fontFamily: font.sans,
    fontSize: 12.5,
    color: color.textFaint,
    backgroundColor: color.hover,
  },
  empty: { padding: 16, fontFamily: font.sans, color: color.textMuted, fontSize: 14 },
  stats: { display: "flex", gap: 12, fontSize: 13, marginBottom: 10 },
  plus: { color: color.accent, fontWeight: 600 },
  minus: { color: color.danger, fontWeight: 600 },
});

export function Diff({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => toLines(before, after), [before, after]);
  const added = lines.filter((l) => l.kind === "add").length;
  const removed = lines.filter((l) => l.kind === "del").length;

  return (
    <div>
      <div {...stylex.props(s.stats)}>
        <span {...stylex.props(s.plus)}>+{added}</span>
        <span {...stylex.props(s.minus)}>-{removed}</span>
        <span>lines</span>
      </div>
      <div {...stylex.props(s.root)} role="table" aria-label="Changes">
        {added + removed === 0 ? (
          <p {...stylex.props(s.empty)}>No changes to the text in this revision.</p>
        ) : (
          lines.map((l, i) =>
            l.kind === "skip" ? (
              <div key={i} {...stylex.props(s.skip)}>
                {l.count} unchanged {l.count === 1 ? "line" : "lines"}
              </div>
            ) : (
              <div key={i} role="row" {...stylex.props(s.line, l.kind === "add" && s.add, l.kind === "del" && s.del)}>
                <span
                  aria-label={l.kind === "add" ? "added" : l.kind === "del" ? "removed" : undefined}
                  {...stylex.props(s.gutter, l.kind === "add" && s.addGutter, l.kind === "del" && s.delGutter)}
                >
                  {l.kind === "add" ? "+" : l.kind === "del" ? "-" : ""}
                </span>
                <span {...stylex.props(s.text)}>{l.text || " "}</span>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
