use crate::pdf::recolor::RenderTheme;
use crate::pdf::render_cache::PdfRenderService;
use std::sync::Arc;
use tauri::{http::Response, Manager};

/// Register the `taurus-page://` custom URI scheme protocol.
///
/// URL format: `taurus-page://<session-id>/<page-index>?w=<width>&theme=<light|dark>&saturation=<0-100>&contrast=<0-100>`
///
/// This handler is a thin dispatcher: rendering and LRU caching are delegated
/// to `PdfRenderService` (architecture 2.5.2, detailed design ch. 4).
///
/// The handler is asynchronous: the render runs on the blocking thread pool so
/// the webview/main thread is never stalled by a PDFium render (Tauri custom
/// protocol handlers block the main thread when run synchronously).
pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.register_asynchronous_uri_scheme_protocol("taurus-page", |ctx, request, responder| {
        let uri = request.uri();
        let path = uri.path().to_string();
        let query = uri.query().unwrap_or("").to_string();

        let params: std::collections::HashMap<String, String> = query
            .split('&')
            .filter_map(|pair| {
                let mut kv = pair.split('=');
                Some((kv.next()?.to_string(), kv.next().unwrap_or("").to_string()))
            })
            .collect();

        let width: u32 = params.get("w").and_then(|v| v.parse().ok()).unwrap_or(1000);
        let saturation: u32 = params
            .get("saturation")
            .and_then(|v| v.parse().ok())
            .unwrap_or(100);
        let contrast: u32 = params
            .get("contrast")
            .and_then(|v| v.parse().ok())
            .unwrap_or(100);
        let theme = match params.get("theme").map(|s| s.as_str()) {
            Some("dark") => RenderTheme::Dark,
            _ => RenderTheme::Light,
        };

        let parts: Vec<String> = path
            .trim_matches('/')
            .split('/')
            .map(|s| s.to_string())
            .collect();
        if parts.len() < 2 {
            responder.respond(
                Response::builder()
                    .status(400)
                    .header("Content-Type", "text/plain")
                    .body(b"Invalid URI format. Expected: /session_id/page_index".to_vec())
                    .unwrap(),
            );
            return;
        }

        let page_index: u16 = match parts[1].parse() {
            Ok(idx) => idx,
            Err(_) => {
                responder.respond(
                    Response::builder()
                        .status(400)
                        .header("Content-Type", "text/plain")
                        .body(format!("Invalid page index: {}", parts[1]).into_bytes())
                        .unwrap(),
                );
                return;
            }
        };

        let Some(service) = ctx.app_handle().try_state::<Arc<PdfRenderService>>() else {
            responder.respond(
                Response::builder()
                    .status(500)
                    .header("Content-Type", "text/plain")
                    .body(b"Render service not available".to_vec())
                    .unwrap(),
            );
            return;
        };
        let service = service.inner().clone();
        let session_id = parts[0].clone();

        tauri::async_runtime::spawn_blocking(move || {
            let result = tauri::async_runtime::block_on(service.get_or_render(
                &session_id,
                page_index,
                width,
                theme,
                saturation,
                contrast,
            ));

            let response = match result {
                Ok(bytes) => Response::builder()
                    .status(200)
                    .header("Content-Type", "image/png")
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", "public, max-age=3600")
                    .body(bytes)
                    .unwrap(),
                Err(err) => Response::builder()
                    .status(500)
                    .header("Content-Type", "text/plain")
                    .body(format!("Failed to render page: {}", err).into_bytes())
                    .unwrap(),
            };

            responder.respond(response);
        });
    })
}
