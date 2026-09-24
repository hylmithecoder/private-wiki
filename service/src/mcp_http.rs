//! MCP over Streamable HTTP, for Claude clients that can't spawn the local
//! stdio server (remote machines, claude.ai via a tunnel).
//!
//! Mounted only when `WIKI_MCP_KEY` is set. Two ways to authenticate:
//! - `/mcp` with `Authorization: Bearer <key>` (Claude Code, `--header`)
//! - `/mcp/<key>` with the key in the URL (claude.ai custom connectors,
//!   which can't send custom headers). Treat that URL like a password.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Request, State},
    http::{StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::{mcp::WikiMcp, wiki::Wiki};

fn sha256(data: &[u8]) -> [u8; 32] {
    Sha256::digest(data).into()
}

fn ct_eq(a: &[u8; 32], b: &[u8; 32]) -> bool {
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Returns the `/mcp` router, or `None` when `WIKI_MCP_KEY` is unset.
pub fn router(wiki: Wiki) -> Option<Router> {
    let key = std::env::var("WIKI_MCP_KEY").ok().filter(|k| !k.is_empty());
    let Some(key) = key else {
        eprintln!("wiki: WIKI_MCP_KEY is not set, so /mcp (remote MCP) is disabled");
        return None;
    };
    if key.len() < 24 {
        eprintln!("wiki: warning: WIKI_MCP_KEY is short; use 24+ random characters");
    }
    let key_hash = Arc::new(sha256(key.as_bytes()));

    let service = StreamableHttpService::new(
        move || Ok(WikiMcp::new(wiki.clone(), "http")),
        Arc::new(LocalSessionManager::default()),
        // Requests are token-authenticated, so the Host allowlist (a guard
        // for unauthenticated localhost servers) would only block tunnels.
        StreamableHttpServerConfig::default().disable_allowed_hosts(),
    );

    Some(
        Router::new()
            .route_service("/mcp", service.clone())
            .route_service("/mcp/{key}", service)
            .route_layer(axum::middleware::from_fn_with_state(key_hash, require_key)),
    )
}

async fn require_key(State(key_hash): State<Arc<[u8; 32]>>, req: Request, next: Next) -> Response {
    // One log line per request (key never logged) to debug client connections.
    let method = req.method().clone();
    let agent = req
        .headers()
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("-")
        .chars()
        .take(60)
        .collect::<String>();
    let version = req
        .headers()
        .get("mcp-protocol-version")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("-")
        .to_string();
    let bearer = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    let in_path = req.uri().path().strip_prefix("/mcp/");
    let ok = [bearer, in_path]
        .into_iter()
        .flatten()
        .any(|candidate| ct_eq(&sha256(candidate.as_bytes()), &key_hash));
    if !ok {
        eprintln!("mcp | http {method} -> 401 wrong or missing key  ua={agent}");
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        return (
            StatusCode::UNAUTHORIZED,
            [(header::WWW_AUTHENTICATE, "Bearer")],
            Json(json!({ "error": "invalid or missing MCP key" })),
        )
            .into_response();
    }
    let res = next.run(req).await;
    // Successful traffic is logged as MCP events (mcp.rs); only surface
    // transport-level failures here, e.g. 404 for an expired session.
    if !res.status().is_success() {
        let hint = match res.status().as_u16() {
            404 => "  (unknown session, e.g. after a server restart; client must reconnect)",
            _ => "",
        };
        eprintln!(
            "mcp | http {method} -> {}{hint}  protocol={version}  ua={agent}",
            res.status().as_u16()
        );
    }
    res
}
