import { invoke } from "@tauri-apps/api/core";
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

interface EpubMetadata {
  session_id: string;
  title: string;
  author: string;
  chapter_count: number;
}

export class EpubViewerHandle implements DocumentViewerHandle {
  readonly capabilities: ViewerCapabilities = {
    viewModes: ["pages"],
    hasOutline: false,
    hasTextSearch: false,
  };

  private sessionId: string | null = null;
  private title = "";
  private author = "";
  private chapterCount = 0;
  private currentChapter = 0;
  private positionListeners: Set<(pos: DocumentPosition) => void> = new Set();
  private readyListeners: Set<() => void> = new Set();

  constructor(private filePath: string) {}

  async init(): Promise<void> {
    try {
      console.log(`Initializing EPUB viewer for: ${this.filePath}`);
      const meta = await invoke<EpubMetadata>("epub_open", {
        filePath: this.filePath,
      });

      console.log(`EPUB opened successfully. Session ID: ${meta.session_id}, Title: ${meta.title}, Chapters: ${meta.chapter_count}`);
      
      this.sessionId = meta.session_id;
      this.title = meta.title;
      this.author = meta.author;
      this.chapterCount = meta.chapter_count;

      for (const listener of this.readyListeners) {
        listener();
      }
    } catch (error) {
      console.error("Failed to initialize EPUB viewer:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      throw error;
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getTitle(): string {
    return this.title;
  }

  getAuthor(): string {
    return this.author;
  }

  getChapterCount(): number {
    return this.chapterCount;
  }

  async getChapterContent(chapterIndex: number): Promise<string> {
    if (!this.sessionId) {
      throw new Error("EPUB session not initialized");
    }

    const content = await invoke<string>("epub_get_chapter_content", {
      sessionId: this.sessionId,
      chapterIndex,
    });

    return content;
  }

  getZoom(): ZoomLevel {
    return 1.0; // EPUB doesn't use zoom
  }

  getViewMode(): ViewMode {
    return "pages";
  }

  navigate(target: PageTarget | ScrollDelta): void {
    if (target.kind === "page") {
      this.currentChapter = Math.max(
        0,
        Math.min(target.index, this.chapterCount - 1),
      );
      this.notifyPositionChange();
    }
  }

  setZoom(_level: ZoomLevel): void {
    // EPUB viewer doesn't support zoom
  }

  setViewMode(_mode: ViewMode): void {
    // EPUB viewer only supports pages mode
  }

  async *search(_query: string): AsyncIterable<SearchHit> {
    // Search to be implemented
  }

  async getOutline(): Promise<OutlineNode[]> {
    return [];
  }

  getCurrentPosition(): DocumentPosition {
    return {
      format: "epub",
      cfi: `chapter-${this.currentChapter}`,
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
      invoke("epub_close", { sessionId: this.sessionId }).catch(console.error);
      this.sessionId = null;
    }
    this.positionListeners.clear();
    this.readyListeners.clear();
  }
}