/* eslint-disable @typescript-eslint/no-require-imports -- Babel loads this as CommonJS */
// Babel only parses TS/JSX and runs the StyleX compiler; SWC (via Turbopack)
// still does all other transforms. The same config is read by
// @stylexjs/postcss-plugin to extract the CSS, so class names always match.
const path = require("path");

// Turbopack may evaluate this file from a bundled context, so resolve from
// the project root rather than trusting __dirname.
const root = process.cwd();

module.exports = {
  presets: [["@babel/preset-typescript", { onlyRemoveTypeImports: true }]],
  plugins: [
    [
      "@stylexjs/babel-plugin",
      {
        dev: process.env.NODE_ENV === "development",
        runtimeInjection: false,
        treeshakeCompensation: true,
        // Mirror the tsconfig "@/*" path so theme imports resolve.
        aliases: { "@/*": [path.join(root, "src/*")] },
        unstable_moduleResolution: {
          type: "commonJS",
          rootDir: root,
        },
      },
    ],
  ],
};
