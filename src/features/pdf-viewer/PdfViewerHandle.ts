import { invoke } from "@tauri-apps/api/core";
import type { PdfMetadata, PdfOutlineNode, PdfSearchHit } from "../../shared/bindings";
import { pdfOutlineToNodes } from "../../shared/outline";
import { log } from "../../shared/log";
import {
  OverscrollController,
  OVERSCROLL_PAGES_TUNING,
  OVERSCROLL_SCROLL_TUNING,
  type OverscrollFeedback,
} from "../../shared/overscroll";
import type {
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
} from "../../shared/types";
import type {
  DocumentViewerHandle,
  PanDirection,
  ViewerCapabilities,
} from "../../shared/viewer-handle";

/** Initial vertical step size (px) for the j/k hold-to-pan gesture. */
const PAN_VERTICAL_STEP = 240;
/** Continuous pan speed in px/s while a pan key is held. */
const PAN_VELOCITY = 1200;

export class PdfViewerHandle implements DocumentViewerHandle {
  readonly capabilities: ViewerCapabilities = {
    viewModes: ["scroll", "pages"],
    hasOutline: true,
    hasTextSearch: true,
  };

  private sessionId: string | null = null;
  private pageCount = 0;
  private documentTitle: string | null = null;
  private currentPage = 0;
  private zoomLevel = 1.0;
  private viewMode: ViewMode = "scroll";
  private columns: ColumnCount = 1;
  private scrollContainer: HTMLElement | null = null;
  private scrollTargetResolver: ((pageIndex: number) => number | null) | null = null;
  private pendingScrollPage: number | null = null;
  private pendingScrollOffset: number | null = null;
  private positionListeners: Set<(pos: DocumentPosition) => void> = new Set();
  private readyListeners: Set<() => void> = new Set();
  private zoomListeners: Set<(zoom: number) => void> = new Set();
  private viewModeListeners: Set<(mode: ViewMode) => void> = new Set();
  private columnListeners: Set<(cols: ColumnCount) => void> = new Set();
  private readonly overscroll = new OverscrollController(OVERSCROLL_SCROLL_TUNING);
  /** Last observed scroll position, used to detect a blocked document edge. */
  private lastScrollPos: number | null = null;
  /** Active smooth pan loop (while a pan key is held). */
  private panLoop: { raf: number; last: number; direction: PanDirection } | null =
    null;

  /** Containers that already have their scroll/wheel listeners attached. */
  private static readonly attachedContainers = new WeakSet<HTMLElement>();

  constructor(private filePath: string) {}

  async init(): Promise<void> {
    try {
      const meta = await invoke<PdfMetadata>("pdf_open", {
        filePath: this.filePath,
      });

      this.sessionId = meta.session_id;
      this.pageCount = meta.page_count;
      this.documentTitle = meta.title ?? null;
      log.info(
        `[PdfViewerHandle] opened: ${this.filePath} (${this.pageCount} pages)`,
      );

      for (const listener of this.readyListeners) {
        listener();
      }
    } catch (error) {
      log.warn(`[PdfViewerHandle] Failed to initialize PDF viewer: ${error}`);
      log.warn(`[PdfViewerHandle] Error details: ${JSON.stringify(error, null, 2)}`);
      throw error;
    }
  }

  attachScrollContainer(el: HTMLElement): void {
    if (!PdfViewerHandle.attachedContainers.has(el)) {
      PdfViewerHandle.attachedContainers.add(el);
      el.addEventListener("scroll", () => this.onScroll(), { passive: true });
      el.addEventListener("wheel", (e) => this.handlePdfWheel(e), {
        passive: false,
      });
    }
    this.scrollContainer = el;
  }

