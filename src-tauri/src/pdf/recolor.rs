/// Bitmap recolor applied to rendered pages before encoding.
///
/// `saturation`/`contrast` are 0-100 integers where 100 means no change
/// (requirements 5.5, detailed design 5.2). Dark theme additionally inverts
/// luminance so the page renders on a dark background. A plain invert is not
/// a standalone dark-mode strategy per requirements 5.5.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RenderTheme {
    Light,
    Dark,
}

pub fn apply_recolor(rgba: &mut [u8], theme: RenderTheme, saturation: u32, contrast: u32) {
    let saturation = saturation.clamp(0, 100) as f32 / 100.0;

    let level = (contrast.clamp(0, 100) as f32 - 100.0) * 2.55;
    let contrast_factor = 259.0 * (level + 255.0) / (255.0 * (259.0 - level));

    let invert = theme == RenderTheme::Dark;

    for chunk in rgba.chunks_exact_mut(4) {
        let mut r = chunk[0] as f32;
        let mut g = chunk[1] as f32;
        let mut b = chunk[2] as f32;

        if invert {
            r = 255.0 - r;
            g = 255.0 - g;
            b = 255.0 - b;
        }

        let luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        r = luminance + (r - luminance) * saturation;
        g = luminance + (g - luminance) * saturation;
        b = luminance + (b - luminance) * saturation;

        r = contrast_factor * (r - 128.0) + 128.0;
        g = contrast_factor * (g - 128.0) + 128.0;
        b = contrast_factor * (b - 128.0) + 128.0;

        chunk[0] = r.clamp(0.0, 255.0) as u8;
        chunk[1] = g.clamp(0.0, 255.0) as u8;
        chunk[2] = b.clamp(0.0, 255.0) as u8;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_recolor_leaves_pixels_unchanged() {
        let mut pixels = [0u8, 128, 255, 255, 10, 20, 30, 255];
        let before = pixels;
        apply_recolor(&mut pixels, RenderTheme::Light, 100, 100);
        assert_eq!(pixels, before);
    }

    #[test]
    fn dark_theme_inverts_luminance() {
        let mut pixels = [255u8, 255, 255, 255];
        apply_recolor(&mut pixels, RenderTheme::Dark, 100, 100);
        assert_eq!(pixels[0], 0);
        assert_eq!(pixels[1], 0);
        assert_eq!(pixels[2], 0);
    }
}
