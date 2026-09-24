"use client";

import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Robot, User, WarningCircle } from "@phosphor-icons/react";

import { color, ease, font, radius, shadow } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";
import type { Author } from "@/lib/api";

/* ---------------------------------------------------------------- surfaces */

export const surface = stylex.create({
  // Frosted chrome: sidebar, bars, palette. Web glassmorphism approximation.
  glass: {
    backgroundColor: { default: color.glass, [media.reducedTransparency]: color.solid },
    backdropFilter: { default: "blur(22px) saturate(160%)", [media.reducedTransparency]: "none" },
    WebkitBackdropFilter: { default: "blur(22px) saturate(160%)", [media.reducedTransparency]: "none" },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.hairline,
    boxShadow: shadow.panel,
  },
  // Reading surface: barely translucent so body text keeps full contrast.
  paper: {
    backgroundColor: { default: color.paper, [media.reducedTransparency]: color.solid },
    backdropFilter: { default: "blur(28px) saturate(140%)", [media.reducedTransparency]: "none" },
    WebkitBackdropFilter: { default: "blur(28px) saturate(140%)", [media.reducedTransparency]: "none" },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.hairline, [media.print]: "transparent" },
    boxShadow: { default: shadow.panel, [media.print]: "none" },
    borderRadius: radius.panel,
  },
  float: {
    backgroundColor: { default: color.overlay, [media.reducedTransparency]: color.solid },
    boxShadow: shadow.float,
  },
  rounded: {
    borderRadius: radius.panel,
  },
});

/* ----------------------------------------------------------------- buttons */

const btn = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexShrink: 0,
    height: 36,
    paddingInline: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    fontFamily: font.sans,
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: "nowrap",
    textDecoration: "none",
    cursor: { default: "pointer", ":disabled": "default" },
    opacity: { default: 1, ":disabled": 0.5 },
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    transitionProperty: "background-color, color, border-color, transform",
    transitionDuration: { default: "160ms", [media.reducedMotion]: "0s" },
    transitionTimingFunction: ease.out,
    transform: { default: null, ":active": "translateY(1px) scale(0.98)", ":disabled": "none" },
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
  },
  sm: { height: 30, paddingInline: 10, fontSize: 13, gap: 6 },
  icon: { width: 36, paddingInline: 0 },
  iconSm: { width: 30, height: 30, paddingInline: 0 },
  primary: {
    backgroundColor: { default: color.accent, ":hover": color.accentHover },
    color: color.accentInk,
  },
  subtle: {
    backgroundColor: { default: color.field, ":hover": color.fieldHover },
    borderColor: color.hairline,
    color: color.text,
  },
  ghost: {
    backgroundColor: { default: "transparent", ":hover": color.hover },
    color: { default: color.textMuted, ":hover": color.text },
  },
  danger: {
    backgroundColor: { default: color.dangerSoft, ":hover": color.danger },
    color: { default: color.danger, ":hover": color.accentInk },
  },
});

type Variant = "primary" | "subtle" | "ghost" | "danger";
type BtnOpts = { variant?: Variant; size?: "md" | "sm"; iconOnly?: boolean; xstyle?: StyleXStyles };

function btnProps({ variant = "subtle", size = "md", iconOnly, xstyle }: BtnOpts) {
  return stylex.props(
    btn.base,
    size === "sm" && btn.sm,
    iconOnly && (size === "sm" ? btn.iconSm : btn.icon),
    btn[variant],
    xstyle,
  );
}

export function Button({
  variant,
  size,
  iconOnly,
  xstyle,
  ...rest
}: BtnOpts & Omit<ComponentProps<"button">, "className" | "style">) {
  return <button type="button" {...rest} {...btnProps({ variant, size, iconOnly, xstyle })} />;
}

export function LinkButton({
  variant,
  size,
  iconOnly,
  xstyle,
  ...rest
}: BtnOpts & Omit<ComponentProps<typeof Link>, "className" | "style">) {
  return <Link {...rest} {...btnProps({ variant, size, iconOnly, xstyle })} />;
}

/* ------------------------------------------------------------------ fields */

const fieldStyles = stylex.create({
  wrap: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  label: { fontSize: 13, fontWeight: 500, color: color.textMuted },
  help: { fontSize: 12.5, color: color.textFaint },
  error: { fontSize: 12.5, color: color.danger },
});

export const inputStyles = stylex.create({
  input: {
    width: "100%",
    minWidth: 0,
    height: 40,
    paddingInline: 12,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.hairlineStrong, ":focus": color.accent },
    backgroundColor: { default: color.field, ":hover": color.fieldHover, ":focus": color.fieldHover },
    color: color.text,
    fontSize: 15,
    outline: "none",
    boxShadow: { default: "none", ":focus": shadow.focus },
    transitionProperty: "border-color, box-shadow, background-color",
    transitionDuration: { default: "140ms", [media.reducedMotion]: "0s" },
    "::placeholder": { color: color.textFaint },
  },
  invalid: {
    borderColor: color.danger,
  },
});

