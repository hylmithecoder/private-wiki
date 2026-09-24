// "Written by hand" rendering for the lined-paper print view.
//
// Every letter gets a small, deterministic wobble: tilt, baseline offset,
// size and ink pressure, plus a slow drift per word (lines are never
// perfectly straight by hand) and slightly uneven word gaps. Deterministic
// (seeded) so the preview and the printout are identical.
//
// Letters become inline-blocks (transforms don't apply to plain inline
// boxes); each word is kept `nowrap` so lines still only break at spaces.
import type { Element, ElementContent, Root, RootContent } from "hast";
import type { CSSProperties } from "react";

/** mulberry32: tiny, fast, good enough for visual jitter. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

type Rand = () => number;
const spread = (r: Rand) => r() * 2 - 1;

export type HumanizeOptions = {
  /** 0 = typed, 1 = very loose handwriting. */
  amount: number;
  seed: number;
  wordClass: string;
  charClass: string;
};

class Jitter {
  private r: Rand;
  private word = 0;
  private phase: number;
  constructor(private o: HumanizeOptions) {
    this.r = prng(o.seed);
    this.phase = this.r() * Math.PI * 2;
  }

  wordStyle(): string {
    this.word++;
    // Uneven gaps between words.
    return `margin-right:${(spread(this.r) * 0.45 * this.o.amount).toFixed(3)}mm`;
  }

  /** CSS for one letter; `drift` follows the word's position on the line. */
  charStyle(): string {
    const a = this.o.amount;
    const drift = Math.sin(this.word * 0.85 + this.phase) * 0.22 * a;
    const dy = spread(this.r) * 0.26 * a + drift;
    const rot = spread(this.r) * 2.4 * a;
    const scale = 1 + spread(this.r) * 0.05 * a;
    const ink = 1 - this.r() * 0.16 * a;
    return (
      `transform:translateY(${dy.toFixed(3)}mm) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)});` +
      `opacity:${ink.toFixed(3)}`
    );
  }

  split(text: string): ElementContent[] {
    return text.split(/(\s+)/).flatMap((part): ElementContent[] => {
      if (!part) return [];
      if (/^\s+$/.test(part)) return [{ type: "text", value: part }];
      return [
        {
          type: "element",
          tagName: "span",
          properties: { className: [this.o.wordClass], style: this.wordStyle() },
          children: Array.from(part).map((ch) => ({
            type: "element" as const,
            tagName: "span",
            properties: { className: [this.o.charClass], style: this.charStyle() },
            children: [{ type: "text" as const, value: ch }],
          })),
        },
      ];
    });
  }
}

/** Code stays typed; form controls and graphics have no text to wobble. */
const SKIP = new Set(["pre", "code", "svg", "input", "math", "script", "style"]);

/** rehype plugin for react-markdown. */
export function rehypeHumanize(options: HumanizeOptions) {
  return () => (tree: Root) => {
    if (options.amount <= 0) return;
    const j = new Jitter(options);
    const walk = (node: Root | Element) => {
      node.children = node.children.flatMap((child: RootContent): RootContent[] => {
        if (child.type === "text") return j.split(child.value);
        if (child.type === "element" && !SKIP.has(child.tagName)) walk(child);
        return [child];
      }) as typeof node.children;
    };
    walk(tree);
  };
}

/** The same treatment for a plain string (the page title), as hast nodes. */
export function humanizeString(text: string, options: HumanizeOptions): ElementContent[] {
  if (options.amount <= 0) return [{ type: "text", value: text }];
  return new Jitter({ ...options, seed: options.seed ^ 0x9e3779b9 }).split(text);
}

/** "transform:x;opacity:y" -> { transform: "x", opacity: "y" } */
export function styleObject(css: string): CSSProperties {
  return Object.fromEntries(
    css
      .split(";")
      .filter(Boolean)
      .map((decl) => {
        const i = decl.indexOf(":");
        const key = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        return [key, decl.slice(i + 1).trim()];
      }),
  );
}
