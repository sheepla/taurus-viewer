/// Bitmap pixel manipulation for dark mode / recolor.
///
/// Takes raw RGBA bytes and applies brightness inversion for dark-mode rendering.
pub fn invert_brightness(rgba: &mut [u8]) {
    for chunk in rgba.chunks_exact_mut(4) {
        chunk[0] = 255 - chunk[0]; // R
        chunk[1] = 255 - chunk[1]; // G
        chunk[2] = 255 - chunk[2]; // B
                                   // chunk[3] is alpha — leave unchanged
    }
}
