import { invoke } from "@tauri-apps/api/core";
import { View } from "foliate-js/view.js";
import { epubOutlineToNodes } from "../../shared/outline";
import { info, debug, warn } from "@tauri-apps/plugin-log";
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

if (!customElements.get("foliate-view")) {
  customElements.define("foliate-view", View);
}

interface EpubMetadata {
  session_id: string;
}

interface EpubTocEntry {
  label: string;
  href: string | null;
  subitems?: EpubTocEntry[];
}

type FoliateRenderer = HTMLElement & {
  getContents?: () => Array<{ doc?: Document }>;
  scrollBy?: (dx: number, dy: number) => void;
  setStyles?: (styles: string | [string, string]) => void;
};

type FoliateView = View & {
  renderer?: FoliateRenderer;
};

const FORWARDED_KEY_ATTRIBUTE = "data-taurus-key-forwarding";
const APP_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "PageDown",
  "PageUp",
  " ",
  "+",
  "-",
  "=",
  "/",
  "?",
  "B",
  "D",
  "N",
  "Tab",
  "b",
  "d",
  "f",
  "h",
  "j",
  "k",
  "l",
  "m",
  "n",
  "t",
  "u",
  "v",
  "~",
]);

export class EpubViewerHandle implements DocumentViewerHandle {
  readonly capabilities: ViewerCapabilities = {
    viewModes: ["scroll", "pages"],
    hasOutline: true,
    hasTextSearch: true,
  };

  private sessionId: string | null = null;
  private view: FoliateView;
  private zoomLevel = 1.0;
  private columns = 1;
  private viewMode: ViewMode = "pages";
  private readyListeners: Set<() => void> = new Set();
  private positionListeners: Set<(pos: DocumentPosition) => void> = new Set();
  private zoomListeners: Set<(zoom: number) => void> = new Set();
  private viewModeListeners: Set<(mode: ViewMode) => void> = new Set();
  private columnListeners: Set<(cols: number) => void> = new Set();
  private overscrollState: { phase: "idle" | "pulling" | "cooldown"; accumulatedDelta: number } = {
    phase: "idle",
    accumulatedDelta: 0,
  };
  private resetTimer: number | null = null;
  private cooldownTimer: number | null = null;

  constructor(private filePath: string) {
    this.view = document.createElement("foliate-view") as FoliateView;
    this.view.style.width = "100%";
    this.view.style.height = "100%";
    this.view.style.display = "block";
    this.view.style.flex = "1";
    this.view.style.minHeight = "0";
    this.view.addEventListener("relocate", () => this.onRelocate());
    this.view.addEventListener("load", (event) => {
      const detail = (event as CustomEvent<{ doc?: Document }>).detail;
      if (detail?.doc) this.forwardContentKeys(detail.doc);
      this.applyReaderStyles();
    });
    this.view.addEventListener("wheel", (e) => this.handleEpubWheel(e as WheelEvent), { passive: false });
  }

  getViewElement(): View {
    return this.view;
  }

  async init(file: File): Promise<void> {
    try {
      const meta = await invoke<EpubMetadata>("epub_open", {
        filePath: this.filePath,
      });
      this.sessionId = meta.session_id;

      await this.view.open(file);
      await this.view.init({ showTextStart: true });
      this.applyReaderStyles();
      this.bindLoadedContent();

      for (const cb of this.readyListeners) {
        cb();
      }
    } catch (error) {
      warn(`[EpubViewerHandle] Failed to initialize EPUB viewer: ${error}`);
      throw error;
    }
  }

  navigate(target: PageTarget | ScrollDelta | PageTurn): void {
    debug(`[EpubViewerHandle] navigate: ${JSON.stringify(target)}`);
    switch (target.kind) {
      case "page":
        this.view.goTo({ fraction: target.index }).catch((err) => warn(`[EpubViewerHandle] goTo failed: ${err}`));
        break;
      case "scroll":
        this.view.renderer?.scrollBy?.(0, target.deltaY);
        break;
      case "prev":
        this.view.prev().catch((err) => warn(`[EpubViewerHandle] prev failed: ${err}`));
        break;
      case "next":
        this.view.next().catch((err) => warn(`[EpubViewerHandle] next failed: ${err}`));
        break;
      case "left":
        this.view.goLeft().catch((err) => warn(`[EpubViewerHandle] goLeft failed: ${err}`));
        break;
      case "right":
        this.view.goRight().catch((err) => warn(`[EpubViewerHandle] goRight failed: ${err}`));
        break;
    }
  }

