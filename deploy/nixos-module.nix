# Optional: run the wiki as a NixOS *system* service instead of a user unit.
# Import it from configuration.nix:
#   imports = [ /srv/http/trpl3cweb/deploy/nixos-module.nix ];
# then `sudo nixos-rebuild switch`. Adjust `root` and `user` if needed.
{ ... }:
let
  root = "/srv/http/trpl3cweb";
  user = "hylmi";
in
{
  systemd.services.trpl3c-wiki = {
    description = "trpl3c wiki (API, dashboard and remote MCP)";
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    serviceConfig = {
      User = user;
      WorkingDirectory = root;
      EnvironmentFile = "-${root}/.env";
      # Same database as the user service / `make run`.
      Environment = "WIKI_DB=/home/${user}/.local/share/trpl3c-wiki/wiki.db";
      ExecStart = "${root}/dist/mcp-service serve";
      Restart = "on-failure";
      RestartSec = 3;
      UMask = "0077";
      NoNewPrivileges = true;
      PrivateTmp = true;
      ProtectSystem = "strict";
      ReadWritePaths = [ "/home/${user}/.local/share/trpl3c-wiki" ];
    };
  };
}
