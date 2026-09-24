//! Web login for write access. Reads are public; creating, editing,
//! deleting and reverting pages over HTTP need a session obtained by
//! presenting `WIKI_ADMIN_KEY`. The MCP server is local stdio and is not
//! affected.

use std::sync::Arc;

use axum::{
    Json,
    extract::{Request, State},
    http::{HeaderMap, Method, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::wiki::Wiki;

const COOKIE: &str = "wiki_session";
const TTL_SECS: i64 = 30 * 24 * 60 * 60;

#[derive(Clone)]
pub struct AppState {
    pub wiki: Wiki,
    /// SHA-256 of the admin key; `None` means writes are disabled.
    admin_key_hash: Option<Arc<[u8; 32]>>,
    /// Add `Secure` to the cookie (set when served over HTTPS).
    secure_cookie: bool,
}

impl AppState {
    pub fn from_env(wiki: Wiki) -> Self {
        let key = std::env::var("WIKI_ADMIN_KEY").ok().filter(|k| !k.is_empty());
        match &key {
            None => eprintln!("wiki: WIKI_ADMIN_KEY is not set, so the web UI is read-only"),
            Some(k) if k.len() < 16 => eprintln!("wiki: warning: WIKI_ADMIN_KEY is short; use 16+ random characters"),
            Some(_) => {}
        }
        Self {
            wiki,
            admin_key_hash: key.map(|k| Arc::new(sha256(k.as_bytes()))),
            secure_cookie: std::env::var("WIKI_SECURE_COOKIE").is_ok_and(|v| v == "1"),
        }
    }

    fn session_hash(&self, headers: &HeaderMap) -> Option<String> {
        let token = cookie(headers, COOKIE)?;
        Some(hex::encode(sha256(token.as_bytes())))
    }

    fn is_authenticated(&self, headers: &HeaderMap) -> bool {
        self.admin_key_hash.is_some()
            && self
                .session_hash(headers)
                .is_some_and(|h| self.wiki.session_valid(&h).unwrap_or(false))
    }
}

fn sha256(data: &[u8]) -> [u8; 32] {
    Sha256::digest(data).into()
}

/// Compares fixed-size digests without an early exit.
fn ct_eq(a: &[u8; 32], b: &[u8; 32]) -> bool {
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v)
}

fn set_cookie(state: &AppState, value: &str, max_age: i64) -> String {
    format!(
        "{COOKIE}={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{}",
        if state.secure_cookie { "; Secure" } else { "" }
    )
}

fn error(status: StatusCode, msg: &str) -> Response {
    (status, Json(json!({ "error": msg }))).into_response()
}

/// Rejects writes to the wiki API without a valid session.
pub async fn require_login(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let is_write = !matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS);
    let open = matches!(req.uri().path(), "/login" | "/logout");
    if is_write && !open {
        if state.admin_key_hash.is_none() {
            return error(StatusCode::FORBIDDEN, "Editing is disabled: set WIKI_ADMIN_KEY on the server.");
        }
        let headers = req.headers().clone();
        let st = state.clone();
        let ok = tokio::task::spawn_blocking(move || st.is_authenticated(&headers))
            .await
            .unwrap_or(false);
        if !ok {
            return error(StatusCode::UNAUTHORIZED, "Log in to make changes.");
        }
    }
    next.run(req).await
}

#[derive(Deserialize)]
pub struct LoginBody {
    key: String,
}

pub async fn login(State(state): State<AppState>, Json(body): Json<LoginBody>) -> Response {
    let Some(expected) = state.admin_key_hash.clone() else {
        return error(StatusCode::FORBIDDEN, "Editing is disabled: set WIKI_ADMIN_KEY on the server.");
    };
    if !ct_eq(&sha256(body.key.as_bytes()), &expected) {
        // Slow down guessing.
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;
        return error(StatusCode::UNAUTHORIZED, "Wrong key.");
    }
    let mut raw = [0u8; 32];
    if getrandom::fill(&mut raw).is_err() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Could not create a session.");
    }
    let token = hex::encode(raw);
    let hash = hex::encode(sha256(token.as_bytes()));
    let wiki = state.wiki.clone();
    let stored = tokio::task::spawn_blocking(move || wiki.create_session(&hash, TTL_SECS)).await;
    if !matches!(stored, Ok(Ok(()))) {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Could not create a session.");
    }
    (
        [(header::SET_COOKIE, set_cookie(&state, &token, TTL_SECS))],
        Json(json!({ "authenticated": true, "writable": true })),
    )
        .into_response()
}

pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(hash) = state.session_hash(&headers) {
        let wiki = state.wiki.clone();
        let _ = tokio::task::spawn_blocking(move || wiki.delete_session(&hash)).await;
    }
    (
        [(header::SET_COOKIE, set_cookie(&state, "", 0))],
        Json(json!({ "authenticated": false, "writable": state.admin_key_hash.is_some() })),
    )
        .into_response()
}

pub async fn session(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let st = state.clone();
    let authenticated = tokio::task::spawn_blocking(move || st.is_authenticated(&headers))
        .await
        .unwrap_or(false);
    Json(json!({
        "authenticated": authenticated,
        "writable": state.admin_key_hash.is_some(),
    }))
    .into_response()
}
