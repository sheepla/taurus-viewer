use crate::error::AppError;
use crate::pdf::outline::{collect_outline, PdfOutlineNode};
use crate::pdf::recolor::{apply_recolor, RenderTheme};
use crate::pdf::search::{find_matches, PdfSearchHit, PdfTextRun};
use dashmap::DashMap;
use pdfium_render::prelude::*;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex, OnceLock,
};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PdfHighlightRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

// PDFiumの共有ライブラリをバイナリに埋め込み(Windows/macOS)。
// パスは build.rs が `cargo:rustc-env=PDFIUM_LIB_PATH=...` で渡す、
// ターゲットのOUT_DIR配下にダウンロード済みのファイル。
#[cfg(any(target_os = "windows", target_os = "macos"))]
static PDFIUM_LIB_BYTES: &[u8] = include_bytes!(env!("PDFIUM_LIB_PATH"));

/// プラットフォームごとのPDFium共有ライブラリのファイル名。
const fn pdfium_lib_filename() -> &'static str {
    if cfg!(target_os = "windows") {
        "pdfium.dll"
    } else if cfg!(target_os = "macos") {
        "pdfium.dylib"
    } else {
        "libpdfium.so"
    }
}

static RESOLVED_PDFIUM_DLL_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Process-wide `Pdfium` binding resolved once on first use (detailed design
/// 4.5). `Send`/`Sync` come from the `sync` crate feature. PDFium FFI is NOT
/// thread-safe, so every access to the document is serialized by a mutex.
static PDFIUM: OnceLock<Pdfium> = OnceLock::new();
static PDFIUM_INIT_LOCK: Mutex<()> = Mutex::new(());

pub struct PdfSession {
    pub id: String,
    pub page_count: usize,
    pub title: Option<String>,
    pub document: Mutex<PdfDocument<'static>>,
}

impl PdfSession {
    pub fn new(
        id: String,
        file_path: PathBuf,
        resource_dir: Option<PathBuf>,
    ) -> Result<Self, AppError> {
        println!("Creating PDF session for file: {:?}", file_path);

        let pdfium = Self::get_pdfium(resource_dir.as_deref())?;
        let document = pdfium
            .load_pdf_from_file(&file_path, None)
            .map_err(|e| AppError::Pdf(format!("Failed to load PDF: {}", e)))?;

        let page_count = document.pages().len() as usize;
        let title = document
            .metadata()
            .get(PdfDocumentMetadataTagType::Title)
            .map(|tag| tag.value().to_string());

        println!("PDF has {} pages", page_count);

        Ok(Self {
            id,
            page_count,
            title,
            document: Mutex::new(document),
        })
    }

    fn get_pdfium(resource_dir: Option<&Path>) -> Result<&'static Pdfium, AppError> {
        if let Some(p) = PDFIUM.get() {
            return Ok(p);
        }
        let _guard = PDFIUM_INIT_LOCK.lock().expect("PDFIUM_INIT_LOCK poisoned");
        if let Some(p) = PDFIUM.get() {
            return Ok(p);
        }
        let dll_path = Self::resolve_pdfium_path(resource_dir)?;
        let bindings = Pdfium::bind_to_library(&dll_path)
            .or_else(|_| Pdfium::bind_to_system_library())
            .map_err(|e| AppError::Pdf(format!("Failed to bind PDFium: {}", e)))?;
        let pdfium = Pdfium::new(bindings);
        let _ = PDFIUM.set(pdfium);
        Ok(PDFIUM.get().unwrap())
    }

    fn ensure_pdfium_lib() -> Result<PathBuf, AppError> {
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        {
            use std::io::Write;

            let temp_dir = std::env::temp_dir();
            let lib_path = temp_dir.join(format!(
                "pdfium_{}_{}",
                std::process::id(),
                pdfium_lib_filename()
            ));

            if lib_path.exists() {
                if let Ok(metadata) = std::fs::metadata(&lib_path) {
                    if metadata.len() == PDFIUM_LIB_BYTES.len() as u64 {
                        return Ok(lib_path);
                    }
                }
            }

            let mut file = std::fs::File::create(&lib_path).map_err(|e| {
                AppError::Pdf(format!("Failed to create temporary PDFium library: {}", e))
            })?;

            file.write_all(PDFIUM_LIB_BYTES)
                .map_err(|e| AppError::Pdf(format!("Failed to write PDFium library: {}", e)))?;

            Ok(lib_path)
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            Err(AppError::Pdf(
                "PDFium library embedding is only supported on Windows and macOS".to_string(),
            ))
        }
    }

    fn resolve_pdfium_path(resource_dir: Option<&Path>) -> Result<PathBuf, AppError> {
        if let Some(path) = RESOLVED_PDFIUM_DLL_PATH.get() {
            if path.exists() {
                return Ok(path.clone());
            }
        }

        // 1. Try Tauri resource directory
        if let Some(res_dir) = resource_dir {
            let lib_path = res_dir.join(pdfium_lib_filename());
            if lib_path.exists() {
                RESOLVED_PDFIUM_DLL_PATH.set(lib_path.clone()).ok();
                return Ok(lib_path);
            }
        }

        #[cfg(any(target_os = "windows", target_os = "macos"))]
        {
            // 2. Use embedded library
            if let Ok(lib_path) = Self::ensure_pdfium_lib() {
                if lib_path.exists() {
                    RESOLVED_PDFIUM_DLL_PATH.set(lib_path.clone()).ok();
                    return Ok(lib_path);
                }
            }
        }

        // 3. Try current directory
        let local_path = PathBuf::from(pdfium_lib_filename());
        if local_path.exists() {
            RESOLVED_PDFIUM_DLL_PATH.set(local_path.clone()).ok();
            return Ok(local_path);
        }

        Err(AppError::Pdf(format!(
            "Could not find {} in resource directory, temp, or current directory.",
            pdfium_lib_filename()
        )))
    }

    pub fn get_page_dimensions(&self, page_index: u16) -> Result<(f64, f64), AppError> {
        let doc = self.document.lock().unwrap();
        let page = doc
            .pages()
            .get(page_index)
            .map_err(|e| AppError::Pdf(e.to_string()))?;

        let width = page.width().value as f64;
        let height = page.height().value as f64;

        Ok((width, height))
    }

    pub fn get_page_sizes(&self) -> Result<Vec<(f64, f64)>, AppError> {
        let doc = self.document.lock().unwrap();
        let sizes = doc
            .pages()
            .page_sizes()
            .map_err(|e| AppError::Pdf(e.to_string()))?;
        Ok(sizes
            .into_iter()
            .map(|size| (size.width().value as f64, size.height().value as f64))
            .collect())
    }

    pub fn get_outline(&self) -> Result<Vec<PdfOutlineNode>, AppError> {
        let doc = self.document.lock().unwrap();
        Ok(collect_outline(&doc))
    }

    pub fn search_text(&self, query: &str) -> Result<Vec<PdfSearchHit>, AppError> {
        const MAX_RESULTS: usize = 200;

        let doc = self.document.lock().unwrap();
        let pages = doc.pages();
        let mut hits = Vec::new();

        for page_index in 0..pages.len() {
            if hits.len() >= MAX_RESULTS {
                break;
            }
            let page = pages
                .get(page_index)
                .map_err(|e| AppError::Pdf(e.to_string()))?;
            let text = page.text().map_err(|e| AppError::Pdf(e.to_string()))?.all();

            for snippet in find_matches(&text, query, MAX_RESULTS - hits.len()) {
                hits.push(PdfSearchHit {
                    page_index: page_index as u32,
                    snippet,
                });
            }
        }

        Ok(hits)
    }

    pub fn get_text_layer(&self, page_index: u16) -> Result<Vec<PdfTextRun>, AppError> {
        let doc = self.document.lock().unwrap();
        let page = doc
            .pages()
            .get(page_index)
            .map_err(|e| AppError::Pdf(e.to_string()))?;
        let text = page.text().map_err(|e| AppError::Pdf(e.to_string()))?;
        Ok(text
            .segments()
            .iter()
            .filter_map(|segment| {
                let bounds = segment.bounds();
                let value = segment.text();
                if value.trim().is_empty() {
                    return None;
                }
                Some(PdfTextRun {
                    text: value,
                    x: bounds.left().value as f64,
                    y: bounds.bottom().value as f64,
                    width: bounds.width().value as f64,
                    height: bounds.height().value as f64,
                })
            })
            .collect())
    }

    pub fn get_page_highlights(
        &self,
        page_index: u16,
        query: &str,
    ) -> Result<Vec<PdfHighlightRect>, AppError> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let doc = self.document.lock().unwrap();
        let page = doc
            .pages()
            .get(page_index)
            .map_err(|e| AppError::Pdf(e.to_string()))?;
        let text_page = page.text().map_err(|e| AppError::Pdf(e.to_string()))?;
        let mut rects = Vec::new();
        for segment in text_page.segments().iter() {
            let value = segment.text();
            if find_matches(&value, query, 1).is_empty() {
                continue;
            }
            let bounds = segment.bounds();
            rects.push(PdfHighlightRect {
                x: bounds.left().value as f64,
                y: bounds.bottom().value as f64,
                width: bounds.width().value as f64,
                height: bounds.height().value as f64,
            });
        }
        Ok(rects)
    }

    pub fn render_page_recolored(
        &self,
        page_index: u16,
        target_width: u32,
        theme: RenderTheme,
        saturation: u32,
        contrast: u32,
    ) -> Result<Vec<u8>, AppError> {
        let doc = self.document.lock().unwrap();
        let page = doc
            .pages()
            .get(page_index)
            .map_err(|e| AppError::Pdf(format!("Failed to get page {}: {}", page_index, e)))?;

        let render_config = PdfRenderConfig::new().set_target_width(target_width as i32);

        let bitmap = page
            .render_with_config(&render_config)
            .map_err(|e| AppError::Pdf(format!("Failed to render page: {}", e)))?;

        let mut image = bitmap.as_image().into_rgba8();
        drop(doc);

        apply_recolor(image.as_mut(), theme, saturation, contrast);

        let mut buffer = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut buffer);
        image
            .write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| AppError::Pdf(format!("Failed to encode PNG: {}", e)))?;

        Ok(buffer)
    }
}

