"use client";

import * as stylex from "@stylexjs/stylex";
import { ArrowRight, ClockCounterClockwise, FileDashed, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import useSWR, { useSWRConfig } from "swr";

import { ExportMenu } from "@/components/ExportMenu";
import { Markdown } from "@/components/Markdown";
import {
  AuthorBadge,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  print,
  Skeleton,
  SkeletonText,
  Tag,
  surface,
} from "@/components/ui";
import { api, ApiError, keys, type Page, type PageSummary } from "@/lib/api";
import { ago, fullDate } from "@/lib/time";
import { loginHref, useSession } from "@/lib/session";
import { useTitle } from "@/lib/useTitle";
import { editHref, headings, historyHref, newHref, pageHref } from "@/lib/wiki";
import { color, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";

const s = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [media.xl]: "minmax(0, 1fr) 240px" },
    gap: { default: 16, [media.md]: 24 },
    alignItems: "start",
  },
  article: {
    paddingBlock: { default: 22, [media.md]: 36, [media.print]: 0 },
    paddingInline: { default: 18, [media.md]: 40, [media.print]: 0 },
  },
  source: {
    marginBottom: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.hairlineStrong,
    fontSize: 10,
    color: color.textFaint,
  },
  meta: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 8 },
  metaText: { display: "inline-flex", alignItems: "center", gap: 6 },
  tags: { display: "flex", flexWrap: "wrap", gap: 6 },
  rail: {
    display: { default: "flex", [media.print]: "none" },
    flexDirection: "column",
    gap: 16,
    position: { default: "static", [media.xl]: "sticky" },
    top: 40,
  },
  toc: { display: { default: "none", [media.xl]: "block" } },
  railPanel: { padding: 18 },
  railTitle: { fontSize: 13, fontWeight: 600, color: color.textMuted, marginBottom: 10 },
  railList: { display: "flex", flexDirection: "column", gap: 2, listStyle: "none", padding: 0 },
  railLink: {
    display: "block",
    paddingBlock: 6,
    paddingInline: 8,
    marginInline: -8,
    borderRadius: radius.control,
    fontSize: 13.5,
    lineHeight: 1.4,
    color: { default: color.textMuted, ":hover": color.text },
    backgroundColor: { default: "transparent", ":hover": color.hover },
    textDecoration: "none",
  },
  railIndent: { paddingInlineStart: 20 },
  railEmpty: { fontSize: 13.5, color: color.textFaint, lineHeight: 1.5 },
  graphLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    fontSize: 13,
    fontWeight: 500,
    color: { default: color.accent, ":hover": color.accentHover },
    textDecoration: "none",
  },
  confirm: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    fontSize: 14,
    color: color.danger,
  },
  headSkel: { display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 },
});

export function WikiView() {
  const slug = useSearchParams().get("p") ?? "";
  const { data: page, error, mutate } = useSWR<Page>(slug ? keys.page(slug) : null);
  useTitle(page?.title ?? (error ? "Not found" : null));

  if (!slug) return <MissingPage slug="" />;
  if (error instanceof ApiError && error.status === 404) return <MissingPage slug={slug} />;
  if (error) return <ErrorState error={error} retry={() => mutate()} />;
  if (!page) return <Loading />;
  return <PageContent page={page} />;
}

function Loading() {
  return (
    <div aria-busy>
      <div {...stylex.props(s.headSkel)}>
        <Skeleton width="min(420px, 70%)" height={32} />
        <Skeleton width="220px" />
      </div>
      <div {...stylex.props(surface.paper, s.article)}>
        <SkeletonText lines={7} />
      </div>
    </div>
  );
}

function MissingPage({ slug }: { slug: string }) {
  const { canEdit } = useSession();
  const guess = slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <div {...stylex.props(surface.paper, s.article)}>
      <EmptyState
        icon={<FileDashed size={32} />}
        title={slug ? `There's no page called “${guess}” yet` : "No page selected"}
        action={
          slug ? (
            <LinkButton href={canEdit ? newHref(guess) : loginHref(newHref(guess))} variant="primary">
              <Plus weight="bold" />
              {canEdit ? "Create it" : "Log in to create it"}
            </LinkButton>
          ) : (
            <LinkButton href="/">Go home</LinkButton>
          )
        }
      >
        {slug ? "Write it now, or ask Claude to draft it through MCP." : null}
      </EmptyState>
    </div>
  );
}

