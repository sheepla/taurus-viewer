import { invoke } from "@tauri-apps/api/core";
import { View } from "foliate-js/view.js";
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

export class EpubViewerHandle implements DocumentViewerHandle {
  readonly capabilities: ViewerCapabilities = {
    viewModes: ["pages"],
    hasOutline: false,
    hasTextSearch: false,
  };

  private sessionId: string | null = null;
  private view: View;
  private readyListeners: Set<() => void> = new Set();
  private positionListeners: Set<(pos: DocumentPosition) => void> = new Set();

  constructor(private filePath: string) {
    this.view = document.createElement("foliate-view") as View;
    this.view.style.width = "100%";
    this.view.style.height = "100%";
    this.view.style.display = "block";
    this.view.style.flex = "1";
    this.view.style.minHeight = "0";
    this.view.addEventListener("relocate", () => this.onRelocate());
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

  setZoom(_level: ZoomLevel): void {}
  setViewMode(_mode: ViewMode): void {}

  async *search(_query: string): AsyncIterable<SearchHit> {}

  async getOutline(): Promise<OutlineNode[]> {
    return [];
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
