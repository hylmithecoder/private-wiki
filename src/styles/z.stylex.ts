import * as stylex from "@stylexjs/stylex";

// The only z-index layers in the app.
export const z = stylex.defineConsts({
  sidebar: "20",
  topbar: "30",
  drawer: "40",
  palette: "50",
  grain: "60",
});
