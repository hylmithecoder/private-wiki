//! Wiki core: the only code that touches SQLite. The HTTP API and the MCP
//! server are thin adapters over these functions, so every write (human or
//! Claude) goes through the same validation, revision history and indexing.

use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Serialize;

/// Marks the start / end of a highlighted term in search snippets.
pub const HL_START: char = '\u{2}';
pub const HL_END: char = '\u{3}';

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Author {
    Human,
    Claude,
}

impl Author {
    fn as_str(self) -> &'static str {
        match self {
            Author::Human => "human",
            Author::Claude => "claude",
        }
    }

    fn parse(s: &str) -> Self {
        if s == "claude" {
            Author::Claude
        } else {
            Author::Human
        }
    }
}

#[derive(Debug)]
pub enum WikiError {
    NotFound(String),
    AlreadyExists(String),
    Conflict { current_revision_id: i64 },
    Invalid(String),
    Db(rusqlite::Error),
}

impl std::fmt::Display for WikiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WikiError::NotFound(slug) => write!(f, "page '{slug}' not found"),
            WikiError::AlreadyExists(slug) => write!(f, "page '{slug}' already exists"),
            WikiError::Conflict {
                current_revision_id,
            } => write!(
                f,
                "page changed since you read it (current revision is {current_revision_id}); re-read it and apply your edit again"
            ),
            WikiError::Invalid(msg) => write!(f, "{msg}"),
            WikiError::Db(e) => write!(f, "database error: {e}"),
        }
    }
}

impl std::error::Error for WikiError {}

impl From<rusqlite::Error> for WikiError {
    fn from(e: rusqlite::Error) -> Self {
        WikiError::Db(e)
    }
}

pub type Result<T> = std::result::Result<T, WikiError>;

#[derive(Debug, Serialize)]
pub struct Page {
    pub slug: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub revision_id: i64,
    pub author: Author,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct PageSummary {
    pub slug: String,
    pub title: String,
    pub tags: Vec<String>,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct RevisionMeta {
    pub id: i64,
    pub summary: String,
    pub author: Author,
    pub created_at: i64,
    pub size: i64,
}

#[derive(Debug, Serialize)]
pub struct Revision {
    pub id: i64,
    pub slug: String,
    pub title: String,
    pub content: String,
    pub summary: String,
    pub author: Author,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct Change {
    pub slug: String,
    pub title: String,
    pub revision_id: i64,
    pub summary: String,
    pub author: Author,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub slug: String,
    pub title: String,
    /// Excerpt with matches wrapped in [`HL_START`] / [`HL_END`].
    pub snippet: String,
}

#[derive(Debug, Serialize)]
pub struct GraphNode {
    pub slug: String,
    pub title: String,
    pub tags: Vec<String>,
    pub updated_at: i64,
}

/// All live pages plus every `[[wikilink]]` between them. Link targets that
/// don't exist yet are included (`to` has no matching node) so the UI can
/// show "wanted" pages.
#[derive(Debug, Serialize)]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub links: Vec<GraphLink>,
}

#[derive(Debug, Serialize)]
pub struct GraphLink {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Serialize)]
pub struct TagCount {
    pub tag: String,
    pub count: i64,
}

pub struct NewPage {
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub summary: String,
    pub author: Author,
}

pub struct PageUpdate {
    pub title: Option<String>,
    pub content: String,
    pub tags: Option<Vec<String>>,
    pub base_revision_id: i64,
    pub summary: String,
    pub author: Author,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS pages (
    id                  INTEGER PRIMARY KEY,
    slug                TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    current_revision_id INTEGER,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at          INTEGER
);

-- Append-only: rows are never updated or deleted.
CREATE TABLE IF NOT EXISTS revisions (
    id         INTEGER PRIMARY KEY,
    page_id    INTEGER NOT NULL REFERENCES pages(id),
    parent_id  INTEGER REFERENCES revisions(id),
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    summary    TEXT NOT NULL DEFAULT '',
    author     TEXT NOT NULL CHECK (author IN ('human', 'claude')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS revisions_page ON revisions(page_id, id);
CREATE INDEX IF NOT EXISTS revisions_recent ON revisions(id DESC, author);

CREATE TABLE IF NOT EXISTS links (
    from_page_id INTEGER NOT NULL REFERENCES pages(id),
    to_slug      TEXT NOT NULL,
    PRIMARY KEY (from_page_id, to_slug)
);
CREATE INDEX IF NOT EXISTS links_to ON links(to_slug);

CREATE TABLE IF NOT EXISTS page_tags (
    page_id INTEGER NOT NULL REFERENCES pages(id),
    tag     TEXT NOT NULL,
    PRIMARY KEY (page_id, tag)
);
CREATE INDEX IF NOT EXISTS page_tags_tag ON page_tags(tag);

-- Web login sessions. Only a SHA-256 of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
);

-- rowid = pages.id; kept in sync by `index_page`.
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
    title, content, tokenize = 'unicode61 remove_diacritics 2'
);
"#;

#[derive(Clone, Debug)]
pub struct Wiki {
    conn: Arc<Mutex<Connection>>,
}

impl Wiki {
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path)?;
        // WAL lets the HTTP server and a stdio MCP process share the file.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// `$WIKI_DB`, else `$XDG_DATA_HOME/trpl3c-wiki/wiki.db`
    /// (falling back to `~/.local/share`). Both entry points use this so
    /// they always agree on the file regardless of working directory.
    pub fn default_path() -> PathBuf {
        if let Some(p) = std::env::var("WIKI_DB").ok().filter(|p| !p.is_empty()) {
            return PathBuf::from(p);
        }
        let base = std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|_| std::env::var("HOME").map(|h| PathBuf::from(h).join(".local/share")))
            .unwrap_or_else(|_| PathBuf::from("."));
        base.join("trpl3c-wiki").join("wiki.db")
    }

