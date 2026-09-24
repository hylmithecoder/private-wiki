import { createRequire } from "node:module";

// Turbopack bundles PostCSS plugins referenced by name, which breaks
// StyleX's theme-file resolution. Loading it through a runtime require
// keeps it as plain Node code.
const load = createRequire(`${process.cwd()}/`);
const stylex = load(["@stylexjs", "postcss-plugin"].join("/"));

const config = {
  plugins: [
    stylex({
      include: ["src/**/*.{ts,tsx}"],
      useCSSLayers: true,
    }),
  ],
};

export default config;
