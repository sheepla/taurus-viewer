self:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.taurus-viewer;
  package = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
in
{
  options.programs.taurus-viewer = {
    enable = lib.mkEnableOption "TaurusViewer, a lightweight keyboard-driven document viewer";

    package = lib.mkOption {
      type = lib.types.package;
      default = package;
      description = "The taurus-viewer package to install.";
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];

    # `cfg.package` only puts `taurus-viewer.app` in the Nix store
    # (`$out/Applications`), which Launch Services / Spotlight won't see on
    # their own. Symlink it into `/Applications/Nix Apps/` on every
    # activation, following the convention used by nix-darwin setups for
    # exposing GUI .app bundles outside the store.
    system.activationScripts.postActivation.text = ''
      echo "Linking taurus-viewer.app into /Applications/Nix Apps/..." >&2
      mkdir -p "/Applications/Nix Apps"
      ln -sfn "${cfg.package}/Applications/taurus-viewer.app" "/Applications/Nix Apps/taurus-viewer.app"
    '';
  };
}
