// Page -> .docx, built from the Markdown AST in the browser.
// Loaded lazily by ExportMenu (the docx library is large).
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  HeightRule,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import type { Nodes, Parent, PhrasingContent, Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { Page } from "./api";
import { textLeft, type LinedSettings } from "./lined";
import { EXPORT_COLORS, highlight, titleFromMeta } from "./highlight";
import { fullDate } from "./time";
import { expandWikilinks } from "./wiki";

const FONT = "Calibri";
const MONO = "Consolas";
const TEXT = "1F2A24";
const MUTED = "5F6D65";
const ACCENT = "A35700";
const HAIR = "D5DCD7";
const CODE_BG = "F5F7F5";

type Marks = Pick<IRunOptions, "bold" | "italics" | "strike">;

const TWIP_PER_MM = 1440 / 25.4;

/** Paragraph spacing: normal, or snapped to the rulings of lined paper. */
type Rhythm = {
  lined: boolean;
  /** Print every glyph pure black (lined paper on B/W printers). */
  black: boolean;
  /** One ruling in twips (lined only). */
  pitch: number;
  /** spacing for a paragraph; `after` is in lines when lined. */
  sp(before: number, after: number, line?: number): { before: number; after: number; line: number; lineRule?: (typeof LineRuleType)[keyof typeof LineRuleType] };
};

function rhythm(l?: LinedSettings): Rhythm {
  if (!l) return { lined: false, black: false, pitch: 0, sp: (before, after, line = 300) => ({ before, after, line }) };
  const pitch = Math.round(l.pitch * TWIP_PER_MM);
  return {
    lined: true,
    black: l.ink === "black",
    pitch,
    // Every line box is exactly one ruling; spacing is whole rulings.
    sp: (before, after) => ({
      before: before ? pitch : 0,
      after: after ? pitch * l.gapLines : 0,
      line: pitch,
      lineRule: LineRuleType.EXACT,
    }),
  };
}

class Converter {
  constructor(
    private origin: string,
    private r: Rhythm = rhythm(),
  ) {}

  private url(href: string) {
    return href.startsWith("/") ? this.origin + href : href;
  }

  inline(nodes: PhrasingContent[], marks: Marks = {}): ParagraphChild[] {
    return nodes.flatMap((n): ParagraphChild[] => {
      switch (n.type) {
        case "text":
          return [new TextRun({ text: n.value, ...marks })];
        case "strong":
          return this.inline(n.children, { ...marks, bold: true });
        case "emphasis":
          return this.inline(n.children, { ...marks, italics: true });
        case "delete":
          return this.inline(n.children, { ...marks, strike: true });
        case "inlineCode":
          return [
            new TextRun({
              text: n.value,
              font: MONO,
              size: 19,
              color: TEXT,
              shading: { type: ShadingType.CLEAR, color: "auto", fill: "EEF1EE" },
              ...marks,
            }),
          ];
        case "break":
          return [new TextRun({ break: 1 })];
        case "link":
          return [
            new ExternalHyperlink({
              link: this.url(n.url),
              children: this.inline(n.children, marks).map((c) =>
                c instanceof TextRun ? c : new TextRun({ text: "" }),
              ),
            }),
          ];
        case "image":
          return [
            new ExternalHyperlink({
              link: this.url(n.url),
              children: [new TextRun({ text: `[image: ${n.alt || n.url}]`, color: ACCENT, ...marks })],
            }),
          ];
        default:
          return "value" in n && typeof n.value === "string" ? [new TextRun({ text: n.value, ...marks })] : [];
      }
    });
  }

  blocks(nodes: RootContent[], ctx: { indent?: number; quote?: boolean } = {}): (Paragraph | Table)[] {
    return nodes.flatMap((n) => this.block(n, ctx));
  }

  private para(children: ParagraphChild[], ctx: { indent?: number; quote?: boolean }, extra = {}) {
    return new Paragraph({
      children,
      spacing: this.r.sp(0, 140),
      indent: ctx.indent || ctx.quote ? { left: (ctx.indent ?? 0) + (ctx.quote ? 360 : 0) } : undefined,
      border: ctx.quote ? { left: { style: BorderStyle.SINGLE, size: 12, color: "E2B77A", space: 10 } } : undefined,
      ...extra,
    });
  }

  block(n: RootContent, ctx: { indent?: number; quote?: boolean }): (Paragraph | Table)[] {
    switch (n.type) {
      case "heading": {
        const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
        return [
          new Paragraph({
            heading: levels[Math.min(n.depth, 4) - 1],
            children: this.inline(n.children),
            keepNext: true,
            spacing: this.r.lined ? this.r.sp(1, 0) : { before: 280, after: 120 },
          }),
        ];
      }
      case "paragraph":
        return [this.para(this.inline(n.children, ctx.quote ? { italics: true } : {}), ctx)];
      case "blockquote":
        return this.blocks(n.children, { ...ctx, quote: true });
      case "list":
        return this.list(n, 0, ctx);
      case "code":
        return this.code(n.value, n.lang, titleFromMeta(n.meta), ctx);
      case "table":
        return [this.table(n)];
      case "thematicBreak":
        return [
          new Paragraph({
            children: [],
            spacing: this.r.sp(0, 200),
            border: this.r.lined ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 6, color: HAIR, space: 1 } },
          }),
        ];
      case "html":
        return [this.para([new TextRun({ text: n.value, font: MONO, size: 18, color: MUTED })], ctx)];
      default:
        return "children" in n ? this.blocks((n as Parent).children as RootContent[], ctx) : [];
    }
  }

  private list(n: Extract<Nodes, { type: "list" }>, level: number, ctx: { quote?: boolean }): Paragraph[] {
    const out: Paragraph[] = [];
    const reference = n.ordered ? "ordered" : "bullets";
    for (const item of n.children) {
      item.children.forEach((child, i) => {
        if (child.type === "list") {
          out.push(...this.list(child, level + 1, ctx));
        } else if (child.type === "paragraph" && i === 0) {
          const check = item.checked == null ? [] : [new TextRun({ text: item.checked ? "☑ " : "☐ " })];
          out.push(
            new Paragraph({
              children: [...check, ...this.inline(child.children)],
              numbering: { reference, level: Math.min(level, 3) },
              spacing: this.r.lined ? this.r.sp(0, 0) : { after: 60, line: 290 },
            }),
          );
        } else {
          out.push(
            ...(this.block(child, { indent: 720 * (level + 1), quote: ctx.quote }) as Paragraph[]),
          );
        }
      });
    }
    return out;
  }

  private code(
    value: string,
    lang: string | null | undefined,
    title: string | null,
    ctx: { indent?: number },
  ): Paragraph[] {
    const { label, lines } = highlight(value, lang);
    const shading = { type: ShadingType.CLEAR, color: "auto", fill: CODE_BG };
    const indent = { left: (ctx.indent ?? 0) + 120, right: 120 };
    const side = { style: BorderStyle.SINGLE, size: 4, color: HAIR, space: 6 };
    const header = new Paragraph({
      children: [
        new TextRun({ text: label.toUpperCase(), font: FONT, size: 16, bold: true, color: MUTED }),
        ...(title ? [new TextRun({ text: `   ${title}`, font: MONO, size: 16, color: MUTED })] : []),
      ],
      shading,
      indent,
      keepNext: true,
      // Top/bottom paragraph borders add height, which would break the rulings.
      spacing: this.r.lined ? this.r.sp(0, 0) : { before: 120, after: 0 },
      border: this.r.lined ? { left: side, right: side } : { top: side, left: side, right: side },
    });
    const body = lines.map((tokens, i) => {
      const last = i === lines.length - 1;
      return new Paragraph({
        children: tokens.length
          ? tokens.map(
              (t) =>
                new TextRun({
                  text: t.text,
                  font: MONO,
                  size: 18,
                  color: this.r.black ? "000000" : EXPORT_COLORS[t.kind],
                  italics: t.kind === "comment",
                }),
            )
          : [new TextRun({ text: "", font: MONO, size: 18 })],
        shading,
        indent,
        keepLines: true,
        keepNext: !last,
        spacing: this.r.lined
          ? this.r.sp(0, last ? 1 : 0)
          : { before: i === 0 ? 60 : 0, after: last ? 200 : 0, line: 260 },
        border: { left: side, right: side, ...(last && !this.r.lined ? { bottom: side } : {}) },
      });
    });
    return [header, ...body];
  }

  private table(n: Extract<Nodes, { type: "table" }>): Table {
    const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: HAIR };
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: n.children.map(
        (row, r) =>
          new TableRow({
            tableHeader: r === 0,
            ...(this.r.lined ? { height: { value: this.r.pitch, rule: HeightRule.ATLEAST } } : {}),
            children: row.children.map(
              (cell, c) =>
                new TableCell({
                  borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                  shading: r === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "EEF1EE" } : undefined,
                  margins: this.r.lined ? { top: 0, bottom: 0, left: 100, right: 100 } : { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [
                    new Paragraph({
                      children: this.inline(cell.children, r === 0 ? { bold: true } : {}),
                      spacing: this.r.lined ? this.r.sp(0, 0) : undefined,
                      alignment:
                        n.align?.[c] === "center"
                          ? AlignmentType.CENTER
                          : n.align?.[c] === "right"
                            ? AlignmentType.RIGHT
                            : AlignmentType.LEFT,
                    }),
                  ],
                }),
            ),
          }),
      ),
    });
  }
}

