TARGET  ?= x86_64-unknown-linux-musl
BINARY  := mcp-service
SERVICE := service
OUT     := dist/$(BINARY)
CARGO   := cargo
BUN     := bun

# C toolchain for the musl target (needed by rusqlite's bundled SQLite).
# Prefer the bundled zig wrapper (self-contained), fall back to musl-gcc.
ifeq ($(shell command -v zig 2>/dev/null),)
MUSL_CC ?= musl-gcc
else
MUSL_CC ?= $(CURDIR)/scripts/zig-cc
endif

export CC_$(shell echo $(TARGET) | tr '-' '_') := $(MUSL_CC)

# Optional overrides (WIKI_ADDR, WIKI_DB). Only export what's actually set,
# so an unset variable never reaches the service as an empty string.
-include .env
ifdef WIKI_ADDR
export WIKI_ADDR
endif
ifdef WIKI_DB
export WIKI_DB
endif
ifdef WIKI_ADMIN_KEY
export WIKI_ADMIN_KEY
endif
ifdef WIKI_MCP_KEY
export WIKI_MCP_KEY
endif
ifdef WIKI_SECURE_COOKIE
export WIKI_SECURE_COOKIE
endif

.PHONY: help setup webui build run run-prod test mcp-config clean

help:
	@echo "targets: setup | webui | build | run | run-prod | test | mcp-config | clean"

## Copy env templates and install frontend dependencies (idempotent).
## A fresh .env gets random WIKI_ADMIN_KEY and WIKI_MCP_KEY values.
setup:
	@test -f .env || sed \
		-e "s/^WIKI_ADMIN_KEY=.*/WIKI_ADMIN_KEY=$$(head -c 24 /dev/urandom | base64 | tr -d '/+=')/" \
		-e "s/^WIKI_MCP_KEY=.*/WIKI_MCP_KEY=$$(head -c 32 /dev/urandom | base64 | tr -d '/+=')/" \
		.env.example > .env
	$(BUN) install

## Build the dashboard as a static export (./out, embedded by the service).
webui:
	$(BUN) run build

## Build the fully static musl binary with the dashboard embedded.
build: webui
	rustup target add $(TARGET)
	cd $(SERVICE) && $(CARGO) build --release --target $(TARGET)
	mkdir -p dist
	install -m 755 $(SERVICE)/target/$(TARGET)/release/$(BINARY) $(OUT)
	@file $(OUT)
	@echo "→ single static binary: $(OUT)  (serves API + dashboard on one port)"

## Dev mode: next dev (UI, :3000, proxies /api) + the Rust service (API, :4220).
run:
	@trap 'kill 0' INT TERM EXIT; \
		$(BUN) run dev & \
		(cd $(SERVICE) && $(CARGO) run -- serve) & \
		wait

## Production mode: run the single binary (needs `make build` first).
run-prod: build
	@echo "→ http://$${WIKI_ADDR:-127.0.0.1:4220}  (dashboard + API on the same port)"
	./$(OUT) serve

test:
	cd $(SERVICE) && $(CARGO) test
	$(BUN) run lint

## Print how to connect Claude to the wiki MCP server.
## PUBLIC_URL = where /mcp is reachable, e.g. your tunnel: make mcp-config PUBLIC_URL=https://wiki.example.com
PUBLIC_URL ?= http://$(or $(WIKI_ADDR),127.0.0.1:4220)
mcp-config:
	@echo "Local (stdio, same machine):"
	@echo "  claude mcp add --scope user wiki -- $(CURDIR)/$(OUT) mcp"
	@echo
	@echo "Remote (HTTP, e.g. through a tunnel), Claude Code:"
	@echo "  claude mcp add --scope user --transport http wiki $(PUBLIC_URL)/mcp --header \"Authorization: Bearer $(WIKI_MCP_KEY)\""
	@echo
	@echo "Remote, claude.ai custom connector URL (keep it secret):"
	@echo "  $(PUBLIC_URL)/mcp/$(WIKI_MCP_KEY)"

clean:
	cd $(SERVICE) && $(CARGO) clean
	rm -rf out dist .next
