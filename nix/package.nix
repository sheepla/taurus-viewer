{
  lib,
  stdenv,
  fetchurl,
  rustPlatform,
  cargo-tauri,
  nodejs,
  pkg-config,
  cmake,
  pnpmConfigHook,
  fetchPnpmDeps,
  pnpm_10,
  makeBinaryWrapper,
}:
let
  pnpm = pnpm_10;

  # src-tauri/build.rs downloads the arm64 pdfium dylib dynamically over the
  # network at build time, which the Nix build sandbox does not allow; it
  # also checks for an already-vendored `pdfium.dylib` at the crate root
  # first, so we fetch it here (as a fixed-output derivation, which is
  # allowed network access) and drop it into place in `postPatch` below.
  pdfiumMacArm64 = fetchurl {
    url = "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-mac-arm64.tgz";
    hash = "sha256-4hTuM/IrIgTap2WlRa7h5CXYhEjmFU2slcagYga3Q38=";
  };
in
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "taurus-viewer";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = ../.;
    filter =
      name: type:
      let
        baseName = baseNameOf (toString name);
      in
      !(lib.elem baseName [
        "target"
        "dist"
        "node_modules"
        ".git"
      ]);
  };

  cargoRoot = "src-tauri";
  buildAndTestSubdir = "src-tauri";

  cargoLock = {
    lockFile = ../src-tauri/Cargo.lock;
  };

  # `cargo test` relies on fixtures under `testdata/` and loose `*.pdf`/
  # `*.epub` files that are intentionally gitignored (see .gitignore) and
  # therefore aren't present in the git-tracked source tree Nix builds from.
  doCheck = false;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 4;
    hash = "sha256-spysJgZChbR9rjcXy4IdUQl0OeMPX0+do+Oq6WuZjOA=";
  };

  nativeBuildInputs = [
    cargo-tauri.hook
    nodejs
    pkg-config
    cmake
    pnpmConfigHook
    pnpm
  ]
  ++ lib.optional stdenv.hostPlatform.isDarwin makeBinaryWrapper;

  postPatch = ''
    tar -xzf ${pdfiumMacArm64} -O lib/libpdfium.dylib > src-tauri/pdfium.dylib
  '';

  postInstall = lib.optionalString stdenv.hostPlatform.isDarwin ''
    makeBinaryWrapper "$out/Applications/taurus-viewer.app/Contents/MacOS/taurus-viewer" "$out/bin/taurus-viewer"
  '';

  meta = {
    description = "Lightweight, keyboard-driven document viewer built with Tauri";
    homepage = "https://github.com/sheepla/taurus-viewer";
    license = lib.licenses.mit;
    platforms = [ "aarch64-darwin" ];
    mainProgram = "taurus-viewer";
  };
})