/**
 * @param lined when given, lay the document out for pre-ruled paper: page
 *   size and margins from the settings, every line exactly one ruling tall.
 *   Word positions text inside "exact" lines slightly differently from the
 *   browser, so fine-tune with the printer shift if needed.
 */
export async function pageToDocx(page: Page, origin: string, lined?: LinedSettings): Promise<Blob> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(expandWikilinks(page.content)) as Root;
  const r = rhythm(lined);
  const conv = new Converter(origin, r);
  const tw = (mm: number) => Math.round(mm * TWIP_PER_MM);
  let pageProps: object = { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } };
  if (lined) {
    // Word puts the extra space of an exact line above the text, so the
    // baseline sits about one descent above the bottom of the line.
    const baseline = lined.pitch - lined.fontPt * 0.3528 * 0.24;
    const top = lined.firstLine - lined.lift - baseline + lined.offsetY;
    const bottom = lined.paperH - top - lined.lines * lined.pitch - 0.3;
    pageProps = {
      size: { width: tw(lined.paperW), height: tw(lined.paperH) },
      margin: {
        top: tw(Math.max(top, 0)),
        bottom: tw(Math.max(bottom, 0)),
        left: tw(textLeft(lined) + lined.offsetX),
        right: tw(lined.marginRight - lined.offsetX),
        header: 0,
        footer: 0,
      },
    };
  }

  const meta = [
    `Updated ${fullDate(page.updated_at)}`,
    page.tags.length ? `Tags: ${page.tags.join(", ")}` : null,
    `${origin}/wiki?p=${encodeURIComponent(page.slug)}`,
  ].filter(Boolean) as string[];

  const doc = new Document({
    creator: "Wiki",
    title: page.title,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: lined ? Math.round(lined.fontPt * 2) : 22, color: r.black ? "000000" : TEXT },
        },
        // On lined paper headings must still fit inside one ruling.
        heading1: { run: { font: FONT, size: lined ? Math.round(lined.fontPt * 2.6) : 34, bold: true, color: TEXT } },
        heading2: { run: { font: FONT, size: lined ? Math.round(lined.fontPt * 2.36) : 28, bold: true, color: TEXT } },
        heading3: { run: { font: FONT, size: lined ? Math.round(lined.fontPt * 2.1) : 24, bold: true, color: TEXT } },
        heading4: { run: { font: FONT, size: lined ? Math.round(lined.fontPt * 2) : 22, bold: true, color: TEXT } },
        title: { run: { font: FONT, size: lined ? Math.round(lined.fontPt * 2.7) : 48, bold: true, color: TEXT } },
        hyperlink: { run: { color: ACCENT, underline: {} } },
      },
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [0, 1, 2, 3].map((level) => ({
            level,
            format: LevelFormat.BULLET,
            text: ["•", "◦", "▪", "•"][level],
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
        {
          reference: "ordered",
          levels: [0, 1, 2, 3].map((level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN, LevelFormat.DECIMAL][level],
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: { page: pageProps },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun(page.title)],
            spacing: r.lined ? r.sp(0, 1) : { after: 80 },
          }),
          // The source line is noise on handwriting paper; keep it for normal docs.
          ...(r.lined
            ? []
            : [
                new Paragraph({
                  children: [new TextRun({ text: meta.join("   |   "), size: 17, color: MUTED })],
                  spacing: { after: 320 },
                  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: HAIR, space: 8 } },
                }),
              ]),
          ...conv.blocks(tree.children),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}
