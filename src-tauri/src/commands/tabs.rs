use crate::error::AppError;
use crate::library::cache::{ClosedTabRecord, DbCache, TabSessionRecord};
use tauri::State;

/// Pushes a tab onto the persistent closed-tab stack (pruned to 10 entries).
#[tauri::command]
#[specta::specta]
pub async fn tab_push_closed(
    file_path: String,
    format: String,
    view_state: String,
    db_cache: State<'_, DbCache>,
) -> Result<(), AppError> {
    db_cache
        .push_closed_tab(&file_path, &format, &view_state)
        .await
}

/// Pops the most recently closed tab, if any.
#[tauri::command]
#[specta::specta]
pub async fn tab_pop_closed(
    db_cache: State<'_, DbCache>,
) -> Result<Option<ClosedTabRecord>, AppError> {
    db_cache.pop_closed_tab().await
}

/// Replaces the persisted tab set with the given sessions (startup restore).
#[tauri::command]
#[specta::specta]
pub async fn tab_save_sessions(
    tabs: Vec<TabSessionRecord>,
    db_cache: State<'_, DbCache>,
) -> Result<(), AppError> {
    db_cache.save_tab_sessions(&tabs).await
}

/// Loads the previously persisted tab sessions.
#[tauri::command]
#[specta::specta]
pub async fn tab_load_sessions(
    db_cache: State<'_, DbCache>,
) -> Result<Vec<TabSessionRecord>, AppError> {
    db_cache.load_tab_sessions().await
}
