use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // 1. Build Tauri application
    tauri_build::build();

    // 2. Fetch and place pdfium.dll dynamically if on Windows
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "windows" {
        let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
        // Find cargo target directory (up 5 levels from OUT_DIR)
        let mut target_dir = out_dir.clone();
        for _ in 0..5 {
            target_dir.pop();
        }

        let pdfium_dest_dir = target_dir.clone();
        let pdfium_dest = pdfium_dest_dir.join("pdfium.dll");

        if !pdfium_dest.exists() {
            println!("cargo:warning=Downloading pdfium.dll dynamically during build...");
            let url = "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-win-x64.tgz";

            // Download the tarball
            let mut response = reqwest::blocking::get(url)
                .expect("Failed to download pdfium binary release package");

            let temp_tarball = out_dir.join("pdfium.tgz");
            let mut file =
                fs::File::create(&temp_tarball).expect("Failed to create temporary tgz file");
            std::io::copy(&mut response, &mut file)
                .expect("Failed to write download stream to tgz file");

            // Extract the tgz file
            let tarball_file = fs::File::open(&temp_tarball).expect("Failed to read tgz file");
            let tar = flate2::read::GzDecoder::new(tarball_file);
            let mut archive = tar::Archive::new(tar);

            for entry in archive
                .entries()
                .expect("Failed to read tar archive entries")
            {
                let mut entry = entry.expect("Failed to parse archive entry");
                let path = entry.path().expect("Failed to extract path from entry");
                if path.to_str() == Some("bin/pdfium.dll") {
                    fs::create_dir_all(&pdfium_dest_dir).ok();
                    let mut dest_file =
                        fs::File::create(&pdfium_dest).expect("Failed to create output pdfium.dll");
                    std::io::copy(&mut entry, &mut dest_file)
                        .expect("Failed to extract pdfium.dll content");
                }
            }

            // Clean up temporary files
            fs::remove_file(temp_tarball).ok();

            // Also copy pdfium.dll to source root (src-tauri) so cargo test/run can find it in the current directory
            fs::copy(&pdfium_dest, PathBuf::from("pdfium.dll")).ok();
        }
    }
}
