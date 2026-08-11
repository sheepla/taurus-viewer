import type {
  DocumentPosition,
  OutlineNode,
  PageTarget,
  PageTurn,
  ScrollDelta,
  SearchHit,
  Unsubscribe,
  ViewMode,
  ZoomLevel,
} from "./types";

/**
 * Declares what a specific document format is capable of.
 * The common UI shell inspects this before issuing commands.
 */
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

  navigate(target: PageTarget | ScrollDelta | PageTurn): void;
  setZoom(level: ZoomLevel): void;
  /** Calling with a mode outside capabilities.viewModes is a no-op + warning. */
  setViewMode(mode: ViewMode): void;
  search(query: string): AsyncIterable<SearchHit>;
  getOutline(): Promise<OutlineNode[]>;
  /** Called when tab state is persisted (e.g. on close or app exit). */
  getCurrentPosition(): DocumentPosition;
  /** Current reading progress as a fraction in [0, 1]. */
  getProgress(): number;

  onPositionChange(cb: (pos: DocumentPosition) => void): Unsubscribe;
  onReady(cb: () => void): Unsubscribe;

  dispose(): void;
}
