use crate::error::AppError;
use crate::epub::session::EpubSessionManager;
use specta::Type;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

#[derive(Debug, serde::Serialize, serde::Deserialize, Type)]
pub struct EpubMetadata {
    pub session_id: String,
    pub title: String,
    pub author: String,
    pub chapter_count: u32,
}

/// Opens an EPUB file, creates a session, and returns basic document metadata.
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
    
    // Check if file exists
    if !path.exists() {
        return Err(AppError::Epub(format!("File not found: {:?}", path)));
    }
    
    // Check if it's a file
    if !path.is_file() {
        return Err(AppError::Epub(format!("Path is not a file: {:?}", path)));
    }
    
    println!("Normalized path: {:?}", path);
    
    let mut manager = session_manager.write().await;
    let session = manager.open_session(&path)?;

    Ok(EpubMetadata {
        session_id: session.id.clone(),
        title: session.title.clone(),
        author: session.author.clone(),
        chapter_count: session.get_chapter_count() as u32,
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

/// Returns chapter content for display.
#[tauri::command]
#[specta::specta]
pub async fn epub_get_chapter_content(
    session_id: String,
    chapter_index: u32,
    session_manager: State<'_, Arc<RwLock<EpubSessionManager>>>,
) -> Result<String, AppError> {
    let manager = session_manager.read().await;
    let session = manager
        .get_session(&session_id)
        .ok_or_else(|| AppError::Epub("Session not found".into()))?;

    session.get_chapter_content(chapter_index as usize)
}