  setZoom(level: ZoomLevel): void {
    this.zoomLevel = Math.max(0.6, Math.min(level, 2.5));
    info(`[EpubViewerHandle] setZoom: ${this.zoomLevel}`);
    this.applyReaderStyles();
    for (const cb of this.zoomListeners) cb(this.zoomLevel);
  }

  getZoom(): ZoomLevel {
    return this.zoomLevel;
  }

  setViewMode(mode: ViewMode): void {
    if (this.capabilities.viewModes.includes(mode)) {
      this.viewMode = mode;
      this.view.setAttribute("flow", mode === "scroll" ? "scrolled" : "paginated");
      info(`[EpubViewerHandle] setViewMode: ${mode}`);
      for (const cb of this.viewModeListeners) cb(this.viewMode);
    }
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  getColumns(): number {
    return this.columns;
  }

  setColumns(cols: number): void {
    this.columns = Math.max(1, Math.min(2, cols));
    const paginator = this.view.renderer;
    if (paginator) {
      // Set max-column-count attributes to force the desired column count
      paginator.setAttribute("max-column-count", this.columns.toString());
      paginator.setAttribute("max-column-count-portrait", this.columns.toString());
      paginator.setAttribute("max-column-count-spread", this.columns.toString());
    }
    info(`[EpubViewerHandle] setColumns: ${this.columns}`);
    for (const cb of this.columnListeners) cb(this.columns);
  }

  async *search(query: string): AsyncIterable<SearchHit> {
    if (!query.trim()) return;
    for await (const result of this.view.search({ query, index: undefined })) {
      if (typeof result === "string") break;
      if ("subitems" in result) {
        for (const item of result.subitems) {
          yield {
            destination: { format: "epub", cfi: item.cfi },
            snippet: item.excerpt ?? "",
          };
        }
      }
    }
  }

  clearSearch(): void {
    this.view.clearSearch();
  }

  async getOutline(): Promise<OutlineNode[]> {
    const book = this.view.book as { toc?: EpubTocEntry[] } | undefined;
    return epubOutlineToNodes(book?.toc);
  }

  getCurrentPosition(): DocumentPosition {
    return {
      format: "epub",
      cfi: this.view.lastLocation?.cfi ?? "epubcfi(/0)",
    };
  }

  getProgress(): number {
    const fraction = this.view.lastLocation?.fraction;
    if (typeof fraction !== "number" || Number.isNaN(fraction)) return 0;
    return Math.min(1, Math.max(0, fraction));
  }

  restore(state: TabViewState): void {
    if (state.zoom) {
      this.setZoom(state.zoom);
    }
    if (state.position.format === "epub" && "cfi" in state.position) {
      this.view.goTo({ cfi: state.position.cfi }).catch(console.error);
    }
  }

  goToPosition(position: PagePosition): void {
    if (position.format !== "epub") return;
    const target =
      "cfi" in position
        ? position.cfi
        : position.href
          ? position.href
          : undefined;
    if (target) this.view.goTo(target).catch(console.error);
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

  onColumnsChange(cb: (cols: number) => void): Unsubscribe {
    this.columnListeners.add(cb);
    return () => this.columnListeners.delete(cb);
  }

  onReady(cb: () => void): Unsubscribe {
    this.readyListeners.add(cb);
    if (this.sessionId) cb();
    return () => this.readyListeners.delete(cb);
  }

  private onRelocate(): void {
    const pos = this.getCurrentPosition();
    for (const listener of this.positionListeners) {
      listener(pos);
    }
  }

  private handleEpubWheel(e: WheelEvent): void {
    if (this.overscrollState.phase === "cooldown") return;
    const renderer = this.view.renderer as any;
    if (!renderer) return;

    // Find the actual scrollable element inside the paginator's shadow DOM
    let el: HTMLElement | null = null;
    if (renderer.shadowRoot) {
      // In SCROLL mode, the container has overflow:auto and is the scrollable element
      // In PAGES mode, the container has overflow:hidden and pages are scrolled via scrollBy
      el = renderer.shadowRoot.querySelector('#container') as HTMLElement;
    }
    if (!el) {
      // Fallback: try to find any scrollable element in the view's shadow DOM
      if (this.view.shadowRoot) {
        el = this.view.shadowRoot.querySelector('foliate-paginator')?.shadowRoot?.querySelector('#container') as HTMLElement;
      }
    }
    if (!el) {
      el = this.view;
    }

    const scrollTop = el.scrollTop ?? 0;
    const scrollHeight = el.scrollHeight ?? 0;
    const clientHeight = el.clientHeight ?? 0;

    // Use paginator's internal atStart/atEnd which check both adjacent sections and page position
    const isAtBottom = typeof renderer.atEnd === "function" ? renderer.atEnd : 
      (typeof renderer.atBottom === "function" ? renderer.atBottom() : (scrollTop + clientHeight >= scrollHeight - 15));
    const isAtTop = typeof renderer.atStart === "function" ? renderer.atStart : 
      (typeof renderer.atTop === "function" ? renderer.atTop() : (scrollTop <= 15));

    debug(`[EpubOverscroll] deltaY=${e.deltaY}, scrollTop=${scrollTop}, clientHeight=${clientHeight}, scrollHeight=${scrollHeight}, isAtTop=${isAtTop}, isAtBottom=${isAtBottom}, viewMode=${this.viewMode}`);

    if ((e.deltaY > 0 && isAtBottom) || (e.deltaY < 0 && isAtTop)) {
      e.preventDefault();
      if (this.overscrollState.phase === "idle") {
        this.overscrollState.phase = "pulling";
        this.overscrollState.accumulatedDelta = 0;
      }
      this.overscrollState.accumulatedDelta += e.deltaY;

      if (this.resetTimer) window.clearTimeout(this.resetTimer);
      this.resetTimer = window.setTimeout(() => {
        this.overscrollState = { phase: "idle", accumulatedDelta: 0 };
      }, 300);

      if (Math.abs(this.overscrollState.accumulatedDelta) >= 100) {
        const direction = this.overscrollState.accumulatedDelta > 0 ? "next" : "prev";
        this.overscrollState = { phase: "cooldown", accumulatedDelta: 0 };
        info(`[EpubOverscroll] Triggering ${direction} page turn via overscroll`);
        if (direction === "next") {
          this.view.next().catch((err) => warn(`[EpubOverscroll] next() failed: ${err}`));
        } else {
          this.view.prev().catch((err) => warn(`[EpubOverscroll] prev() failed: ${err}`));
        }
        if (this.cooldownTimer) window.clearTimeout(this.cooldownTimer);
        this.cooldownTimer = window.setTimeout(() => {
          this.overscrollState.phase = "idle";
        }, 400);
      }
    } else {
      this.overscrollState = { phase: "idle", accumulatedDelta: 0 };
    }
  }

  private applyReaderStyles(): void {
    const fontSize = `${Math.round(this.zoomLevel * 100)}%`;
    this.view.renderer?.setStyles?.(`
      html {
        font-size: ${fontSize} !important;
      }
      body {
        line-height: 1.65 !important;
      }
    `);
  }

  private bindLoadedContent(): void {
    for (const content of this.view.renderer?.getContents?.() ?? []) {
      if (content.doc) this.forwardContentKeys(content.doc);
    }
  }

  private forwardContentKeys(doc: Document): void {
    const root = doc.documentElement;
    if (root.getAttribute(FORWARDED_KEY_ATTRIBUTE) === "true") return;
    root.setAttribute(FORWARDED_KEY_ATTRIBUTE, "true");
    doc.addEventListener(
      "keydown",
      (event) => {
        if (!APP_KEYS.has(event.key) && !event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: event.key,
            code: event.code,
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      true,
    );
  }

  dispose(): void {
    try {
      if (this.view && typeof this.view.close === "function") {
        this.view.close();
      }
    } catch (err) {
      console.warn("Error during view close:", err);
    }
    if (this.sessionId) {
      invoke("epub_close", { sessionId: this.sessionId }).catch(console.error);
      this.sessionId = null;
    }
    this.positionListeners.clear();
    this.readyListeners.clear();
  }
}