/// Renders page 0 of a PDF to a PNG using the shared process-wide `Pdfium`
/// instance (detailed design 4.5). Used for library thumbnails; the file is
/// parsed once per thumbnail and the instance is not registered as a session.
pub fn render_pdf_thumbnail(
    file_path: &Path,
    resource_dir: Option<&Path>,
    target_width: u32,
) -> Result<Vec<u8>, AppError> {
    let pdfium = PdfSession::get_pdfium(resource_dir)?;
    let document = pdfium
        .load_pdf_from_file(file_path, None)
        .map_err(|e| AppError::Pdf(format!("Failed to load PDF: {}", e)))?;

    let page = document
        .pages()
        .get(0)
        .map_err(|e| AppError::Pdf(e.to_string()))?;

    let render_config = PdfRenderConfig::new().set_target_width(target_width as i32);

    let bitmap = page
        .render_with_config(&render_config)
        .map_err(|e| AppError::Pdf(format!("Failed to render page: {}", e)))?;

    let image = bitmap.as_image().into_rgba8();

    let mut buffer = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buffer);
    image
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| AppError::Pdf(format!("Failed to encode PNG: {}", e)))?;

    Ok(buffer)
}

pub struct PdfSessionManager {
    sessions: DashMap<String, Arc<PdfSession>>,
    next_id: AtomicU64,
}

