//! HTTP adapter: JSON API for the web UI under /api, plus the exported
//! dashboard (Next.js `out/`) embedded into the binary for everything else.

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, State},
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Response},
    routing::get,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::{self, AppState};
use crate::wiki::{Author, NewPage, PageUpdate, Wiki, WikiError};

struct ApiError(WikiError);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, extra) = match &self.0 {
            WikiError::NotFound(_) => (StatusCode::NOT_FOUND, json!({})),
            WikiError::AlreadyExists(_) => (StatusCode::CONFLICT, json!({ "kind": "exists" })),
            WikiError::Conflict { current_revision_id } => (
                StatusCode::CONFLICT,
                json!({ "kind": "stale", "current_revision_id": current_revision_id }),
            ),
            WikiError::Invalid(_) => (StatusCode::BAD_REQUEST, json!({})),
            WikiError::Db(e) => {
                eprintln!("db error: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, json!({}))
            }
        };
        let mut body = extra;
        body["error"] = json!(self.0.to_string());
        (status, Json(body)).into_response()
    }
}

type ApiResult<T> = Result<Json<T>, ApiError>;

/// SQLite calls block (and may wait on the MCP process's write lock), so
/// keep them off the async workers.
async fn run<T: Send + 'static>(
    wiki: Wiki,
    f: impl FnOnce(&Wiki) -> Result<T, WikiError> + Send + 'static,
) -> ApiResult<T> {
    tokio::task::spawn_blocking(move || f(&wiki))
        .await
        .expect("wiki task panicked")
        .map(Json)
        .map_err(ApiError)
}

#[derive(Deserialize)]
struct ListQuery {
    tag: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct RecentQuery {
    author: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct CreateBody {
    title: String,
    content: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    summary: String,
}

#[derive(Deserialize)]
struct UpdateBody {
    title: Option<String>,
    content: String,
    tags: Option<Vec<String>>,
    base_revision_id: i64,
    #[serde(default)]
    summary: String,
}

#[derive(Deserialize)]
struct RevertBody {
    revision_id: i64,
}

#[derive(Serialize)]
struct Ok {
    ok: bool,
}

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/login", axum::routing::post(auth::login))
        .route("/logout", axum::routing::post(auth::logout))
        .route("/session", get(auth::session))
        .route("/pages", get(list_pages).post(create_page))
        .route("/pages/{slug}", get(get_page).put(update_page).delete(delete_page))
        .route("/pages/{slug}/history", get(history))
        .route("/pages/{slug}/revisions/{id}", get(revision))
        .route("/pages/{slug}/revert", axum::routing::post(revert))
        .route("/pages/{slug}/backlinks", get(backlinks))
        .route("/search", get(search))
        .route("/recent", get(recent))
        .route("/tags", get(tags))
        .route("/graph", get(graph))
        .route(
            "/fonts",
            get(list_fonts)
                .post(upload_font)
                .layer(axum::extract::DefaultBodyLimit::max(crate::wiki::MAX_FONT_BYTES + 1024)),
        )
        .route("/fonts/{id}", axum::routing::delete(delete_font))
        .route("/fonts/{id}/file", get(font_file))
        .route_layer(axum::middleware::from_fn_with_state(state.clone(), auth::require_login))
        .with_state(state);

    Router::new().nest("/api", api).fallback(static_file)
}

async fn list_pages(State(AppState { wiki: w, .. }): State<AppState>, Query(q): Query<ListQuery>) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(100).clamp(1, 500);
    run(w, move |w| w.list_pages(q.tag.as_deref(), limit)).await
}

async fn create_page(State(AppState { wiki: w, .. }): State<AppState>, Json(b): Json<CreateBody>) -> impl IntoResponse {
    let res = run(w, move |w| {
        w.create_page(NewPage {
            title: b.title,
            content: b.content,
            tags: b.tags,
            summary: b.summary,
            author: Author::Human,
        })
    })
    .await;
    res.map(|page| (StatusCode::CREATED, page))
}

async fn get_page(State(AppState { wiki: w, .. }): State<AppState>, Path(slug): Path<String>) -> impl IntoResponse {
    run(w, move |w| w.get_page(&slug)).await
}

async fn update_page(
    State(AppState { wiki: w, .. }): State<AppState>,
    Path(slug): Path<String>,
    Json(b): Json<UpdateBody>,
) -> impl IntoResponse {
    run(w, move |w| {
        w.update_page(
            &slug,
            PageUpdate {
                title: b.title,
                content: b.content,
                tags: b.tags,
                base_revision_id: b.base_revision_id,
                summary: b.summary,
                author: Author::Human,
            },
        )
    })
    .await
}

