// Typed client for the Rust service (/api). Mirrors service/src/wiki.rs.

export type Author = "human" | "claude";

export type Page = {
  slug: string;
  title: string;
  content: string;
  tags: string[];
  revision_id: number;
  author: Author;
  created_at: number;
  updated_at: number;
};

export type PageSummary = {
  slug: string;
  title: string;
  tags: string[];
  updated_at: number;
};

export type RevisionMeta = {
  id: number;
  summary: string;
  author: Author;
  created_at: number;
  size: number;
};

export type Revision = {
  id: number;
  slug: string;
  title: string;
  content: string;
  summary: string;
  author: Author;
  created_at: number;
};

export type Change = {
  slug: string;
  title: string;
  revision_id: number;
  summary: string;
  author: Author;
  created_at: number;
};

export type Session = { authenticated: boolean; writable: boolean };

export type SearchHit = { slug: string; title: string; snippet: string };
export type TagCount = { tag: string; count: number };

// Relative on purpose: in production the binary serves UI and /api together,
// and in dev `next dev` proxies /api to the service (see next.config.ts).
const BASE = "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }

  get needsLogin() {
    return this.status === 401;
  }

  get isStale() {
    return this.status === 409 && this.body.kind === "stale";
  }

  get currentRevisionId() {
    return typeof this.body.current_revision_id === "number" ? this.body.current_revision_id : null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the wiki service. Is it running?", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(typeof body.error === "string" ? body.error : res.statusText, res.status, body);
  }
  return body as T;
}

/** SWR fetcher: keys are API paths such as `/pages/rust`. */
export const fetcher = <T,>(path: string) => request<T>(path);

export const keys = {
  pages: (tag?: string) => (tag ? `/pages?tag=${encodeURIComponent(tag)}` : "/pages?limit=500"),
  page: (slug: string) => `/pages/${encodeURIComponent(slug)}`,
  history: (slug: string) => `/pages/${encodeURIComponent(slug)}/history`,
  revision: (slug: string, id: number) => `/pages/${encodeURIComponent(slug)}/revisions/${id}`,
  backlinks: (slug: string) => `/pages/${encodeURIComponent(slug)}/backlinks`,
  search: (q: string) => `/search?q=${encodeURIComponent(q)}`,
  recent: (author?: Author) => (author ? `/recent?author=${author}` : "/recent"),
  tags: () => "/tags",
  graph: () => "/graph",
  session: () => "/session",
};

export const api = {
  login: (key: string) => request<Session>("/login", { method: "POST", body: JSON.stringify({ key }) }),
  logout: () => request<Session>("/logout", { method: "POST" }),

  createPage: (input: { title: string; content: string; tags: string[]; summary: string }) =>
    request<Page>("/pages", { method: "POST", body: JSON.stringify(input) }),

  updatePage: (
    slug: string,
    input: { title: string; content: string; tags: string[]; summary: string; base_revision_id: number },
  ) => request<Page>(keys.page(slug), { method: "PUT", body: JSON.stringify(input) }),

  deletePage: (slug: string) => request<{ ok: boolean }>(keys.page(slug), { method: "DELETE" }),

  revert: (slug: string, revision_id: number) =>
    request<Page>(`${keys.page(slug)}/revert`, { method: "POST", body: JSON.stringify({ revision_id }) }),
};

export type GraphData = {
  nodes: { slug: string; title: string; tags: string[]; updated_at: number }[];
  links: { from: string; to: string }[];
};
