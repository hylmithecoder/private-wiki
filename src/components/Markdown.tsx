"use client";

import * as stylex from "@stylexjs/stylex";
import Link from "next/link";
import { useMemo, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import useSWR from "swr";

import { keys, type PageSummary } from "@/lib/api";
import { CodeBlock, titleFromMeta } from "./CodeBlock";
import { expandWikilinks, slugify, uniqueId } from "@/lib/wiki";
import { color, font, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";

const s = stylex.create({
  root: {
    color: color.text,
    lineHeight: 1.72,
    overflowWrap: "break-word",
    maxWidth: { default: "72ch", [media.print]: "none" },
    fontSize: { default: 16, [media.md]: 16.5, [media.print]: 11.5 },
  },
  p: { marginTop: 0, marginBottom: "1em" },
  h2: {
    fontSize: { default: 21, [media.md]: 23 },
    lineHeight: 1.25,
    fontWeight: 650,
    letterSpacing: "-0.015em",
    marginTop: "1.8em",
    marginBottom: "0.6em",
    scrollMarginTop: 80,
    breakAfter: "avoid",
  },
  h3: {
    fontSize: 18,
    lineHeight: 1.3,
    fontWeight: 600,
    marginTop: "1.5em",
    marginBottom: "0.5em",
    scrollMarginTop: 80,
    breakAfter: "avoid",
  },
  h4: { fontSize: 16, fontWeight: 600, marginTop: "1.3em", marginBottom: "0.4em" },
  first: { marginTop: 0 },
  a: {
    color: color.accent,
    textDecorationLine: "underline",
    textDecorationThickness: "1px",
    textUnderlineOffset: "3px",
    textDecorationColor: { default: color.accentSoft, ":hover": color.accent },
    transitionProperty: "text-decoration-color",
    transitionDuration: "140ms",
  },
  // Wikilink to a page that doesn't exist yet: clicking it offers to create it.
  missing: {
    color: color.textMuted,
    textDecorationStyle: "dashed",
    textDecorationColor: { default: color.hairlineStrong, ":hover": color.textMuted },
  },
  list: { marginTop: 0, marginBottom: "1em", paddingInlineStart: "1.4em" },
  li: { marginBlock: "0.25em" },
  task: { listStyleType: "none", marginInlineStart: "-1.3em" },
  checkbox: { marginInlineEnd: 8, accentColor: color.accent, verticalAlign: "-2px" },
  quote: {
    marginTop: 0,
    marginBottom: "1em",
    marginInline: 0,
    paddingInlineStart: 16,
    borderInlineStartWidth: 3,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: color.accentSoft,
    color: color.textMuted,
  },
  code: {
    fontFamily: font.mono,
    fontSize: "0.87em",
    paddingInline: 5,
    paddingBlock: 1,
    borderRadius: 6,
    backgroundColor: color.hover,
  },
  pre: {
    marginTop: 0,
    marginBottom: "1.2em",
    padding: 16,
    borderRadius: radius.control,
    backgroundColor: color.field,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.hairline,
    overflowX: "auto",
    fontFamily: font.mono,
    fontSize: 13.5,
    lineHeight: 1.6,
  },
  tableWrap: { overflowX: "auto", marginTop: 0, marginBottom: "1.2em" },
  table: { borderCollapse: "collapse", fontSize: 14.5, minWidth: "100%" },
  th: {
    textAlign: "start",
    fontWeight: 600,
    paddingBlock: 8,
    paddingInline: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.hairlineStrong,
  },
  td: {
    breakInside: "avoid",
    paddingBlock: 8,
    paddingInline: 12,
    verticalAlign: "top",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.hairline,
  },
  hr: {
    marginBlock: "2em",
    borderWidth: 0,
    height: 1,
    backgroundColor: color.hairlineStrong,
  },
  img: { maxWidth: "100%", height: "auto", borderRadius: radius.control },
});

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  data?: { meta?: string | null };
  children?: HastNode[];
};

function hastText(node: HastNode): string {
  return node.type === "text" ? (node.value ?? "") : (node.children ?? []).map(hastText).join("");
}

function text(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(text).join("");
  if (children && typeof children === "object" && "props" in children) {
    return text((children.props as { children?: ReactNode }).children);
  }
  return "";
}

export function Markdown({ content }: { content: string }) {
  const { data: pages } = useSWR<PageSummary[]>(keys.pages());
  const existing = useMemo(() => (pages ? new Set(pages.map((p) => p.slug)) : null), [pages]);
  const source = useMemo(() => expandWikilinks(content), [content]);

  // Heading ids are assigned in document order, matching `headings()` in lib/wiki.
  const seen = new Map<string, number>();
  let headingIndex = 0;
  const heading = (Tag: "h2" | "h3") =>
    function Heading({ children }: ComponentProps<"h2">) {
      const first = headingIndex++ === 0;
      return (
        <Tag id={uniqueId(slugify(text(children)), seen)} {...stylex.props(s[Tag], first && s.first)}>
          {children}
        </Tag>
      );
    };

  const components: Components = {
    p: ({ children }) => <p {...stylex.props(s.p)}>{children}</p>,
    h1: heading("h2"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: ({ children }) => <h4 {...stylex.props(s.h4)}>{children}</h4>,
    a: ({ href = "", children }) => {
      if (href.startsWith("/wiki?p=")) {
        const slug = decodeURIComponent(href.slice("/wiki?p=".length));
        const missing = existing != null && !existing.has(slug);
        return (
          <Link
            href={href}
            title={missing ? "This page doesn't exist yet" : undefined}
            {...stylex.props(s.a, missing && s.missing)}
          >
            {children}
          </Link>
        );
      }
      const external = /^https?:\/\//.test(href);
      return (
        <a
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          {...stylex.props(s.a)}
        >
          {children}
        </a>
      );
    },
    ul: ({ children }) => <ul {...stylex.props(s.list)}>{children}</ul>,
    ol: ({ children, start }) => (
      <ol start={start} {...stylex.props(s.list)}>
        {children}
      </ol>
    ),
    li: ({ children, className }) => (
      <li {...stylex.props(s.li, className?.includes("task-list-item") && s.task)}>{children}</li>
    ),
    input: ({ type, checked }) =>
      type === "checkbox" ? (
        <input type="checkbox" checked={!!checked} disabled readOnly {...stylex.props(s.checkbox)} />
      ) : null,
    blockquote: ({ children }) => <blockquote {...stylex.props(s.quote)}>{children}</blockquote>,
    // Fenced code: ```lang title="file.ext" (or just ```lang file.ext).
    pre: ({ node, children }) => {
      const code = (node as HastNode | undefined)?.children?.find((c) => c.tagName === "code");
      if (!code) return <pre {...stylex.props(s.pre)}>{children}</pre>;
      const classes = Array.isArray(code.properties?.className) ? (code.properties.className as string[]) : [];
      const lang = classes.find((c) => c.startsWith("language-"))?.slice("language-".length) ?? null;
      return (
        <CodeBlock code={hastText(code).replace(/\n$/, "")} lang={lang} title={titleFromMeta(code.data?.meta)} />
      );
    },
    code: ({ children }) => <code {...stylex.props(s.code)}>{children}</code>,
    table: ({ children }) => (
      <div {...stylex.props(s.tableWrap)}>
        <table {...stylex.props(s.table)}>{children}</table>
      </div>
    ),
    th: ({ children }) => <th {...stylex.props(s.th)}>{children}</th>,
    td: ({ children }) => <td {...stylex.props(s.td)}>{children}</td>,
    hr: () => <hr {...stylex.props(s.hr)} />,
    img: ({ src, alt }) =>
      // eslint-disable-next-line @next/next/no-img-element
      typeof src === "string" ? <img src={src} alt={alt ?? ""} loading="lazy" {...stylex.props(s.img)} /> : null,
  };

  return (
    <div {...stylex.props(s.root)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