    fn with<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        let mut conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut conn)
    }

    pub fn list_pages(&self, tag: Option<&str>, limit: i64) -> Result<Vec<PageSummary>> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT p.id, p.slug, p.title, p.updated_at FROM pages p
                 WHERE p.deleted_at IS NULL
                   AND (?1 IS NULL OR EXISTS (SELECT 1 FROM page_tags t WHERE t.page_id = p.id AND t.tag = ?1))
                 ORDER BY p.updated_at DESC LIMIT ?2",
            )?;
            let rows = stmt
                .query_map(params![tag, limit], |r| {
                    Ok((r.get::<_, i64>(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows.into_iter()
                .map(|(id, slug, title, updated_at)| {
                    Ok(PageSummary {
                        tags: tags_for(c, id)?,
                        slug,
                        title,
                        updated_at,
                    })
                })
                .collect()
        })
    }

    pub fn get_page(&self, slug: &str) -> Result<Page> {
        self.with(|c| load_page(c, slug))
    }

    pub fn create_page(&self, new: NewPage) -> Result<Page> {
        let title = clean_title(&new.title)?;
        let slug = slugify(&title);
        if slug.is_empty() {
            return Err(WikiError::Invalid(
                "title must contain letters or digits".into(),
            ));
        }
        let tags = clean_tags(&new.tags);
        self.with(|c| {
            let tx = c.transaction()?;
            let existing: Option<(i64, Option<i64>)> = tx
                .query_row(
                    "SELECT id, deleted_at FROM pages WHERE slug = ?1",
                    [&slug],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            let (page_id, parent) = match existing {
                Some((_, None)) => return Err(WikiError::AlreadyExists(slug)),
                // Re-creating a deleted page continues its history.
                Some((id, Some(_))) => {
                    let cur: Option<i64> = tx.query_row(
                        "SELECT current_revision_id FROM pages WHERE id = ?1",
                        [id],
                        |r| r.get(0),
                    )?;
                    tx.execute(
                        "UPDATE pages SET title = ?2, deleted_at = NULL WHERE id = ?1",
                        params![id, title],
                    )?;
                    (id, cur)
                }
                None => {
                    tx.execute(
                        "INSERT INTO pages (slug, title) VALUES (?1, ?2)",
                        params![slug, title],
                    )?;
                    (tx.last_insert_rowid(), None)
                }
            };
            write_revision(
                &tx,
                page_id,
                parent,
                &title,
                &new.content,
                &new.summary,
                new.author,
            )?;
            set_tags(&tx, page_id, &tags)?;
            tx.commit()?;
            load_page(c, &slug)
        })
    }

    pub fn update_page(&self, slug: &str, upd: PageUpdate) -> Result<Page> {
        let title = upd.title.as_deref().map(clean_title).transpose()?;
        let tags = upd.tags.as_deref().map(clean_tags);
        self.with(|c| {
            let tx = c.transaction()?;
            let (page_id, current_title, current_rev) = live_page(&tx, slug)?;
            if current_rev != upd.base_revision_id {
                return Err(WikiError::Conflict {
                    current_revision_id: current_rev,
                });
            }
            let title = title.unwrap_or(current_title);
            write_revision(
                &tx,
                page_id,
                Some(current_rev),
                &title,
                &upd.content,
                &upd.summary,
                upd.author,
            )?;
            if let Some(tags) = &tags {
                set_tags(&tx, page_id, tags)?;
            }
            tx.commit()?;
            load_page(c, slug)
        })
    }

    /// Replace exactly one occurrence of `old_text`. Lets Claude make small
    /// fixes without resending (and possibly mangling) a whole page.
    pub fn edit_page(
        &self,
        slug: &str,
        old_text: &str,
        new_text: &str,
        base_revision_id: i64,
        summary: &str,
        author: Author,
    ) -> Result<Page> {
        if old_text.is_empty() {
            return Err(WikiError::Invalid("old_text must not be empty".into()));
        }
        let page = self.get_page(slug)?;
        match page.content.matches(old_text).count() {
            0 => {
                return Err(WikiError::Invalid(
                    "old_text was not found in the page".into(),
                ));
            }
            1 => {}
            n => {
                return Err(WikiError::Invalid(format!(
                    "old_text appears {n} times; include more surrounding text so it is unique"
                )));
            }
        }
        self.update_page(
            slug,
            PageUpdate {
                title: None,
                content: page.content.replacen(old_text, new_text, 1),
                tags: None,
                base_revision_id,
                summary: summary.to_string(),
                author,
            },
        )
    }

    pub fn delete_page(&self, slug: &str) -> Result<()> {
        self.with(|c| {
            let tx = c.transaction()?;
            let (page_id, _, _) = live_page(&tx, slug)?;
            tx.execute(
                "UPDATE pages SET deleted_at = unixepoch() WHERE id = ?1",
                [page_id],
            )?;
            tx.execute("DELETE FROM pages_fts WHERE rowid = ?1", [page_id])?;
            tx.execute("DELETE FROM links WHERE from_page_id = ?1", [page_id])?;
            tx.commit()?;
            Ok(())
        })
    }

    pub fn history(&self, slug: &str) -> Result<Vec<RevisionMeta>> {
        self.with(|c| {
            let (page_id, _, _) = live_page(c, slug)?;
            let mut stmt = c.prepare(
                "SELECT id, summary, author, created_at, length(content) FROM revisions
                 WHERE page_id = ?1 ORDER BY id DESC",
            )?;
            let rows = stmt
                .query_map([page_id], |r| {
                    Ok(RevisionMeta {
                        id: r.get(0)?,
                        summary: r.get(1)?,
                        author: Author::parse(&r.get::<_, String>(2)?),
                        created_at: r.get(3)?,
                        size: r.get(4)?,
                    })
                })?
                .collect::<rusqlite::Result<_>>()?;
            Ok(rows)
        })
    }

    pub fn get_revision(&self, slug: &str, id: i64) -> Result<Revision> {
        self.with(|c| {
            c.query_row(
                "SELECT r.id, p.slug, r.title, r.content, r.summary, r.author, r.created_at
                 FROM revisions r JOIN pages p ON p.id = r.page_id
                 WHERE p.slug = ?1 AND r.id = ?2",
                params![slug, id],
                |r| {
                    Ok(Revision {
                        id: r.get(0)?,
                        slug: r.get(1)?,
                        title: r.get(2)?,
                        content: r.get(3)?,
                        summary: r.get(4)?,
                        author: Author::parse(&r.get::<_, String>(5)?),
                        created_at: r.get(6)?,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| WikiError::NotFound(format!("{slug}@{id}")))
        })
    }

    /// Restores an old revision by writing it as a new one; history is kept.
    pub fn revert(&self, slug: &str, revision_id: i64, author: Author) -> Result<Page> {
        let old = self.get_revision(slug, revision_id)?;
        let current = self.get_page(slug)?;
        self.update_page(
            slug,
            PageUpdate {
                title: Some(old.title),
                content: old.content,
                tags: None,
                base_revision_id: current.revision_id,
                summary: format!("Revert to revision {revision_id}"),
                author,
            },
        )
    }

    pub fn backlinks(&self, slug: &str) -> Result<Vec<PageSummary>> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT p.slug, p.title, p.updated_at FROM links l
                 JOIN pages p ON p.id = l.from_page_id
                 WHERE l.to_slug = ?1 AND p.deleted_at IS NULL
                 ORDER BY p.title COLLATE NOCASE",
            )?;
            let rows = stmt
                .query_map([slug], |r| {
                    Ok(PageSummary {
                        slug: r.get(0)?,
                        title: r.get(1)?,
                        tags: Vec::new(),
                        updated_at: r.get(2)?,
                    })
                })?
                .collect::<rusqlite::Result<_>>()?;
            Ok(rows)
        })
    }

    pub fn search(&self, query: &str, limit: i64) -> Result<Vec<SearchHit>> {
        let Some(fts_query) = to_fts_query(query) else {
            return Ok(Vec::new());
        };
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT p.slug, p.title,
                        snippet(pages_fts, 1, char(2), char(3), '…', 16)
                 FROM pages_fts f JOIN pages p ON p.id = f.rowid
                 WHERE pages_fts MATCH ?1 AND p.deleted_at IS NULL
                 ORDER BY bm25(pages_fts, 5.0, 1.0) LIMIT ?2",
            )?;
            let rows = stmt
                .query_map(params![fts_query, limit], |r| {
                    Ok(SearchHit {
                        slug: r.get(0)?,
                        title: r.get(1)?,
                        snippet: r.get(2)?,
                    })
                })?
                .collect::<rusqlite::Result<_>>()?;
            Ok(rows)
        })
    }

    pub fn recent_changes(&self, author: Option<Author>, limit: i64) -> Result<Vec<Change>> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT p.slug, r.title, r.id, r.summary, r.author, r.created_at
                 FROM revisions r JOIN pages p ON p.id = r.page_id
                 WHERE p.deleted_at IS NULL AND (?1 IS NULL OR r.author = ?1)
                 ORDER BY r.id DESC LIMIT ?2",
            )?;
            let rows = stmt
                .query_map(params![author.map(Author::as_str), limit], |r| {
                    Ok(Change {
                        slug: r.get(0)?,
                        title: r.get(1)?,
                        revision_id: r.get(2)?,
                        summary: r.get(3)?,
                        author: Author::parse(&r.get::<_, String>(4)?),
                        created_at: r.get(5)?,
                    })
                })?
                .collect::<rusqlite::Result<_>>()?;
            Ok(rows)
        })
    }

    pub fn graph(&self) -> Result<Graph> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT p.id, p.slug, p.title, p.updated_at FROM pages p WHERE p.deleted_at IS NULL",
            )?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let nodes = rows
                .into_iter()
                .map(|(id, slug, title, updated_at)| {
                    Ok(GraphNode { tags: tags_for(c, id)?, slug, title, updated_at })
                })
                .collect::<Result<Vec<_>>>()?;
            let mut stmt = c.prepare(
                "SELECT p.slug, l.to_slug FROM links l JOIN pages p ON p.id = l.from_page_id
                 WHERE p.deleted_at IS NULL AND l.to_slug != p.slug",
            )?;
            let links = stmt
                .query_map([], |r| Ok(GraphLink { from: r.get(0)?, to: r.get(1)? }))?
                .collect::<rusqlite::Result<_>>()?;
            Ok(Graph { nodes, links })
        })
    }

    pub fn tags(&self) -> Result<Vec<TagCount>> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT t.tag, count(*) FROM page_tags t JOIN pages p ON p.id = t.page_id
                 WHERE p.deleted_at IS NULL GROUP BY t.tag ORDER BY count(*) DESC, t.tag",
            )?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(TagCount {
                        tag: r.get(0)?,
                        count: r.get(1)?,
                    })
                })?
                .collect::<rusqlite::Result<_>>()?;
            Ok(rows)
        })
    }
}