async fn delete_page(State(AppState { wiki: w, .. }): State<AppState>, Path(slug): Path<String>) -> impl IntoResponse {
    run(w, move |w| w.delete_page(&slug).map(|_| Ok { ok: true })).await
}

async fn history(State(AppState { wiki: w, .. }): State<AppState>, Path(slug): Path<String>) -> impl IntoResponse {
    run(w, move |w| w.history(&slug)).await
}

async fn revision(State(AppState { wiki: w, .. }): State<AppState>, Path((slug, id)): Path<(String, i64)>) -> impl IntoResponse {
    run(w, move |w| w.get_revision(&slug, id)).await
}

async fn revert(
    State(AppState { wiki: w, .. }): State<AppState>,
    Path(slug): Path<String>,
    Json(b): Json<RevertBody>,
) -> impl IntoResponse {
    run(w, move |w| w.revert(&slug, b.revision_id, Author::Human)).await
}

async fn backlinks(State(AppState { wiki: w, .. }): State<AppState>, Path(slug): Path<String>) -> impl IntoResponse {
    run(w, move |w| w.backlinks(&slug)).await
}

async fn search(State(AppState { wiki: w, .. }): State<AppState>, Query(q): Query<SearchQuery>) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(20).clamp(1, 100);
    run(w, move |w| w.search(&q.q, limit)).await
}

async fn recent(State(AppState { wiki: w, .. }): State<AppState>, Query(q): Query<RecentQuery>) -> impl IntoResponse {
    let author = match q.author.as_deref() {
        Some("claude") => Some(Author::Claude),
        Some("human") => Some(Author::Human),
        _ => None,
    };
    let limit = q.limit.unwrap_or(50).clamp(1, 500);
    run(w, move |w| w.recent_changes(author, limit)).await
}

async fn graph(State(AppState { wiki: w, .. }): State<AppState>) -> impl IntoResponse {
    run(w, |w| w.graph()).await
}

#[derive(Deserialize)]
struct FontUpload {
    name: Option<String>,
    filename: String,
}

async fn list_fonts(State(AppState { wiki: w, .. }): State<AppState>) -> impl IntoResponse {
    run(w, |w| w.list_fonts()).await
}

/// Raw font bytes as the body; name and filename in the query string.
async fn upload_font(
    State(AppState { wiki: w, .. }): State<AppState>,
    Query(q): Query<FontUpload>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let res = run(w, move |w| w.add_font(q.name.as_deref().unwrap_or(""), &q.filename, &body)).await;
    res.map(|font| (StatusCode::CREATED, font))
}

async fn delete_font(State(AppState { wiki: w, .. }): State<AppState>, Path(id): Path<i64>) -> impl IntoResponse {
    run(w, move |w| w.delete_font(id).map(|_| Ok { ok: true })).await
}

async fn font_file(State(AppState { wiki: w, .. }): State<AppState>, Path(id): Path<i64>) -> Response {
    let res = tokio::task::spawn_blocking(move || w.font_file(id)).await.expect("wiki task panicked");
    match res {
        Result::Ok((mime, data)) => Response::builder()
            .header(header::CONTENT_TYPE, mime)
            // Ids are never reused, so the bytes behind one never change.
            .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
            .body(Body::from(data))
            .unwrap(),
        Err(e) => ApiError(e).into_response(),
    }
}

async fn tags(State(AppState { wiki: w, .. }): State<AppState>) -> impl IntoResponse {
    run(w, |w| w.tags()).await
}

/// The Next.js static export. Missing in dev builds before `make webui`;
/// in that case the UI is served by `next dev` instead.
#[derive(RustEmbed)]
#[folder = "../out"]
#[allow_missing = true]
struct Dashboard;

async fn static_file(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/').trim_end_matches('/');
    let candidates = if path.is_empty() {
        vec!["index.html".to_string()]
    } else {
        vec![path.to_string(), format!("{path}.html"), format!("{path}/index.html")]
    };
    for name in candidates {
        if let Some(file) = Dashboard::get(&name) {
            return file_response(&name, file, StatusCode::OK);
        }
    }
    match Dashboard::get("404.html") {
        Some(file) => file_response("404.html", file, StatusCode::NOT_FOUND),
        None => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

fn file_response(name: &str, file: rust_embed::EmbeddedFile, status: StatusCode) -> Response {
    let mime = mime_guess::from_path(name).first_or_octet_stream();
    // Hashed build assets never change; HTML must always be revalidated.
    let cache = if name.starts_with("_next/static/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime.as_ref())
        .header(header::CACHE_CONTROL, cache)
        .body(Body::from(file.data.into_owned()))
        .unwrap()
}
