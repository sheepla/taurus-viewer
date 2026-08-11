import { invoke } from "@tauri-apps/api/core";
import { View } from "foliate-js/view.js";
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

  navigate(target: PageTarget | ScrollDelta): void {
    if (target.kind === "page") {
      // Navigation handling
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
      cfi: this.view.lastLocation?.fraction?.toString() ?? "0",
    };
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
