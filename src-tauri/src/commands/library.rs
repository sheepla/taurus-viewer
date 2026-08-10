use crate::error::AppError;
use crate::library::cache::{DbCache, LibraryEntry, LibraryFolder};
use crate::library::scanner;
use crate::library::thumbnail::ThumbnailGenerator;
use std::path::PathBuf;
use tauri::{Manager, State};

#[tauri::command]
#[specta::specta]
pub async fn library_add_folder(
    path: String,
    db_cache: State<'_, DbCache>,
) -> Result<i32, AppError> {
    let folder_path = PathBuf::from(path);
    let id = db_cache.add_folder(&folder_path).await?;
    Ok(id as i32)
}

#[tauri::command]
#[specta::specta]
pub async fn library_remove_folder(
    path: String,
    db_cache: State<'_, DbCache>,
) -> Result<(), AppError> {
    let folder_path = PathBuf::from(path);
    db_cache.remove_folder(&folder_path).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_list_folders(
    db_cache: State<'_, DbCache>,
) -> Result<Vec<LibraryFolder>, AppError> {
    db_cache.list_folders().await
}

#[tauri::command]
#[specta::specta]
pub async fn library_list_entries(
    db_cache: State<'_, DbCache>,
) -> Result<Vec<LibraryEntry>, AppError> {
    db_cache.list_entries().await
}

#[tauri::command]
#[specta::specta]
pub async fn library_scan_folder(
    path: String,
    db_cache: State<'_, DbCache>,
    app: tauri::AppHandle,
) -> Result<u32, AppError> {
    let folder_path = PathBuf::from(&path);
    let scanned = scanner::scan_directory(&folder_path)?;
    let folder_id = db_cache.add_folder(&folder_path).await?;
    let count = scanned.len() as u32;

    // Resolve thumbnail cache dir from Tauri cache directory
    let cache_dir = app
        .path()
        .cache_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("taurus-viewer")
        .join("thumbnails");
    std::fs::create_dir_all(&cache_dir)?;

    for file in scanned {
        let entry_id = db_cache
            .upsert_entry(
                folder_id,
                &file.path,
                &file.format,
                &file.title,
                file.size,
                file.mtime,
            )
            .await?;

        if file.format == "pdf" {
            let thumb_result = ThumbnailGenerator::new(cache_dir.clone())
                .and_then(|gen| gen.generate_pdf_thumbnail(entry_id, &file.path));

            if let Ok(thumb_path) = thumb_result {
                let _ = db_cache.update_thumbnail(entry_id, &thumb_path).await;
            }
        }
    }

    Ok(count)
}

#[tauri::command]
#[specta::specta]
pub async fn palette_search_library(
    query: String,
    db_cache: State<'_, DbCache>,
) -> Result<Vec<LibraryEntry>, AppError> {
    db_cache.search_library(&query).await
}