/// Web sessions (see http.rs). Kept here because this module owns the DB.
impl Wiki {
    pub fn create_session(&self, token_hash: &str, ttl_secs: i64) -> Result<()> {
        self.with(|c| {
            c.execute("DELETE FROM sessions WHERE expires_at < unixepoch()", [])?;
            c.execute(
                "INSERT INTO sessions (token_hash, expires_at) VALUES (?1, unixepoch() + ?2)",
                params![token_hash, ttl_secs],
            )?;
            Ok(())
        })
    }

    pub fn session_valid(&self, token_hash: &str) -> Result<bool> {
        self.with(|c| {
            Ok(c.query_row(
                "SELECT 1 FROM sessions WHERE token_hash = ?1 AND expires_at >= unixepoch()",
                [token_hash],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
        })
    }

    pub fn delete_session(&self, token_hash: &str) -> Result<()> {
        self.with(|c| {
            c.execute("DELETE FROM sessions WHERE token_hash = ?1", [token_hash])?;
            Ok(())
        })
    }
}

fn live_page(c: &Connection, slug: &str) -> Result<(i64, String, i64)> {
    c.query_row(
        "SELECT id, title, current_revision_id FROM pages WHERE slug = ?1 AND deleted_at IS NULL",
        [slug],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .optional()?
    .ok_or_else(|| WikiError::NotFound(slug.to_string()))
}

fn load_page(c: &Connection, slug: &str) -> Result<Page> {
    let page = c
        .query_row(
            "SELECT p.id, p.slug, p.title, r.content, r.id, r.author, p.created_at, p.updated_at
             FROM pages p JOIN revisions r ON r.id = p.current_revision_id
             WHERE p.slug = ?1 AND p.deleted_at IS NULL",
            [slug],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    Page {
                        slug: r.get(1)?,
                        title: r.get(2)?,
                        content: r.get(3)?,
                        tags: Vec::new(),
                        revision_id: r.get(4)?,
                        author: Author::parse(&r.get::<_, String>(5)?),
                        created_at: r.get(6)?,
                        updated_at: r.get(7)?,
                    },
                ))
            },
        )
        .optional()?;
    let (id, mut page) = page.ok_or_else(|| WikiError::NotFound(slug.to_string()))?;
    page.tags = tags_for(c, id)?;
    Ok(page)
}

