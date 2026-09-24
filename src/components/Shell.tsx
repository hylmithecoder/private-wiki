"use client";

import * as stylex from "@stylexjs/stylex";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { IconContext, List, MagnifyingGlass, Plus, SignIn } from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SWRConfig } from "swr";

import { fetcher } from "@/lib/api";
import { loginHereHref, useSession } from "@/lib/session";
import { newHref } from "@/lib/wiki";
import { color, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";
import { z } from "@/styles/z.stylex";
import { SearchPalette } from "./SearchPalette";
import { SidebarContent, Wordmark } from "./Sidebar";
import { Button, LinkButton, print, surface } from "./ui";

const PaletteContext = createContext<(query?: string) => void>(() => {});
export const useOpenPalette = () => useContext(PaletteContext);

const SIDEBAR_W = 272;
const GAP = 12;

const s = stylex.create({
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: -1,
    pointerEvents: "none",
    backgroundColor: color.bg,
    backgroundImage: {
      default:
        "radial-gradient(60vmax 50vmax at 8% 0%, rgba(120, 170, 140, 0.55), transparent 60%)," +
        "radial-gradient(55vmax 45vmax at 100% 18%, rgba(150, 185, 205, 0.5), transparent 62%)," +
        "radial-gradient(50vmax 40vmax at 60% 110%, rgba(235, 190, 120, 0.38), transparent 60%)",
      "@media (prefers-color-scheme: dark)":
        "radial-gradient(60vmax 50vmax at 8% 0%, rgba(34, 92, 66, 0.55), transparent 60%)," +
        "radial-gradient(55vmax 45vmax at 100% 18%, rgba(26, 70, 92, 0.45), transparent 62%)," +
        "radial-gradient(50vmax 40vmax at 60% 110%, rgba(120, 78, 20, 0.35), transparent 60%)",
    },
  },
  // Fixed, pointer-events-none grain so the glass reads as a material.
  grain: {
    position: "fixed",
    inset: 0,
    zIndex: z.grain,
    pointerEvents: "none",
    opacity: { default: 0.05, "@media (prefers-color-scheme: dark)": 0.07 },
    mixBlendMode: "overlay",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
  },
  skip: {
    position: "absolute",
    left: 12,
    top: { default: -60, ":focus": 12 },
    zIndex: z.palette,
    paddingBlock: 8,
    paddingInline: 12,
    borderRadius: radius.control,
    backgroundColor: color.accent,
    color: color.accentInk,
    fontSize: 14,
  },
  sidebar: {
    // print.hide can't be used here: it would reset this responsive display.
    display: { default: "none", [media.lg]: "flex", [media.print]: "none" },
    position: "fixed",
    top: GAP,
    bottom: GAP,
    left: GAP,
    width: SIDEBAR_W,
    zIndex: z.sidebar,
    borderRadius: radius.panel,
    overflow: "hidden",
  },
  topbar: {
    display: { default: "flex", [media.lg]: "none", [media.print]: "none" },
    position: "sticky",
    top: 0,
    zIndex: z.topbar,
    alignItems: "center",
    gap: 4,
    height: 56,
    paddingInline: 8,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    boxShadow: "none",
  },
  topbarTitle: { flexGrow: 1, minWidth: 0, paddingInlineStart: 4 },
  main: {
    minHeight: { default: "100dvh", [media.print]: "auto" },
    paddingInline: { default: 16, [media.md]: 28, [media.lg]: 36, [media.print]: 0 },
    paddingInlineStart: { default: 16, [media.md]: 28, [media.lg]: SIDEBAR_W + GAP + 36, [media.print]: 0 },
    paddingTop: { default: 20, [media.md]: 32, [media.lg]: 40, [media.print]: 0 },
    paddingBottom: { default: 64, [media.print]: 0 },
  },
  inner: { maxWidth: { default: 1180, [media.print]: "none" }, marginInline: "auto", width: "100%" },
  scrim: {
    position: "fixed",
    inset: 0,
    zIndex: z.drawer,
    backgroundColor: color.scrim,
  },
  drawer: {
    position: "fixed",
    top: 8,
    bottom: 8,
    left: 8,
    width: "min(86vw, 320px)",
    zIndex: z.drawer,
    display: "flex",
    borderRadius: radius.panel,
    overflow: "hidden",
  },
});

function Backdrop() {
  return (
    <>
      <div aria-hidden {...stylex.props(s.backdrop, print.hide)} />
      <div aria-hidden {...stylex.props(s.grain, print.hide)} />
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [palette, setPalette] = useState<{ open: boolean; query: string }>({ open: false, query: "" });
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const router = useRouter();
  const { canEdit, writable, isLoading } = useSession();

  const openPalette = useCallback((query = "") => setPalette({ open: true, query }), []);
  const closePalette = useCallback(() => setPalette((p) => ({ ...p, open: false })), []);

  // Close the drawer on navigation.
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => ({ open: !p.open, query: "" }));
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        openPalette();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

  const sidebar = (onNavigate?: () => void) => (
    <SidebarContent onSearch={() => openPalette()} onNavigate={onNavigate} />
  );

  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: true, dedupingInterval: 1500 }}>
      <IconContext.Provider value={{ size: 18, weight: "regular" }}>
        <PaletteContext.Provider value={openPalette}>
          <Backdrop />
          <a href="#main" {...stylex.props(s.skip, print.hide)}>
            Skip to content
          </a>

          <aside aria-label="Wiki navigation" {...stylex.props(surface.glass, s.sidebar)}>
            <Suspense>{sidebar()}</Suspense>
          </aside>

          <header {...stylex.props(surface.glass, s.topbar)}>
            <Button variant="ghost" iconOnly aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
              <List size={20} />
            </Button>
            <div {...stylex.props(s.topbarTitle)}>
              <Wordmark />
            </div>
            <Button variant="ghost" iconOnly aria-label="Search" onClick={() => openPalette()}>
              <MagnifyingGlass size={20} />
            </Button>
            {canEdit ? (
              <LinkButton href={newHref()} variant="ghost" iconOnly aria-label="New page">
                <Plus size={20} />
              </LinkButton>
            ) : (
              !isLoading &&
              writable && (
                <Button variant="ghost" iconOnly aria-label="Log in to edit" onClick={() => router.push(loginHereHref())}>
                  <SignIn size={20} />
                </Button>
              )
            )}
          </header>

          <AnimatePresence>
            {drawerOpen && (
              <>
                <motion.div
                  key="scrim"
                  {...stylex.props(s.scrim)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.2 }}
                  onClick={() => setDrawerOpen(false)}
                />
                <motion.div
                  key="drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Navigation"
                  {...stylex.props(surface.glass, surface.float, s.drawer)}
                  initial={reduce ? { opacity: 0 } : { x: "-105%" }}
                  animate={reduce ? { opacity: 1 } : { x: 0 }}
                  exit={reduce ? { opacity: 0 } : { x: "-105%" }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 40 }}
                  onKeyDown={(e) => e.key === "Escape" && setDrawerOpen(false)}
                >
                  <Suspense>{sidebar(() => setDrawerOpen(false))}</Suspense>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <SearchPalette open={palette.open} initialQuery={palette.query} onClose={closePalette} />

          <main id="main" {...stylex.props(s.main)}>
            <div {...stylex.props(s.inner)}>{children}</div>
          </main>
        </PaletteContext.Provider>
      </IconContext.Provider>
    </SWRConfig>
  );
}
