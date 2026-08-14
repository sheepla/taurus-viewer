import type { DocumentPosition, OutlineNode, PagePosition } from "../../shared/types";

export type VisibleOutlineNode = {
  node: OutlineNode;
  depth: number;
};

/** Depth-first flattening of the outline tree into a display list. */
export function flattenOutline(
  nodes: readonly OutlineNode[],
  depth = 0,
): VisibleOutlineNode[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenOutline(node.children, depth + 1),
  ]);
}

function epubHref(destination: PagePosition): string | undefined {
  return destination.format === "epub" && "href" in destination
    ? destination.href
    : undefined;
}

function epubFraction(destination: PagePosition): number | undefined {
  if (destination.format !== "epub") return undefined;
  const fraction = (destination as { fraction?: unknown }).fraction;
  return typeof fraction === "number" ? fraction : undefined;
}

/**
 * Maps a reading position to the flattened outline index that best matches
 * the section the reader is currently in.
 *
 * - PDF: the last outline entry whose page is at or before the current page
 *   (standard "current section" semantics). Returns 0 when the reader is
 *   before the first outline entry.
 * - EPUB: the entry whose href matches the current section (deepest entry
 *   wins). Falls back to the greatest entry fraction at or before the current
 *   progress for TOC-less documents rendered with fallback nodes.
 *
 * Returns `null` when the position cannot be matched and the current selection
 * should be left untouched.
 */
export function findOutlineIndexForPosition(
  visibleNodes: readonly VisibleOutlineNode[],
  position: DocumentPosition,
): number | null {
  if (visibleNodes.length === 0) return null;

  if (position.format === "pdf") {
    let bestIndex = -1;
    let bestPage = -1;
    visibleNodes.forEach(({ node }, index) => {
      const destination = node.destination;
      if (
        destination.format === "pdf" &&
        destination.pageIndex <= position.pageIndex &&
        destination.pageIndex >= bestPage
      ) {
        bestPage = destination.pageIndex;
        bestIndex = index;
      }
    });
    return bestIndex >= 0 ? bestIndex : 0;
  }

  if (position.format !== "epub") return null;

  if (position.href) {
    let bestIndex: number | null = null;
    visibleNodes.forEach(({ node }, index) => {
      if (epubHref(node.destination) === position.href) {
        bestIndex = index;
      }
    });
    if (bestIndex !== null) return bestIndex;
  }

  if (typeof position.fraction === "number") {
    const currentFraction = position.fraction;
    let bestIndex = -1;
    let bestFraction = -1;
    visibleNodes.forEach(({ node }, index) => {
      const fraction = epubFraction(node.destination);
      if (
        fraction !== undefined &&
        fraction <= currentFraction &&
        fraction >= bestFraction
      ) {
        bestFraction = fraction;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) return bestIndex;
  }

  return null;
}
