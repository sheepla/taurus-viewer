/**
 * Spread-fit rule for the PDF scroll layout.
 *
 * At zoom <= 1 the spread is capped so it never overflows the viewport
 * horizontally. Zooming beyond 1 grows the spread freely, which enables
 * horizontal panning and the scrollbar.
 */
export function fitSpreadScale(
  zoom: number,
  spreadWidth: number,
  availableWidth: number,
): number {
  if (zoom > 1) return zoom;
  const fit = Math.min(1, availableWidth / spreadWidth);
  return zoom * fit;
}