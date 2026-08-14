use crate::error::AppError;
use crate::library::cache::{AddFolderOutcome, DbCache, LibraryEntry, LibraryFolder};
use crate::library::scanner;
use crate::library::thumbnail::ThumbnailGenerator;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{Manager, State};
use tauri_specta::Event;

/// Progress event emitted while a library folder is being scanned.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ScanProgress {
    pub folder_path: String,
    pub processed: u32,
    pub total: u32,
}

/// Emitted once a folder scan (including deferred thumbnails) has finished.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ScanFinished {
    pub folder_path: String,
    pub total: u32,
}

#[tauri::command]
#[specta::specta]
pub async fn library_add_folder(
    path: String,
    db_cache: State<'_, DbCache>,
    app: tauri::AppHandle,
) -> Result<AddFolderOutcome, AppError> {
    let folder_path = PathBuf::from(path);
    let outcome = db_cache.add_folder(&folder_path).await?;
    spawn_scan(app, db_cache.inner().clone(), folder_path);
    Ok(outcome)
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

pub fn spawn_scan(app: tauri::AppHandle, db_cache: DbCache, folder_path: PathBuf) {
    tauri::async_runtime::spawn(async move {
        let _ = scan_folder_async(&app, &db_cache, folder_path).await;
    });
}

/// Generates thumbnails for changed entries plus any entry whose thumbnail is
/// missing (NULL or the cached PNG no longer exists), then prunes thumbnail
/// files whose entry has been removed from the library. Runs best-effort so a
/// thumbnail problem never fails the folder scan itself.
async fn generate_missing_thumbnails(
    db_cache: &DbCache,
    cache_dir: PathBuf,
    resource_dir: Option<PathBuf>,
    folder_id: i64,
    mut changed_files: Vec<(i64, PathBuf, String)>,
) {
    let candidates = db_cache
        .list_entries_needing_thumbnails(folder_id)
        .await
        .unwrap_or_default();

    for candidate in candidates {
        let thumbnail_exists = candidate
            .thumbnail_path
            .as_deref()
            .map(|p| Path::new(p).is_file())
            .unwrap_or(false);
        if thumbnail_exists {
            continue;
        }
        let already_scheduled = changed_files
            .iter()
            .any(|(entry_id, _, _)| *entry_id == candidate.entry_id);
        if !already_scheduled {
            changed_files.push((
                candidate.entry_id,
                PathBuf::from(candidate.path),
                candidate.format,
            ));
        }
    }

    if !changed_files.is_empty() {
        let db_cache = db_cache.clone();
        let gen_cache_dir = cache_dir.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let generator = ThumbnailGenerator::new(gen_cache_dir, resource_dir);
            for (entry_id, path, format) in changed_files {
                let thumb_res = if format == "pdf" {
                    generator.generate_pdf_thumbnail(entry_id, &path).map(Some)
                } else {
                    generator.generate_epub_thumbnail(entry_id, &path)
                };
                if let Ok(Some(thumb_path)) = thumb_res {
                    let _ = tauri::async_runtime::block_on(
                        db_cache.update_thumbnail(entry_id, &thumb_path),
                    );
                }
            }
        })
        .await
        .ok();
    }

    let valid_ids: HashSet<i64> = db_cache
        .list_entry_ids()
        .await
        .unwrap_or_default()
        .into_iter()
        .collect();
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(entries) = std::fs::read_dir(&cache_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                let Some(stem) = name.strip_suffix(".png") else {
                    continue;
                };
                let Ok(id) = stem.parse::<i64>() else {
                    continue;
                };
                if !valid_ids.contains(&id) {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    })
    .await
    .ok();
}

async fn scan_folder_async(
    app: &tauri::AppHandle,
    db_cache: &DbCache,
    folder_path: PathBuf,
) -> Result<(), AppError> {
    log::info!(
        "Starting background scan for folder: {}",
        folder_path.display()
    );
    let scanned = scanner::scan_directory(&folder_path)?;
    let folder_id = match db_cache.add_folder(&folder_path).await? {
        AddFolderOutcome::Created(id) | AddFolderOutcome::AlreadyExists(id) => id,
    };
    let total = scanned.len() as u32;

    let cache_dir = app
        .path()
        .cache_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("taurus-viewer")
        .join("thumbnails");
    std::fs::create_dir_all(&cache_dir)?;

    let keep_paths: Vec<String> = scanned
        .iter()
        .map(|f| f.path.to_string_lossy().into_owned())
        .collect();

    let mut changed_files = Vec::new();

    for (index, file) in scanned.iter().enumerate() {
        if let Ok(upsert) = db_cache
            .upsert_entry(
                folder_id,
                &file.path,
                &file.format,
                &file.title,
                file.size,
                file.mtime,
                file.error_message.as_deref(),
            )
            .await
        {
            if upsert.changed && file.error_message.is_none() {
                changed_files.push((upsert.entry_id, file.path.clone(), file.format.clone()));
            }
        }

        ScanProgress {
            folder_path: folder_path.to_string_lossy().into_owned(),
            processed: (index + 1) as u32,
            total,
        }
        .emit(app)
        .ok();
    }

    db_cache
        .delete_entries_not_in(folder_id, &keep_paths)
        .await?;
    db_cache.update_folder_scanned_at(folder_id).await?;

    let cache_dir = cache_dir.clone();
    let resource_dir = app.path().resource_dir().ok();
    generate_missing_thumbnails(db_cache, cache_dir, resource_dir, folder_id, changed_files).await;

    ScanFinished {
        folder_path: folder_path.to_string_lossy().into_owned(),
        total,
    }
    .emit(app)
    .ok();

    Ok(())
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
    let folder_id = match db_cache.add_folder(&folder_path).await? {
        AddFolderOutcome::Created(id) | AddFolderOutcome::AlreadyExists(id) => id,
    };
    let count = scanned.len() as u32;

    let cache_dir = app
        .path()
        .cache_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("taurus-viewer")
        .join("thumbnails");
    std::fs::create_dir_all(&cache_dir)?;

    let keep_paths: Vec<String> = scanned
        .iter()
        .map(|f| f.path.to_string_lossy().into_owned())
        .collect();

    let mut changed_files = Vec::new();

    for file in &scanned {
        if let Ok(upsert) = db_cache
            .upsert_entry(
                folder_id,
                &file.path,
                &file.format,
                &file.title,
                file.size,
                file.mtime,
                file.error_message.as_deref(),
            )
            .await
        {
            if upsert.changed && file.error_message.is_none() {
                changed_files.push((upsert.entry_id, file.path.clone(), file.format.clone()));
            }
        }
    }

    db_cache
        .delete_entries_not_in(folder_id, &keep_paths)
        .await?;
    db_cache.update_folder_scanned_at(folder_id).await?;

    let cache_dir = cache_dir.clone();
    let resource_dir = app.path().resource_dir().ok();
    generate_missing_thumbnails(&db_cache, cache_dir, resource_dir, folder_id, changed_files).await;

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
