# Running the wiki as a service

The service runs the single static binary (`dist/mcp-service serve`), which
serves the dashboard, `/api` and remote MCP (`/mcp`) on `WIKI_ADDR`
(default `0.0.0.0:4220`, all interfaces; if the port is taken, the next free
one is used). Settings come from `.env` in the repo root.

## systemd user service (no root)

```sh
make build             # produce dist/mcp-service (after every code change)
make service-install   # install + enable the unit (~/.config/systemd/user)
make service-start
make service-logs      # follow logs, including `mcp |` events
make deploy            # rebuild and restart in one go
```

A user service only runs while you are logged in, unless *linger* is on:

- NixOS (declarative, recommended), in `configuration.nix`:
  `users.users.<you>.linger = true;` then `nixos-rebuild switch`.
- Elsewhere: `loginctl enable-linger $USER`.

## OpenRC (Alpine, Gentoo, ... VPS)

```sh
make build && make package-openrc          # -> dist/trpl3c-wiki-openrc.tar.gz
scp dist/trpl3c-wiki-openrc.tar.gz vps:
ssh vps 'tar xzf trpl3c-wiki-openrc.tar.gz && sudo sh trpl3c-wiki/install.sh'
```

`install.sh` creates a `wiki` system user, installs the binary to
`/opt/trpl3c-wiki`, the init script, `/etc/conf.d/trpl3c-wiki` and a logrotate
rule, generates `/etc/trpl3c-wiki.env` with fresh keys on first install, then
enables and (re)starts the service. Running it again upgrades in place.

| What | Where |
| --- | --- |
| Log (incl. `mcp |` events) | `/var/log/trpl3c-wiki/wiki.log` (`tail -f`), rotated weekly |
| Settings / keys | `/etc/trpl3c-wiki.env` (same format as `.env`) |
| Database | `/var/lib/trpl3c-wiki/wiki.db` |
| Control | `rc-service trpl3c-wiki start|stop|restart|status` |

Needs OpenRC 0.44 or newer (supervise-daemon with `output_log`); crashes are
restarted automatically. Open port 4220 in the VPS firewall if you access it
directly, and prefer HTTPS in front of it (reverse proxy or tunnel).

## NixOS system service (alternative)

If you prefer a system service, see `nixos-module.nix` in this folder.

## Tunnel

Point the tunnel (for example cloudflared) at `http://127.0.0.1:4220`. Put it
behind HTTPS and set `WIKI_SECURE_COOKIE=1` in `.env`. If only the tunnel
should reach the wiki, set `WIKI_ADDR=127.0.0.1:4220` so the port isn't open
on the public IP.
