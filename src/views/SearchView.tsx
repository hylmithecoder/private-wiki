"use client";

import * as stylex from "@stylexjs/stylex";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { list } from "@/components/ListStyles";
import { Snippet } from "@/components/Snippet";
import { EmptyState, ErrorState, inputStyles, LinkButton, PageHeader, Skeleton, surface } from "@/components/ui";
import { keys, type SearchHit } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTitle } from "@/lib/useTitle";
import { newHref, pageHref } from "@/lib/wiki";
import { color } from "@/styles/tokens.stylex";

const s = stylex.create({
  form: { position: "relative", marginBottom: 20 },
  icon: {
    position: "absolute",
    left: 14,
    top: "50%",
    transform: "translateY(-50%)",
    color: color.textFaint,
    pointerEvents: "none",
  },
  input: { height: 48, paddingInlineStart: 42, fontSize: 16 },
  skel: { display: "flex", flexDirection: "column", gap: 10, padding: 12 },
});

export function SearchView() {
  const router = useRouter();
  const q = useSearchParams().get("q") ?? "";
  const { canEdit } = useSession();
  const [value, setValue] = useState(q);
  // Keep the field in sync when the query changes via navigation.
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setValue(q);
  }
  useTitle(q ? `Search: ${q}` : "Search");

  const { data, error, mutate } = useSWR<SearchHit[]>(q.trim() ? keys.search(q.trim()) : null);

  return (
    <>
      <PageHeader title="Search" />
      <form
        role="search"
        {...stylex.props(s.form)}
        onSubmit={(e) => {
          e.preventDefault();
          router.replace(`/search?q=${encodeURIComponent(value.trim())}`);
        }}
      >
        <MagnifyingGlass size={20} {...stylex.props(s.icon)} />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Search pages"
          placeholder="Search titles and content"
          enterKeyHint="search"
          autoFocus={!q}
          {...stylex.props(inputStyles.input, s.input)}
        />
      </form>

      {!q.trim() ? null : error ? (
        <ErrorState error={error} retry={() => mutate()} />
      ) : !data ? (
        <div {...stylex.props(surface.paper, s.skel)}>
          {[0, 1, 2].map((i) => (
            <div key={i} {...stylex.props(s.skel)}>
              <Skeleton width="40%" height={14} />
              <Skeleton width="90%" />
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div {...stylex.props(surface.paper, list.state)}>
          <EmptyState
            title={`No pages match “${q}”`}
            action={
              canEdit && (
                <LinkButton href={newHref(q)} variant="primary">
                  <Plus weight="bold" />
                  Create “{q}”
                </LinkButton>
              )
            }
          >
            Search matches the start of words in titles and page text.
          </EmptyState>
        </div>
      ) : (
        <div {...stylex.props(surface.paper, list.panel)}>
          {data.map((h) => (
            <Link key={h.slug} href={pageHref(h.slug)} {...stylex.props(list.row)}>
              <span {...stylex.props(list.title)}>{h.title}</span>
              <span {...stylex.props(list.body)}>
                <Snippet text={h.snippet} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
