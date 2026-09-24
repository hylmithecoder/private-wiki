// Syntax highlighting shared by the code block UI and the .docx export.
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

export type TokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "type"
  | "attr"
  | "meta"
  | "tag"
  | "addition"
  | "deletion";

export type Token = { text: string; kind: TokenKind };
export type Highlighted = { lang: string | null; label: string; lines: Token[][] };

const LABELS: Record<string, string> = {
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  zsh: "Shell",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  csharp: "C#",
  cs: "C#",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  graphql: "GraphQL",
  ini: "INI",
  toml: "TOML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  jsx: "JSX",
  json: "JSON",
  kotlin: "Kotlin",
  lua: "Lua",
  makefile: "Makefile",
  markdown: "Markdown",
  md: "Markdown",
  php: "PHP",
  python: "Python",
  py: "Python",
  r: "R",
  ruby: "Ruby",
  rust: "Rust",
  rs: "Rust",
  scss: "SCSS",
  sql: "SQL",
  swift: "Swift",
  typescript: "TypeScript",
  ts: "TypeScript",
  tsx: "TSX",
  html: "HTML",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
};

// Guessing only among languages likely in this wiki keeps detection sane.
const AUTO_SUBSET = [
  "python", "javascript", "typescript", "rust", "bash", "sql", "json",
  "c", "cpp", "java", "go", "css", "xml", "yaml", "kotlin", "php",
];

function kindOf(classes: string[]): TokenKind | null {
  const c = classes.join(" ");
  if (/hljs-(comment|quote|doctag)/.test(c)) return "comment";
  if (/hljs-(string|regexp|char)/.test(c)) return "string";
  if (/hljs-(number|literal|symbol|bullet)/.test(c)) return "number";
  if (/hljs-title.*function_|hljs-function/.test(c)) return "function";
  if (/hljs-(type|built_in|title|class)/.test(c)) return "type";
  if (/hljs-(keyword|selector-tag|operator)/.test(c)) return "keyword";
  if (/hljs-(attr|attribute|property|variable|params|template-variable|selector-(class|id|attr|pseudo))/.test(c)) return "attr";
  if (/hljs-(meta|section|link)/.test(c)) return "meta";
  if (/hljs-(tag|name)/.test(c)) return "tag";
  if (/hljs-addition/.test(c)) return "addition";
  if (/hljs-deletion/.test(c)) return "deletion";
  return null;
}

type HNode = { type: string; value?: string; properties?: { className?: string[] }; children?: HNode[] };

function flatten(node: HNode, inherited: TokenKind, out: Token[]) {
  if (node.type === "text") {
    out.push({ text: node.value ?? "", kind: inherited });
    return;
  }
  const own = node.type === "element" ? kindOf(node.properties?.className ?? []) : null;
  for (const child of node.children ?? []) flatten(child, own ?? inherited, out);
}

function toLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const t of tokens) {
    t.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, kind: t.kind });
    });
  }
  // Drop the empty line a trailing newline would leave behind.
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

export function highlight(code: string, rawLang?: string | null): Highlighted {
  const lang = rawLang?.toLowerCase() ?? null;
  try {
    if (lang && lowlight.registered(lang)) {
      const tree = lowlight.highlight(lang, code) as HNode;
      const tokens: Token[] = [];
      flatten(tree, "plain", tokens);
      return { lang, label: LABELS[lang] ?? rawLang!, lines: toLines(tokens) };
    }
    if (!lang && code.includes("\n")) {
      const tree = lowlight.highlightAuto(code, { subset: AUTO_SUBSET }) as HNode & { data?: { language?: string } };
      const detected = tree.data?.language;
      if (detected) {
        const tokens: Token[] = [];
        flatten(tree, "plain", tokens);
        return { lang: detected, label: LABELS[detected] ?? detected, lines: toLines(tokens) };
      }
    }
  } catch {
    // Fall through to plain text.
  }
  return {
    lang,
    label: lang ? (LABELS[lang] ?? rawLang!) : "Code",
    lines: toLines([{ text: code, kind: "plain" }]),
  };
}

/**
 * Parses a fence's info string after the language, e.g. `title="graph.py"`,
 * `title=graph.py`, or a bare file name like `graph.py`.
 */
export function titleFromMeta(meta: string | null | undefined): string | null {
  if (!meta) return null;
  const quoted = /title=(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(meta);
  if (quoted) return quoted[1] ?? quoted[2] ?? quoted[3];
  const bare = meta.trim().split(/\s+/)[0];
  return bare && /\.[a-z0-9]+$/i.test(bare) ? bare : null;
}

/** Light-theme colours as hex, for exports (docx) where CSS vars don't exist. */
export const EXPORT_COLORS: Record<TokenKind, string> = {
  plain: "1F2A24",
  keyword: "9A3F00",
  string: "2F6F3E",
  number: "7A4A8C",
  comment: "6B7A72",
  function: "1F5F8B",
  type: "0F6B6B",
  attr: "8A5A00",
  meta: "6B5B95",
  tag: "1F5F8B",
  addition: "2F6F3E",
  deletion: "B3261E",
};
