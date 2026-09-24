import * as stylex from "@stylexjs/stylex";

// Dark applies to screens only, so print never inherits dark values
// (StyleX doesn't guarantee the order of competing at-rules).
const DARK = "@media screen and (prefers-color-scheme: dark)";
// Paper-specific values (white page, opaque surfaces).
const PRINT = "@media print";

// Forest palette: cool mist / deep pine neutrals, one amber accent.
// Glass is web frosted-glass (backdrop-filter), not Apple Liquid Glass.
export const color = stylex.defineVars({
  bg: { default: "#e6ebe7", [DARK]: "#0a0f0d", [PRINT]: "#ffffff" },
  text: { default: "#15201a", [DARK]: "#e4ebe6", [PRINT]: "#15201a" },
  textMuted: { default: "#46544c", [DARK]: "#a6b3ab", [PRINT]: "#46544c" },
  textFaint: { default: "#5f6d65", [DARK]: "#84928a", [PRINT]: "#5f6d65" },
  accent: { default: "#a35700", [DARK]: "#eeb04a", [PRINT]: "#a35700" },
  accentHover: { default: "#8a4900", [DARK]: "#f5c46d" },
  accentInk: { default: "#fffaf2", [DARK]: "#1c1204" },
  accentSoft: { default: "rgba(197, 118, 20, 0.14)", [DARK]: "rgba(238, 176, 74, 0.14)", [PRINT]: "rgba(197, 118, 20, 0.14)" },
  danger: { default: "#b3261e", [DARK]: "#f2877e", [PRINT]: "#b3261e" },
  dangerSoft: { default: "rgba(179, 38, 30, 0.10)", [DARK]: "rgba(242, 135, 126, 0.12)" },
  hairline: { default: "rgba(21, 42, 31, 0.10)", [DARK]: "rgba(255, 255, 255, 0.08)", [PRINT]: "rgba(21, 42, 31, 0.10)" },
  hairlineStrong: { default: "rgba(21, 42, 31, 0.18)", [DARK]: "rgba(255, 255, 255, 0.14)", [PRINT]: "rgba(21, 42, 31, 0.18)" },
  // Chrome glass (sidebar, bars, palette).
  glass: { default: "rgba(250, 252, 250, 0.56)", [DARK]: "rgba(20, 28, 25, 0.52)" },
  // Floating overlays (drawer, palette) sit over busy content, so denser.
  overlay: { default: "rgba(246, 249, 247, 0.9)", [DARK]: "rgba(17, 24, 21, 0.86)" },
  // Reading surface: mostly opaque so long text keeps full contrast.
  paper: { default: "rgba(252, 253, 252, 0.84)", [DARK]: "rgba(15, 21, 19, 0.80)", [PRINT]: "#ffffff" },
  // Fallback when the OS asks for reduced transparency.
  solid: { default: "#f7f9f7", [DARK]: "#121916" },
  edge: { default: "rgba(255, 255, 255, 0.75)", [DARK]: "rgba(255, 255, 255, 0.07)" },
  field: { default: "rgba(255, 255, 255, 0.62)", [DARK]: "rgba(0, 0, 0, 0.22)", [PRINT]: "rgba(255, 255, 255, 0.62)" },
  fieldHover: { default: "rgba(255, 255, 255, 0.85)", [DARK]: "rgba(0, 0, 0, 0.32)" },
  hover: { default: "rgba(21, 42, 31, 0.05)", [DARK]: "rgba(255, 255, 255, 0.05)", [PRINT]: "rgba(21, 42, 31, 0.05)" },
  active: { default: "rgba(21, 42, 31, 0.09)", [DARK]: "rgba(255, 255, 255, 0.09)" },
  scrim: { default: "rgba(18, 28, 23, 0.28)", [DARK]: "rgba(0, 0, 0, 0.55)" },
});

// Shadows are tinted to the pine hue, never pure black on light.
export const shadow = stylex.defineVars({
  panel: {
    default: "0 1px 0 rgba(255,255,255,0.7) inset, 0 12px 40px -12px rgba(30, 60, 45, 0.22)",
    [DARK]: "0 1px 0 rgba(255,255,255,0.06) inset, 0 16px 48px -16px rgba(0, 0, 0, 0.6)",
  },
  float: {
    default: "0 1px 0 rgba(255,255,255,0.8) inset, 0 24px 80px -20px rgba(24, 52, 38, 0.35)",
    [DARK]: "0 1px 0 rgba(255,255,255,0.08) inset, 0 28px 90px -20px rgba(0, 0, 0, 0.75)",
  },
  focus: {
    default: "0 0 0 3px rgba(197, 118, 20, 0.22)",
    [DARK]: "0 0 0 3px rgba(238, 176, 74, 0.22)",
  },
});

// Shape lock: panels 16, controls 10, tags / chips full pill.
export const radius = stylex.defineVars({
  panel: "16px",
  control: "10px",
  pill: "999px",
});

export const font = stylex.defineVars({
  sans: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
});

export const ease = stylex.defineVars({
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
});

// Syntax highlighting. Muted so code stays calm next to the one UI accent.
export const syntax = stylex.defineVars({
  keyword: { default: "#9a3f00", [DARK]: "#f0b45a", [PRINT]: "#9a3f00" },
  string: { default: "#2f6f3e", [DARK]: "#9fd49a", [PRINT]: "#2f6f3e" },
  number: { default: "#7a4a8c", [DARK]: "#d7a6e8", [PRINT]: "#7a4a8c" },
  comment: { default: "#6b7a72", [DARK]: "#7f8f86", [PRINT]: "#6b7a72" },
  function: { default: "#1f5f8b", [DARK]: "#8cc4f0", [PRINT]: "#1f5f8b" },
  type: { default: "#0f6b6b", [DARK]: "#7fd3c7", [PRINT]: "#0f6b6b" },
  attr: { default: "#8a5a00", [DARK]: "#e8c07a", [PRINT]: "#8a5a00" },
  meta: { default: "#6b5b95", [DARK]: "#b7a6e0", [PRINT]: "#6b5b95" },
  codeBg: { default: "rgba(250, 252, 250, 0.9)", [DARK]: "rgba(8, 12, 10, 0.55)", [PRINT]: "#f7f8f7" },
  codeHeader: { default: "rgba(21, 42, 31, 0.035)", [DARK]: "rgba(255, 255, 255, 0.03)", [PRINT]: "rgba(21, 42, 31, 0.035)" },
  lineNo: { default: "#9aa8a0", [DARK]: "#56645c", [PRINT]: "#9aa8a0" },
});
