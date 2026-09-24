"use client";

import * as stylex from "@stylexjs/stylex";
import { FloppyDisk, Key, WarningCircle } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Markdown } from "@/components/Markdown";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  inputStyles,
  Kbd,
  LinkButton,
  Skeleton,
  SkeletonText,
  surface,
} from "@/components/ui";
import { api, ApiError, keys, type Page } from "@/lib/api";
import { loginHref, useSession } from "@/lib/session";
import { useTitle } from "@/lib/useTitle";
import { pageHref, slugify } from "@/lib/wiki";
import { color, font, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";

type Draft = { title: string; tags: string; content: string; summary: string };

const s = stylex.create({
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  heading: { fontSize: { default: 22, [media.md]: 26 }, fontWeight: 650, letterSpacing: "-0.02em" },
  barActions: { display: "flex", alignItems: "center", gap: 8 },
  saveHint: { display: { default: "none", [media.md]: "inline-flex" }, gap: 4, fontSize: 12.5, color: color.textFaint },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  meta: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [media.md]: "minmax(0, 3fr) minmax(0, 2fr)" },
    gap: 16,
    padding: { default: 16, [media.md]: 20 },
  },
  toggle: {
    display: { default: "inline-flex", [media.lg]: "none" },
    alignSelf: "flex-start",
    padding: 3,
    gap: 2,
    borderRadius: radius.control,
    backgroundColor: color.hover,
  },
  toggleBtn: {
    height: 30,
    paddingInline: 14,
    borderWidth: 0,
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 500,
    cursor: "pointer",
    color: color.textMuted,
    backgroundColor: "transparent",
  },
  toggleOn: { color: color.text, backgroundColor: color.fieldHover, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" },
  panes: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [media.lg]: "minmax(0, 1fr) minmax(0, 1fr)" },
    gap: 16,
  },
  pane: { minWidth: 0, display: "flex", flexDirection: "column" },
  hideMobile: { display: { default: "none", [media.lg]: "flex" } },
  textarea: {
    width: "100%",
    flexGrow: 1,
    minHeight: { default: "58dvh", [media.lg]: "calc(100dvh - 330px)" },
    padding: { default: 16, [media.md]: 20 },
    resize: "vertical",
    borderRadius: radius.panel,
    fontFamily: font.mono,
    fontSize: 14,
    lineHeight: 1.7,
    tabSize: 2,
  },
  preview: {
    minHeight: { default: "58dvh", [media.lg]: "calc(100dvh - 330px)" },
    maxHeight: { default: "none", [media.lg]: "calc(100dvh - 330px)" },
    overflowY: "auto",
    paddingBlock: 20,
    paddingInline: { default: 18, [media.md]: 28 },
  },
  previewEmpty: { color: color.textFaint, fontSize: 14.5 },
  paneLabel: { fontSize: 13, fontWeight: 500, color: color.textMuted, marginBottom: 6 },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: radius.panel,
    backgroundColor: color.dangerSoft,
    color: color.text,
    fontSize: 14,
    lineHeight: 1.5,
  },
  gate: { padding: { default: 20, [media.md]: 32 } },
  bannerIcon: { color: color.danger, flexShrink: 0, marginTop: 1 },
  bannerBody: { display: "flex", flexDirection: "column", gap: 10 },
  bannerActions: { display: "flex", gap: 8, flexWrap: "wrap" },
});

const EMPTY: Draft = { title: "", tags: "", content: "", summary: "" };

function draftFrom(page: Page): Draft {
  return { title: page.title, tags: page.tags.join(", "), content: page.content, summary: "" };
}

const parseTags = (tags: string) =>
  tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

