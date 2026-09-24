"use client";

import * as stylex from "@stylexjs/stylex";
import { ArrowLeft, FileDoc, Printer, Ruler, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import useSWR, { useSWRConfig } from "swr";
import type { ElementContent } from "hast";

import lined from "@/components/lined.module.css";
import { Markdown } from "@/components/Markdown";
import { Button, ErrorState, LinkButton, PageHeader, SkeletonText, inputStyles, surface } from "@/components/ui";
import { api, fontFileUrl, keys, type FontMeta, type Page } from "@/lib/api";
import { hashSeed, humanizeString, rehypeHumanize, styleObject, type HumanizeOptions } from "@/lib/humanize";
import { useSession } from "@/lib/session";
import {
  DEFAULTS,
  FONTS,
  MM_TO_PX,
  fontFamily,
  uploadedFamily,
  PRESETS,
  geometry,
  textLeft,
  loadSettings,
  saveSettings,
  type LinedSettings,
} from "@/lib/lined";
import { useTitle } from "@/lib/useTitle";
import { pageHref } from "@/lib/wiki";
import { color, radius } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";

const s = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [media.lg]: "340px minmax(0, 1fr)" },
    gap: { default: 16, [media.md]: 20 },
    alignItems: "start",
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: { default: 16, [media.md]: 20 },
    position: { default: "static", [media.lg]: "sticky" },
    top: 24,
    maxHeight: { default: "none", [media.lg]: "calc(100dvh - 48px)" },
    overflowY: "auto",
  },
  group: { display: "flex", flexDirection: "column", gap: 10, borderWidth: 0, margin: 0, padding: 0, minWidth: 0 },
  legend: { fontSize: 12.5, fontWeight: 600, color: color.textMuted, marginBottom: 2, padding: 0 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  label: { fontSize: 12.5, color: color.textMuted },
  unitWrap: { position: "relative" },
  unit: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 12,
    color: color.textFaint,
    pointerEvents: "none",
  },
  num: { height: 36, fontSize: 14, paddingInlineEnd: 34 },
  select: { height: 36, fontSize: 14 },
  actions: { display: "flex", flexDirection: "column", gap: 8 },
  warn: {
    display: "flex",
    gap: 8,
    padding: 10,
    borderRadius: radius.control,
    backgroundColor: color.dangerSoft,
    color: color.text,
    fontSize: 13,
    lineHeight: 1.45,
  },
  warnIcon: { color: color.danger, flexShrink: 0, marginTop: 1 },
  help: { fontSize: 13, lineHeight: 1.55, color: color.textMuted },
  helpSummary: { cursor: "pointer", fontWeight: 600, color: color.text, fontSize: 13.5 },
  helpList: { paddingInlineStart: 18, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 },
  previewHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 },
  previewMeta: { fontSize: 13, color: color.textMuted },
  pages: { display: "flex", flexDirection: "column", alignItems: "center", gap: 20 },
  range: { width: "100%", accentColor: color.accent },
  fontActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  hint: { fontSize: 12.5, color: color.textFaint },
  check: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: color.textMuted, cursor: "pointer" },
  checkbox: { accentColor: color.accent, width: 16, height: 16 },
});

/** One ruling as a whole number of CSS px (Chrome rounds line boxes in print). */
const lineUnit = (pitchMm: number) => Math.max(1, Math.round(pitchMm * MM_TO_PX));

type NumKey = { [K in keyof LinedSettings]: LinedSettings[K] extends number ? K : never }[keyof LinedSettings];

export function LinedPrintView() {
  const slug = useSearchParams().get("p") ?? "";
  const { data: page, error, mutate } = useSWR<Page>(slug ? keys.page(slug) : null, { revalidateOnFocus: false });
  useTitle(page ? page.title : "Print");

  if (error) return <ErrorState error={error} retry={() => mutate()} />;
  if (!page) {
    return (
      <div {...stylex.props(surface.paper)} style={{ padding: 24 }}>
        <SkeletonText lines={6} />
      </div>
    );
  }
  return <LinedPrint page={page} />;
}

