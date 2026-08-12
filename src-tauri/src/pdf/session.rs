use crate::error::AppError;
use crate::pdf::outline::{collect_outline, PdfOutlineNode};
use crate::pdf::recolor::{apply_recolor, RenderTheme};
use crate::pdf::search::{find_matches, PdfSearchHit};
use pdfium_render::prelude::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

// PDFium DLLをバイナリに埋め込み
#[cfg(target_os = "windows")]
static PDFIUM_DLL_BYTES: &[u8] = include_bytes!("../../pdfium.dll");

static RESOLVED_PDFIUM_DLL_PATH: OnceLock<PathBuf> = OnceLock::new();

pub struct PdfSession {
    pub id: String,
    pub file_path: PathBuf,
    pub page_count: usize,
    pub resource_dir: Option<PathBuf>,
}

impl PdfSession {
    pub fn new(
        id: String,
        file_path: PathBuf,
        resource_dir: Option<PathBuf>,
    ) -> Result<Self, AppError> {
        println!("Creating PDF session for file: {:?}", file_path);

        let page_count = Self::get_page_count(&file_path, resource_dir.as_deref())?;

        println!("PDF has {} pages", page_count);

        Ok(Self {
            id,
            file_path,
            page_count,
            resource_dir,
        })
    }

    fn get_page_count(file_path: &Path, resource_dir: Option<&Path>) -> Result<usize, AppError> {
        let pdfium = Self::create_pdfium(resource_dir)?;
        let document = pdfium
            .load_pdf_from_file(file_path, None)
            .map_err(|e| AppError::Pdf(format!("Failed to load PDF: {}", e)))?;

        Ok(document.pages().len() as usize)
    }

