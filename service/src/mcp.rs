//! MCP adapter: exposes the wiki core to Claude. Every write is recorded as
//! `author = claude`. Delete and revert are intentionally not exposed; those
//! stay human-only in the web UI.

use std::time::Instant;

use rmcp::{
    ErrorData, RoleServer, ServerHandler,
    handler::server::{router::tool::ToolRouter, tool::ToolCallContext, wrapper::Parameters},
    model::{
        CacheScope, CallToolRequestParams, CallToolResponse, Implementation, InitializeRequestParams,
        InitializeResult, JsonObject, ListToolsResult, PaginatedRequestParams, ProtocolVersion, ResultType,
        ServerCapabilities, ServerConfig,
    },
    schemars,
    service::RequestContext,
    tool, tool_handler, tool_router,
};
use serde::Deserialize;

use crate::wiki::{Author, HL_END, HL_START, NewPage, PageUpdate, Wiki, WikiError};

type ToolResult = Result<String, String>;

fn err(e: WikiError) -> String {
    e.to_string()
}

fn json<T: serde::Serialize>(v: &T) -> ToolResult {
    serde_json::to_string_pretty(v).map_err(|e| e.to_string())
}

#[derive(Deserialize, schemars::JsonSchema)]
struct SearchParams {
    /// Free-text query. Words are prefix-matched against titles and content.
    query: String,
    /// Max results (default 10, max 50).
    limit: Option<i64>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct SlugParams {
    /// Page slug, e.g. "rust-ownership".
    slug: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct ListParams {
    /// Only pages with this tag.
    tag: Option<String>,
    /// Max results (default 50, max 200).
    limit: Option<i64>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct CreateParams {
    /// Page title; the slug is derived from it.
    title: String,
    /// Markdown body. Link to other pages with [[Page Title]] or [[Page Title|label]].
    content: String,
    /// Optional tags.
    #[serde(default)]
    tags: Vec<String>,
    /// One-line description of this change, shown in history.
    summary: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct UpdateParams {
    slug: String,
    /// Full new Markdown body (replaces the whole page).
    content: String,
    /// `revision_id` from the read_page call this edit is based on.
    base_revision_id: i64,
    /// One-line description of this change.
    summary: String,
    /// New title (optional; the slug does not change).
    title: Option<String>,
    /// Replace the tag set (optional).
    tags: Option<Vec<String>>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct EditParams {
    slug: String,
    /// Exact text to replace. Must appear exactly once in the page.
    old_text: String,
    /// Replacement text.
    new_text: String,
    /// `revision_id` from the read_page call this edit is based on.
    base_revision_id: i64,
    /// One-line description of this change.
    summary: String,
}

#[derive(Debug, Clone)]
pub struct WikiMcp {
    wiki: Wiki,
    tool_router: ToolRouter<Self>,
    /// "stdio" or "http", shown in the event log.
    transport: &'static str,
}

impl WikiMcp {
    pub fn new(wiki: Wiki, transport: &'static str) -> Self {
        Self {
            wiki,
            tool_router: Self::tool_router(),
            transport,
        }
    }

    fn client(context: &RequestContext<RoleServer>) -> String {
        context
            .peer
            .peer_info()
            .map(|p| p.client_info.name.clone())
            .unwrap_or_else(|| "client".into())
    }
}

/// Event log line on stderr (stdout is the MCP channel in stdio mode).
macro_rules! event {
    ($($arg:tt)*) => { eprintln!("mcp | {}", format!($($arg)*)) };
}

/// Compact, single-line view of tool arguments: identifiers in full,
/// long text fields reduced to their size.
fn summarize(args: Option<&JsonObject>) -> String {
    const BULKY: &[&str] = &["content", "old_text", "new_text"];
    let Some(args) = args else { return String::new() };
    args.iter()
        .map(|(k, v)| {
            let shown = match v {
                serde_json::Value::String(s) if BULKY.contains(&k.as_str()) => {
                    format!("<{} chars>", s.chars().count())
                }
                serde_json::Value::String(s) => {
                    let t: String = s.chars().take(50).collect();
                    let more = if s.chars().count() > 50 { "..." } else { "" };
                    format!("{:?}", format!("{t}{more}"))
                }
                other => other.to_string(),
            };
            format!("{k}={shown}")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[tool_router]
impl WikiMcp {
    #[tool(description = "Full-text search over page titles and content. Search before creating a page to avoid duplicates.")]
    fn search_pages(&self, Parameters(p): Parameters<SearchParams>) -> ToolResult {
        let hits = self
            .wiki
            .search(&p.query, p.limit.unwrap_or(10).clamp(1, 50))
            .map_err(err)?;
        if hits.is_empty() {
            return Ok(format!("No pages match '{}'.", p.query));
        }
        Ok(hits
            .iter()
            .map(|h| {
                let snippet = h.snippet.replace([HL_START, HL_END], "**");
                format!("- {} (slug: {})\n  {}", h.title, h.slug, snippet.replace('\n', " "))
            })
            .collect::<Vec<_>>()
            .join("\n"))
    }

    #[tool(description = "Read a page's Markdown content, tags and current revision_id (needed for edits).")]
    fn read_page(&self, Parameters(p): Parameters<SlugParams>) -> ToolResult {
        let page = self.wiki.get_page(&p.slug).map_err(err)?;
        Ok(format!(
            "# {}\nslug: {}\nrevision_id: {}\ntags: {}\n\n{}",
            page.title,
            page.slug,
            page.revision_id,
            if page.tags.is_empty() { "(none)".into() } else { page.tags.join(", ") },
            page.content
        ))
    }

    #[tool(description = "List pages, most recently updated first, optionally filtered by tag.")]
    fn list_pages(&self, Parameters(p): Parameters<ListParams>) -> ToolResult {
        let pages = self
            .wiki
            .list_pages(p.tag.as_deref(), p.limit.unwrap_or(50).clamp(1, 200))
            .map_err(err)?;
        json(&pages)
    }

    #[tool(description = "List all tags with page counts.")]
    fn list_tags(&self) -> ToolResult {
        json(&self.wiki.tags().map_err(err)?)
    }

    #[tool(description = "Pages that link to the given page via [[wikilinks]].")]
    fn get_backlinks(&self, Parameters(p): Parameters<SlugParams>) -> ToolResult {
        json(&self.wiki.backlinks(&p.slug).map_err(err)?)
    }

    #[tool(description = "Revision history of a page (newest first).")]
    fn page_history(&self, Parameters(p): Parameters<SlugParams>) -> ToolResult {
        json(&self.wiki.history(&p.slug).map_err(err)?)
    }

    #[tool(description = "Create a new page. Fails if a page with the same slug exists; use search_pages first.")]
    fn create_page(&self, Parameters(p): Parameters<CreateParams>) -> ToolResult {
        let page = self
            .wiki
            .create_page(NewPage {
                title: p.title,
                content: p.content,
                tags: p.tags,
                summary: p.summary,
                author: Author::Claude,
            })
            .map_err(err)?;
        Ok(format!("Created '{}' (slug: {}, revision_id: {}).", page.title, page.slug, page.revision_id))
    }

    #[tool(description = "Replace a page's whole content. Prefer edit_page for small changes. Rejected if the page changed since base_revision_id.")]
    fn update_page(&self, Parameters(p): Parameters<UpdateParams>) -> ToolResult {
        let page = self
            .wiki
            .update_page(
                &p.slug,
                PageUpdate {
                    title: p.title,
                    content: p.content,
                    tags: p.tags,
                    base_revision_id: p.base_revision_id,
                    summary: p.summary,
                    author: Author::Claude,
                },
            )
            .map_err(err)?;
        Ok(format!("Updated '{}' (revision_id: {}).", page.slug, page.revision_id))
    }

    #[tool(description = "Replace one exact snippet of a page's content. old_text must occur exactly once. Rejected if the page changed since base_revision_id.")]
    fn edit_page(&self, Parameters(p): Parameters<EditParams>) -> ToolResult {
        let page = self
            .wiki
            .edit_page(&p.slug, &p.old_text, &p.new_text, p.base_revision_id, &p.summary, Author::Claude)
            .map_err(err)?;
        Ok(format!("Edited '{}' (revision_id: {}).", page.slug, page.revision_id))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for WikiMcp {
    async fn initialize(
        &self,
        request: InitializeRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<InitializeResult, ErrorData> {
        context.peer.set_peer_info(request.clone());
        let result = self.negotiate_initialize(&request);
        let info = &request.client_info;
        match &result {
            Ok(r) => event!(
                "connect  {} {} via {} (protocol {})",
                info.name,
                info.version,
                self.transport,
                r.protocol_version
            ),
            Err(e) => event!("connect  {} via {} FAILED: {}", info.name, self.transport, e.message),
        }
        result
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        let tools = self.tool_router.list_all();
        event!("tools    {} listed {} tools", Self::client(&context), tools.len());
        let cache_hints = context
            .protocol_version()
            .is_some_and(|v| v >= ProtocolVersion::V_2026_07_28);
        Ok(ListToolsResult {
            result_type: Some(ResultType::COMPLETE),
            tools,
            meta: None,
            next_cursor: None,
            ttl_ms: cache_hints.then_some(0),
            cache_scope: cache_hints.then_some(CacheScope::Public),
        })
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let name = request.name.clone();
        let args = summarize(request.arguments.as_ref());
        let client = Self::client(&context);
        let started = Instant::now();
        let result = self
            .tool_router
            .call(ToolCallContext::new(self, request, context))
            .await;
        let ms = started.elapsed().as_millis();
        let outcome = match &result {
            Ok(CallToolResponse::Complete(r)) if r.is_error == Some(true) => {
                let msg = r
                    .content
                    .first()
                    .and_then(|c| c.as_text())
                    .map(|t| t.text.chars().take(100).collect::<String>())
                    .unwrap_or_default();
                format!("error: {msg}")
            }
            Ok(_) => "ok".to_string(),
            Err(e) => format!("failed: {}", e.message),
        };
        event!("call     {client} -> {name}({args})  {outcome}  {ms}ms");
        result
    }

    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("trpl3c-wiki", env!("CARGO_PKG_VERSION")))
            .with_instructions(
                "A private Markdown wiki. Search before creating pages. Read a page to get its \
                 revision_id before editing, and pass it as base_revision_id. Link pages with \
                 [[Page Title]]. Every change needs a short summary; all your edits are recorded \
                 as author 'claude' and can be reviewed and reverted by the owner.",
            )
    }
}
