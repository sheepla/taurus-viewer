use std::env;
use std::fs;
use std::path::PathBuf;

/// Describes where to fetch the platform's pdfium binary from and how to
/// locate it inside the downloaded tarball.
struct PdfiumAsset {
    url: &'static str,
    /// Path of the binary inside the extracted tarball.
    archive_path: &'static str,
    /// Filename to place the binary under (also used as the Windows resource name).
    dest_name: &'static str,
}

fn pdfium_asset(target_os: &str, target_arch: &str) -> Option<PdfiumAsset> {
    match (target_os, target_arch) {
        ("windows", _) => Some(PdfiumAsset {
            url: "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-win-x64.tgz",
            archive_path: "bin/pdfium.dll",
            dest_name: "pdfium.dll",
        }),
        // Only Apple Silicon is supported on macOS for now.
        ("macos", "aarch64") => Some(PdfiumAsset {
            url: "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-mac-arm64.tgz",
            archive_path: "lib/libpdfium.dylib",
            dest_name: "pdfium.dylib",
        }),
        _ => None,
    }
}

fn main() {
    // 1. Build Tauri application
    tauri_build::build();

    // 2. Fetch the pdfium binary dynamically for the platform being built.
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();

    let Some(asset) = pdfium_asset(&target_os, &target_arch) else {
        return;
    };

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let out_dest = out_dir.join(asset.dest_name);

    if !out_dest.exists() {
        // Reuse an already-vendored binary committed at the crate root
        // (e.g. `src-tauri/pdfium.dll`) if present, to avoid a network
        // fetch on every clean build.
        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
        let vendored = manifest_dir.join(asset.dest_name);

        if vendored.exists() {
            fs::copy(&vendored, &out_dest).expect("Failed to copy vendored pdfium binary");
        } else {
            println!(
                "cargo:warning=Downloading {} dynamically during build...",
                asset.dest_name
            );

            let mut response = reqwest::blocking::get(asset.url)
                .expect("Failed to download pdfium binary release package");

            let temp_tarball = out_dir.join("pdfium.tgz");
            let mut file =
                fs::File::create(&temp_tarball).expect("Failed to create temporary tgz file");
            std::io::copy(&mut response, &mut file)
                .expect("Failed to write download stream to tgz file");

            let tarball_file = fs::File::open(&temp_tarball).expect("Failed to read tgz file");
            let tar = flate2::read::GzDecoder::new(tarball_file);
            let mut archive = tar::Archive::new(tar);

            for entry in archive
                .entries()
                .expect("Failed to read tar archive entries")
            {
                let mut entry = entry.expect("Failed to parse archive entry");
                let path = entry.path().expect("Failed to extract path from entry");
                if path.to_str() == Some(asset.archive_path) {
                    let mut dest_file = fs::File::create(&out_dest)
                        .expect("Failed to create output pdfium binary");
                    std::io::copy(&mut entry, &mut dest_file)
                        .expect("Failed to extract pdfium binary content");
                }
            }

            fs::remove_file(temp_tarball).ok();
        }
    }

    // Re-export the path so the crate can `include_bytes!` it regardless of
    // target OS (see src/pdf/session.rs).
    println!("cargo:rustc-env=PDFIUM_LIB_PATH={}", out_dest.display());

    // Also copy to the crate root so it can be picked up as a bundle
    // resource (see tauri.windows.conf.json / tauri.macos.conf.json) and
    // found in the current directory during `cargo run`/`cargo test`.
    fs::copy(&out_dest, PathBuf::from(asset.dest_name)).ok();
}
