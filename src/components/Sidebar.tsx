"use client";

import * as stylex from "@stylexjs/stylex";
import {
  BookOpenText,
  ClockCounterClockwise,
  Graph,
  Hash,
  House,
  MagnifyingGlass,
  Plus,
  Robot,
  SignIn,
  SignOut,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { ReactNode } from "react";

import { api, keys, type PageSummary } from "@/lib/api";
import { loginHereHref, useSession } from "@/lib/session";
import { newHref, pageHref } from "@/lib/wiki";
import { color, ease, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";
import { Button, Kbd, LinkButton, Skeleton } from "./ui";

const s = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minHeight: 0,
    paddingBlock: 16,
  },
  pad: { paddingInline: 14 },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: color.text,
    fontSize: 16,
    fontWeight: 650,
    letterSpacing: "-0.01em",
  },
  mark: {
    display: "grid",
    placeItems: "center",
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: color.accent,
    color: color.accentInk,
  },
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    height: 38,
    marginTop: 18,
    paddingInline: 10,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.hairline,
    backgroundColor: { default: color.field, ":hover": color.fieldHover },
    color: color.textFaint,
    fontSize: 14,
    textAlign: "start",
    cursor: "pointer",
    transitionProperty: "background-color",
    transitionDuration: "140ms",
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: color.accent,
  },
  searchLabel: { flexGrow: 1 },
  newBtn: { width: "100%", marginTop: 10 },
  nav: { display: "flex", flexDirection: "column", gap: 2, marginTop: 18 },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 36,
    paddingInline: 10,
    borderRadius: radius.control,
    fontSize: 14,
    color: { default: color.textMuted, ":hover": color.text },
    backgroundColor: { default: "transparent", ":hover": color.hover },
    textDecoration: "none",
    transitionProperty: "background-color, color",
    transitionDuration: "140ms",
    transitionTimingFunction: ease.out,
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: -2,
  },
  active: {
    color: color.text,
    backgroundColor: color.active,
    fontWeight: 500,
  },
  pageItem: {
    minHeight: { default: 36, [media.lg]: 32 },
    fontSize: 13.5,
  },
  pageTitle: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  sectionLabel: {
    marginTop: 22,
    marginBottom: 6,
    paddingInline: 24,
    fontSize: 12,
    fontWeight: 500,
    color: color.textFaint,
  },
  pages: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingInline: 14,
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  footer: {
    paddingInline: 14,
    paddingTop: 10,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.hairline,
  },
  logout: {
    width: "100%",
    borderWidth: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "start",
  },
  empty: { paddingInline: 10, fontSize: 13, color: color.textFaint, lineHeight: 1.5 },
  skeletons: { display: "flex", flexDirection: "column", gap: 14, paddingInline: 10, paddingTop: 8 },
});

export function Wordmark() {
  return (
    <Link href="/" {...stylex.props(s.brand)}>
      <span {...stylex.props(s.mark)}>
        <BookOpenText size={17} weight="bold" />
      </span>
      Wiki
    </Link>
  );
}

function NavItem({
  href,
  icon,
  active,
  onNavigate,
  children,
}: {
  href: string;
  icon: ReactNode;
  active: boolean;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      {...stylex.props(s.item, active && s.active)}
    >
      {icon}
      {children}
    </Link>
  );
}

export function SidebarContent({ onSearch, onNavigate }: { onSearch: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { data: pages, error } = useSWR<PageSummary[]>(keys.pages());
  const { canEdit, writable, isLoading, refresh } = useSession();

  async function logout() {
    const session = await api.logout().catch(() => ({ authenticated: false, writable }));
    await refresh(session, { revalidate: false });
    onNavigate?.();
    if (pathname === "/edit") router.push("/");
  }

  const currentSlug = pathname === "/wiki" ? params.get("p") : null;
  const author = params.get("author");
  const sorted = pages?.slice().sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div {...stylex.props(s.root)}>
      <div {...stylex.props(s.pad)}>
        <Wordmark />
        <button type="button" onClick={onSearch} {...stylex.props(s.search)}>
          <MagnifyingGlass />
          <span {...stylex.props(s.searchLabel)}>Search</span>
          <Kbd>/</Kbd>
        </button>
        {canEdit ? (
          <LinkButton href={newHref()} variant="primary" onClick={onNavigate} xstyle={s.newBtn}>
            <Plus weight="bold" />
            New page
          </LinkButton>
        ) : (
          !isLoading &&
          writable && (
            <Button
              onClick={() => {
                onNavigate?.();
                router.push(loginHereHref());
              }}
              xstyle={s.newBtn}
            >
              <SignIn />
              Log in to edit
            </Button>
          )
        )}

        <nav aria-label="Main" {...stylex.props(s.nav)}>
          <NavItem href="/" icon={<House />} active={pathname === "/"} onNavigate={onNavigate}>
            Home
          </NavItem>
          <NavItem
            href="/recent"
            icon={<ClockCounterClockwise />}
            active={pathname === "/recent" && author !== "claude"}
            onNavigate={onNavigate}
          >
            Recent changes
          </NavItem>
          <NavItem
            href="/recent?author=claude"
            icon={<Robot />}
            active={pathname === "/recent" && author === "claude"}
            onNavigate={onNavigate}
          >
            Claude&apos;s edits
          </NavItem>
          <NavItem href="/tags" icon={<Hash />} active={pathname === "/tags"} onNavigate={onNavigate}>
            Tags
          </NavItem>
          <NavItem href="/graph" icon={<Graph />} active={pathname === "/graph"} onNavigate={onNavigate}>
            Graph
          </NavItem>
        </nav>
      </div>

      <h2 {...stylex.props(s.sectionLabel)}>
        Pages{pages ? ` (${pages.length})` : ""}
      </h2>
      <div {...stylex.props(s.pages)}>
        {error ? (
          <p {...stylex.props(s.empty)}>Can&apos;t load pages. Is the service running?</p>
        ) : !sorted ? (
          <div {...stylex.props(s.skeletons)}>
            <Skeleton width="70%" />
            <Skeleton width="55%" />
            <Skeleton width="80%" />
          </div>
        ) : sorted.length === 0 ? (
          <p {...stylex.props(s.empty)}>No pages yet.</p>
        ) : (
          sorted.map((p) => (
            <Link
              key={p.slug}
              href={pageHref(p.slug)}
              onClick={onNavigate}
              aria-current={p.slug === currentSlug ? "page" : undefined}
              {...stylex.props(s.item, s.pageItem, p.slug === currentSlug && s.active)}
            >
              <span {...stylex.props(s.pageTitle)}>{p.title}</span>
            </Link>
          ))
        )}
      </div>
      {canEdit && (
        <div {...stylex.props(s.footer)}>
          <button type="button" onClick={logout} {...stylex.props(s.item, s.logout)}>
            <SignOut />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
