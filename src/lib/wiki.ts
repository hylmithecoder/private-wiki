// Must match `slugify` / `wikilinks` in service/src/wiki.rs.
export function slugify(s: string): string {
  let out = "";
  let dash = false;
  for (const ch of s.toLowerCase()) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      if (dash && out) out += "-";
      dash = false;
      out += ch;
    } else {
      dash = true;
    }
  }
  return out;
}

export const pageHref = (slug: string) => `/wiki?p=${encodeURIComponent(slug)}`;
export const editHref = (slug: string) => `/edit?p=${encodeURIComponent(slug)}`;
export const newHref = (title?: string) => (title ? `/edit?new=${encodeURIComponent(title)}` : "/edit?new=");
export const historyHref = (slug: string) => `/history?p=${encodeURIComponent(slug)}`;

const WIKILINK = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;

/**
 * Turns `[[Title]]` / `[[Title|label]]` into Markdown links, leaving fenced
 * and inline code untouched.
 */
export function expandWikilinks(md: string): string {
  return md
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(WIKILINK, (_, target: string, label?: string) => {
            const slug = slugify(target);
            if (!slug) return _;
            const text = (label ?? target).trim().replace(/[[\]]/g, "");
            return `[${text}](${pageHref(slug)})`;
          }),
    )
    .join("");
}

export type Heading = { id: string; text: string; depth: 2 | 3 };

/** `##` and `###` headings, for the "On this page" rail. */
export function headings(md: string): Heading[] {
  const out: Heading[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  for (const line of md.split("\n")) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/[*_`[\]]/g, "");
    out.push({ id: uniqueId(slugify(text), seen), text, depth: m[1].length as 2 | 3 });
  }
  return out;
}

export function uniqueId(base: string, seen: Map<string, number>): string {
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}
