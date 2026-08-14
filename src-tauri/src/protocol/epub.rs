use crate::epub::session::EpubSessionManager;
use std::sync::Arc;
use tauri::{http::Response, Manager};
use tokio::sync::RwLock;

/// Register the `taurus-epub://` custom URI scheme protocol.
///
/// URL format: `taurus-epub://<session-id>`
///
/// Serves the raw EPUB file bytes so the frontend can fetch a `Blob` and pass
/// it to foliate-js (detailed design 1.5).
///
/// The handler is asynchronous: the file read runs on the blocking thread pool
/// so the webview/main thread is never stalled by a large EPUB transfer.
pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.register_asynchronous_uri_scheme_protocol("taurus-epub", |ctx, request, responder| {
        let session_id = request.uri().path().trim_matches('/').to_string();

        let Some(manager) = ctx
            .app_handle()
            .try_state::<Arc<RwLock<EpubSessionManager>>>()
        else {
            responder.respond(
                Response::builder()
                    .status(500)
                    .header("Content-Type", "text/plain")
                    .body(b"Session manager not available".to_vec())
                    .unwrap(),
            );
            return;
        };
        let manager = manager.inner().clone();

        tauri::async_runtime::spawn(async move {
            let path = {
                let manager = manager.read().await;
                match manager.get_session(&session_id) {
                    Some(session) => session.file_path.clone(),
                    None => {
                        responder.respond(
                            Response::builder()
                                .status(404)
                                .header("Content-Type", "text/plain")
                                .body(b"Session not found".to_vec())
                                .unwrap(),
                        );
                        return;
                    }
                }
            };

            tauri::async_runtime::spawn_blocking(move || {
                let result =
                    std::fs::read(&path).map_err(|e| crate::error::AppError::Io(e.to_string()));
                let response = match result {
                    Ok(bytes) => Response::builder()
                        .status(200)
                        .header("Content-Type", "application/epub+zip")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap(),
                    Err(err) => Response::builder()
                        .status(500)
                        .header("Content-Type", "text/plain")
                        .body(format!("Failed to serve EPUB: {}", err).into_bytes())
                        .unwrap(),
                };
                responder.respond(response);
            });
        });
    })
}
