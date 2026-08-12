use crate::pdf::recolor::RenderTheme;
use crate::pdf::render_cache::PdfRenderService;
use tauri::Manager;

/// Register the `taurus-page://` custom URI scheme protocol.
///
/// URL format: `taurus-page://<session-id>/<page-index>?w=<width>&theme=<light|dark>&saturation=<0-100>&contrast=<0-100>`
///
/// This handler is a thin dispatcher: rendering and LRU caching are delegated
/// to `PdfRenderService` (architecture 2.5.2, detailed design ch. 4).
pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.register_uri_scheme_protocol("taurus-page", |ctx, request| {
        let uri = request.uri();
        let path = uri.path();
        let query = uri.query().unwrap_or("");

        let params: std::collections::HashMap<&str, &str> = query
            .split('&')
            .filter_map(|pair| {
                let mut kv = pair.split('=');
                Some((kv.next()?, kv.next().unwrap_or("")))
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
        let theme = match params.get("theme").copied() {
            Some("dark") => RenderTheme::Dark,
            _ => RenderTheme::Light,
        };

        let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
        if parts.len() < 2 {
            return tauri::http::Response::builder()
                .status(400)
                .header("Content-Type", "text/plain")
                .body(b"Invalid URI format. Expected: /session_id/page_index".to_vec())
                .unwrap();
        }

        let session_id = parts[0];
        let page_index: u16 = match parts[1].parse() {
            Ok(idx) => idx,
            Err(_) => {
                return tauri::http::Response::builder()
                    .status(400)
                    .header("Content-Type", "text/plain")
                    .body(format!("Invalid page index: {}", parts[1]).into_bytes())
                    .unwrap()
            }
        };

        let service = ctx.app_handle().try_state::<PdfRenderService>();

        let result = match service {
            Some(service) => tauri::async_runtime::block_on(
                service.get_or_render(session_id, page_index, width, theme, saturation, contrast),
            ),
            None => Err(crate::error::AppError::Pdf(
                "Render service not available".into(),
            )),
        };

        match result {
            Ok(bytes) => tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", "image/png")
                .header("Access-Control-Allow-Origin", "*")
                .header("Cache-Control", "public, max-age=3600")
                .body(bytes)
                .unwrap(),
            Err(err) => tauri::http::Response::builder()
                .status(500)
                .header("Content-Type", "text/plain")
                .body(format!("Failed to render page: {}", err).into_bytes())
                .unwrap(),
        }
    })
}
