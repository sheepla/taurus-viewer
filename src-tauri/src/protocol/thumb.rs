use std::path::PathBuf;

/// Register the `taurus-thumb://` custom URI scheme protocol.
///
/// URL format: `taurus-thumb://<entry-id>`
///
/// Serves thumbnail PNG files from the cache directory.
pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.register_uri_scheme_protocol("taurus-thumb", |_ctx, request| {
        let uri = request.uri().path();
        let entry_id = uri.trim_matches('/');

        let app_dir = dirs::cache_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("taurus-viewer")
            .join("thumbnails");

        let thumb_file = app_dir.join(format!("{}.png", entry_id));

        if let Ok(bytes) = std::fs::read(&thumb_file) {
            tauri::http::Response::builder()
                .header("Content-Type", "image/png")
                .header("Access-Control-Allow-Origin", "*")
                .body(bytes)
                .unwrap()
        } else {
            tauri::http::Response::builder()
                .status(404)
                .body(b"Thumbnail not found".to_vec())
                .unwrap()
        }
    })
}
