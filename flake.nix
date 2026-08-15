{
  description = "TaurusViewer — a lightweight, keyboard-driven document viewer built with Tauri";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    nix-darwin = {
      url = "github:nix-darwin/nix-darwin/master";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      nix-darwin,
      ...
    }:
    let
      systems = [ "aarch64-darwin" ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      packages = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.callPackage ./nix/package.nix { };
        }
      );

      devShells = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.callPackage ./nix/shell.nix { };
        }
      );

      formatter = forEachSystem (system: (pkgsFor system).nixfmt-rfc-style);

      # `darwinModules.default` wires `programs.taurus-viewer.enable` into a
      # nix-darwin system configuration, e.g.:
      #
      #   inputs.taurus-viewer.url = "github:sheepla/taurus-viewer";
      #   # ...
      #   darwinConfigurations.<host> = nix-darwin.lib.darwinSystem {
      #     modules = [
      #       inputs.taurus-viewer.darwinModules.default
      #       { programs.taurus-viewer.enable = true; }
      #     ];
      #   };
      darwinModules.default = import ./nix/darwin-module.nix self;
    };
}