fn tags_for(c: &Connection, page_id: i64) -> Result<Vec<String>> {
    let mut stmt = c.prepare_cached("SELECT tag FROM page_tags WHERE page_id = ?1 ORDER BY tag")?;
    let tags = stmt
        .query_map([page_id], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(tags)
}

fn write_revision(
    tx: &Transaction,
    page_id: i64,
    parent: Option<i64>,
    title: &str,
    content: &str,
    summary: &str,
    author: Author,
) -> Result<()> {
    tx.execute(
        "INSERT INTO revisions (page_id, parent_id, title, content, summary, author)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            page_id,
            parent,
            title,
            content,
            summary.trim(),
            author.as_str()
        ],
    )?;
    let rev = tx.last_insert_rowid();
    tx.execute(
        "UPDATE pages SET title = ?2, current_revision_id = ?3, updated_at = unixepoch() WHERE id = ?1",
        params![page_id, title, rev],
    )?;
    index_page(tx, page_id, title, content)
}

fn index_page(tx: &Transaction, page_id: i64, title: &str, content: &str) -> Result<()> {
    tx.execute("DELETE FROM pages_fts WHERE rowid = ?1", [page_id])?;
    tx.execute(
        "INSERT INTO pages_fts (rowid, title, content) VALUES (?1, ?2, ?3)",
        params![page_id, title, content],
    )?;
    tx.execute("DELETE FROM links WHERE from_page_id = ?1", [page_id])?;
    let mut insert =
        tx.prepare_cached("INSERT OR IGNORE INTO links (from_page_id, to_slug) VALUES (?1, ?2)")?;
    for target in wikilinks(content) {
        insert.execute(params![page_id, target])?;
    }
    Ok(())
}

