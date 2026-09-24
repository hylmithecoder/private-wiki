import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Where the Rust service listens; `next dev` proxies /api to it.
const API_ORIGIN = `http://${process.env.WIKI_ADDR || "127.0.0.1:4220"}`;

export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    // Dev: the UI always calls relative /api, same as in production.
    return {
      images: { unoptimized: true },
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
      },
    };
  }
  // Build: static export; the Rust service embeds `out/` and serves it next to /api.
  return {
    output: "export",
    images: { unoptimized: true },
  };
}
