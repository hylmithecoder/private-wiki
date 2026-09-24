"use client";

import * as stylex from "@stylexjs/stylex";
import { ArrowCounterClockwise, ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Diff } from "@/components/Diff";
import { Markdown } from "@/components/Markdown";
import { AuthorBadge, Button, ErrorState, LinkButton, PageHeader, Skeleton, SkeletonText, surface } from "@/components/ui";
import { api, keys, type Page, type Revision, type RevisionMeta } from "@/lib/api";
import { ago, fullDate } from "@/lib/time";
import { useSession } from "@/lib/session";
import { useTitle } from "@/lib/useTitle";
import { historyHref, pageHref } from "@/lib/wiki";
import { color, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";

const s = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [media.lg]: "320px minmax(0, 1fr)" },
    gap: { default: 16, [media.md]: 20 },
    alignItems: "start",
  },
  list: {
    order: { default: 2, [media.lg]: 1 },
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    position: { default: "static", [media.lg]: "sticky" },
    top: 40,
    maxHeight: { default: "none", [media.lg]: "calc(100dvh - 80px)" },
    overflowY: "auto",
  },
  item: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    paddingBlock: 10,
    paddingInline: 12,
    borderRadius: radius.control,
    textDecoration: "none",
    color: color.text,
    backgroundColor: { default: "transparent", ":hover": color.hover },
  },
  itemActive: { backgroundColor: { default: color.active, ":hover": color.active } },
  itemTop: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" },
  itemTime: { fontSize: 12.5, color: color.textFaint, whiteSpace: "nowrap" },
  itemSummary: { fontSize: 13.5, color: color.textMuted, lineHeight: 1.4 },
  current: {
    fontSize: 11.5,
    fontWeight: 600,
    color: color.accent,
    paddingInline: 7,
    paddingBlock: 2,
    borderRadius: radius.pill,
    backgroundColor: color.accentSoft,
  },
  detail: {
    order: { default: 1, [media.lg]: 2 },
    paddingBlock: { default: 18, [media.md]: 28 },
    paddingInline: { default: 16, [media.md]: 32 },
    minWidth: 0,
  },
  detailHead: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },
  detailTitle: { fontSize: 17, fontWeight: 600, marginBottom: 6 },
  detailMeta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 13.5, color: color.textMuted },
  tabs: { display: "flex", gap: 4, marginBottom: 14 },
  tab: {
    height: 30,
    paddingInline: 12,
    borderWidth: 0,
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 500,
    cursor: "pointer",
    color: color.textMuted,
    backgroundColor: { default: "transparent", ":hover": color.hover },
  },
  tabOn: { color: color.text, backgroundColor: { default: color.active, ":hover": color.active } },
  error: { color: color.danger, fontSize: 13.5 },
});

export function HistoryView() {
  const params = useSearchParams();
  const slug = params.get("p") ?? "";
  const { data: page } = useSWR<Page>(slug ? keys.page(slug) : null);
  const { data: revs, error, mutate } = useSWR<RevisionMeta[]>(slug ? keys.history(slug) : null);
  useTitle(page ? `History of ${page.title}` : "History");

  const selectedId = Number(params.get("r")) || revs?.[0]?.id;
  const index = revs?.findIndex((r) => r.id === selectedId) ?? -1;
  const selected = index >= 0 ? revs![index] : undefined;
  const previous = index >= 0 ? revs![index + 1] : undefined;

  return (
    <>
      <PageHeader
        title={page ? page.title : <Skeleton width="260px" height={30} />}
        sub={revs ? `${revs.length} ${revs.length === 1 ? "revision" : "revisions"}` : "History"}
        actions={
          <LinkButton href={pageHref(slug)} variant="ghost">
            <ArrowLeft />
            Back to page
          </LinkButton>
        }
      />
      {error ? (
        <ErrorState error={error} retry={() => mutate()} />
      ) : (
        <div {...stylex.props(s.layout)}>
          <nav aria-label="Revisions" {...stylex.props(surface.glass, surface.rounded, s.list)}>
            {!revs
              ? [0, 1, 2].map((i) => (
                  <div key={i} {...stylex.props(s.item)}>
                    <Skeleton width="50%" />
                    <Skeleton width="80%" />
                  </div>
                ))
              : revs.map((r, i) => (
                  <Link
                    key={r.id}
                    href={`${historyHref(slug)}&r=${r.id}`}
                    scroll={false}
                    aria-current={r.id === selectedId ? "true" : undefined}
                    {...stylex.props(s.item, r.id === selectedId && s.itemActive)}
                  >
                    <span {...stylex.props(s.itemTop)}>
                      <AuthorBadge author={r.author} />
                      {i === 0 ? (
                        <span {...stylex.props(s.current)}>Current</span>
                      ) : (
                        <span {...stylex.props(s.itemTime)} title={fullDate(r.created_at)}>
                          {ago(r.created_at)}
                        </span>
                      )}
                    </span>
                    <span {...stylex.props(s.itemSummary)}>{r.summary || "No summary"}</span>
                  </Link>
                ))}
          </nav>

          <section aria-label="Selected revision" {...stylex.props(surface.paper, s.detail)}>
            {selected ? (
              <RevisionDetail
                key={selected.id}
                slug={slug}
                meta={selected}
                previousId={previous?.id}
                isCurrent={index === 0}
              />
            ) : revs ? (
              <p>Revision not found.</p>
            ) : (
              <SkeletonText lines={6} />
            )}
          </section>
        </div>
      )}
    </>
  );
}

function RevisionDetail({
  slug,
  meta,
  previousId,
  isCurrent,
}: {
  slug: string;
  meta: RevisionMeta;
  previousId?: number;
  isCurrent: boolean;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { canEdit } = useSession();
  const [view, setView] = useState<"changes" | "content">("changes");
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: rev } = useSWR<Revision>(keys.revision(slug, meta.id));
  const { data: prev } = useSWR<Revision>(previousId ? keys.revision(slug, previousId) : null);

  async function restore() {
    setRestoring(true);
    setError(null);
    try {
      const page = await api.revert(slug, meta.id);
      await mutate(keys.page(slug), page, { revalidate: false });
      await mutate((key) => typeof key === "string" && /^\/(pages|recent|search)/.test(key));
      router.push(pageHref(slug));
    } catch (e) {
      setError((e as Error).message);
      setRestoring(false);
    }
  }

  const loading = !rev || (previousId != null && !prev);

  return (
    <>
      <div {...stylex.props(s.detailHead)}>
        <div>
          <h2 {...stylex.props(s.detailTitle)}>{meta.summary || (previousId ? "Edit" : "Page created")}</h2>
          <div {...stylex.props(s.detailMeta)}>
            <AuthorBadge author={meta.author} />
            <span>{fullDate(meta.created_at)}</span>
          </div>
        </div>
        {!isCurrent && canEdit && (
          <Button size="sm" onClick={restore} disabled={restoring}>
            <ArrowCounterClockwise />
            {restoring ? "Restoring" : "Restore this version"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" {...stylex.props(s.error)}>
          {error}
        </p>
      )}

      <div role="tablist" aria-label="View" {...stylex.props(s.tabs)}>
        {(["changes", "content"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={view === t}
            onClick={() => setView(t)}
            {...stylex.props(s.tab, view === t && s.tabOn)}
          >
            {t === "changes" ? "Changes" : "Content"}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonText lines={6} />
      ) : view === "changes" ? (
        <Diff before={prev?.content ?? ""} after={rev.content} />
      ) : (
        <Markdown content={rev.content} />
      )}
    </>
  );
}
