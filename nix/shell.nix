{
  lib,
  stdenv,
  mkShell,
  fetchurl,
  rustc,
  cargo,
  rust-analyzer,
  clippy,
  rustfmt,
  cargo-tauri,
  nodejs,
  pkg-config,
  cmake,
  pnpm_10,
}:
let
  pnpm = pnpm_10;

  pdfiumMacArm64 = fetchurl {
    url = "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-mac-arm64.tgz";
    hash = "sha256-4hTuM/IrIgTap2WlRa7h5CXYhEjmFU2slcagYga3Q38=";
  };
in
mkShell {
  packages = [
    rustc
    cargo
    rust-analyzer
    clippy
    rustfmt
    cargo-tauri
    nodejs
    pnpm
    pkg-config
    cmake
  ];

  shellHook = ''
    # Vendor the arm64 pdfium binary so src-tauri/build.rs picks it up
    # locally instead of downloading it from GitHub on every clean build.
    if [ ! -f src-tauri/pdfium.dylib ] && [ -f "${pdfiumMacArm64}" ]; then
      tar -xzf "${pdfiumMacArm64}" -O lib/libpdfium.dylib > src-tauri/pdfium.dylib
      echo "Vendored src-tauri/pdfium.dylib from pdfium-binaries"
    fi
  '';
}
