import * as stylex from "@stylexjs/stylex";
import { Fragment } from "react";

import { color } from "@/styles/tokens.stylex";

const s = stylex.create({
  mark: {
    backgroundColor: color.accentSoft,
    color: color.text,
    borderRadius: 3,
    paddingInline: 1,
  },
});

/** Strips the Markdown syntax that would otherwise show up raw in excerpts. */
function plain(md: string) {
  return md
    .replace(/```\w*/g, " ")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[|\]\]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)#{1,6}\s/g, "$1")
    .replace(/[`*_>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Renders a search snippet whose matches are wrapped in \u0002 ... \u0003. */
export function Snippet({ text }: { text: string }) {
  const parts = plain(text).split(/\u0002|\u0003/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} {...stylex.props(s.mark)}>
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
