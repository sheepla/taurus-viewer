import { invoke } from "@tauri-apps/api/core";
import { View } from "foliate-js/view.js";
import { epubOutlineToNodes } from "../../shared/outline";
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
    viewModes: ["pages"],
    hasOutline: true,
    hasTextSearch: true,
  };

  private sessionId: string | null = null;
  private view: FoliateView;
  private zoomLevel = 1.0;
  private readyListeners: Set<() => void> = new Set();
  private positionListeners: Set<(pos: DocumentPosition) => void> = new Set();

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
      console.error("Failed to initialize EPUB viewer:", error);
      throw error;
    }
  }

  navigate(target: PageTarget | ScrollDelta | PageTurn): void {
    switch (target.kind) {
      case "page":
        this.view.goTo({ fraction: target.index }).catch(console.error);
        break;
      case "scroll":
        this.view.renderer?.scrollBy?.(0, target.deltaY);
        break;
      case "prev":
        this.view.prev().catch(console.error);
        break;
      case "next":
        this.view.next().catch(console.error);
        break;
      case "left":
        this.view.goLeft().catch(console.error);
        break;
      case "right":
        this.view.goRight().catch(console.error);
        break;
    }
  }

  setZoom(level: ZoomLevel): void {
    this.zoomLevel = Math.max(0.6, Math.min(level, 2.5));
    this.applyReaderStyles();
  }

  getZoom(): ZoomLevel {
    return this.zoomLevel;
  }

  setViewMode(_mode: ViewMode): void {}

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
