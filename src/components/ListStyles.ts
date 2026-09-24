import * as stylex from "@stylexjs/stylex";

import { color, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";

// Shared row styles for the search / recent / tag listings.
export const list = stylex.create({
  panel: {
    paddingBlock: { default: 8, [media.md]: 12 },
    paddingInline: { default: 8, [media.md]: 12 },
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    paddingBlock: 12,
    paddingInline: 12,
    borderRadius: radius.control,
    textDecoration: "none",
    color: color.text,
    backgroundColor: { default: "transparent", ":hover": color.hover },
    transitionProperty: "background-color",
    transitionDuration: "140ms",
  },
  top: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  title: { fontSize: 15, fontWeight: 550, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  time: { fontSize: 12.5, color: color.textFaint, whiteSpace: "nowrap", flexShrink: 0 },
  body: { fontSize: 14, lineHeight: 1.55, color: color.textMuted },
  metaRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: color.textFaint },
  group: {
    paddingInline: 12,
    paddingTop: 16,
    paddingBottom: 6,
    fontSize: 12.5,
    fontWeight: 600,
    color: color.textFaint,
  },
  firstGroup: { paddingTop: 6 },
  state: { padding: { default: 16, [media.md]: 20 } },
});