impl PdfSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: DashMap::new(),
            next_id: AtomicU64::new(1),
        }
    }

    pub fn open_session(
        &self,
        file_path: &Path,
        resource_dir: Option<PathBuf>,
    ) -> Result<Arc<PdfSession>, AppError> {
        let id_num = self.next_id.fetch_add(1, Ordering::SeqCst);
        let id = format!("pdf_session_{}", id_num);

        let session = PdfSession::new(id.clone(), file_path.to_path_buf(), resource_dir)?;
        let session_arc = Arc::new(session);
        self.sessions.insert(id.clone(), session_arc.clone());

        Ok(session_arc)
    }

    pub fn get_session(&self, id: &str) -> Option<Arc<PdfSession>> {
        self.sessions.get(id).map(|entry| entry.value().clone())
    }

    pub fn close_session(&self, id: &str) {
        self.sessions.remove(id);
    }
}

impl Default for PdfSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_session() -> PdfSession {
        PdfSession::new(
            "test_session".to_string(),
            PathBuf::from("../testdata/sample-multilingual-text.pdf"),
            None,
        )
        .expect("open testdata PDF")
    }

    #[test]
    fn extracts_outline_from_sample() {
        let outline = test_session().get_outline().expect("get outline");
        assert!(!outline.is_empty());
        assert_eq!(outline[0].title, "English:");
        assert_eq!(outline[0].page_index, 0);
    }

    #[test]
    fn extracts_document_title_metadata() {
        let session = test_session();
        if let Some(title) = session.title.as_deref() {
            assert!(!title.is_empty());
        }
    }

    #[test]
    fn searches_text_case_insensitively() {
        let hits = test_session().search_text("rich").expect("search text");
        assert!(hits.len() >= 3);
        assert!(hits[0].snippet.contains("rich"));

        let missing = test_session().search_text("wisdom").expect("search text");
        assert!(missing.is_empty());
    }

    #[test]
    fn extracts_positioned_text_runs_from_sample() {
        let runs = test_session().get_text_layer(0).expect("get text layer");
        assert!(!runs.is_empty());
        assert!(runs.iter().all(|run| !run.text.trim().is_empty()));
        assert!(runs.iter().all(|run| run.width > 0.0 && run.height > 0.0));
    }
}
