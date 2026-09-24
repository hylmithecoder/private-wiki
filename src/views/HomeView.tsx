"use client";

import * as stylex from "@stylexjs/stylex";
import { ArrowRight, BookOpenText, MagnifyingGlass, Plus, Robot } from "@phosphor-icons/react";
import Link from "next/link";
import useSWR from "swr";

import { useOpenPalette } from "@/components/Shell";
import { AuthorBadge, EmptyState, ErrorState, Kbd, LinkButton, PageHeader, Skeleton, Tag, surface } from "@/components/ui";
import { keys, type Change, type PageSummary, type TagCount } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ago } from "@/lib/time";
import { newHref, pageHref } from "@/lib/wiki";
import { color, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";

const s = stylex.create({
  search: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    height: { default: 52, [media.md]: 58 },
    paddingInline: 18,
    marginBottom: { default: 24, [media.md]: 36 },
    borderRadius: radius.panel,
    fontSize: 16,
    color: color.textFaint,
    textAlign: "start",
    cursor: "text",
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
  },
  searchLabel: { flexGrow: 1 },
  kbdHint: { display: { default: "none", [media.md]: "inline-flex" } },
  grid: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [media.lg]: "minmax(0, 1.7fr) minmax(0, 1fr)" },
    gap: { default: 16, [media.md]: 20 },
    alignItems: "start",
  },
  panel: { padding: { default: 18, [media.md]: 24 } },
  side: { display: "flex", flexDirection: "column", gap: { default: 16, [media.md]: 20 } },
  sectionHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  h2: { fontSize: 15, fontWeight: 600, color: color.text },
  more: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    color: { default: color.textMuted, ":hover": color.accent },
    textDecoration: "none",
  },
  rows: { display: "flex", flexDirection: "column" },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    columnGap: 16,
    rowGap: 6,
    paddingBlock: 12,
    paddingInline: 10,
    marginInline: -10,
    borderRadius: radius.control,
    textDecoration: "none",
    color: color.text,
    backgroundColor: { default: "transparent", ":hover": color.hover },
    transitionProperty: "background-color",
    transitionDuration: "140ms",
  },
  rowTitle: { fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowTime: { fontSize: 13, color: color.textFaint, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  rowTags: { display: "flex", gap: 6, flexWrap: "wrap", gridColumn: "1 / -1" },
  miniTag: { fontSize: 12, color: color.textFaint },
  change: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingBlock: 10,
    paddingInline: 10,
    marginInline: -10,
    borderRadius: radius.control,
    textDecoration: "none",
    color: color.text,
    backgroundColor: { default: "transparent", ":hover": color.hover },
  },
  changeTitle: { fontSize: 14.5, fontWeight: 500 },
  changeSummary: { fontSize: 13.5, color: color.textMuted, lineHeight: 1.45 },
  changeTime: { fontSize: 12.5, color: color.textFaint },
  tags: { display: "flex", flexWrap: "wrap", gap: 6 },
  quiet: { fontSize: 14, color: color.textMuted, lineHeight: 1.55 },
  skelRows: { display: "flex", flexDirection: "column", gap: 22, paddingBlock: 10 },
});

