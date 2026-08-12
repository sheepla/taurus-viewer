use crate::epub::session::EpubSessionManager;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

/// Register the `taurus-epub://` custom URI scheme protocol.
///
/// URL format: `taurus-epub://<session-id>`
///
/// Serves the raw EPUB file bytes so the frontend can fetch a `Blob` and pass
/// it to foliate-js (detailed design 1.5).
pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.register_uri_scheme_protocol("taurus-epub", |ctx, request| {
        let session_id = request.uri().path().trim_matches('/');

        let manager = ctx
            .app_handle()
            .try_state::<Arc<RwLock<EpubSessionManager>>>();

        let result = match manager {
            Some(manager) => tauri::async_runtime::block_on(async {
                let manager = manager.read().await;
                let session = manager
                    .get_session(session_id)
                    .ok_or_else(|| crate::error::AppError::Epub("Session not found".into()))?;
                std::fs::read(&session.file_path)
                    .map_err(|e| crate::error::AppError::Io(e.to_string()))
            }),
            None => Err(crate::error::AppError::Epub(
                "Session manager not available".into(),
            )),
        };

        match result {
            Ok(bytes) => tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", "application/epub+zip")
                .header("Access-Control-Allow-Origin", "*")
                .body(bytes)
                .unwrap(),
            Err(err) => tauri::http::Response::builder()
                .status(500)
                .header("Content-Type", "text/plain")
                .body(format!("Failed to serve EPUB: {}", err).into_bytes())
                .unwrap(),
        }
    })
}