    fn ensure_pdfium_dll() -> Result<PathBuf, AppError> {
        #[cfg(target_os = "windows")]
        {
            use std::io::Write;

            let temp_dir = std::env::temp_dir();
            let dll_path = temp_dir.join(format!("pdfium_{}.dll", std::process::id()));

            if dll_path.exists() {
                if let Ok(metadata) = std::fs::metadata(&dll_path) {
                    if metadata.len() == PDFIUM_DLL_BYTES.len() as u64 {
                        return Ok(dll_path);
                    }
                }
            }

            let mut file = std::fs::File::create(&dll_path).map_err(|e| {
                AppError::Pdf(format!("Failed to create temporary PDFium DLL: {}", e))
            })?;

            file.write_all(PDFIUM_DLL_BYTES)
                .map_err(|e| AppError::Pdf(format!("Failed to write PDFium DLL: {}", e)))?;

            Ok(dll_path)
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(AppError::Pdf(
                "PDFium DLL embedding is only supported on Windows".to_string(),
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
            let dll_path = res_dir.join("pdfium.dll");
            if dll_path.exists() {
                RESOLVED_PDFIUM_DLL_PATH.set(dll_path.clone()).ok();
                return Ok(dll_path);
            }
        }

        #[cfg(target_os = "windows")]
        {
            // 2. Use embedded DLL
            if let Ok(dll_path) = Self::ensure_pdfium_dll() {
                if dll_path.exists() {
                    RESOLVED_PDFIUM_DLL_PATH.set(dll_path.clone()).ok();
                    return Ok(dll_path);
                }
            }
        }

        // 3. Try current directory
        let local_path = PathBuf::from("pdfium.dll");
        if local_path.exists() {
            RESOLVED_PDFIUM_DLL_PATH.set(local_path.clone()).ok();
            return Ok(local_path);
        }

        Err(AppError::Pdf(
            "Could not find pdfium.dll in resource directory, temp, or current directory."
                .to_string(),
        ))
    }

    fn create_pdfium(resource_dir: Option<&Path>) -> Result<Pdfium, AppError> {
        // If we have a cached resolved path, try binding directly
        if let Some(path) = RESOLVED_PDFIUM_DLL_PATH.get() {
            if let Ok(bindings) = Pdfium::bind_to_library(path) {
                return Ok(Pdfium::new(bindings));
            }
        }

        let dll_path = Self::resolve_pdfium_path(resource_dir)?;
        match Pdfium::bind_to_library(&dll_path) {
            Ok(bindings) => Ok(Pdfium::new(bindings)),
            Err(e) => {
                // Fallback to system library if library load fails
                match Pdfium::bind_to_system_library() {
                    Ok(bindings) => Ok(Pdfium::new(bindings)),
                    Err(sys_err) => Err(AppError::Pdf(format!(
                        "Failed to bind PDFium library from {:?}: {}; and system library failed: {}",
                        dll_path, e, sys_err
                    ))),
                }
            }
        }
    }

    fn create_session_pdfium(&self) -> Result<Pdfium, AppError> {
        Self::create_pdfium(self.resource_dir.as_deref())
    }

    pub fn get_page_dimensions(&self, page_index: u16) -> Result<(f64, f64), AppError> {
        let pdfium = self.create_session_pdfium()?;
        let document = pdfium
            .load_pdf_from_file(&self.file_path, None)
            .map_err(|e| AppError::Pdf(e.to_string()))?;

        let page = document
            .pages()
            .get(page_index)
            .map_err(|e| AppError::Pdf(e.to_string()))?;

        let width = page.width().value as f64;
        let height = page.height().value as f64;

        Ok((width, height))
    }

    pub fn get_outline(&self) -> Result<Vec<PdfOutlineNode>, AppError> {
        let pdfium = self.create_session_pdfium()?;
        let document = pdfium
            .load_pdf_from_file(&self.file_path, None)
            .map_err(|e| AppError::Pdf(format!("Failed to load PDF: {}", e)))?;

        Ok(collect_outline(&document))
    }

    pub fn search_text(&self, query: &str) -> Result<Vec<PdfSearchHit>, AppError> {
        const MAX_RESULTS: usize = 200;

        let pdfium = self.create_session_pdfium()?;
        let document = pdfium
            .load_pdf_from_file(&self.file_path, None)
            .map_err(|e| AppError::Pdf(format!("Failed to load PDF: {}", e)))?;

        let pages = document.pages();
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

    pub fn render_page_recolored(
        &self,
        page_index: u16,
        target_width: u32,
        theme: RenderTheme,
        saturation: u32,
        contrast: u32,
    ) -> Result<Vec<u8>, AppError> {
        let pdfium = self.create_session_pdfium()?;
        let document = pdfium
            .load_pdf_from_file(&self.file_path, None)
            .map_err(|e| AppError::Pdf(format!("Failed to load document for rendering: {}", e)))?;

        let page = document
            .pages()
            .get(page_index)
            .map_err(|e| AppError::Pdf(format!("Failed to get page {}: {}", page_index, e)))?;

        let render_config = PdfRenderConfig::new().set_target_width(target_width as i32);

        let bitmap = page
            .render_with_config(&render_config)
            .map_err(|e| AppError::Pdf(format!("Failed to render page: {}", e)))?;

        let mut image = bitmap.as_image().into_rgba8();

        apply_recolor(image.as_mut(), theme, saturation, contrast);

        let mut buffer = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut buffer);
        image
            .write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| AppError::Pdf(format!("Failed to encode PNG: {}", e)))?;

        Ok(buffer)
    }
}

pub struct PdfSessionManager {
    sessions: HashMap<String, PdfSession>,
    next_id: u64,
}

impl PdfSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            next_id: 1,
        }
    }

    pub fn open_session(
        &mut self,
        file_path: &Path,
        resource_dir: Option<PathBuf>,
    ) -> Result<&PdfSession, AppError> {
        let id = format!("pdf_session_{}", self.next_id);
        self.next_id += 1;

        let session = PdfSession::new(id.clone(), file_path.to_path_buf(), resource_dir)?;
        self.sessions.insert(id.clone(), session);

        Ok(self.sessions.get(&id).unwrap())
    }

    pub fn get_session(&self, id: &str) -> Option<&PdfSession> {
        self.sessions.get(id)
    }

    pub fn close_session(&mut self, id: &str) {
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
    fn searches_text_case_insensitively() {
        let hits = test_session().search_text("rich").expect("search text");
        assert!(hits.len() >= 3);
        assert!(hits[0].snippet.contains("rich"));

        let missing = test_session().search_text("wisdom").expect("search text");
        assert!(missing.is_empty());
    }
}