function LinedPrint({ page }: { page: Page }) {
  // Only mounted client-side (after the page loads), so reading
  // localStorage in the initializer can't cause a hydration mismatch.
  const [settings, setSettings] = useState<LinedSettings>(() => loadSettings());
  const [baselineMm, setBaselineMm] = useState<number | null>(null);
  // Chrome rounds line boxes to whole CSS px; layout happens on that rounded
  // grid and each page is scaled by (exact pitch / rounded pitch) at paint.
  const [unitScale, setUnitScale] = useState(1);
  const [mode, setMode] = useState<"doc" | "calib">("doc");
  const [pageCount, setPageCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);
  const { canEdit } = useSession();
  const { mutate } = useSWRConfig();
  const { data: fonts } = useSWR<FontMeta[]>(keys.fonts());
  const fileRef = useRef<HTMLInputElement>(null);

  const family = fontFamily(settings.font);
  const uploadedId = settings.font.startsWith("upload:") ? Number(settings.font.slice(7)) : null;
  const human = useMemo<HumanizeOptions>(
    () => ({
      amount: settings.humanize / 100,
      seed: hashSeed(page.slug),
      wordClass: lined.hwWord,
      charClass: lined.hwChar,
    }),
    [settings.humanize, page.slug],
  );
  const rehypePlugins = useMemo(() => (human.amount > 0 ? [rehypeHumanize(human)] : []), [human]);
  const flowRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Rough baseline until the real font is measured.
  const geo = useMemo(
    () => geometry(settings, baselineMm ?? settings.pitch / 2 + settings.fontPt * 0.3528 * 0.35),
    [settings, baselineMm],
  );

  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    const reset = () => setMode("doc");
    window.addEventListener("afterprint", reset);
    return () => window.removeEventListener("afterprint", reset);
  }, []);

  // Snap every block to whole rulings, then build the per-page preview.
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      const flow = flowRef.current;
      const preview = previewRef.current;
      const printBox = printRef.current;
      if (cancelled || !flow || !preview || !printBox) return;
      const doc = flow.firstElementChild as HTMLElement;
      const markdownRoot = doc.children[1] as HTMLElement | undefined;
      const blocks = [doc.children[0] as HTMLElement, ...Array.from(markdownRoot?.children ?? [])] as HTMLElement[];
      const docTop = () => doc.getBoundingClientRect().top;

      // Layout grid = the ruling rounded to whole px (see --lh); the paint
      // scale maps it back to the exact ruling distance on paper.
      const unit = lineUnit(settings.pitch);
      const scale = (settings.pitch * MM_TO_PX) / unit;
      if (Math.abs(scale - unitScale) > 1e-6) setUnitScale(scale);

      // Baseline of the first text line inside `el`, px from the doc top.
      const baselineOf = (el: Element): number | null => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => (n.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
        });
        const text = walker.nextNode();
        if (!text?.parentNode) return null;
        const mark = document.createElement("span");
        mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
        text.parentNode.insertBefore(mark, text);
        const y = mark.getBoundingClientRect().top - docTop();
        mark.remove();
        return y;
      };
      const mod = (y: number) => ((y % unit) + unit) % unit;

      // 1. Whole rulings per block (+ empty lines between blocks).
      const shifted = Array.from(doc.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,figcaption,figure pre,th,td"));
      shifted.forEach((el) => {
        el.style.position = "";
        el.style.top = "";
      });
      blocks.forEach((el) => (el.style.marginBottom = "0px"));
      blocks.forEach((el, i) => {
        const h = el.getBoundingClientRect().height;
        const whole = Math.max(1, Math.ceil(h / unit - 0.02)) * unit;
        const next = blocks[i + 1];
        const beforeHeading = next && /^H[1-4]$/.test(next.tagName) ? 1 : 0;
        const gap = next ? Math.max(settings.gapLines, beforeHeading) : 0;
        el.style.marginBottom = `${whole - h + gap * unit}px`;
      });

      // 2. Where body text sits inside a line box, measured on real text.
      const bodyY = baselineOf(doc.querySelector("p, li") ?? doc);
      if (bodyY != null) {
        const bodyBase = mod(bodyY);
        const mm = (bodyBase * scale) / MM_TO_PX;
        if (baselineMm == null || Math.abs(mm - baselineMm) > 0.005) setBaselineMm(mm);
        // 3. Other fonts/sizes sit at a different height in the same line
        //    box: nudge them onto the body baseline.
        for (const el of shifted) {
          const y = baselineOf(el);
          if (y == null) continue;
          let d = mod(y) - bodyBase;
          if (d > unit / 2) d -= unit;
          if (d < -unit / 2) d += unit;
          if (Math.abs(d) > 0.2) {
            el.style.position = "relative";
            el.style.top = `${-d}px`;
          }
        }
      }

      // 4. Paginate ourselves: page k shows lines [k*N, (k+1)*N) of the flow.
      const perPage = settings.lines * unit;
      const count = Math.max(1, Math.ceil(doc.getBoundingClientRect().height / perPage - 0.001));
      setPageCount(count);
      const top = geo.top - settings.offsetY;
      const left = geo.left - settings.offsetX;
      const width = settings.paperW - geo.left - geo.right;
      const sheetPx = settings.paperW * MM_TO_PX;
      const fit = Math.min(1, (preview.clientWidth || 600) / sheetPx);

      const makeSheet = (k: number, forPrint: boolean) => {
        const sheet = document.createElement("div");
        sheet.className = lined.sheet;
        sheet.style.cssText =
          `width:${settings.paperW}mm;height:${settings.paperH}mm;--pitch:${settings.pitch}mm;` +
          (forPrint ? "" : `transform:scale(${fit})`);
        if (!forPrint) {
          const rulings = document.createElement("div");
          rulings.className = lined.rulings;
          rulings.style.cssText = `top:${settings.firstLine - settings.pitch}mm;height:${settings.lines * settings.pitch}mm`;
          sheet.append(rulings);
          if (settings.hasMarginLine) {
            const margin = document.createElement("div");
            margin.className = lined.marginLine;
            margin.style.left = `${settings.marginLeft}mm`;
            sheet.append(margin);
          }
        }
        const win = document.createElement("div");
        win.className = lined.window;
        // Printer shift only applies on paper; the preview shows the ideal.
        const t = forPrint ? top + settings.offsetY : top;
        const l = forPrint ? left + settings.offsetX : left;
        win.style.cssText = `top:${t}mm;left:${l}mm;width:${width}mm;height:${settings.lines * settings.pitch}mm`;
        const clone = doc.cloneNode(true) as HTMLElement;
        // Same layout width as the measured flow, so lines break identically.
        clone.style.width = `${width / scale}mm`;
        clone.style.transformOrigin = "0 0";
        clone.style.transform = `scale(${scale}) translateY(-${k * perPage}px)`;
        win.append(clone);
        sheet.append(win);
        return sheet;
      };

      preview.replaceChildren(
        ...Array.from({ length: count }, (_, k) => {
          const holder = document.createElement("div");
          holder.style.cssText = `width:${sheetPx * fit}px;height:${settings.paperH * MM_TO_PX * fit}px`;
          holder.append(makeSheet(k, false));
          return holder;
        }),
      );
      printBox.replaceChildren(...Array.from({ length: count }, (_, k) => makeSheet(k, true)));
    };
    // Measure only once the chosen (possibly uploaded) font has loaded.
    Promise.all([document.fonts.load(`16px ${family}`).catch(() => []), document.fonts.ready]).then(() =>
      requestAnimationFrame(run),
    );
    const ro = new ResizeObserver(() => requestAnimationFrame(run));
    if (previewRef.current) ro.observe(previewRef.current);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [settings, geo, page.content, baselineMm, unitScale, family, rehypePlugins]);

  const set = (patch: Partial<LinedSettings>) => setSettings((cur) => ({ ...cur, ...patch }));
  const setNum = (key: NumKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.valueAsNumber;
    if (!Number.isNaN(v)) set({ [key]: v, preset: key === "offsetX" || key === "offsetY" || key === "fontPt" || key === "lift" ? settings.preset : "custom" });
  };

  async function uploadFont(file: File) {
    setFontError(null);
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) {
      setFontError("Choose a .ttf, .otf, .woff or .woff2 file.");
      return;
    }
    setUploading(true);
    try {
      const font = await api.uploadFont(file, file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
      await mutate(keys.fonts());
      set({ font: `upload:${font.id}`, humanize: settings.humanize || 35 });
    } catch (e) {
      setFontError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteFont(id: number) {
    if (!window.confirm("Delete this font from the wiki?")) return;
    setFontError(null);
    try {
      await api.deleteFont(id);
      await mutate(keys.fonts());
      set({ font: "geist" });
    } catch (e) {
      setFontError((e as Error).message);
    }
  }

  function print(which: "doc" | "calib") {
    flushSync(() => setMode(which));
    window.print();
  }

  async function wordExport() {
    setBusy(true);
    try {
      const { pageToDocx } = await import("@/lib/export-docx");
      const blob = await pageToDocx(page, window.location.origin, settings);
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: `${page.slug}-lined.docx` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(false);
    }
  }

  // Pages are laid out by us (see run()), so the page box has no margins.
  const pageCss =
    `@page { size: ${settings.paperW}mm ${settings.paperH}mm; margin: 0 }` +
    (uploadedId != null
      ? `\n@font-face { font-family: "${uploadedFamily(uploadedId)}"; src: url("${fontFileUrl(uploadedId)}"); font-display: block; }`
      : "");

  const num = (key: NumKey, label: string, unit = "mm", step = 0.5) => (
    <div {...stylex.props(s.field)}>
      <label htmlFor={`lp-${key}`} {...stylex.props(s.label)}>
        {label}
      </label>
      <div {...stylex.props(s.unitWrap)}>
        <input
          id={`lp-${key}`}
          type="number"
          inputMode="decimal"
          step={step}
          value={settings[key]}
          onChange={setNum(key)}
          {...stylex.props(inputStyles.input, s.num)}
        />
        <span {...stylex.props(s.unit)}>{unit}</span>
      </div>
    </div>
  );

  return (
    <>
      <style>{`${pageCss}\n@media print { body { background: #fff !important; } }`}</style>

      <div className={lined.screenOnly}>
        <PageHeader
          title="Print on lined paper"
          sub={page.title}
          actions={
            <LinkButton href={pageHref(page.slug)} variant="ghost">
              <ArrowLeft />
              Back to page
            </LinkButton>
          }
        />

        <div {...stylex.props(s.layout)}>
          <aside {...stylex.props(surface.glass, surface.rounded, s.panel)}>
            <fieldset {...stylex.props(s.group)}>
              <legend {...stylex.props(s.legend)}>Paper</legend>
              <select
                aria-label="Paper preset"
                value={settings.preset}
                onChange={(e) => set({ preset: e.target.value, ...PRESETS[e.target.value]?.values })}
                {...stylex.props(inputStyles.input, s.select)}
              >
                {Object.entries(PRESETS).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.label}
                  </option>
                ))}
              </select>
              <div {...stylex.props(s.grid2)}>
                {num("paperW", "Width")}
                {num("paperH", "Height")}
              </div>
            </fieldset>

            <fieldset {...stylex.props(s.group)}>
              <legend {...stylex.props(s.legend)}>Ruled lines (measure your sheet)</legend>
              <div {...stylex.props(s.grid2)}>
                {num("pitch", "Line spacing", "mm", 0.05)}
                {num("firstLine", "First line from top", "mm", 0.25)}
                {num("lines", "Lines per side", "", 1)}
                {num("marginLeft", settings.hasMarginLine ? "Red margin line" : "Text starts at", "mm", 0.5)}
                {num("marginRight", "Right margin", "mm", 0.5)}
              </div>
              <label {...stylex.props(s.check)}>
                <input
                  type="checkbox"
                  checked={settings.hasMarginLine}
                  onChange={(e) => set({ hasMarginLine: e.target.checked, preset: "custom" })}
                  {...stylex.props(s.checkbox)}
                />
                Paper has a red margin line
              </label>
            </fieldset>

            <fieldset {...stylex.props(s.group)}>
              <legend {...stylex.props(s.legend)}>Handwriting</legend>
              <div {...stylex.props(s.field)}>
                <label htmlFor="lp-font" {...stylex.props(s.label)}>
                  Font
                </label>
                <select
                  id="lp-font"
                  value={settings.font}
                  onChange={(e) => set({ font: e.target.value })}
                  {...stylex.props(inputStyles.input, s.select)}
                >
                  <optgroup label="Built in">
                    {Object.entries(FONTS).map(([k, f]) => (
                      <option key={k} value={k}>
                        {f.label}
                      </option>
                    ))}
                  </optgroup>
                  {fonts && fonts.length > 0 && (
                    <optgroup label="Uploaded">
                      {fonts.map((f) => (
                        <option key={f.id} value={`upload:${f.id}`}>
                          {f.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div {...stylex.props(s.field)}>
                <label htmlFor="lp-human" {...stylex.props(s.label)}>
                  Hand-written feel: {settings.humanize === 0 ? "off" : `${settings.humanize}%`}
                </label>
                <input
                  id="lp-human"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.humanize}
                  onChange={(e) => set({ humanize: e.target.valueAsNumber })}
                  {...stylex.props(s.range)}
                />
              </div>
              {canEdit ? (
                <div {...stylex.props(s.fontActions)}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2,font/*"
                    hidden
                    onChange={(e) => e.target.files?.[0] && uploadFont(e.target.files[0])}
                  />
                  <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <UploadSimple />
                    {uploading ? "Uploading" : "Upload font"}
                  </Button>
                  {uploadedId != null && (
                    <Button size="sm" variant="ghost" onClick={() => deleteFont(uploadedId)}>
                      <Trash />
                      Delete font
                    </Button>
                  )}
                </div>
              ) : (
                <p {...stylex.props(s.hint)}>Log in to upload your own font.</p>
              )}
              {fontError && (
                <p role="alert" {...stylex.props(s.warn)}>
                  <WarningCircle size={16} {...stylex.props(s.warnIcon)} />
                  {fontError}
                </p>
              )}
            </fieldset>

            <fieldset {...stylex.props(s.group)}>
              <legend {...stylex.props(s.legend)}>Text</legend>
              <div {...stylex.props(s.grid2)}>
                {num("fontPt", "Font size", "pt", 0.5)}
                {num("lift", "Above the line", "mm", 0.25)}
              </div>
              <div {...stylex.props(s.field)}>
                <label htmlFor="lp-gap" {...stylex.props(s.label)}>
                  Between paragraphs
                </label>
                <select
                  id="lp-gap"
                  value={settings.gapLines}
                  onChange={(e) => set({ gapLines: Number(e.target.value) as 0 | 1 })}
                  {...stylex.props(inputStyles.input, s.select)}
                >
                  <option value={1}>One empty line</option>
                  <option value={0}>No empty line</option>
                </select>
              </div>
              <div {...stylex.props(s.grid2)}>
                <div {...stylex.props(s.field)}>
                  <label htmlFor="lp-ink" {...stylex.props(s.label)}>
                    Ink
                  </label>
                  <select
                    id="lp-ink"
                    value={settings.ink}
                    onChange={(e) => set({ ink: e.target.value as LinedSettings["ink"] })}
                    {...stylex.props(inputStyles.input, s.select)}
                  >
                    <option value="black">Black</option>
                    <option value="color">Color</option>
                  </select>
                </div>
                <div {...stylex.props(s.field)}>
                  <label htmlFor="lp-weight" {...stylex.props(s.label)}>
                    Text weight
                  </label>
                  <select
                    id="lp-weight"
                    value={settings.weight}
                    onChange={(e) => set({ weight: Number(e.target.value) as LinedSettings["weight"] })}
                    {...stylex.props(inputStyles.input, s.select)}
                  >
                    <option value={400}>Normal</option>
                    <option value={500}>Medium</option>
                    <option value={600}>Semibold</option>
                  </select>
                </div>
              </div>
            </fieldset>

            <fieldset {...stylex.props(s.group)}>
              <legend {...stylex.props(s.legend)}>Printer calibration</legend>
              <div {...stylex.props(s.grid2)}>
                {num("offsetX", "Shift right", "mm", 0.25)}
                {num("offsetY", "Shift down", "mm", 0.25)}
              </div>
            </fieldset>

            {geo.warnings.map((w) => (
              <p key={w} role="alert" {...stylex.props(s.warn)}>
                <WarningCircle size={16} {...stylex.props(s.warnIcon)} />
                {w}
              </p>
            ))}

            <div {...stylex.props(s.actions)}>
              <Button variant="primary" onClick={() => print("doc")}>
                <Printer />
                Print / Save PDF
              </Button>
              <Button onClick={() => print("calib")}>
                <Ruler />
                Print calibration sheet
              </Button>
              <Button onClick={wordExport} disabled={busy}>
                <FileDoc />
                {busy ? "Exporting" : "Word (.docx), lined"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSettings({ ...DEFAULTS })}>
                Reset to defaults
              </Button>
            </div>

            <details {...stylex.props(s.help)}>
              <summary {...stylex.props(s.helpSummary)}>How to measure and print</summary>
              <ol {...stylex.props(s.helpList)}>
                <li>Line spacing: measure from line 1 to line 11 and divide by 10. That is more accurate than one gap.</li>
                <li>First line: from the top edge of the paper down to line 1.</li>
                <li>Lines per side: count the writing lines on one side (not the thick top and bottom rules).</li>
                <li>
                  Red margin line: from the left edge to the red line. No red line (like Sidu folio)? Untick it and set
                  where the text should start.
                </li>
                <li>
                  In the print dialog (Chrome or Edge): Margins <b>Default</b>, Scale <b>100%</b>, and turn off{" "}
                  <b>Headers and footers</b>. The paper size is set automatically.
                </li>
                <li>
                  Black and white printer? Keep Ink on Black so nothing prints as pale grey.
                </li>
                <li>
                  Your own handwriting as a font: on calligraphr.com (free), download the template, fill it in with a pen,
                  scan or photograph it, and export a .ttf. Adding 2-3 variants per letter makes it look even more
                  natural. Then use Upload font here and turn up Hand-written feel.
                </li>
                <li>
                  Print the calibration sheet on one of your lined sheets. If its lines land 1.5 mm below the real ones,
                  set Shift down to -1.5 (same idea for Shift right).
                </li>
              </ol>
            </details>
          </aside>

          <section aria-label="Preview">
            <div {...stylex.props(s.previewHead)}>
              <span {...stylex.props(s.previewMeta)}>
                {pageCount} {pageCount === 1 ? "page" : "pages"}, {settings.lines} lines each
              </span>
              <span {...stylex.props(s.previewMeta)}>Preview (printer shift not shown)</span>
            </div>
            <div ref={previewRef} {...stylex.props(s.pages)} />
          </section>
        </div>
      </div>

      {/* Printed pages (built in run()); calibration replaces them when chosen. */}
      <div ref={printRef} className={mode === "doc" ? lined.printOnly : lined.hidden} />

      {/* The flowing document: laid out and measured here, never printed directly. */}
      <div
        ref={flowRef}
        className={`${lined.flow} ${lined.screenOnly}`}
        style={{ width: `${(settings.paperW - geo.left - geo.right) / unitScale}mm` }}
      >
        <div
          className={settings.ink === "black" ? `${lined.doc} ${lined.inkBlack}` : lined.doc}
          style={{
            fontFamily: family,
            ["--weight" as string]: settings.weight,
            ["--lh" as string]: `${lineUnit(settings.pitch)}px`,
            // Font size is pre-divided by the paint scale so it prints at the chosen pt.
            ["--font" as string]: `${settings.fontPt / unitScale}pt`,
          }}
        >
          <h1>
            <Hast nodes={humanizeString(page.title, human)} />
          </h1>
          <Markdown content={page.content} rehypePlugins={rehypePlugins} />
        </div>
      </div>

      {mode === "calib" && <CalibrationSheet settings={settings} />}
    </>
  );
}

function CalibrationSheet({ settings: c }: { settings: LinedSettings }) {
  const x = (mm: number) => `${mm + c.offsetX}mm`;
  const y = (mm: number) => `${mm + c.offsetY}mm`;
  const text = textLeft(c);
  // Rulers stay clear of the edge most printers can't reach (~3-5 mm).
  const ruleY = 9;
  const ruleX = c.paperW - 9;
  const hTicks = Array.from({ length: Math.floor((c.paperW - 20) / 5) + 1 }, (_, i) => 10 + i * 5);
  const vTicks = Array.from({ length: Math.floor((c.paperH - 20) / 5) + 1 }, (_, i) => 10 + i * 5);
  const sampleStyle = {
    left: `${text + 9}mm`,
    // Roughly puts the baseline `lift` mm above the line (descender ≈ 0.2 em).
    bottom: `calc(${c.lift}mm - 0.2em)`,
    fontSize: `${c.fontPt}pt`,
    fontWeight: c.weight,
    fontFamily: fontFamily(c.font),
  };
  return (
    <div className={`${lined.calib} ${lined.printOnly}`} style={{ width: `${c.paperW}mm`, height: `${c.paperH - 0.5}mm` }}>
      {/* Ruled lines, numbered, with sample text on the first three. */}
      {Array.from({ length: c.lines }, (_, i) => (
        <div key={i} className={lined.calibLine} style={{ top: y(c.firstLine + i * c.pitch), left: x(0) }}>
          <span className={lined.calibNo} style={{ left: `${text}mm` }}>
            {i + 1}
          </span>
          {i < 3 && (
            <span className={lined.calibSample} style={sampleStyle}>
              {["Sample text on the line: Hag 0123", "Contoh tulisan di atas garis", "The quick brown fox jumps"][i]}
            </span>
          )}
        </div>
      ))}
      {c.hasMarginLine && <div className={lined.calibMarginLine} style={{ left: x(c.marginLeft) }} />}

      {/* Horizontal ruler (mm from the left edge). */}
      <div className={lined.calibTick} style={{ left: x(10), top: y(ruleY), width: `${c.paperW - 20}mm`, height: "0.3mm" }} />
      {hTicks.map((mm) => (
        <div key={`h${mm}`}>
          <div
            className={lined.calibTick}
            style={{ left: x(mm), top: y(ruleY), width: "0.3mm", height: mm % 10 === 0 ? "3.5mm" : "2mm" }}
          />
          {mm % 20 === 0 && (
            <span className={lined.calibTickLabel} style={{ left: x(mm + 0.8), top: y(ruleY + 1.4) }}>
              {mm}
            </span>
          )}
        </div>
      ))}
      {/* Vertical ruler (mm from the top edge), on the right. */}
      <div className={lined.calibTick} style={{ left: x(ruleX), top: y(10), width: "0.3mm", height: `${c.paperH - 20}mm` }} />
      {vTicks.map((mm) => (
        <div key={`v${mm}`}>
          <div
            className={lined.calibTick}
            style={{
              left: x(ruleX - (mm % 10 === 0 ? 3.5 : 2)),
              top: y(mm),
              width: mm % 10 === 0 ? "3.5mm" : "2mm",
              height: "0.3mm",
            }}
          />
          {mm % 20 === 0 && (
            <span className={lined.calibTickLabel} style={{ left: x(ruleX - 9), top: y(mm - 3) }}>
              {mm}
            </span>
          )}
        </div>
      ))}

      <p className={lined.calibNote} style={{ top: y(ruleY + 6), left: x(Math.max(text, 10)), width: `${c.paperW - Math.max(text, 10) - 22}mm` }}>
        Lines every {c.pitch} mm, line 1 at {c.firstLine} mm, {c.lines} lines, text from {text} mm, shift {c.offsetX} /{" "}
        {c.offsetY} mm. Print this on your lined paper: the black lines should cover the paper&apos;s lines. If they land
        lower by X mm, set Shift down to -X.
      </p>
    </div>
  );
}

/** Renders the few hast nodes humanizeString produces (spans + text). */
function Hast({ nodes }: { nodes: ElementContent[] }) {
  return (
    <>
      {nodes.map((n, i) =>
        n.type === "text" ? (
          n.value
        ) : n.type === "element" ? (
          <span
            key={i}
            className={(n.properties.className as string[] | undefined)?.join(" ")}
            style={styleObject(String(n.properties.style ?? ""))}
          >
            <Hast nodes={n.children} />
          </span>
        ) : null,
      )}
    </>
  );
}
