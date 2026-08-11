use crate::error::AppError;
use crate::pdf::session::PdfSessionManager;
use specta::Type;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::RwLock;

#[derive(Debug, serde::Serialize, serde::Deserialize, Type)]
pub struct PdfMetadata {
    pub session_id: String,
    pub page_count: u32,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Type)]
pub struct PageDimensions {
    pub width: f64,
    pub height: f64,
}

/// Opens a PDF file, creates a render session, and returns basic document metadata.
#[tauri::command]
#[specta::specta]
pub async fn pdf_open(
    file_path: String,
    session_manager: State<'_, Arc<RwLock<PdfSessionManager>>>,
    app: tauri::AppHandle,
) -> Result<PdfMetadata, AppError> {
    println!("pdf_open called with file_path: {}", file_path);

    // Normalize Windows path separators
    let normalized_path = if cfg!(windows) {
        file_path.replace('/', "\\")
    } else {
        file_path.replace('\\', "/")
    };

    let path = PathBuf::from(&normalized_path);

    // Check if file exists
    if !path.exists() {
        return Err(AppError::Pdf(format!("File not found: {:?}", path)));
    }

    // Check if it's a file
    if !path.is_file() {
        return Err(AppError::Pdf(format!("Path is not a file: {:?}", path)));
    }

    println!("Normalized path: {:?}", path);

    let resource_dir = app.path().resource_dir().ok();
    let mut manager = session_manager.write().await;
    let session = manager.open_session(&path, resource_dir)?;

    Ok(PdfMetadata {
        session_id: session.id.clone(),
        page_count: session.page_count as u32,
    })
}

/// Closes a PDF session and releases resources.
#[tauri::command]
#[specta::specta]
pub async fn pdf_close(
    session_id: String,
    session_manager: State<'_, Arc<RwLock<PdfSessionManager>>>,
) -> Result<(), AppError> {
    session_manager.write().await.close_session(&session_id);
    Ok(())
}

/// Returns page dimensions for layout calculation.
#[tauri::command]
#[specta::specta]
pub async fn pdf_get_page_dimensions(
    session_id: String,
    page_index: u16,
    session_manager: State<'_, Arc<RwLock<PdfSessionManager>>>,
) -> Result<PageDimensions, AppError> {
    let manager = session_manager.read().await;
    let session = manager
        .get_session(&session_id)
        .ok_or_else(|| AppError::Pdf("Session not found".into()))?;

    let (width, height) = session.get_page_dimensions(page_index)?;
    Ok(PageDimensions { width, height })
}