  /**
   * Registers a resolver that maps a page index to its absolute scroll offset
   * (in the scroll container's coordinate space). Used by windowed rendering:
   * when the target page is not mounted, the handle scrolls by offset instead
   * of `scrollIntoView`. A pending navigation is resolved as soon as a
   * resolver becomes available (e.g. after page sizes load).
   */
  setScrollTargetResolver(
    cb: ((pageIndex: number) => number | null) | null,
  ): void {
    this.scrollTargetResolver = cb;
    if (cb) {
      if (this.pendingScrollPage !== null) {
        const page = this.pendingScrollPage;
        this.pendingScrollPage = null;
        this.scrollToPage(page);
      }
      if (this.pendingScrollOffset !== null && this.scrollContainer) {
        const offset = this.pendingScrollOffset;
        this.pendingScrollOffset = null;
        this.scrollContainer.scrollTop = offset;
      }
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getTitle(): string | null {
    return this.documentTitle;
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

  startPan(direction: PanDirection): boolean {
    if (this.viewMode !== "scroll") return false;
    if (
      (direction === "left" || direction === "right") &&
      !this.canPanHorizontally()
    ) {
      return false;
    }
    const container = this.scrollContainer;
    if (!container) return false;

    this.stopPan();
    const horizontal = direction === "left" || direction === "right";
    const step = horizontal
      ? Math.max(240, container.clientWidth * 0.75)
      : PAN_VERTICAL_STEP;
    const axis = horizontal ? "left" : "top";
    const sign = direction === "left" || direction === "up" ? -1 : 1;
    container.scrollBy({ [axis]: sign * step, behavior: "auto" });

    const last = performance.now();
    this.panLoop = {
      raf: requestAnimationFrame((now) => this.panFrame(direction, last, now)),
      last,
      direction,
    };
    return true;
  }

  private panFrame(direction: PanDirection, last: number, now: number): void {
    const loop = this.panLoop;
    const container = this.scrollContainer;
    if (!loop || !container) return;
    const dt = Math.min(50, now - last);
    const horizontal = direction === "left" || direction === "right";
    const axis = horizontal ? "left" : "top";
    const sign = direction === "left" || direction === "up" ? -1 : 1;
    container.scrollBy({
      [axis]: (sign * PAN_VELOCITY * dt) / 1000,
      behavior: "auto",
    });
    loop.last = now;
    loop.raf = requestAnimationFrame((t) => this.panFrame(direction, now, t));
  }

  stopPan(): void {
    if (this.panLoop) {
      cancelAnimationFrame(this.panLoop.raf);
      this.panLoop = null;
    }
  }

  navigate(target: PageTarget | ScrollDelta | PageTurn | ScrollEdge): void {
    log.debug(`[PdfViewerHandle] navigate: ${JSON.stringify(target)}`);
    switch (target.kind) {
      case "page":
        this.turnPage(target.index);
        break;
      case "scroll":
        if (this.viewMode === "pages") {
          // PAGES mode: the vertical scroll keys turn pages.
          if (target.deltaY > 0) {
            this.goToPage(this.currentPage + 1);
          } else if (target.deltaY < 0) {
            this.goToPage(this.currentPage - 1);
          }
        } else {
          this.scrollContainer?.scrollBy({ top: target.deltaY, behavior: "auto" });
        }
        break;
      case "edge":
        if (this.viewMode === "pages") {
          this.goToPage(target.edge === "start" ? 0 : this.pageCount - 1);
        } else {
          const container = this.scrollContainer;
          if (container) {
            container.scrollTop =
              target.edge === "start" ? 0 : container.scrollHeight;
          }
          // The scroll event fires before the windowed render mounts the pages
          // near the new position, so its onScroll handler would otherwise
          // report a stale page. Pin the current page directly.
          const edgePage = target.edge === "start" ? 0 : this.pageCount - 1;
          if (edgePage !== this.currentPage) {
            this.currentPage = edgePage;
            this.notifyPositionChange();
          }
        }
        break;
      case "prev":
      case "left":
        if (this.canPanHorizontally()) {
          this.scrollContainer!.scrollBy({
            left: -Math.max(240, this.scrollContainer!.clientWidth * 0.75),
            behavior: "auto",
          });
        } else {
          this.turnPage(this.currentPage - 1);
        }
        break;
      case "next":
      case "right":
        if (this.canPanHorizontally()) {
          this.scrollContainer!.scrollBy({
            left: Math.max(240, this.scrollContainer!.clientWidth * 0.75),
            behavior: "auto",
          });
        } else {
          this.turnPage(this.currentPage + 1);
        }
        break;
    }
  }

  setZoom(level: ZoomLevel): void {
    this.zoomLevel = Math.max(0.25, Math.min(level, 4.0));
    log.info(`[PdfViewerHandle] setZoom: ${this.zoomLevel}`);
    for (const cb of this.zoomListeners) cb(this.zoomLevel);
  }

  setViewMode(mode: ViewMode): void {
    if (this.capabilities.viewModes.includes(mode)) {
      this.viewMode = mode;
      this.lastScrollPos = null;
      this.overscroll.configure(
        mode === "scroll" ? OVERSCROLL_SCROLL_TUNING : OVERSCROLL_PAGES_TUNING,
      );
      log.info(`[PdfViewerHandle] setViewMode: ${mode}`);
      for (const cb of this.viewModeListeners) cb(this.viewMode);
    }
  }

  getColumns(): ColumnCount {
    return this.columns;
  }

  setColumns(cols: ColumnCount): void {
    this.columns = cols;
    log.info(`[PdfViewerHandle] setColumns: ${this.columns}`);
    for (const cb of this.columnListeners) cb(this.columns);
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
    this.setZoom(state.zoom ?? 1.0);
    if (state.columns) {
      this.setColumns(state.columns);
    }
    if (state.viewMode) {
      this.setViewMode(state.viewMode);
    }
    if (state.position.format === "pdf") {
      if (this.viewMode === "pages") {
        this.goToPage(state.position.pageIndex);
      } else {
        this.scrollToPage(state.position.pageIndex);
        if (state.position.scrollOffset > 0) {
          if (this.scrollContainer && this.scrollTargetResolver) {
            this.scrollContainer.scrollTop = state.position.scrollOffset;
          } else {
            this.pendingScrollOffset = state.position.scrollOffset;
          }
        }
      }
    }
  }

  goToPosition(position: PagePosition): void {
    if (position.format === "pdf") {
      this.turnPage(position.pageIndex);
    }
  }

  onPositionChange(cb: (pos: DocumentPosition) => void): Unsubscribe {
    this.positionListeners.add(cb);
    return () => this.positionListeners.delete(cb);
  }

  onZoomChange(cb: (zoom: number) => void): Unsubscribe {
    this.zoomListeners.add(cb);
    return () => this.zoomListeners.delete(cb);
  }

  onViewModeChange(cb: (mode: ViewMode) => void): Unsubscribe {
    this.viewModeListeners.add(cb);
    return () => this.viewModeListeners.delete(cb);
  }

  onColumnsChange(cb: (cols: ColumnCount) => void): Unsubscribe {
    this.columnListeners.add(cb);
    return () => this.columnListeners.delete(cb);
  }

  onOverscrollChange(cb: (feedback: OverscrollFeedback) => void): Unsubscribe {
    return this.overscroll.subscribe(cb);
  }

  onReady(cb: () => void): Unsubscribe {
    this.readyListeners.add(cb);
    if (this.sessionId) {
      cb();
    }
    return () => this.readyListeners.delete(cb);
  }

  /**
   * Whether the scroll container currently overflows horizontally, meaning
   * the left/right keys should pan instead of turning pages.
   */
  private canPanHorizontally(): boolean {
    const container = this.scrollContainer;
    if (!container || this.viewMode !== "scroll") return false;
    return container.scrollWidth > container.clientWidth + 1;
  }

  /** Navigates to a page index, scrolling in SCROLL mode or selecting the
   *  page in PAGES mode. */
  private turnPage(index: number): void {
    if (this.viewMode === "pages") {
      this.goToPage(index);
    } else {
      this.scrollToPage(index);
    }
  }

  /** Updates the current page without scrolling (PAGES-mode navigation). */
  private goToPage(index: number): void {
    if (this.pageCount === 0) return;
    const clamped = Math.max(0, Math.min(index, this.pageCount - 1));
    if (clamped === this.currentPage) return;
    this.currentPage = clamped;
    this.notifyPositionChange();
  }

  private scrollToPage(index: number): void {
    if (this.pageCount === 0) return;
    if (this.viewMode === "pages") {
      this.goToPage(index);
      return;
    }
    const clamped = Math.max(0, Math.min(index, this.pageCount - 1));
    const page = this.scrollContainer?.querySelector<HTMLElement>(
      `[data-page-index="${clamped}"]`,
    );
    if (page) {
      page.scrollIntoView({ behavior: "auto", block: "start" });
    } else {
      const offset = this.scrollTargetResolver?.(clamped) ?? null;
      if (offset !== null && this.scrollContainer) {
        // The resolver reports offsets in the inner content coordinate space,
        // while scrollTop is measured from the container's padding edge.
        const paddingTop =
          Number.parseFloat(getComputedStyle(this.scrollContainer).paddingTop) ||
          0;
        this.scrollContainer.scrollTop = offset + paddingTop;
      } else {
        this.pendingScrollPage = clamped;
      }
    }
    if (clamped !== this.currentPage) {
      this.currentPage = clamped;
      this.notifyPositionChange();
    }
  }

  private handlePdfWheel(e: WheelEvent): void {
    if (e.deltaY === 0) return;
    if (this.overscroll.currentPhase === "cooldown") return;

    if (this.viewMode === "pages") {
      // Fixed layout: the wheel always engages the overscroll page turn.
      e.preventDefault();
      const trigger = this.overscroll.handleWheel(e.deltaY);
      if (trigger === null) return;
      this.goToPage(this.currentPage + (trigger === "next" ? 1 : -1));
      return;
    }

    const container = this.scrollContainer;
    if (!container) return;
    // SCROLL mode: keep native scrolling while the position moves, and hand
    // over to the overscroll gesture only once the wheel is blocked at a
    // document edge.
    if (
      this.lastScrollPos !== null &&
      container.scrollTop === this.lastScrollPos
    ) {
      e.preventDefault();
      const trigger = this.overscroll.handleWheel(e.deltaY);
      if (trigger === null) return;
      this.lastScrollPos = null;
      // At the document edges the page turn clamps, so the gesture only
      // provides visual feedback there.
      this.goToPage(this.currentPage + (trigger === "next" ? 1 : -1));
      return;
    }
    this.lastScrollPos = container.scrollTop;
    if (this.overscroll.currentPhase !== "idle") {
      this.overscroll.reset();
    }
  }

  private onScroll(): void {
    const container = this.scrollContainer;
    if (!container) return;
    const pages = container.querySelectorAll<HTMLElement>("[data-page-index]");
    if (pages.length === 0) return;

    const containerTop = container.getBoundingClientRect().top;
    const viewport = container.clientHeight || 1;
    let best = this.currentPage;
    let bestDistance = Infinity;
    pages.forEach((page) => {
      const index = Number.parseInt(page.dataset.pageIndex ?? "0", 10);
      const distance = Math.abs(page.getBoundingClientRect().top - containerTop);
      // Only trust pages within the current viewport window. Pages far away
      // are leftovers from a windowed render that has not caught up after a
      // large jump; trusting them would report a stale page.
      if (distance < viewport && distance < bestDistance) {
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
    this.stopPan();
    if (this.sessionId) {
      invoke("pdf_close", { sessionId: this.sessionId }).catch(log.error);
      this.sessionId = null;
    }
    log.info(`[PdfViewerHandle] closed: ${this.filePath}`);
    this.scrollContainer = null;
    this.positionListeners.clear();
    this.readyListeners.clear();
    this.overscroll.dispose();
  }
}
