import type { OverscrollFeedback } from "./overscroll";
import type {
  BookmarkLabel,
  ColumnCount,
  DocumentPosition,
  OutlineNode,
  PagePosition,
  PageTarget,
  PageTurn,
  ScrollDelta,
  ScrollEdge,
  SearchHit,
  TabViewState,
  Unsubscribe,
  ViewMode,
  ZoomLevel,
} from "./types";

/**
 * Declares what a specific document format is capable of.
 * The common UI shell inspects this before issuing commands.
 */
/** Continuous pan direction used while a pan key is held down. */
export type PanDirection = "up" | "down" | "left" | "right";

export interface ViewerCapabilities {
  /** Supported view modes. PDF: ["scroll","pages"], EPUB: ["pages"] */
  viewModes: ViewMode[];
  /** Whether an outline (table of contents) can be extracted. */
  hasOutline: boolean;
  hasTextSearch: boolean;
}

/**
 * The single interface the common UI shell (tabs, status bar, key dispatcher)
 * uses to control any document viewer, regardless of format.
 *
 * PDF implementation: delegates to Tauri Rust commands.
 * EPUB implementation: delegates to a foliate-js instance.
 */
export interface DocumentViewerHandle {
  readonly capabilities: ViewerCapabilities;

  navigate(target: PageTarget | ScrollDelta | PageTurn | ScrollEdge): void;
  /** Starts smooth continuous scrolling while a pan key is held. Returns
   *  `true` if panning began for the given direction, or `false` when the
   *  direction is not scrollable in the current mode (the caller then falls
   *  back to its one-shot action, e.g. a page turn). */
  startPan?(direction: PanDirection): boolean;
  /** Stops the continuous scrolling started by `startPan`. */
  stopPan?(): void;
  setZoom(level: ZoomLevel): void;
  getZoom?(): ZoomLevel;
  /** Calling with a mode outside capabilities.viewModes is a no-op + warning. */
  setViewMode(mode: ViewMode): void;
  getViewMode?(): ViewMode;
  setColumns?(cols: ColumnCount): void;
  getColumns?(): ColumnCount;
  search(query: string): AsyncIterable<SearchHit>;
  /** Removes any search-result highlights currently shown in the document. */
  clearSearch(): void;
  getOutline(): Promise<OutlineNode[]>;
  /** Called when tab state is persisted (e.g. on close or app exit). */
  getCurrentPosition(): DocumentPosition;
  /** Current reading progress as a fraction in [0, 1]. */
  getProgress(): number;
  /** Restores a persisted view state (tab restore / closed-tab reopen). */
  restore(state: TabViewState): void;
  /** Jumps to a page-scoped position (e.g. a bookmark). */
  goToPosition(position: PagePosition): void;

  /** Resolves a stored bookmark position into display parts (section heading
   *  + page number). Optional; the UI falls back to a generic label. */
  getBookmarkLabel?(position: PagePosition): BookmarkLabel | null;

  /** Document title from metadata, or null when unavailable. */
  getTitle?(): string | null;

  onPositionChange(cb: (pos: DocumentPosition) => void): Unsubscribe;
  onZoomChange?(cb: (zoom: number) => void): Unsubscribe;
  onViewModeChange?(cb: (mode: ViewMode) => void): Unsubscribe;
  onColumnsChange?(cb: (cols: ColumnCount) => void): Unsubscribe;
  onOverscrollChange?(cb: (feedback: OverscrollFeedback) => void): Unsubscribe;
  onReady(cb: () => void): Unsubscribe;

  dispose(): void;
}
