import { invoke } from "@tauri-apps/api/core";
import { View } from "foliate-js/view.js";
import { epubOutlineToNodes } from "../../shared/outline";
import { resolveEpubTitle } from "../../shared/epubTitle";
import { info, debug, warn } from "@tauri-apps/plugin-log";
import type {
  BookmarkLabel,
  ColumnCount,
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
import {
  resolveEpubBookmarkLabel,
  type EpubBookInfo,
} from "../bookmarks/bookmarks";
import {
  OverscrollController,
  OVERSCROLL_PAGES_TUNING,
  OVERSCROLL_SCROLL_TUNING,
  shouldEngageScrolledOverscroll,
  type OverscrollDirection,
  type OverscrollFeedback,
} from "../../shared/overscroll";
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
  getContents?: () => Array<{ index?: number; doc?: Document }>;
  scrollBy?: (dx: number, dy: number) => void;
  setStyles?: (styles: string | [string, string]) => void;
  atStart?: boolean;
  atEnd?: boolean;
  scrolled?: boolean;
  containerPosition?: number;
  viewSize?: number;
  size?: number;
  nextSection?: () => Promise<void>;
  prevSection?: () => Promise<void>;
};

type FoliateView = View & {
  renderer?: FoliateRenderer;
};

const FORWARDED_KEY_ATTRIBUTE = "data-taurus-key-forwarding";
const FORWARDED_WHEEL_ATTRIBUTE = "data-taurus-wheel-forwarding";
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
  private columns: ColumnCount = 1;
  private viewMode: ViewMode = "pages";
  private readyListeners: Set<() => void> = new Set();
  private positionListeners: Set<(pos: DocumentPosition) => void> = new Set();
  private zoomListeners: Set<(zoom: number) => void> = new Set();
  private viewModeListeners: Set<(mode: ViewMode) => void> = new Set();
  private columnListeners: Set<(cols: ColumnCount) => void> = new Set();
  private readonly overscroll = new OverscrollController();

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
      if (detail?.doc) {
        this.forwardContentKeys(detail.doc);
        this.forwardContentWheel(detail.doc);
      }
      this.applyViewMode();
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
      this.applyViewMode();
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
    console.log(`[EpubViewerHandle] NAVIGATE CALLED: ${JSON.stringify(target)}`);
    const renderer = this.view.renderer;
    const scrolled = renderer !== undefined && renderer.scrolled === true;
    switch (target.kind) {
      case "page":
        this.view.goTo({ fraction: target.index }).catch((err) => warn(`[EpubViewerHandle] goTo failed: ${err}`));
        break;
      case "scroll":
        if (scrolled && renderer.containerPosition !== undefined) {
          // A section is one long page: scroll it directly. Native clamping
          // stops at the section edges. When the key pushes toward an edge,
          // hand the input over to the overscroll gesture to turn the section.
          const direction: OverscrollDirection = target.deltaY > 0 ? "next" : "prev";
          if (this.isAtSectionEdge(direction)) {
            this.turnViaOverscroll(direction);
          } else {
            renderer.containerPosition += target.deltaY;
          }
        } else if (target.deltaY > 0) {
          // PAGES mode: the vertical scroll keys turn pages.
          this.view.next().catch((err) => warn(`[EpubViewerHandle] next failed: ${err}`));
        } else if (target.deltaY < 0) {
          this.view.prev().catch((err) => warn(`[EpubViewerHandle] prev failed: ${err}`));
        }
        break;
      case "prev":
        if (scrolled) {
          if (renderer.prevSection) {
            renderer.prevSection().catch((err) => warn(`[EpubViewerHandle] prevSection failed: ${err}`));
          }
        } else {
          this.view.prev().catch((err) => warn(`[EpubViewerHandle] prev failed: ${err}`));
        }
        break;
      case "next":
        if (scrolled) {
          if (renderer.nextSection) {
            renderer.nextSection().catch((err) => warn(`[EpubViewerHandle] nextSection failed: ${err}`));
          }
        } else {
          this.view.next().catch((err) => warn(`[EpubViewerHandle] next failed: ${err}`));
        }
        break;
      case "left":
        if (scrolled) {
          // Mirrors goLeft(): prev for LTR, next for RTL.
          const rtl = (this.view.book as { dir?: string } | undefined)?.dir === "rtl";
          if (rtl && renderer.nextSection) {
            renderer.nextSection().catch((err) => warn(`[EpubViewerHandle] section turn failed: ${err}`));
          } else if (!rtl && renderer.prevSection) {
            renderer.prevSection().catch((err) => warn(`[EpubViewerHandle] section turn failed: ${err}`));
          }
        } else {
          this.view.goLeft().catch((err) => warn(`[EpubViewerHandle] goLeft failed: ${err}`));
        }
        break;
      case "right":
        if (scrolled) {
          // Mirrors goRight(): next for LTR, prev for RTL.
          const rtl = (this.view.book as { dir?: string } | undefined)?.dir === "rtl";
          if (rtl && renderer.prevSection) {
            renderer.prevSection().catch((err) => warn(`[EpubViewerHandle] section turn failed: ${err}`));
          } else if (!rtl && renderer.nextSection) {
            renderer.nextSection().catch((err) => warn(`[EpubViewerHandle] section turn failed: ${err}`));
          }
        } else {
          this.view.goRight().catch((err) => warn(`[EpubViewerHandle] goRight failed: ${err}`));
        }
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
      this.applyViewMode();
      info(`[EpubViewerHandle] setViewMode: ${mode}`);
      for (const cb of this.viewModeListeners) cb(this.viewMode);
    }
  }

  /**
   * Switches the foliate layout. The paginator reads its own `flow` attribute,
   * so it must be set on the renderer, not on the foliate-view element.
   * Keeps the overscroll gesture tuning in sync with the actual flow.
   */
  private applyViewMode(): void {
    const renderer = this.view.renderer;
    if (!renderer) return;
    renderer.setAttribute(
      "flow",
      this.viewMode === "scroll" ? "scrolled" : "paginated",
    );
    this.overscroll.configure(
      this.viewMode === "scroll" ? OVERSCROLL_SCROLL_TUNING : OVERSCROLL_PAGES_TUNING,
    );
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  getColumns(): ColumnCount {
    return this.columns;
  }

  setColumns(cols: ColumnCount): void {
    this.columns = cols;
    const paginator = this.view.renderer;
    if (paginator) {
      paginator.setAttribute("max-column-count", this.columns.toString());
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

  getTitle(): string | null {
    const book = this.view.book as { metadata?: { title?: unknown } } | undefined;
    return resolveEpubTitle(book?.metadata?.title);
  }

  getCurrentPosition(): DocumentPosition {
    const location = this.view.lastLocation;
    return {
      format: "epub",
      cfi: location?.cfi ?? "epubcfi(/0)",
      href: location?.tocItem?.href ?? undefined,
      fraction: location?.fraction,
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
    if (state.columns) {
      this.setColumns(state.columns);
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

  getBookmarkLabel(position: PagePosition): BookmarkLabel | null {
    if (position.format !== "epub" || !("cfi" in position)) return null;
    return resolveEpubBookmarkLabel(
      position.cfi,
      this.view.book as EpubBookInfo,
    );
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
    // The wheel listener is attached to both the content document and the
    // host element; the same event retargets across the shadow boundary, so
    // only process it once.
    const event = e as WheelEvent & { __overscrollHandled?: boolean };
    if (event.__overscrollHandled) return;
    event.__overscrollHandled = true;

    if (this.overscroll.currentPhase === "cooldown") {
      debug(`[EpubOverscroll] cooldown, ignoring deltaY=${e.deltaY}`);
      return;
    }
    const renderer = this.view.renderer;
    if (!renderer || e.deltaY === 0) return;

    const scrolled = renderer.scrolled === true;
    if (scrolled) {
      // A section is one long page: keep native scrolling while the wheel is
      // inside the section, and hand over to the overscroll gesture only once
      // the wheel reaches the section edge.
      const direction: OverscrollDirection = e.deltaY > 0 ? "next" : "prev";
      if (!this.isAtSectionEdge(direction)) {
        if (this.overscroll.currentPhase !== "idle") {
          this.overscroll.reset();
          debug("[EpubOverscroll] scroll resumed, reset");
        }
        return;
      }
      debug(`[EpubOverscroll] at section edge, deltaY=${e.deltaY}`);
    }

    // PAGES mode always overscrolls; SCROLL mode overscrolls at the section
    // edges. In both cases foliate's next()/prev() naturally stop at the
    // document boundaries.
    e.preventDefault();
    const trigger = this.overscroll.handleWheel(e.deltaY);
    if (trigger === null) return;
    this.turn(trigger);
  }

  private turn(direction: OverscrollDirection): void {
    if (direction === "next") {
      this.view.next().catch((err) => warn(`[EpubOverscroll] next() failed: ${err}`));
    } else {
      this.view.prev().catch((err) => warn(`[EpubOverscroll] prev() failed: ${err}`));
    }
  }

  private turnViaOverscroll(direction: OverscrollDirection): void {
    const delta = direction === "next" ? this.overscroll.threshold : -this.overscroll.threshold;
    const trigger = this.overscroll.handleWheel(delta);
    if (trigger === null) return;
    this.turn(trigger);
  }

  private isAtSectionEdge(direction: OverscrollDirection): boolean {
    const renderer = this.view.renderer;
    if (!renderer || renderer.scrolled !== true) return false;
    const start = Math.abs(renderer.containerPosition ?? NaN);
    const viewSize = renderer.viewSize ?? NaN;
    const size = renderer.size ?? NaN;
    return shouldEngageScrolledOverscroll(start, viewSize, size, direction);
  }

  onOverscrollChange(cb: (feedback: OverscrollFeedback) => void): Unsubscribe {
    return this.overscroll.subscribe(cb);
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
      if (content.doc) {
        this.forwardContentKeys(content.doc);
        this.forwardContentWheel(content.doc);
      }
    }
  }

  private forwardContentWheel(doc: Document): void {
    const root = doc.documentElement;
    if (root.getAttribute(FORWARDED_WHEEL_ATTRIBUTE) === "true") return;
    root.setAttribute(FORWARDED_WHEEL_ATTRIBUTE, "true");
    doc.addEventListener(
      "wheel",
      (event) => this.handleEpubWheel(event as WheelEvent),
      { passive: false },
    );
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
    this.overscroll.dispose();
  }
}
