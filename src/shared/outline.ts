import type { PdfOutlineNode } from "./bindings";
import type { OutlineNode } from "./types";

/** Converts the backend's PDF outline payload into renderer OutlineNodes. */
export function pdfOutlineToNodes(raw: readonly PdfOutlineNode[]): OutlineNode[] {
  return raw.map((node) => ({
    title: node.title,
    destination: { format: "pdf", pageIndex: node.page_index },
    children: pdfOutlineToNodes(node.children),
  }));
}

/** foliate-js `book.toc` entry shape. */
export interface FoliateTocItem {
  label: string;
  href: string | null;
  subitems?: FoliateTocItem[];
}

/** Converts a foliate-js table of contents into renderer OutlineNodes. */
export function epubOutlineToNodes(toc: readonly FoliateTocItem[] | null | undefined): OutlineNode[] {
  if (!toc) return [];
  return toc.map((item) => ({
    title: item.label,
    destination: {
      format: "epub",
      href: item.href ?? "",
    },
    children: epubOutlineToNodes(item.subitems ?? []),
  }));
}
