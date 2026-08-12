use crate::error::AppError;
use crate::pdf::renderer::PdfRenderer;
use std::path::{Path, PathBuf};

pub struct ThumbnailGenerator {
    cache_dir: PathBuf,
    renderer: PdfRenderer,
}

impl ThumbnailGenerator {
    pub fn new(cache_dir: PathBuf) -> Result<Self, AppError> {
        let renderer = PdfRenderer::new()?;
        Ok(Self {
            cache_dir,
            renderer,
        })
    }

    pub fn generate_pdf_thumbnail(
        &self,
        entry_id: i64,
        pdf_path: &Path,
    ) -> Result<PathBuf, AppError> {
        let png_bytes = self.renderer.render_page_to_png(pdf_path, 0, 300)?;
        let out_path = self.cache_dir.join(format!("{}.png", entry_id));
        std::fs::write(&out_path, png_bytes)?;
        Ok(out_path)
    }

    /// Extracts the EPUB cover image (OPF metadata) and stores it as a PNG
    /// thumbnail (architecture 6.6). Returns `None` when no cover exists.
    pub fn generate_epub_thumbnail(
        &self,
        entry_id: i64,
        epub_path: &Path,
    ) -> Result<Option<PathBuf>, AppError> {
        let mut doc = epub::doc::EpubDoc::new(epub_path)
            .map_err(|e| AppError::Epub(format!("Failed to parse EPUB: {}", e)))?;

        let Some((cover_bytes, _mime)) = doc.get_cover() else {
            return Ok(None);
        };

        let cover = image::load_from_memory(&cover_bytes)
            .map_err(|e| AppError::Epub(format!("Failed to decode cover image: {}", e)))?
            .to_rgba8();

        let out_path = self.cache_dir.join(format!("{}.png", entry_id));
        cover
            .save(&out_path)
            .map_err(|e| AppError::Io(e.to_string()))?;
        Ok(Some(out_path))
    }
}
