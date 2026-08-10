use crate::epub::session::EpubSessionManager;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

/// Register the `taurus-epub://` custom URI scheme protocol.
///
/// URL format: `taurus-epub://<session-id>`
///
/// Returns raw bytes of the EPUB file.
pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.register_uri_scheme_protocol("taurus-epub", |ctx, request| {
        let uri = request.uri();
        let path = uri.path();

        println!("EPUB file request: {}", path);

        let session_id = path.trim_matches('/');
        if session_id.is_empty() {
            return tauri::http::Response::builder()
                .status(400)
                .header("Content-Type", "text/plain")
                .body(b"Invalid URI format. Expected: /session_id".to_vec())
                .unwrap();
        }

        let session_manager = ctx.app_handle().try_state::<Arc<RwLock<EpubSessionManager>>>();

        let file_path = match session_manager {
            Some(session_manager) => {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    let manager = session_manager.read().await;
                    if let Some(session) = manager.get_session(session_id) {
                        Ok(session.file_path.clone())
                    } else {
                        Err("Session not found")
                    }
                })
            }
            None => Err("Session manager not available"),
        };

        match file_path {
            Ok(path) => match std::fs::read(&path) {
                Ok(bytes) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", "application/epub+zip")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .unwrap(),
                Err(err) => tauri::http::Response::builder()
                    .status(500)
                    .header("Content-Type", "text/plain")
                    .body(format!("Failed to read EPUB file: {}", err).into_bytes())
                    .unwrap(),
            },
            Err(err) => tauri::http::Response::builder()
                .status(404)
                .header("Content-Type", "text/plain")
                .body(format!("EPUB session error: {}", err).into_bytes())
                .unwrap(),
        }
    })
}
