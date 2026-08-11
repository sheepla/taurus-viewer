use crate::epub::session::EpubSessionManager;
use crate::error::AppError;
use specta::Type;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

#[derive(Debug, serde::Serialize, serde::Deserialize, Type)]
pub struct EpubMetadata {
    pub session_id: String,
}

/// Opens an EPUB file, creates a session, and returns session ID.
#[tauri::command]
#[specta::specta]
pub async fn epub_open(
    file_path: String,
    session_manager: State<'_, Arc<RwLock<EpubSessionManager>>>,
) -> Result<EpubMetadata, AppError> {
    println!("epub_open called with file_path: {}", file_path);

    // Normalize Windows path separators
    let normalized_path = if cfg!(windows) {
        file_path.replace('/', "\\")
    } else {
        file_path.replace('\\', "/")
    };

    let path = PathBuf::from(&normalized_path);

    if !path.exists() || !path.is_file() {
        return Err(AppError::Epub(format!(
            "File not found or invalid: {:?}",
            path
        )));
    }

    let mut manager = session_manager.write().await;
    let session = manager.open_session(&path)?;

    Ok(EpubMetadata {
        session_id: session.id.clone(),
    })
}

/// Closes an EPUB session and releases resources.
#[tauri::command]
#[specta::specta]
pub async fn epub_close(
    session_id: String,
    session_manager: State<'_, Arc<RwLock<EpubSessionManager>>>,
) -> Result<(), AppError> {
    session_manager.write().await.close_session(&session_id);
    Ok(())
}
