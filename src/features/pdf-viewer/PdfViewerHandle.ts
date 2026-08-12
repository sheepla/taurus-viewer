import { invoke } from "@tauri-apps/api/core";
import type { PdfMetadata, PdfOutlineNode, PdfSearchHit } from "../../shared/bindings";
import { pdfOutlineToNodes } from "../../shared/outline";
import type {
  DocumentPosition,
  OutlineNode,
  PagePosition,
  PageTarget,
  PageTurn,
  ScrollDelta,
  SearchHit,
  TabViewState,
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
    hasTextSearch: true,
  };

  private sessionId: string | null = null;
  private pageCount = 0;
  private currentPage = 0;
  private zoomLevel = 1.0;
  private viewMode: ViewMode = "scroll";
  private scrollContainer: HTMLElement | null = null;
  private positionListeners: Set<(pos: DocumentPosition) => void> = new Set();
  private readyListeners: Set<() => void> = new Set();

  constructor(private filePath: string) {}

  async init(): Promise<void> {
    try {
      const meta = await invoke<PdfMetadata>("pdf_open", {
        filePath: this.filePath,
      });

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

  attachScrollContainer(el: HTMLElement): void {
    this.scrollContainer = el;
    el.addEventListener("scroll", () => this.onScroll(), { passive: true });
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

  navigate(target: PageTarget | ScrollDelta | PageTurn): void {
    switch (target.kind) {
      case "page":
        this.scrollToPage(target.index);
        break;
      case "scroll":
        this.scrollContainer?.scrollBy({ top: target.deltaY, behavior: "auto" });
        break;
      case "prev":
      case "left":
        this.scrollToPage(this.currentPage - 1);
        break;
      case "next":
      case "right":
        this.scrollToPage(this.currentPage + 1);
        break;
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

  async *search(query: string): AsyncIterable<SearchHit> {
    if (!this.sessionId || !query.trim()) return;
    const hits = await invoke<PdfSearchHit[]>("pdf_search", {
      sessionId: this.sessionId,
      query,
    });
    for (const hit of hits) {
      yield {
        destination: { format: "pdf", pageIndex: hit.page_index },
        snippet: hit.snippet,
      };
    }
  }

  clearSearch(): void {
    // PDF rendering has no highlight overlay; nothing to clear.
  }

  async getOutline(): Promise<OutlineNode[]> {
    if (!this.sessionId) return [];
    const nodes = await invoke<PdfOutlineNode[]>("pdf_get_outline", {
      sessionId: this.sessionId,
    });
    return pdfOutlineToNodes(nodes);
  }

  getCurrentPosition(): DocumentPosition {
    return {
      format: "pdf",
      pageIndex: this.currentPage,
      scrollOffset: this.scrollContainer?.scrollTop ?? 0,
      pageCount: this.pageCount,
    };
  }

  getProgress(): number {
    if (this.pageCount <= 1) return 0;
    return Math.min(1, Math.max(0, this.currentPage / (this.pageCount - 1)));
  }

  restore(state: TabViewState): void {
    this.zoomLevel = state.zoom ?? 1.0;
    if (state.viewMode) {
      this.setViewMode(state.viewMode);
    }
    if (state.position.format === "pdf") {
      this.scrollToPage(state.position.pageIndex);
      if (this.scrollContainer && state.position.scrollOffset > 0) {
        this.scrollContainer.scrollTop = state.position.scrollOffset;
      }
    }
  }

  goToPosition(position: PagePosition): void {
    if (position.format === "pdf") {
      this.scrollToPage(position.pageIndex);
    }
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

  private scrollToPage(index: number): void {
    if (this.pageCount === 0) return;
    const clamped = Math.max(0, Math.min(index, this.pageCount - 1));
    const page = this.scrollContainer?.querySelector<HTMLElement>(
      `[data-page-index="${clamped}"]`,
    );
    if (page) {
      page.scrollIntoView({ behavior: "auto", block: "start" });
    }
    if (clamped !== this.currentPage) {
      this.currentPage = clamped;
      this.notifyPositionChange();
    }
  }

  private onScroll(): void {
    const container = this.scrollContainer;
    if (!container) return;
    const pages = container.querySelectorAll<HTMLElement>("[data-page-index]");
    if (pages.length === 0) return;

    const containerTop = container.getBoundingClientRect().top;
    let best = this.currentPage;
    let bestDistance = Infinity;
    pages.forEach((page, index) => {
      const distance = Math.abs(page.getBoundingClientRect().top - containerTop);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });

    if (best !== this.currentPage) {
      this.currentPage = best;
      this.notifyPositionChange();
    }
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
    this.scrollContainer = null;
    this.positionListeners.clear();
    this.readyListeners.clear();
  }
}
