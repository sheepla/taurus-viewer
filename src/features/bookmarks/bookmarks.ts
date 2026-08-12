import type { DocumentPosition, PagePosition } from "../../shared/types";

/**
 * Normalizes a full reading position into a stable, page-scoped bookmark key.
 *
 * PDF positions include a scrollOffset that changes on every scroll, which
 * would break the page-scoped toggle (UNIQUE(file_path, page_position) in the
 * backend). PDF bookmarks therefore key on the page index only; EPUB key on
 * the CFI.
 */
export function makePagePosition(position: DocumentPosition): PagePosition {
  if (position.format === "pdf") {
    return { format: "pdf", pageIndex: position.pageIndex };
  }
  return { format: "epub", cfi: position.cfi };
}

/** Safe parse of a stored `page_position` JSON column. */
export function parseBookmarkPosition(raw: string): PagePosition | null {
  try {
    const value = JSON.parse(raw) as PagePosition;
    if (
      value &&
      typeof value === "object" &&
      (value.format === "pdf" || value.format === "epub")
    ) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** Human-readable label for a bookmark in the sidebar list. */
export function bookmarkLabel(position: PagePosition): string {
  if (position.format === "pdf") {
    return `Page ${position.pageIndex + 1}`;
  }
  return "EPUB Location";
}
