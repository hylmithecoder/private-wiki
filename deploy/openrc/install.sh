#!/bin/sh
# Installs or upgrades the wiki as an OpenRC service. Run as root from the
# unpacked package directory:  sh install.sh
set -eu

ROOT=/opt/trpl3c-wiki
USER_NAME=wiki
ENV_FILE=/etc/trpl3c-wiki.env
here=$(cd "$(dirname "$0")" && pwd)

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
command -v openrc-run >/dev/null || { echo "OpenRC not found" >&2; exit 1; }

# System user without a login shell.
if ! id "$USER_NAME" >/dev/null 2>&1; then
	if command -v adduser >/dev/null && adduser --help 2>&1 | grep -q -- '-S'; then
		addgroup -S "$USER_NAME" 2>/dev/null || true
		adduser -S -D -H -h /var/lib/trpl3c-wiki -s /sbin/nologin -G "$USER_NAME" "$USER_NAME" # Alpine
	else
		useradd --system --home-dir /var/lib/trpl3c-wiki --shell /sbin/nologin --user-group "$USER_NAME" # Gentoo etc.
	fi
fi

install -D -m 0755 "$here/mcp-service" "$ROOT/mcp-service"
install -D -m 0755 "$here/trpl3c-wiki.initd" /etc/init.d/trpl3c-wiki
[ -f /etc/conf.d/trpl3c-wiki ] || install -D -m 0644 "$here/trpl3c-wiki.confd" /etc/conf.d/trpl3c-wiki
if [ -d /etc/logrotate.d ]; then install -m 0644 "$here/trpl3c-wiki.logrotate" /etc/logrotate.d/trpl3c-wiki; fi

# First install: create the env file with fresh random keys.
if [ ! -f "$ENV_FILE" ]; then
	key() { head -c 32 /dev/urandom | base64 | tr -d '/+=' | cut -c1-40; }
	umask 077
	cat > "$ENV_FILE" <<ENV
WIKI_ADDR=0.0.0.0:4220
WIKI_ADMIN_KEY=$(key)
WIKI_MCP_KEY=$(key)
# WIKI_SECURE_COOKIE=1   # set when served over HTTPS
ENV
	echo "created $ENV_FILE with new keys (see it for the admin/MCP keys)"
fi

rc-update add trpl3c-wiki default >/dev/null
if rc-service trpl3c-wiki status >/dev/null 2>&1; then
	rc-service trpl3c-wiki restart
else
	rc-service trpl3c-wiki start
fi
echo "logs: tail -f /var/log/trpl3c-wiki/wiki.log"
