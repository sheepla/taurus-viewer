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

/** Serialized per-tab view state persisted for tab restore (JSON in SQLite). */
export type TabViewState = {
  position: DocumentPosition;
  zoom: ZoomLevel;
  viewMode: ViewMode;
};

/** Uniform representation of the current reading position (used for tab restore). */
export type DocumentPosition =
  | {
      format: "pdf";
      pageIndex: number;
      scrollOffset: number;
      pageCount: number;
    }
  | { format: "epub"; cfi: string };

/**
 * Minimal, page-scoped position used as a stable bookmark key (PDF keyed on
 * the page index, EPUB on the CFI). Also used as a jump destination for
 * outline entries and search hits; EPUB outline entries navigate by href
 * (as produced by foliate-js `book.toc`), which `view.goTo()` accepts.
 * A subset of `DocumentPosition`.
 */
export type PagePosition =
  | { format: "pdf"; pageIndex: number }
  | { format: "epub"; cfi: string }
  | { format: "epub"; href: string };

/** Zoom level: a numeric scale factor (1.0 = 100%). */
export type ZoomLevel = number;

export type ViewMode = "scroll" | "pages";

export type SearchHit = {
  /** Destination to jump to when the hit is selected. */
  destination: PagePosition;
  /** Text surrounding the match, for display in the results list. */
  snippet: string;
};

export type OutlineNode = {
  title: string;
  destination: PagePosition;
  children: OutlineNode[];
};

export type Unsubscribe = () => void;
