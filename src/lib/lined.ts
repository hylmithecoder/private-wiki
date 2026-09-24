// Geometry for printing onto pre-ruled paper (e.g. "folio bergaris").
//
// Every line of text gets a line box exactly one ruling tall, and every block
// is padded to a whole number of rulings, so text stays on the printed lines
// from the first page to the last. The page's content area is also an exact
// number of rulings tall, so page 2+ start on the grid too.

export type LinedSettings = {
  preset: string;
  /** Paper size, mm. */
  paperW: number;
  paperH: number;
  /** Distance between two ruled lines, mm. */
  pitch: number;
  /** Distance from the top edge of the paper to the first ruled line, mm. */
  firstLine: number;
  /** Number of ruled lines on one side of the sheet. */
  lines: number;
  /** Whether the paper has a vertical (red) margin line. */
  hasMarginLine: boolean;
  /** The margin line's position, or where text starts if there is none, mm. */
  marginLeft: number;
  /** Space kept free on the right, mm. */
  marginRight: number;
  /** Body text size, pt. */
  fontPt: number;
  /** How far text sits above the ruled line, mm (0 = baseline on the line). */
  lift: number;
  /** Empty lines between paragraphs / blocks. */
  gapLines: 0 | 1;
  /** "black" prints every glyph pure black (best on B/W printers). */
  ink: "black" | "color";
  /** Body font weight; heavier prints crisper on inkjets. */
  weight: 400 | 500 | 600;
  /** Printer calibration: shifts everything, mm (+ = right / down). */
  offsetX: number;
  offsetY: number;
};

export const PRESETS: Record<string, { label: string; values: Partial<LinedSettings> }> = {
  sidu: {
    label: "Sidu folio bergaris (F4, no margin line)",
    // Estimated from a photo of the sheet: 38 writing lines between a double
    // top rule and a ticked bottom rule, edge to edge. Confirm with a ruler.
    values: {
      paperW: 215,
      paperH: 330,
      pitch: 7.2,
      firstLine: 33.5,
      lines: 38,
      hasMarginLine: false,
      marginLeft: 15,
      marginRight: 12,
    },
  },
  folio: {
    label: "Folio bergaris with red margin (F4)",
    // Starting estimates; measure your own sheet (see the help text).
    values: {
      paperW: 215,
      paperH: 330,
      pitch: 8.5,
      firstLine: 35,
      lines: 34,
      hasMarginLine: true,
      marginLeft: 32,
      marginRight: 12,
    },
  },
  a4: {
    label: "A4 bergaris (210 × 297 mm)",
    values: {
      paperW: 210,
      paperH: 297,
      pitch: 8,
      firstLine: 25,
      lines: 33,
      hasMarginLine: true,
      marginLeft: 25,
      marginRight: 12,
    },
  },
  custom: { label: "Custom", values: {} },
};

export const DEFAULTS: LinedSettings = {
  preset: "sidu",
  paperW: 215,
  paperH: 330,
  pitch: 7.2,
  firstLine: 33.5,
  lines: 38,
  hasMarginLine: false,
  marginLeft: 15,
  marginRight: 12,
  fontPt: 11,
  lift: 0.8,
  gapLines: 1,
  ink: "black",
  weight: 500,
  offsetX: 0,
  offsetY: 0,
};

const KEY = "wiki.lined-print";

export function loadSettings(): LinedSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: LinedSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode etc.; settings just won't persist.
  }
}

export const MM_TO_PX = 96 / 25.4;
/** Gap between the margin line and the start of the text, mm. */
export const TEXT_INDENT = 3;

/** Where text starts from the left paper edge, mm (without printer shift). */
export const textLeft = (s: LinedSettings) => s.marginLeft + (s.hasMarginLine ? TEXT_INDENT : 0);

export type Geometry = {
  /** @page margins, mm. */
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** Content height per page = lines * pitch, mm. */
  pageContent: number;
  /** Problems worth showing to the user. */
  warnings: string[];
};

/**
 * @param baselineMm where the baseline sits inside one line box (measured
 *   in the browser for the actual font), mm from the top of the box.
 */
export function geometry(s: LinedSettings, baselineMm: number): Geometry {
  const warnings: string[] = [];
  // First line box starts so its baseline lands `lift` mm above ruling #1.
  const top = s.firstLine - s.lift - baselineMm + s.offsetY;
  const pageContent = s.lines * s.pitch;
  const bottom = s.paperH - top - pageContent;
  const left = textLeft(s) + s.offsetX;
  const right = s.marginRight - s.offsetX;

  if (top < 0) warnings.push("The first line is too close to the top edge for this font size.");
  if (bottom < 0) warnings.push("The lines don't fit on the paper: reduce the number of lines or the spacing.");
  if (s.fontPt * 0.3528 * 1.25 > s.pitch)
    warnings.push("The font is large for this line spacing; letters may touch the lines above.");
  if (left + right >= s.paperW - 20) warnings.push("The side margins leave almost no room for text.");
  return { top, right, bottom: Math.max(bottom, 0), left, pageContent, warnings };
}
