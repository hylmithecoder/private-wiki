"use client";

import * as stylex from "@stylexjs/stylex";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, FileText, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";

import { keys, type PageSummary, type SearchHit } from "@/lib/api";
import { newHref, pageHref, slugify } from "@/lib/wiki";
import { useSession } from "@/lib/session";
import { ago } from "@/lib/time";
import { color, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";
import { z } from "@/styles/z.stylex";
import { Snippet } from "./Snippet";
import { Kbd, surface } from "./ui";

type Item = { key: string; href: string; icon: ReactNode; title: string; detail?: ReactNode };

const s = stylex.create({
  scrim: { position: "fixed", inset: 0, zIndex: z.palette, backgroundColor: color.scrim },
  wrap: {
    position: "fixed",
    insetInline: 0,
    top: { default: 8, [media.md]: "12vh" },
    zIndex: z.palette,
    display: "flex",
    justifyContent: "center",
    paddingInline: 8,
    pointerEvents: "none",
  },
  panel: {
    width: "min(640px, 100%)",
    maxHeight: { default: "calc(100dvh - 16px)", [media.md]: "70vh" },
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    pointerEvents: "auto",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingInline: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.hairline,
    color: color.textFaint,
  },
  input: {
    flexGrow: 1,
    minWidth: 0,
    height: "100%",
    borderWidth: 0,
    backgroundColor: "transparent",
    outline: "none",
    fontSize: 16,
    color: color.text,
    "::placeholder": { color: color.textFaint },
  },
  list: { overflowY: "auto", overscrollBehavior: "contain", padding: 8 },
  group: { paddingInline: 10, paddingTop: 8, paddingBottom: 6, fontSize: 12, color: color.textFaint },
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    paddingBlock: 10,
    paddingInline: 10,
    borderRadius: radius.control,
    color: color.text,
    textDecoration: "none",
    cursor: "pointer",
  },
  itemActive: { backgroundColor: color.active },
  itemIcon: { flexShrink: 0, marginTop: 1, color: color.textMuted },
  itemBody: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flexGrow: 1 },
  itemTitle: { fontSize: 14.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  itemDetail: {
    fontSize: 13,
    lineHeight: 1.45,
    color: color.textMuted,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
  empty: { paddingInline: 10, paddingBlock: 18, fontSize: 14, color: color.textMuted },
  footer: {
    display: { default: "none", [media.md]: "flex" },
    gap: 16,
    paddingInline: 16,
    paddingBlock: 10,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.hairline,
    fontSize: 12,
    color: color.textFaint,
  },
  hint: { display: "inline-flex", alignItems: "center", gap: 6 },
});

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchPalette({
  open,
  initialQuery,
  onClose,
}: {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="palette-scrim"
            {...stylex.props(s.scrim)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
            onClick={onClose}
          />
          <div key="palette" {...stylex.props(s.wrap)}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Search pages"
              {...stylex.props(surface.glass, surface.float, surface.rounded, s.panel)}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
            >
              <PaletteBody initialQuery={initialQuery} onClose={onClose} />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function PaletteBody({ initialQuery, onClose }: { initialQuery: string; onClose: () => void }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const q = useDebounced(query.trim(), 120);
  const listRef = useRef<HTMLDivElement>(null);

  const { canEdit } = useSession();
  const { data: pages } = useSWR<PageSummary[]>(keys.pages());
  const { data: hits, isLoading } = useSWR<SearchHit[]>(q ? keys.search(q) : null, { keepPreviousData: true });

  // Return focus to wherever it was before the palette opened.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, []);

  const items = useMemo<Item[]>(() => {
    if (!query.trim()) {
      return (pages ?? []).slice(0, 6).map((p) => ({
        key: p.slug,
        href: pageHref(p.slug),
        icon: <FileText />,
        title: p.title,
        detail: `Updated ${ago(p.updated_at)}`,
      }));
    }
    const out: Item[] = (q ? (hits ?? []) : []).map((h) => ({
      key: h.slug,
      href: pageHref(h.slug),
      icon: <FileText />,
      title: h.title,
      detail: <Snippet text={h.snippet} />,
    }));
    const title = query.trim();
    const slug = slugify(title);
    if (canEdit && slug && !pages?.some((p) => p.slug === slug)) {
      out.push({ key: "__new", href: newHref(title), icon: <Plus />, title: `Create “${title}”` });
    }
    if (out.length > 0) {
      out.push({
        key: "__all",
        href: `/search?q=${encodeURIComponent(title)}`,
        icon: <ArrowRight />,
        title: "See all results",
      });
    }
    return out;
  }, [query, q, hits, pages, canEdit]);

  // Reset the highlighted row whenever the results change.
  const [activeFor, setActiveFor] = useState(q);
  if (activeFor !== q) {
    setActiveFor(q);
    setActive(0);
  }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(item: Item | undefined) {
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  const searching = !!query.trim();

  return (
    <>
      <div {...stylex.props(s.inputRow)}>
        <MagnifyingGlass size={20} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search or create a page"
          aria-label="Search pages"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          {...stylex.props(s.input)}
        />
      </div>
      <div ref={listRef} id={listId} role="listbox" aria-label="Results" {...stylex.props(s.list)}>
        {!searching && items.length > 0 && <div {...stylex.props(s.group)}>Recently updated</div>}
        {searching && q && !isLoading && hits?.length === 0 && (
          <p {...stylex.props(s.empty)}>No pages match “{query.trim()}”.</p>
        )}
        {!searching && pages?.length === 0 && (
          <p {...stylex.props(s.empty)}>
            {canEdit ? "Type a title to create your first page." : "No pages yet."}
          </p>
        )}
        {items.map((item, i) => (
          <div
            key={item.key}
            id={`${listId}-${i}`}
            data-index={i}
            role="option"
            aria-selected={i === active}
            onMouseMove={() => setActive(i)}
            onClick={() => go(item)}
            {...stylex.props(s.item, i === active && s.itemActive)}
          >
            <span {...stylex.props(s.itemIcon)}>{item.icon}</span>
            <span {...stylex.props(s.itemBody)}>
              <span {...stylex.props(s.itemTitle)}>{item.title}</span>
              {item.detail && <span {...stylex.props(s.itemDetail)}>{item.detail}</span>}
            </span>
          </div>
        ))}
      </div>
      <div {...stylex.props(s.footer)}>
        <span {...stylex.props(s.hint)}>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move
        </span>
        <span {...stylex.props(s.hint)}>
          <Kbd>Enter</Kbd> to open
        </span>
        <span {...stylex.props(s.hint)}>
          <Kbd>Esc</Kbd> to close
        </span>
      </div>
    </>
  );
}
