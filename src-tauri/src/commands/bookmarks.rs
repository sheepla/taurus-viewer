use crate::error::AppError;
use crate::library::cache::{BookmarkRecord, DbCache};
use tauri::State;

/// Toggles a bookmark for the given page. Returns whether the bookmark now
/// exists (`true` = added, `false` = removed).
#[tauri::command]
#[specta::specta]
pub async fn bookmark_toggle(
    file_path: String,
    format: String,
    page_position: String,
    db_cache: State<'_, DbCache>,
) -> Result<bool, AppError> {
    db_cache
        .toggle_bookmark(&file_path, &format, &page_position)
        .await
}

/// Lists bookmarks for a document in creation order.
#[tauri::command]
#[specta::specta]
pub async fn bookmark_list(
    file_path: String,
    db_cache: State<'_, DbCache>,
) -> Result<Vec<BookmarkRecord>, AppError> {
    db_cache.list_bookmarks(&file_path).await
}
