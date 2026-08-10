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
}