export function Field({
  label,
  help,
  error,
  htmlFor,
  children,
}: {
  label: string;
  help?: ReactNode;
  error?: string | null;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(fieldStyles.wrap)}>
      <label htmlFor={htmlFor} {...stylex.props(fieldStyles.label)}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" {...stylex.props(fieldStyles.error)}>
          {error}
        </p>
      ) : help ? (
        <p {...stylex.props(fieldStyles.help)}>{help}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- tags, kbd */

const pill = stylex.create({
  tag: {
    display: "inline-flex",
    alignItems: "center",
    height: 24,
    paddingInline: 10,
    borderRadius: radius.pill,
    fontSize: 12.5,
    fontWeight: 500,
    textDecoration: "none",
    color: color.textMuted,
    backgroundColor: { default: color.hover, ":hover": color.active },
    transitionProperty: "background-color",
    transitionDuration: "140ms",
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
  },
  kbd: {
    display: "inline-flex",
    alignItems: "center",
    height: 20,
    paddingInline: 6,
    borderRadius: 6,
    fontFamily: font.mono,
    fontSize: 11,
    color: color.textFaint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.hairlineStrong,
  },
});

export function Tag({ tag, count }: { tag: string; count?: number }) {
  return (
    <Link href={`/tags?t=${encodeURIComponent(tag)}`} {...stylex.props(pill.tag)}>
      {tag}
      {count != null && <span {...stylex.props(meta.count)}>{count}</span>}
    </Link>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd {...stylex.props(pill.kbd)}>{children}</kbd>;
}

/* ------------------------------------------------------------------ author */

const meta = stylex.create({
  author: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 13,
    color: color.textMuted,
    whiteSpace: "nowrap",
  },
  claude: { color: color.accent, fontWeight: 500 },
  count: { marginInlineStart: 6, color: color.textFaint, fontVariantNumeric: "tabular-nums" },
});

export function AuthorBadge({ author }: { author: Author }) {
  const isClaude = author === "claude";
  return (
    <span {...stylex.props(meta.author, isClaude && meta.claude)}>
      {isClaude ? <Robot size={15} weight="bold" /> : <User size={15} />}
      {isClaude ? "Claude" : "You"}
    </span>
  );
}

/* --------------------------------------------------------- loading, states */

const pulse = stylex.keyframes({
  "0%": { opacity: 0.55 },
  "50%": { opacity: 1 },
  "100%": { opacity: 0.55 },
});

const skel = stylex.create({
  line: {
    height: 12,
    borderRadius: 6,
    backgroundColor: color.active,
    animationName: pulse,
    animationDuration: "1.6s",
    animationIterationCount: { default: "infinite", [media.reducedMotion]: "0" },
    animationTimingFunction: "ease-in-out",
  },
  width: (w: string) => ({ width: w }),
  height: (h: number) => ({ height: h }),
  stack: { display: "flex", flexDirection: "column", gap: 12 },
});

export function Skeleton({ width = "100%", height = 12 }: { width?: string; height?: number }) {
  return <div aria-hidden {...stylex.props(skel.line, skel.width(width), skel.height(height))} />;
}

export function SkeletonText({ lines = 4 }: { lines?: number }) {
  const widths = ["92%", "100%", "84%", "96%", "70%", "88%", "58%"];
  return (
    <div {...stylex.props(skel.stack)} aria-busy aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} />
      ))}
    </div>
  );
}

const state = stylex.create({
  box: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 12,
    paddingBlock: 8,
  },
  icon: { color: color.textFaint },
  title: { fontSize: 17, fontWeight: 600, color: color.text, letterSpacing: "-0.01em" },
  body: { fontSize: 14.5, lineHeight: 1.6, color: color.textMuted, maxWidth: "52ch" },
  errorIcon: { color: color.danger },
});

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div {...stylex.props(state.box)}>
      {icon && <div {...stylex.props(state.icon)}>{icon}</div>}
      <h2 {...stylex.props(state.title)}>{title}</h2>
      {children && <p {...stylex.props(state.body)}>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div role="alert" {...stylex.props(state.box)}>
      <div {...stylex.props(state.errorIcon)}>
        <WarningCircle size={28} />
      </div>
      <h2 {...stylex.props(state.title)}>Something went wrong</h2>
      <p {...stylex.props(state.body)}>{error.message}</p>
      {retry && (
        <Button size="sm" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ print */

// Only for elements without their own `display`; otherwise put the print
// condition in that element's display value (these would override it).
export const print = stylex.create({
  hide: { display: { default: null, [media.print]: "none" } },
  only: { display: { default: "none", [media.print]: "block" } },
});

/* ---------------------------------------------------------- page scaffold */

const layout = stylex.create({
  header: {
    display: "flex",
    flexDirection: { default: "column", [media.md]: "row" },
    alignItems: { default: "stretch", [media.md]: "flex-end" },
    justifyContent: "space-between",
    gap: 16,
    marginBottom: { default: 20, [media.md]: 28, [media.print]: 12 },
  },
  titles: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
  title: {
    fontSize: { default: 28, [media.md]: 36 },
    lineHeight: 1.1,
    fontWeight: 650,
    letterSpacing: "-0.025em",
    color: color.text,
    overflowWrap: "anywhere",
  },
  sub: { fontSize: 14.5, color: color.textMuted, lineHeight: 1.5 },
  actions: { display: { default: "flex", [media.print]: "none" }, gap: 8, flexWrap: "wrap" },
});

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header {...stylex.props(layout.header)}>
      <div {...stylex.props(layout.titles)}>
        <h1 {...stylex.props(layout.title)}>{title}</h1>
        {sub && <div {...stylex.props(layout.sub)}>{sub}</div>}
      </div>
      {actions && <div {...stylex.props(layout.actions)}>{actions}</div>}
    </header>
  );
}