export function EditView() {
  const params = useSearchParams();
  const slug = params.get("p");
  const newTitle = params.get("new");
  const { data: page, error, mutate } = useSWR<Page>(slug ? keys.page(slug) : null, {
    // The editor holds its own copy; don't let focus revalidation replace it.
    revalidateOnFocus: false,
  });

  const session = useSession();
  useTitle(slug ? (page ? `Editing ${page.title}` : "Editing") : "New page");

  if (!session.isLoading && !session.canEdit) {
    const here = slug ? `/edit?p=${encodeURIComponent(slug)}` : `/edit?new=${encodeURIComponent(newTitle ?? "")}`;
    return (
      <div {...stylex.props(surface.paper, s.gate)}>
        <EmptyState
          icon={<Key size={30} />}
          title="Log in to edit"
          action={
            <LinkButton href={loginHref(here)} variant="primary">
              Log in
            </LinkButton>
          }
        >
          Anyone can read this wiki, but creating and editing pages needs the admin key.
        </EmptyState>
      </div>
    );
  }

  if (slug && error) return <ErrorState error={error} retry={() => mutate()} />;
  if (slug && !page) {
    return (
      <div aria-busy {...stylex.props(s.form)}>
        <Skeleton width="200px" height={26} />
        <div {...stylex.props(surface.paper, s.preview)}>
          <SkeletonText lines={8} />
        </div>
      </div>
    );
  }
  // Key on the revision so a reload after a conflict starts a fresh draft.
  return (
    <Editor
      key={page ? `${page.slug}@${page.revision_id}` : `new:${newTitle}`}
      page={page ?? null}
      initial={page ? draftFrom(page) : { ...EMPTY, title: newTitle ?? "" }}
    />
  );
}

