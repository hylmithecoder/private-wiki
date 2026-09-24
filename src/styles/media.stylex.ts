import * as stylex from "@stylexjs/stylex";

export const media = stylex.defineConsts({
  md: "@media (min-width: 768px)",
  lg: "@media (min-width: 1024px)",
  xl: "@media (min-width: 1280px)",
  reducedMotion: "@media (prefers-reduced-motion: reduce)",
  reducedTransparency: "@media (prefers-reduced-transparency: reduce)",
  hover: "@media (hover: hover)",
  print: "@media print",
});
