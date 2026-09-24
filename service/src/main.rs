mod auth;
mod http;
mod mcp;
mod mcp_http;
mod wiki;

use rmcp::{ServiceExt, transport::stdio};

use crate::wiki::Wiki;

const USAGE: &str = "usage: mcp-service [serve | mcp]

  serve   HTTP API + dashboard (default). Address from $WIKI_ADDR (127.0.0.1:4220).
          Reads are public; web edits need a login with $WIKI_ADMIN_KEY.
          With $WIKI_MCP_KEY set, also serves MCP over HTTP at /mcp.
  mcp     MCP server over stdio, for Claude.

The database path comes from $WIKI_DB (default ~/.local/share/trpl3c-wiki/wiki.db).";

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
                .unwrap_or_else(|| "127.0.0.1:4220".into());
            let listener = tokio::net::TcpListener::bind(&addr).await?;
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