fn set_tags(tx: &Transaction, page_id: i64, tags: &[String]) -> Result<()> {
    tx.execute("DELETE FROM page_tags WHERE page_id = ?1", [page_id])?;
    let mut insert =
        tx.prepare_cached("INSERT OR IGNORE INTO page_tags (page_id, tag) VALUES (?1, ?2)")?;
    for tag in tags {
        insert.execute(params![page_id, tag])?;
    }
    Ok(())
}

fn clean_title(title: &str) -> Result<String> {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() {
        return Err(WikiError::Invalid("title must not be empty".into()));
    }
    if title.chars().count() > 200 {
        return Err(WikiError::Invalid(
            "title must be at most 200 characters".into(),
        ));
    }
    Ok(title)
}

fn clean_tags(tags: &[String]) -> Vec<String> {
    let mut out: Vec<String> = tags
        .iter()
        .map(|t| slugify(t))
        .filter(|t| !t.is_empty())
        .collect();
    out.sort();
    out.dedup();
    out
}

/// "Rust Ownership & Borrowing" -> "rust-ownership-borrowing".
/// Keeps any Unicode letter/digit so non-English titles still get slugs.
pub fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut dash = false;
    for ch in s.chars().flat_map(char::to_lowercase) {
        if ch.is_alphanumeric() {
            if dash && !out.is_empty() {
                out.push('-');
            }
            dash = false;
            out.push(ch);
        } else {
            dash = true;
        }
    }
    out
}

