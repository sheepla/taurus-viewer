import type { BookmarkLabel, DocumentPosition, OutlineNode, PagePosition } from "../../shared/types";
import type { FoliateTocItem } from "../../shared/outline";
import { epubOutlineToNodes } from "../../shared/outline";

/** foliate-js location unit used for the bookmark "page" number. */
const SIZE_PER_LOCATION = 1500;

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
  }
  // EPUB headings are resolved against the live book via
  // `resolveEpubBookmarkLabel`; this is only a generic fallback.
  return "EPUB Location";
}

/** Book-like subset needed to resolve an EPUB bookmark label. */
export interface EpubBookInfo {
  toc?: FoliateTocItem[] | null;
  sections?: Array<{ id?: string; size?: number; linear?: string }>;
  resolveCFI?: (cfi: string) => { index?: number } | null;
}

/**
 * Resolves a stored EPUB CFI into a display label: the heading of the section
 * containing the position plus the foliate-js location number (a book-wide
 * running position based on section sizes). Returns null when the CFI cannot
 * be resolved.
 */
export function resolveEpubBookmarkLabel(cfi: string, book: EpubBookInfo): BookmarkLabel | null {
  const index = book.resolveCFI?.(cfi)?.index;
  if (typeof index !== "number" || index < 0) return null;

  const sections = book.sections ?? [];
  if (index >= sections.length) return null;
  const section = sections[index];
  const sectionHref = section?.id;
  let heading: string | null = null;
  if (sectionHref) {
    const base = sectionHref.split("#")[0];
    const visit = (nodes: readonly OutlineNode[]): void => {
      for (const node of nodes) {
        const dest = node.destination;
        if (dest.format === "epub" && "href" in dest && dest.href) {
          if (dest.href.split("#")[0] === base) heading = node.title;
        }
        visit(node.children);
      }
    };
    visit(epubOutlineToNodes(book.toc ?? null));
  }

  let sizeBefore = 0;
  for (let i = 0; i < index; i += 1) {
    const size = sections[i]?.size;
    if (sections[i]?.linear !== "no" && typeof size === "number" && Number.isFinite(size) && size > 0) {
      sizeBefore += size;
    }
  }
  const page = `Loc ${Math.floor(sizeBefore / SIZE_PER_LOCATION)}`;

  return { heading, page };
}