function Editor({ page, initial }: { page: Page | null; initial: Draft }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [draft, setDraft] = useState<Draft>(initial);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [stale, setStale] = useState<number | null>(null);
  const savedRef = useRef(false);

  const dirty =
    draft.title !== initial.title || draft.tags !== initial.tags || draft.content !== initial.content;

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty && !savedRef.current) e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const save = useCallback(
    async (baseRevision?: number) => {
      if (saving) return;
      if (!draft.title.trim()) {
        setTitleError("Give the page a title.");
        return;
      }
      setSaving(true);
      setError(null);
      setTitleError(null);
      try {
        const input = {
          title: draft.title,
          content: draft.content,
          tags: parseTags(draft.tags),
          summary: draft.summary.trim() || (page ? "" : "Create page"),
        };
        const saved = page
          ? await api.updatePage(page.slug, { ...input, base_revision_id: baseRevision ?? page.revision_id })
          : await api.createPage(input);
        savedRef.current = true;
        await mutate(keys.page(saved.slug), saved, { revalidate: false });
        await mutate((key) => typeof key === "string" && /^\/(pages\?|recent|tags|search)/.test(key));
        router.push(pageHref(saved.slug));
      } catch (e) {
        setSaving(false);
        if (e instanceof ApiError && e.needsLogin) {
          // Session expired; keep the draft on screen and offer a new tab to log in.
          setError(
            <>
              Your login expired, so this wasn&apos;t saved.{" "}
              <a href={loginHref("/")} target="_blank" rel="noopener">
                Log in again in a new tab
              </a>
              , then save here.
            </>,
          );
          mutate(keys.session(), { authenticated: false, writable: true }, { revalidate: true });
        } else if (e instanceof ApiError && e.isStale) {
          setStale(e.currentRevisionId);
        } else if (e instanceof ApiError && e.status === 409) {
          setTitleError("A page with this title already exists.");
        } else if (e instanceof ApiError && e.status === 400) {
          setError(e.message);
        } else {
          setError((e as Error).message);
        }
      }
    },
    [draft, page, saving, mutate, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const slugPreview = slugify(draft.title);
  const cancelHref = page ? pageHref(page.slug) : "/";

  return (
    <form
      {...stylex.props(s.form)}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div {...stylex.props(s.bar)}>
        <h1 {...stylex.props(s.heading)}>{page ? `Editing ${page.title}` : "New page"}</h1>
        <div {...stylex.props(s.barActions)}>
          <span {...stylex.props(s.saveHint)}>
            <Kbd>Ctrl</Kbd>
            <Kbd>S</Kbd>
          </span>
          <LinkButton href={cancelHref} variant="ghost">
            Cancel
          </LinkButton>
          <Button type="submit" variant="primary" disabled={saving || (!!page && !dirty)}>
            <FloppyDisk />
            {saving ? "Saving" : page ? "Save" : "Create"}
          </Button>
        </div>
      </div>

      {stale != null && page && (
        <div role="alert" {...stylex.props(s.banner)}>
          <WarningCircle size={20} {...stylex.props(s.bannerIcon)} />
          <div {...stylex.props(s.bannerBody)}>
            <span>
              This page changed while you were editing (revision {stale}). Someone, probably Claude, saved a newer
              version.
            </span>
            <div {...stylex.props(s.bannerActions)}>
              <LinkButton href={pageHref(page.slug)} target="_blank" size="sm">
                Open latest in new tab
              </LinkButton>
              <Button size="sm" variant="danger" onClick={() => save(stale)}>
                Overwrite with my version
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" {...stylex.props(s.banner)}>
          <WarningCircle size={20} {...stylex.props(s.bannerIcon)} />
          <span>{error}</span>
        </div>
      )}

      <div {...stylex.props(surface.glass, surface.rounded, s.meta)}>
        <Field
          label="Title"
          htmlFor="title"
          error={titleError}
          help={
            page ? (
              "Renaming keeps the page's address."
            ) : slugPreview ? (
              <>
                Address: <code>/wiki?p={slugPreview}</code>
              </>
            ) : (
              "Pages link to each other by title, like [[This Title]]."
            )
          }
        >
          <input
            id="title"
            value={draft.title}
            onChange={set("title")}
            autoFocus={!page}
            autoComplete="off"
            aria-invalid={!!titleError}
            {...stylex.props(inputStyles.input, titleError != null && inputStyles.invalid)}
          />
        </Field>
        <Field label="Tags" htmlFor="tags" help="Comma separated">
          <input
            id="tags"
            value={draft.tags}
            onChange={set("tags")}
            autoComplete="off"
            placeholder="rust, notes"
            {...stylex.props(inputStyles.input)}
          />
        </Field>
      </div>

      <div role="tablist" aria-label="Editor mode" {...stylex.props(s.toggle)}>
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            {...stylex.props(s.toggleBtn, tab === t && s.toggleOn)}
          >
            {t === "write" ? "Write" : "Preview"}
          </button>
        ))}
      </div>

      <div {...stylex.props(s.panes)}>
        <div {...stylex.props(s.pane, tab !== "write" && s.hideMobile)}>
          <label htmlFor="content" {...stylex.props(s.paneLabel)}>
            Content (Markdown)
          </label>
          <textarea
            id="content"
            value={draft.content}
            onChange={set("content")}
            autoFocus={!!page}
            spellCheck
            placeholder={"Write in Markdown.\n\nLink other pages with [[Page Title]]."}
            {...stylex.props(inputStyles.input, s.textarea)}
          />
        </div>
        <div {...stylex.props(s.pane, tab !== "preview" && s.hideMobile)}>
          <span aria-hidden {...stylex.props(s.paneLabel)}>
            Preview
          </span>
          <h2 {...stylex.props(s.srOnly)}>Preview</h2>
          <div {...stylex.props(surface.paper, s.preview)}>
            {draft.content.trim() ? (
              <Markdown content={draft.content} />
            ) : (
              <p {...stylex.props(s.previewEmpty)}>Nothing to preview yet.</p>
            )}
          </div>
        </div>
      </div>

      <div {...stylex.props(surface.glass, surface.rounded, s.meta)}>
        <Field label="Summary of changes" htmlFor="summary" help="Optional. Shown in the page history.">
          <input
            id="summary"
            value={draft.summary}
            onChange={set("summary")}
            autoComplete="off"
            placeholder={page ? "Fix typo in intro" : "Create page"}
            {...stylex.props(inputStyles.input)}
          />
        </Field>
      </div>
    </form>
  );
}