/// Targets of `[[Page Title]]` and `[[Page Title|label]]`, as slugs.
pub fn wikilinks(content: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = content;
    while let Some(start) = rest.find("[[") {
        rest = &rest[start + 2..];
        let Some(end) = rest.find("]]") else { break };
        let inner = &rest[..end];
        rest = &rest[end + 2..];
        if inner.contains('\n') {
            continue;
        }
        let target = inner.split('|').next().unwrap_or("");
        let slug = slugify(target);
        if !slug.is_empty() {
            out.push(slug);
        }
    }
    out
}

/// Turns free text into a safe FTS5 query: every word becomes a quoted
/// prefix term, so user input can never be a syntax error.
fn to_fts_query(q: &str) -> Option<String> {
    let terms: Vec<String> = q
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{w}\"*"))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wiki() -> Wiki {
        let dir = std::env::temp_dir().join(format!(
            "wiki-test-{}-{}",
            std::process::id(),
            rand_suffix()
        ));
        Wiki::open(&dir.join("t.db")).unwrap()
    }

    fn rand_suffix() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    }

    fn new(title: &str, content: &str) -> NewPage {
        NewPage {
            title: title.into(),
            content: content.into(),
            tags: vec!["Rust".into()],
            summary: "init".into(),
            author: Author::Human,
        }
    }

    #[test]
    fn slugs_and_links() {
        assert_eq!(
            slugify("  Rust Ownership & Borrowing "),
            "rust-ownership-borrowing"
        );
        assert_eq!(slugify("Kalkulus Dasar"), "kalkulus-dasar");
        assert_eq!(
            wikilinks("see [[Rust Basics]] and [[SQLite|db]]"),
            vec!["rust-basics", "sqlite"]
        );
    }

    #[test]
    fn lifecycle() {
        let w = wiki();
        let p = w
            .create_page(new("Rust Basics", "Ownership. See [[SQLite]]."))
            .unwrap();
        assert_eq!(p.slug, "rust-basics");
        assert!(matches!(
            w.create_page(new("rust basics", "x")),
            Err(WikiError::AlreadyExists(_))
        ));

        w.create_page(new("SQLite", "Embedded database.")).unwrap();
        assert_eq!(w.backlinks("sqlite").unwrap()[0].slug, "rust-basics");
        let g = w.graph().unwrap();
        assert_eq!(g.nodes.len(), 2);
        assert!(g.links.iter().any(|l| l.from == "rust-basics" && l.to == "sqlite"));

        let p2 = w
            .edit_page(
                "rust-basics",
                "Ownership.",
                "Ownership and borrowing.",
                p.revision_id,
                "expand",
                Author::Claude,
            )
            .unwrap();
        assert_eq!(p2.author, Author::Claude);
        // Stale base revision is rejected.
        let stale = w.edit_page(
            "rust-basics",
            "borrowing",
            "lifetimes",
            p.revision_id,
            "x",
            Author::Claude,
        );
        assert!(matches!(stale, Err(WikiError::Conflict { .. })));

        let hits = w.search("borrow", 10).unwrap();
        assert_eq!(hits[0].slug, "rust-basics");
        assert!(w.search("\"; DROP", 10).is_ok());

        let reverted = w
            .revert("rust-basics", p.revision_id, Author::Human)
            .unwrap();
        assert_eq!(reverted.content, "Ownership. See [[SQLite]].");
        assert_eq!(w.history("rust-basics").unwrap().len(), 3);
        assert_eq!(w.recent_changes(Some(Author::Claude), 10).unwrap().len(), 1);

        w.delete_page("rust-basics").unwrap();
        assert!(w.get_page("rust-basics").is_err());
        assert!(w.search("borrow", 10).unwrap().is_empty());
        let again = w.create_page(new("Rust Basics", "fresh")).unwrap();
        assert_eq!(w.history(&again.slug).unwrap().len(), 4);
    }
}
