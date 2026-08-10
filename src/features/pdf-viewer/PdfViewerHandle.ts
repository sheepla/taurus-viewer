import { invoke } from "@tauri-apps/api/core";
import type { PdfMetadata } from "../../shared/bindings";
import type {
  DocumentPosition,
  OutlineNode,
  PageTarget,
  ScrollDelta,
  SearchHit,
  Unsubscribe,
  ViewMode,
  ZoomLevel,
} from "../../shared/types";
import type {
  DocumentViewerHandle,
  ViewerCapabilities,
} from "../../shared/viewer-handle";

export class PdfViewerHandle implements DocumentViewerHandle {
  readonly capabilities: ViewerCapabilities = {
    viewModes: ["scroll", "pages"],
    hasOutline: true,
    hasTextSearch: false,
  };

  private sessionId: string | null = null;
  private pageCount = 0;
  private currentPage = 0;
  private zoomLevel = 1.0;
  private viewMode: ViewMode = "scroll";
  private positionListeners: Set<(pos: DocumentPosition) => void> = new Set();
  private readyListeners: Set<() => void> = new Set();

  constructor(private filePath: string) {}

  async init(): Promise<void> {
    try {
      console.log(`Initializing PDF viewer for: ${this.filePath}`);
      const meta = await invoke<PdfMetadata>("pdf_open", {
        filePath: this.filePath,
      });

      console.log(`PDF opened successfully. Session ID: ${meta.session_id}, Pages: ${meta.page_count}`);
      
      this.sessionId = meta.session_id;
      this.pageCount = meta.page_count;

      for (const listener of this.readyListeners) {
        listener();
      }
    } catch (error) {
      console.error("Failed to initialize PDF viewer:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      throw error;
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getPageCount(): number {
    return this.pageCount;
  }

  getZoom(): ZoomLevel {
    return this.zoomLevel;
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  navigate(target: PageTarget | ScrollDelta): void {
    if (target.kind === "page") {
      this.currentPage = Math.max(
        0,
        Math.min(target.index, this.pageCount - 1),
      );
      this.notifyPositionChange();
    }
  }

  setZoom(level: ZoomLevel): void {
    this.zoomLevel = Math.max(0.25, Math.min(level, 4.0));
  }

  setViewMode(mode: ViewMode): void {
    if (this.capabilities.viewModes.includes(mode)) {
      this.viewMode = mode;
    }
  }

  async *search(_query: string): AsyncIterable<SearchHit> {
    // Search to be wired
  }

  async getOutline(): Promise<OutlineNode[]> {
    return [];
  }

  getCurrentPosition(): DocumentPosition {
    return {
      format: "pdf",
      pageIndex: this.currentPage,
      scrollOffset: 0,
    };
  }

  onPositionChange(cb: (pos: DocumentPosition) => void): Unsubscribe {
    this.positionListeners.add(cb);
    return () => this.positionListeners.delete(cb);
  }

  onReady(cb: () => void): Unsubscribe {
    this.readyListeners.add(cb);
    if (this.sessionId) {
      cb();
    }
    return () => this.readyListeners.delete(cb);
  }

  private notifyPositionChange(): void {
    const pos = this.getCurrentPosition();
    for (const listener of this.positionListeners) {
      listener(pos);
    }
  }

  dispose(): void {
    if (this.sessionId) {
      invoke("pdf_close", { sessionId: this.sessionId }).catch(console.error);
      this.sessionId = null;
    }
    this.positionListeners.clear();
    this.readyListeners.clear();
  }
}
