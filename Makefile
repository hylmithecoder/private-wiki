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

.PHONY: help setup webui build run run-prod test mcp-config clean \
	service-install service-uninstall service-start service-stop service-restart service-status service-logs deploy \
	package-openrc

help:
	@echo "targets: setup | webui | build | run | run-prod | test | mcp-config | clean"
	@echo "openrc:  package-openrc (tarball + install.sh for an OpenRC VPS)"
	@echo "service: service-install | service-start | service-stop | service-restart | service-status | service-logs | deploy | service-uninstall"

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

## Dev mode: next dev (UI, :3000, proxies /api) + the Rust service (API).
## The API port is WIKI_ADDR's (default 4220), or the next free one if taken;
## both processes get the same address so the dev proxy always matches.
WIKI_HOST := $(firstword $(subst :, ,$(or $(WIKI_ADDR),0.0.0.0:4220)))
WIKI_PORT := $(lastword $(subst :, ,$(or $(WIKI_ADDR),0.0.0.0:4220)))
# For connecting locally to a server bound on all interfaces.
LOCAL_HOST := $(if $(filter 0.0.0.0,$(WIKI_HOST)),127.0.0.1,$(WIKI_HOST))

run:
	@port=$$(scripts/free-port $(WIKI_HOST) $(WIKI_PORT)) || exit 1; \
	addr=$(WIKI_HOST):$$port; \
	[ "$$port" = "$(WIKI_PORT)" ] || echo "→ port $(WIKI_PORT) is in use, API on $$port instead"; \
	echo "→ UI http://localhost:3000  (API on port $$port)"; \
	trap 'kill 0' INT TERM EXIT; \
	WIKI_ADDR=$$addr $(BUN) run dev & \
	(cd $(SERVICE) && WIKI_ADDR=$$addr $(CARGO) run -- serve) & \
	wait

## Production mode: run the single binary (needs `make build` first).
run-prod: build
	@echo "→ http://$(LOCAL_HOST):$(WIKI_PORT) (or the next free port; see the log line below)"
	./$(OUT) serve

test:
	cd $(SERVICE) && $(CARGO) test
	$(BUN) run lint

## Print how to connect Claude to the wiki MCP server.
## PUBLIC_URL = where /mcp is reachable, e.g. your tunnel: make mcp-config PUBLIC_URL=https://wiki.example.com
PUBLIC_URL ?= http://$(LOCAL_HOST):$(WIKI_PORT)
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

# ---------------------------------------------------------------- systemd
# A systemd *user* service running dist/mcp-service (see deploy/README.md).

UNIT_NAME := trpl3c-wiki
UNIT_DIR  := $(HOME)/.config/systemd/user

## Install and enable the user service (needs `make build` once first).
service-install:
	@test -x $(OUT) || { echo "No $(OUT) yet: run 'make build' first."; exit 1; }
	mkdir -p $(UNIT_DIR)
	sed "s|@ROOT@|$(CURDIR)|g" deploy/$(UNIT_NAME).service > $(UNIT_DIR)/$(UNIT_NAME).service
	systemctl --user daemon-reload
	systemctl --user enable $(UNIT_NAME)
	@echo "→ installed. Start it with: make service-start"
	@loginctl show-user $$USER -p Linger | grep -q yes || \
		echo "  note: linger is off, so it stops when you log out (see deploy/README.md)"

service-uninstall:
	-systemctl --user disable --now $(UNIT_NAME)
	rm -f $(UNIT_DIR)/$(UNIT_NAME).service
	systemctl --user daemon-reload

service-start:
	systemctl --user start $(UNIT_NAME)
	@systemctl --user --no-pager status $(UNIT_NAME) | head -n 5

service-stop:
	systemctl --user stop $(UNIT_NAME)

service-restart:
	systemctl --user restart $(UNIT_NAME)
	@systemctl --user --no-pager status $(UNIT_NAME) | head -n 5

service-status:
	systemctl --user --no-pager status $(UNIT_NAME)

service-logs:
	journalctl --user -u $(UNIT_NAME) -f -o cat

## Rebuild the binary and restart the running service.
deploy: build service-restart

# ----------------------------------------------------------------- OpenRC
# Tarball for an OpenRC server (Alpine, Gentoo, ...): the static binary plus
# init script, conf.d, logrotate and install.sh. See deploy/README.md.

PKG := dist/trpl3c-wiki-openrc.tar.gz

package-openrc:
	@test -x $(OUT) || { echo "No $(OUT) yet: run 'make build' first."; exit 1; }
	rm -rf dist/trpl3c-wiki && mkdir -p dist/trpl3c-wiki
	cp $(OUT) deploy/openrc/trpl3c-wiki.initd deploy/openrc/trpl3c-wiki.confd \
		deploy/openrc/trpl3c-wiki.logrotate deploy/openrc/install.sh dist/trpl3c-wiki/
	tar -C dist -czf $(PKG) trpl3c-wiki
	rm -rf dist/trpl3c-wiki
	@echo "→ $(PKG). On the VPS: tar xzf trpl3c-wiki-openrc.tar.gz && sudo sh trpl3c-wiki/install.sh"
