use crate::pdf::session::PdfSessionManager;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

/// Register the `taurus-page://` custom URI scheme protocol.
///
/// URL format: `taurus-page://<session-id>/<page-index>?w=<width>`
///
/// Returns rendered PNG bytes of the specified PDF page.
pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.register_uri_scheme_protocol("taurus-page", |ctx, request| {
        let uri = request.uri();
        let path = uri.path();
        let query = uri.query().unwrap_or("");

        println!("PDF page request: {} query: {}", path, query);

        let width: u32 = query
            .split('&')
            .find_map(|p| {
                let mut kv = p.split('=');
                if kv.next() == Some("w") {
                    kv.next()?.parse().ok()
                } else {
                    None
                }
            })
            .unwrap_or(1000);

        let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
        if parts.len() < 2 {
            println!("Invalid URI format: {}", path);
            return tauri::http::Response::builder()
                .status(400)
                .header("Content-Type", "text/plain")
                .body(b"Invalid URI format. Expected: /session_id/page_index".to_vec())
                .unwrap();
        }

        let session_id = parts[0];
        let page_index: u16 = match parts[1].parse() {
            Ok(idx) => idx,
            Err(e) => {
                println!("Invalid page index '{}': {}", parts[1], e);
                return tauri::http::Response::builder()
                    .status(400)
                    .header("Content-Type", "text/plain")
                    .body(format!("Invalid page index: {}", parts[1]).into_bytes())
                    .unwrap();
            }
        };

        println!(
            "Rendering PDF session: {}, page: {}, width: {}",
            session_id, page_index, width
        );

        let session_manager = ctx
            .app_handle()
            .try_state::<Arc<RwLock<PdfSessionManager>>>();

        let res = match session_manager {
            Some(session_manager) => {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    let manager = session_manager.read().await;
                    if let Some(session) = manager.get_session(session_id) {
                        session.render_page(page_index, width)
                    } else {
                        println!("PDF session not found: {}", session_id);
                        Err(crate::error::AppError::Pdf("Session not found".into()))
                    }
                })
            }
            None => {
                println!("Session manager not found in app state");
                Err(crate::error::AppError::Pdf(
                    "Session manager not available".into(),
                ))
            }
        };

        match res {
            Ok(bytes) => {
                println!(
                    "Successfully rendered page {} ({} bytes)",
                    page_index,
                    bytes.len()
                );
                tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", "image/png")
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", "public, max-age=3600")
                    .body(bytes)
                    .unwrap()
            }
            Err(err) => {
                println!("Error rendering page: {}", err);
                tauri::http::Response::builder()
                    .status(500)
                    .header("Content-Type", "text/plain")
                    .body(format!("Failed to render page: {}", err).into_bytes())
                    .unwrap()
            }
        }
    })
}
