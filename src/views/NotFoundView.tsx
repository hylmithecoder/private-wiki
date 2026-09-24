"use client";

import * as stylex from "@stylexjs/stylex";

import { EmptyState, LinkButton, surface } from "@/components/ui";
import { media } from "@/styles/media.stylex";

const s = stylex.create({
  box: { padding: { default: 20, [media.md]: 32 } },
});

export function NotFoundView() {
  return (
    <div {...stylex.props(surface.paper, s.box)}>
      <EmptyState title="This address doesn't exist" action={<LinkButton href="/">Go home</LinkButton>}>
        Pages live at /wiki?p=page-name. Use search to find the one you want.
      </EmptyState>
    </div>
  );
}
