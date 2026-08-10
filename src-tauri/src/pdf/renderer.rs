use crate::error::AppError;
use pdfium_render::prelude::*;
use std::io::Cursor;
use std::path::Path;

pub struct PdfRenderer {
    pdfium: Pdfium,
}

impl PdfRenderer {
    pub fn new() -> Result<Self, AppError> {
        let bindings = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./"))
            .or_else(|_| Pdfium::bind_to_system_library())
            .map_err(|e| AppError::Pdf(e.to_string()))?;

        Ok(Self {
            pdfium: Pdfium::new(bindings),
        })
    }

    pub fn render_page_to_png(
        &self,
        file_path: &Path,
        page_index: u16,
        target_width: u32,
    ) -> Result<Vec<u8>, AppError> {
        let document = self
            .pdfium
            .load_pdf_from_file(file_path, None)
            .map_err(|e| AppError::Pdf(e.to_string()))?;

        let page = document
            .pages()
            .get(page_index)
            .map_err(|e| AppError::Pdf(e.to_string()))?;

        let render_config = PdfRenderConfig::new().set_target_width(target_width as i32);

        let bitmap = page
            .render_with_config(&render_config)
            .map_err(|e| AppError::Pdf(e.to_string()))?;

        let image = bitmap.as_image().into_rgba8();

        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);
        image
            .write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| AppError::Pdf(e.to_string()))?;

        Ok(buffer)
    }
}
