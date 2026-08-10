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

        results.push(ScannedFile {
            path: path.to_path_buf(),
            format: ext,
            title,
            size,
            mtime,
        });
    }

    Ok(results)
}
