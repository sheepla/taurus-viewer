/**
 * Common position/navigation types shared across PDF and EPUB viewer handles.
 */

/** Jump to a specific page (0-indexed) or scroll by a delta amount. */
export type PageTarget = { kind: "page"; index: number };
export type ScrollDelta = { kind: "scroll"; deltaY: number };
/** Page turn commands understood by every viewer format. */
export type PageTurn =
  | { kind: "prev" }
  | { kind: "next" }
  /** Move toward the previous/next page in the visual (left-to-right) direction.
   *  For RTL EPUB books "left" is forward in reading order. */
  | { kind: "left" }
  | { kind: "right" };

/** Uniform representation of the current reading position (used for tab restore). */
export type DocumentPosition =
  | {
      format: "pdf";
      pageIndex: number;
      scrollOffset: number;
      pageCount: number;
    }
  | { format: "epub"; cfi: string };

/** Zoom level: a numeric scale factor (1.0 = 100%). */
export type ZoomLevel = number;

export type ViewMode = "scroll" | "pages";

export type SearchHit = {
  pageIndex: number;
  /** Character offset within the page text. */
  charOffset: number;
  snippet: string;
};

export type OutlineNode = {
  title: string;
  destination: PageTarget;
  children: OutlineNode[];
};

export type Unsubscribe = () => void;
