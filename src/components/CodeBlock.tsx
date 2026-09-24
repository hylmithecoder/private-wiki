"use client";

import * as stylex from "@stylexjs/stylex";
import { Check, Copy, FileCode, TextAlignLeft } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { highlight, type TokenKind } from "@/lib/highlight";

export { titleFromMeta } from "@/lib/highlight";
import { color, font, radius, syntax } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";

const s = stylex.create({
  root: {
    marginTop: 0,
    marginBottom: "1.3em",
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.hairline,
    backgroundColor: syntax.codeBg,
    overflow: "hidden",
    breakInside: { default: "auto", [media.print]: "avoid" },
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    paddingInlineStart: 14,
    paddingInlineEnd: 6,
    backgroundColor: syntax.codeHeader,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.hairline,
    fontFamily: font.sans,
    fontSize: 12.5,
    color: color.textMuted,
  },
  label: { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, whiteSpace: "nowrap" },
  title: {
    fontFamily: font.mono,
    fontWeight: 400,
    color: color.textFaint,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  spacer: { flexGrow: 1 },
  tool: {
    display: { default: "inline-flex", [media.print]: "none" },
    alignItems: "center",
    gap: 5,
    height: 26,
    paddingInline: 8,
    borderWidth: 0,
    borderRadius: 6,
    fontFamily: font.sans,
    fontSize: 12,
    cursor: "pointer",
    color: { default: color.textMuted, ":hover": color.text },
    backgroundColor: { default: "transparent", ":hover": color.hover },
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: color.accent,
  },
  toolOn: { color: color.text, backgroundColor: color.hover },
  copied: { color: color.accent },
  toolText: { display: { default: "none", [media.md]: "inline" } },
  body: {
    overflowX: "auto",
    paddingBlock: 14,
    fontFamily: font.mono,
    fontSize: { default: 13, [media.md]: 13.5 },
    lineHeight: 1.65,
    tabSize: 4,
    color: color.text,
  },
  table: { display: "table", minWidth: "100%" },
  line: { display: "table-row" },
  lineNo: {
    display: "table-cell",
    width: "1%",
    paddingInlineStart: 14,
    paddingInlineEnd: 14,
    textAlign: "end",
    color: syntax.lineNo,
    userSelect: "none",
    fontVariantNumeric: "tabular-nums",
  },
  code: {
    display: "table-cell",
    paddingInlineEnd: 16,
    whiteSpace: { default: "pre", [media.print]: "pre-wrap" },
    overflowWrap: { default: "normal", [media.print]: "anywhere" },
  },
  codeNoNumbers: { paddingInlineStart: 16 },
  wrap: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  keyword: { color: syntax.keyword },
  string: { color: syntax.string },
  number: { color: syntax.number },
  comment: { color: syntax.comment, fontStyle: "italic" },
  function: { color: syntax.function },
  type: { color: syntax.type },
  attr: { color: syntax.attr },
  meta: { color: syntax.meta },
  tag: { color: syntax.function },
  addition: { color: syntax.string, backgroundColor: color.accentSoft },
  deletion: { color: color.danger, backgroundColor: color.dangerSoft },
});

const KIND_STYLE: Record<Exclude<TokenKind, "plain">, keyof typeof s> = {
  keyword: "keyword",
  string: "string",
  number: "number",
  comment: "comment",
  function: "function",
  type: "type",
  attr: "attr",
  meta: "meta",
  tag: "tag",
  addition: "addition",
  deletion: "deletion",
};

export function CodeBlock({ code, lang, title }: { code: string; lang?: string | null; title?: string | null }) {
  const { label, lines } = useMemo(() => highlight(code, lang), [code, lang]);
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const numbered = lines.length > 1;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable on plain http; nothing useful to do.
    }
  }

  return (
    <figure {...stylex.props(s.root)}>
      <figcaption {...stylex.props(s.header)}>
        <span {...stylex.props(s.label)}>
          <FileCode size={15} />
          {label}
        </span>
        {title && <span {...stylex.props(s.title)}>{title}</span>}
        <span {...stylex.props(s.spacer)} />
        <button
          type="button"
          onClick={() => setWrap((w) => !w)}
          aria-pressed={wrap}
          title="Wrap long lines"
          {...stylex.props(s.tool, wrap && s.toolOn)}
        >
          <TextAlignLeft size={15} />
          <span {...stylex.props(s.toolText)}>Wrap</span>
        </button>
        <button type="button" onClick={copy} title="Copy code" {...stylex.props(s.tool, copied && s.copied)}>
          {copied ? <Check size={15} weight="bold" /> : <Copy size={15} />}
          <span {...stylex.props(s.toolText)}>{copied ? "Copied" : "Copy"}</span>
          <span aria-live="polite" hidden>
            {copied ? "Copied to clipboard" : ""}
          </span>
        </button>
      </figcaption>
      <pre {...stylex.props(s.body)}>
        <code {...stylex.props(s.table)}>
          {lines.map((tokens, i) => (
            <span key={i} {...stylex.props(s.line)}>
              {numbered && (
                <span aria-hidden {...stylex.props(s.lineNo)}>
                  {i + 1}
                </span>
              )}
              <span {...stylex.props(s.code, !numbered && s.codeNoNumbers, wrap && s.wrap)}>
                {tokens.length === 0
                  ? " "
                  : tokens.map((t, j) =>
                      t.kind === "plain" ? (
                        t.text
                      ) : (
                        <span key={j} {...stylex.props(s[KIND_STYLE[t.kind]])}>
                          {t.text}
                        </span>
                      ),
                    )}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