export function HomeView() {
  const openPalette = useOpenPalette();
  const { canEdit } = useSession();
  const pages = useSWR<PageSummary[]>(keys.pages());
  const claude = useSWR<Change[]>(keys.recent("claude"));
  const tags = useSWR<TagCount[]>(keys.tags());

  const count = pages.data?.length;
  const last = pages.data?.[0];

  if (pages.data && pages.data.length === 0) {
    return (
      <>
        <PageHeader title="Your wiki" />
        <section {...stylex.props(surface.paper, s.panel)}>
          <EmptyState
            icon={<BookOpenText size={32} />}
            title="Nothing here yet"
            action={
              canEdit && (
                <LinkButton href={newHref()} variant="primary">
                  <Plus weight="bold" />
                  Create first page
                </LinkButton>
              )
            }
          >
            Write the first page yourself, or ask Claude to create one through the wiki MCP server. Link pages with
            [[Page Title]].
          </EmptyState>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Your wiki"
        sub={
          count == null ? (
            <Skeleton width="180px" />
          ) : (
            <>
              {count} {count === 1 ? "page" : "pages"}
              {last && `, last edited ${ago(last.updated_at)}`}
            </>
          )
        }
        actions={
          canEdit && (
            <LinkButton href={newHref()} variant="primary">
              <Plus weight="bold" />
              New page
            </LinkButton>
          )
        }
      />

      <button type="button" onClick={() => openPalette()} {...stylex.props(surface.glass, s.search)}>
        <MagnifyingGlass size={20} />
        <span {...stylex.props(s.searchLabel)}>Search pages</span>
        <span {...stylex.props(s.kbdHint)}>
          <Kbd>/</Kbd>
        </span>
      </button>

      <div {...stylex.props(s.grid)}>
        <section aria-labelledby="recent-h" {...stylex.props(surface.paper, s.panel)}>
          <div {...stylex.props(s.sectionHead)}>
            <h2 id="recent-h" {...stylex.props(s.h2)}>
              Recently updated
            </h2>
            <Link href="/recent" {...stylex.props(s.more)}>
              All changes <ArrowRight size={14} />
            </Link>
          </div>
          {pages.error ? (
            <ErrorState error={pages.error} retry={() => pages.mutate()} />
          ) : !pages.data ? (
            <div {...stylex.props(s.skelRows)}>
              {[70, 55, 80, 62, 48].map((w) => (
                <Skeleton key={w} width={`${w}%`} height={14} />
              ))}
            </div>
          ) : (
            <div {...stylex.props(s.rows)}>
              {pages.data.slice(0, 10).map((p) => (
                <Link key={p.slug} href={pageHref(p.slug)} {...stylex.props(s.row)}>
                  <span {...stylex.props(s.rowTitle)}>{p.title}</span>
                  <span {...stylex.props(s.rowTime)}>{ago(p.updated_at)}</span>
                  {p.tags.length > 0 && (
                    <span {...stylex.props(s.rowTags)}>
                      {p.tags.slice(0, 4).map((t) => (
                        <span key={t} {...stylex.props(s.miniTag)}>
                          #{t}
                        </span>
                      ))}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>

        <div {...stylex.props(s.side)}>
          <section aria-labelledby="claude-h" {...stylex.props(surface.glass, surface.rounded, s.panel)}>
            <div {...stylex.props(s.sectionHead)}>
              <h2 id="claude-h" {...stylex.props(s.h2)}>
                Claude&apos;s edits
              </h2>
              <Link href="/recent?author=claude" {...stylex.props(s.more)}>
                Review <ArrowRight size={14} />
              </Link>
            </div>
            {!claude.data ? (
              <div {...stylex.props(s.skelRows)}>
                <Skeleton width="80%" />
                <Skeleton width="60%" />
              </div>
            ) : claude.data.length === 0 ? (
              <p {...stylex.props(s.quiet)}>
                <Robot size={16} /> No edits from Claude yet. Its changes show up here so you can review them.
              </p>
            ) : (
              claude.data.slice(0, 5).map((c) => (
                <Link key={c.revision_id} href={`/history?p=${encodeURIComponent(c.slug)}&r=${c.revision_id}`} {...stylex.props(s.change)}>
                  <span {...stylex.props(s.changeTitle)}>{c.title}</span>
                  {c.summary && <span {...stylex.props(s.changeSummary)}>{c.summary}</span>}
                  <span {...stylex.props(s.changeTime)}>
                    <AuthorBadge author={c.author} /> {ago(c.created_at)}
                  </span>
                </Link>
              ))
            )}
          </section>

          {tags.data && tags.data.length > 0 && (
            <section aria-labelledby="tags-h" {...stylex.props(surface.glass, surface.rounded, s.panel)}>
              <div {...stylex.props(s.sectionHead)}>
                <h2 id="tags-h" {...stylex.props(s.h2)}>
                  Tags
                </h2>
              </div>
              <div {...stylex.props(s.tags)}>
                {tags.data.slice(0, 24).map((t) => (
                  <Tag key={t.tag} tag={t.tag} count={t.count} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