/** Source URL and export time, visible only on paper / in the PDF. */
function PrintSource({ slug }: { slug: string }) {
  const [line, setLine] = useState("");
  useEffect(() => {
    // Filled at print time so the timestamp is the moment of export.
    const onBeforePrint = () =>
      flushSync(() => setLine(`${window.location.origin}${pageHref(slug)}  |  exported ${fullDate(Date.now() / 1000)}`));
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, [slug]);
  return <p {...stylex.props(print.only, s.source)}>{line}</p>;
}

function PageContent({ page }: { page: Page }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { canEdit } = useSession();
  const { data: backlinks } = useSWR<PageSummary[]>(keys.backlinks(page.slug));
  const toc = useMemo(() => headings(page.content), [page.content]);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deletePage(page.slug);
      await mutate((key) => typeof key === "string" && (key.startsWith("/pages") || key.startsWith("/recent")));
      router.push("/");
    } catch (e) {
      setDeleteError((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={page.title}
        sub={
          <div {...stylex.props(s.meta)}>
            <span {...stylex.props(s.metaText)} title={fullDate(page.updated_at)}>
              Updated {ago(page.updated_at)} by <AuthorBadge author={page.author} />
            </span>
            {page.tags.length > 0 && (
              <span {...stylex.props(s.tags)}>
                {page.tags.map((t) => (
                  <Tag key={t} tag={t} />
                ))}
              </span>
            )}
          </div>
        }
        actions={
          confirming ? (
            <div {...stylex.props(s.confirm)} role="group" aria-label="Confirm delete">
              {deleteError ?? "Delete this page? History is kept."}
              <Button size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" onClick={onDelete} disabled={deleting}>
                {deleting ? "Deleting" : "Delete"}
              </Button>
            </div>
          ) : (
            <>
              {canEdit && (
                <LinkButton href={editHref(page.slug)} variant="primary">
                  <PencilSimple />
                  Edit
                </LinkButton>
              )}
              <ExportMenu page={page} />
              <LinkButton href={historyHref(page.slug)}>
                <ClockCounterClockwise />
                History
              </LinkButton>
              {canEdit && (
                <Button variant="ghost" iconOnly aria-label="Delete page" onClick={() => setConfirming(true)}>
                  <Trash />
                </Button>
              )}
            </>
          )
        }
      />

      <div {...stylex.props(s.layout)}>
        <article {...stylex.props(surface.paper, s.article)}>
          <PrintSource slug={page.slug} />
          {page.content.trim() ? (
            <Markdown content={page.content} />
          ) : (
            <EmptyState
              title="This page is empty"
              action={
                canEdit && (
                  <LinkButton href={editHref(page.slug)} size="sm">
                    Start writing
                  </LinkButton>
                )
              }
            />
          )}
        </article>

        <aside {...stylex.props(s.rail)} aria-label="Page details">
          {toc.length >= 2 && (
            <nav aria-label="On this page" {...stylex.props(surface.glass, surface.rounded, s.railPanel, s.toc)}>
              <h2 {...stylex.props(s.railTitle)}>On this page</h2>
              <ul {...stylex.props(s.railList)}>
                {toc.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} {...stylex.props(s.railLink, h.depth === 3 && s.railIndent)}>
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <section {...stylex.props(surface.glass, surface.rounded, s.railPanel)}>
            <h2 {...stylex.props(s.railTitle)}>Linked from</h2>
            {!backlinks ? (
              <Skeleton width="60%" />
            ) : backlinks.length === 0 ? (
              <p {...stylex.props(s.railEmpty)}>No other page links here yet.</p>
            ) : (
              <ul {...stylex.props(s.railList)}>
                {backlinks.map((b) => (
                  <li key={b.slug}>
                    <Link href={pageHref(b.slug)} {...stylex.props(s.railLink)}>
                      {b.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/graph?p=${encodeURIComponent(page.slug)}`} {...stylex.props(s.graphLink)}>
              Show in graph <ArrowRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
