import type { DocumentPosition, OutlineNode, PagePosition } from "../../shared/types";

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

function flattenOutlineNodes(nodes: readonly OutlineNode[]): Array<{ title: string; position: any }> {
  return nodes.flatMap((node) => [
    { title: node.title, position: node.destination },
    ...flattenOutlineNodes(node.children),
  ]);
}

/** Human-readable label for a bookmark in the sidebar list. */
export function bookmarkLabel(position: PagePosition, outlineNodes: OutlineNode[] = []): string {
  const flat = flattenOutlineNodes(outlineNodes);
  if (position.format === "pdf") {
    const pageNum = position.pageIndex + 1;
    let bestTitle: string | null = null;
    for (const item of flat) {
      if (item.position && typeof item.position === "object" && "pageIndex" in item.position) {
        if ((item.position as any).pageIndex <= position.pageIndex) {
          bestTitle = item.title;
        }
      }
    }
    return bestTitle ? `Page ${pageNum}: ${bestTitle}` : `Page ${pageNum}`;
  } else {
    let bestTitle: string | null = null;
    for (const item of flat) {
      bestTitle = item.title;
    }
    return bestTitle ? `EPUB: ${bestTitle}` : "EPUB Location";
  }
}
