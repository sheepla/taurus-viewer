use crate::error::AppError;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const SUPPORTED_EXTENSIONS: &[&str] = &["pdf", "epub"];

#[derive(Debug)]
pub struct ScannedFile {
    pub path: PathBuf,
    pub format: String,
    pub title: String,
    pub size: i64,
    pub mtime: i64,
    /// Empty when the file is readable; populated otherwise so the library can
    /// show an error badge instead of silently dropping the file (6.4).
    pub error_message: Option<String>,
}

/// Lightweight readability check used to flag broken files during the scan.
///
/// PDFs are validated by their magic header to avoid opening pdfium for every
/// file; EPUBs are fully parsed since `EpubDoc::new` is cheap.
fn validate(path: &Path, format: &str) -> Option<String> {
    match format {
        "pdf" => {
            let mut header = [0u8; 5];
            let Ok(mut file) = std::fs::File::open(path) else {
                return Some("Cannot open file".into());
            };
            use std::io::Read;
            file.read_exact(&mut header).ok()?;
            if header != *b"%PDF-" {
                Some("Not a valid PDF file".into())
            } else {
                None
            }
        }
        "epub" => match epub::doc::EpubDoc::new(path) {
            Ok(_) => None,
            Err(e) => Some(format!("Failed to parse EPUB: {}", e)),
        },
        _ => Some("Unsupported format".into()),
    }
}

pub fn scan_directory(root: &Path) -> Result<Vec<ScannedFile>, AppError> {
    let mut results = Vec::new();

    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = match path.extension().and_then(|s| s.to_str()) {
            Some(ext) => ext.to_lowercase(),
            None => continue,
        };

        if !SUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let size = metadata.len() as i64;
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();

        let error_message = validate(path, &ext);

        results.push(ScannedFile {
            path: path.to_path_buf(),
            format: ext,
            title,
            size,
            mtime,
            error_message,
        });
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_extension_types() {
        let files = scan_directory(Path::new("../testdata")).expect("scan testdata");
        assert!(!files.is_empty());
        assert!(files.iter().any(|f| f.format == "pdf"));
        assert!(files.iter().any(|f| f.format == "epub"));
    }

    #[test]
    fn validates_sample_pdf() {
        let files = scan_directory(Path::new("../testdata")).expect("scan testdata");
        let pdf = files.iter().find(|f| f.format == "pdf").unwrap();
        assert_eq!(pdf.error_message, None, "sample PDF should validate");
    }
}
