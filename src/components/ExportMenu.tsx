"use client";

import * as stylex from "@stylexjs/stylex";
import { CaretDown, DownloadSimple, FileDoc, FileMd, FilePdf, Notebook } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { Page } from "@/lib/api";
import { color, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";
import { z } from "@/styles/z.stylex";
import { Button, surface } from "./ui";

const s = stylex.create({
  wrap: { position: "relative", display: { default: "inline-flex", [media.print]: "none" } },
  menu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: { default: "auto", [media.md]: 0 },
    left: { default: 0, [media.md]: "auto" },
    zIndex: z.topbar,
    width: 240,
    padding: 6,
    borderRadius: radius.panel,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    paddingBlock: 9,
    paddingInline: 10,
    borderWidth: 0,
    borderRadius: radius.control,
    textAlign: "start",
    cursor: "pointer",
    color: color.text,
    backgroundColor: { default: "transparent", ":hover": color.hover, ":focus-visible": color.hover },
    outline: "none",
  },
  icon: { flexShrink: 0, marginTop: 1, color: color.accent },
  itemBody: { display: "flex", flexDirection: "column", gap: 2 },
  itemTitle: { fontSize: 14, fontWeight: 500 },
  itemHint: { fontSize: 12.5, color: color.textMuted, lineHeight: 1.35 },
  error: { fontSize: 12.5, color: color.danger, paddingInline: 10, paddingBlock: 6 },
});

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportMenu({ page }: { page: Page }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filename = page.slug || "page";

  async function run(kind: "pdf" | "docx" | "md" | "lined") {
    setError(null);
    if (kind === "lined") {
      setOpen(false);
      router.push(`/print?p=${encodeURIComponent(page.slug)}`);
      return;
    }
    if (kind === "pdf") {
      setOpen(false);
      // Wait for the menu to close so it isn't captured, then use the
      // browser's print pipeline: real, selectable text in the PDF.
      requestAnimationFrame(() => window.print());
      return;
    }
    if (kind === "md") {
      const md = `# ${page.title}\n\n${page.content.trimEnd()}\n`;
      download(new Blob([md], { type: "text/markdown;charset=utf-8" }), `${filename}.md`);
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      // docx is large; only load it when someone actually exports.
      const { pageToDocx } = await import("@/lib/export-docx");
      download(await pageToDocx(page, window.location.origin), `${filename}.docx`);
      setOpen(false);
    } catch (e) {
      setError(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const items = [
    { kind: "pdf" as const, icon: <FilePdf size={20} />, title: "PDF", hint: "Opens the print dialog; choose Save as PDF" },
    { kind: "docx" as const, icon: <FileDoc size={20} />, title: "Word document", hint: ".docx with headings, tables and colored code" },
    { kind: "md" as const, icon: <FileMd size={20} />, title: "Markdown", hint: "The raw page source, [[links]] included" },
    { kind: "lined" as const, icon: <Notebook size={20} />, title: "Lined paper", hint: "Print on ruled paper (e.g. folio) with text on the lines" },
  ];

  return (
    <div ref={ref} {...stylex.props(s.wrap)}>
      <Button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={busy}>
        <DownloadSimple />
        {busy ? "Exporting" : "Export"}
        <CaretDown size={14} />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Export page"
            {...stylex.props(surface.glass, surface.float, s.menu)}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 40 }}
          >
            {items.map((item) => (
              <button
                key={item.kind}
                type="button"
                role="menuitem"
                onClick={() => run(item.kind)}
                {...stylex.props(s.item)}
              >
                <span {...stylex.props(s.icon)}>{item.icon}</span>
                <span {...stylex.props(s.itemBody)}>
                  <span {...stylex.props(s.itemTitle)}>{item.title}</span>
                  <span {...stylex.props(s.itemHint)}>{item.hint}</span>
                </span>
              </button>
            ))}
            {error && (
              <p role="alert" {...stylex.props(s.error)}>
                {error}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
