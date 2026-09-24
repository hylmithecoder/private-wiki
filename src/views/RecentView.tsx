"use client";

import * as stylex from "@stylexjs/stylex";
import { Robot } from "@phosphor-icons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

import { list } from "@/components/ListStyles";
import { AuthorBadge, EmptyState, ErrorState, PageHeader, Skeleton, surface } from "@/components/ui";
import { keys, type Author, type Change } from "@/lib/api";
import { ago, dayLabel, fullDate } from "@/lib/time";
import { useTitle } from "@/lib/useTitle";
import { color, radius } from "@/styles/tokens.stylex";

const FILTERS: { label: string; author?: Author }[] = [
  { label: "Everyone" },
  { label: "Claude", author: "claude" },
  { label: "You", author: "human" },
];

const s = stylex.create({
  filters: {
    display: "inline-flex",
    padding: 3,
    gap: 2,
    borderRadius: radius.control,
    backgroundColor: color.hover,
  },
  filter: {
    display: "inline-flex",
    alignItems: "center",
    height: 30,
    paddingInline: 14,
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 500,
    textDecoration: "none",
    color: { default: color.textMuted, ":hover": color.text },
  },
  filterOn: { color: color.text, backgroundColor: color.fieldHover, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" },
  skel: { display: "flex", flexDirection: "column", gap: 10, padding: 12 },
});

function groupByDay(changes: Change[]) {
  const groups: { label: string; items: Change[] }[] = [];
  for (const c of changes) {
    const label = dayLabel(c.created_at);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(c);
    else groups.push({ label, items: [c] });
  }
  return groups;
}

export function RecentView() {
  const raw = useSearchParams().get("author");
  const author: Author | undefined = raw === "claude" || raw === "human" ? raw : undefined;
  const { data, error, mutate } = useSWR<Change[]>(keys.recent(author));
  useTitle(author === "claude" ? "Claude's edits" : "Recent changes");

  return (
    <>
      <PageHeader
        title={author === "claude" ? "Claude's edits" : "Recent changes"}
        sub={author === "claude" ? "Everything Claude changed through MCP. Open one to see the diff or restore." : undefined}
        actions={
          <nav aria-label="Filter by author" {...stylex.props(s.filters)}>
            {FILTERS.map((f) => (
              <Link
                key={f.label}
                href={f.author ? `/recent?author=${f.author}` : "/recent"}
                aria-current={f.author === author ? "page" : undefined}
                {...stylex.props(s.filter, f.author === author && s.filterOn)}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        }
      />
      {error ? (
        <ErrorState error={error} retry={() => mutate()} />
      ) : !data ? (
        <div {...stylex.props(surface.paper, s.skel)}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} {...stylex.props(s.skel)}>
              <Skeleton width="35%" height={14} />
              <Skeleton width="65%" />
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div {...stylex.props(surface.paper, list.state)}>
          <EmptyState icon={author === "claude" ? <Robot size={30} /> : undefined} title="No changes yet">
            {author === "claude"
              ? "When Claude creates or edits pages through the MCP server, they appear here."
              : "Changes appear here as pages are created and edited."}
          </EmptyState>
        </div>
      ) : (
        <div {...stylex.props(surface.paper, list.panel)}>
          {groupByDay(data).map((g, gi) => (
            <section key={g.label} aria-label={g.label}>
              <h2 {...stylex.props(list.group, gi === 0 && list.firstGroup)}>{g.label}</h2>
              {g.items.map((c) => (
                <Link
                  key={c.revision_id}
                  href={`/history?p=${encodeURIComponent(c.slug)}&r=${c.revision_id}`}
                  {...stylex.props(list.row)}
                >
                  <span {...stylex.props(list.top)}>
                    <span {...stylex.props(list.title)}>{c.title}</span>
                    <span {...stylex.props(list.time)} title={fullDate(c.created_at)}>
                      {ago(c.created_at)}
                    </span>
                  </span>
                  <span {...stylex.props(list.metaRow)}>
                    <AuthorBadge author={c.author} />
                    {c.summary && <span {...stylex.props(list.body)}>{c.summary}</span>}
                  </span>
                </Link>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
