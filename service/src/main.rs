mod auth;
mod http;
mod mcp;
mod mcp_http;
mod wiki;

use rmcp::{ServiceExt, transport::stdio};

use crate::wiki::Wiki;

const USAGE: &str = "usage: mcp-service [serve | mcp]

  serve   HTTP API + dashboard (default). Address from $WIKI_ADDR (0.0.0.0:4220, all interfaces);
          if that port is taken, the next free one (4221, 4222, ...) is used.
          Reads are public; web edits need a login with $WIKI_ADMIN_KEY.
          With $WIKI_MCP_KEY set, also serves MCP over HTTP at /mcp.
  mcp     MCP server over stdio, for Claude.

The database path comes from $WIKI_DB (default ~/.local/share/trpl3c-wiki/wiki.db).";

/// How many ports after the requested one to try when it's already taken.
const PORT_FALLBACKS: u16 = 10;

/// Binds `addr`; if its port is in use, tries the next ports (4220 -> 4221 ...).
async fn bind_with_fallback(addr: &str) -> anyhow::Result<tokio::net::TcpListener> {
    let (host, port) = addr
        .rsplit_once(':')
        .and_then(|(h, p)| Some((h, p.parse::<u16>().ok()?)))
        .ok_or_else(|| anyhow::anyhow!("WIKI_ADDR must look like host:port, got {addr:?}"))?;
    for candidate in port..=port.saturating_add(PORT_FALLBACKS) {
        match tokio::net::TcpListener::bind((host, candidate)).await {
            Ok(listener) => {
                if candidate != port {
                    eprintln!(
                        "wiki: warning: port {port} is in use, using {candidate} instead \
                         (point your tunnel / proxy at this port, or free {port})"
                    );
                }
                return Ok(listener);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(e) => return Err(e.into()),
        }
    }
    anyhow::bail!(
        "ports {port}-{} are all in use",
        port.saturating_add(PORT_FALLBACKS)
    )
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cmd = std::env::args().nth(1).unwrap_or_else(|| "serve".into());
    let db = Wiki::default_path();
    match cmd.as_str() {
        "serve" => {
            let wiki = Wiki::open(&db)?;
            let addr = std::env::var("WIKI_ADDR")
                .ok()
                .filter(|a| !a.is_empty())
                // All interfaces, so a VPS's public IP reaches it; set
                // WIKI_ADDR=127.0.0.1:4220 to keep it local (e.g. behind a tunnel).
                .unwrap_or_else(|| "0.0.0.0:4220".into());
            let listener = bind_with_fallback(&addr).await?;
            let addr = listener.local_addr()?.to_string();
            eprintln!("wiki: http://{addr}  (db: {})", db.display());
            let mut app = http::router(auth::AppState::from_env(wiki.clone()));
            if let Some(mcp) = mcp_http::router(wiki) {
                eprintln!("wiki: remote MCP at http://{addr}/mcp");
                app = app.merge(mcp);
            }
            axum::serve(listener, app).await?;
        }
        "mcp" => {
            // stdout is the MCP channel; log to stderr only.
            let wiki = Wiki::open(&db)?;
            eprintln!("wiki mcp: db {}", db.display());
            let service = mcp::WikiMcp::new(wiki, "stdio").serve(stdio()).await?;
            service.waiting().await?;
        }
        _ => {
            eprintln!("{USAGE}");
            std::process::exit(2);
        }
    }
    Ok(())
}
