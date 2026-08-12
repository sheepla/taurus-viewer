import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";
import type {
  DocumentPosition,
  TabViewState,
} from "../../shared/types";

export type DocumentFormat = "pdf" | "epub";

export interface Tab {
  id: string;
  filePath: string;
  format: DocumentFormat;
  title: string;
  handle: DocumentViewerHandle | null;
  /** View state to apply once the viewer handle becomes ready (tab restore). */
  restoreState: TabViewState | null;
}

interface ClosedTabRecord {
  file_path: string;
  format: string;
  view_state: string;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (
    filePath: string,
    format: DocumentFormat,
    restoreState?: TabViewState | null,
  ) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string | null) => void;
  activateNext: () => void;
  activatePrev: () => void;
  setHandle: (id: string, handle: DocumentViewerHandle) => void;
  /** Clears the pending restore state after the viewer applied it. */
  setTabRestored: (id: string) => void;
  /** Pops the most recently closed tab from the persistent stack and reopens it. */
  restoreLastClosedTab: () => Promise<void>;
}

let tabCounter = 0;

function generateTabId(): string {
  return `tab-${++tabCounter}`;
}

function formatTitle(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const parts = normalizedPath.split("/");
  return parts[parts.length - 1] ?? filePath;
}

function resolveFormat(filePath: string): DocumentFormat {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext === "epub" ? "epub" : "pdf";
}

function captureViewState(handle: DocumentViewerHandle): TabViewState {
  const position: DocumentPosition = handle.getCurrentPosition();
  const zoom = typeof handle.getZoom === "function" ? handle.getZoom() : 1.0;
  const viewMode = typeof handle.getViewMode === "function" ? handle.getViewMode() : "pages";
  return { position, zoom, viewMode };
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab(filePath, format, restoreState = null) {
    const id = generateTabId();
    const tab: Tab = {
      id,
      filePath,
      format,
      title: formatTitle(filePath),
      handle: null,
      restoreState,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
  },

  closeTab(id) {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    const tab = tabs[index];

    // Capture the view state and push it onto the closed-tab stack before
    // disposing the handle so restore can reopen the tab in the same state.
    if (tab?.handle) {
      const viewState = captureViewState(tab.handle);
      void invoke("tab_push_closed", {
        filePath: tab.filePath,
        format: tab.format,
        viewState: JSON.stringify(viewState),
      }).catch(console.error);
      tab.handle.dispose();
    }

    const next = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;

    if (activeTabId === id) {
      // Prefer the tab to the right, then left.
      const nextTab = next[index] ?? next[index - 1] ?? null;
      nextActive = nextTab?.id ?? null;
    }

    set({ tabs: next, activeTabId: nextActive });
  },

  activateTab(id) {
    set({ activeTabId: id });
  },

  activateNext() {
    const { tabs, activeTabId } = get();
    if (tabs.length === 0) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const next = tabs[(idx + 1) % tabs.length];
    if (next) set({ activeTabId: next.id });
  },

  activatePrev() {
    const { tabs, activeTabId } = get();
    if (tabs.length === 0) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
    if (prev) set({ activeTabId: prev.id });
  },

  setHandle(id, handle) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, handle } : t)),
    }));
  },

  setTabRestored(id) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, restoreState: null } : t)),
    }));
  },

  async restoreLastClosedTab() {
    try {
      const record = await invoke<ClosedTabRecord | null>("tab_pop_closed");
      if (!record) {
        toast.info("No closed tab to restore");
        return;
      }
      let viewState: TabViewState | null = null;
      try {
        viewState = JSON.parse(record.view_state) as TabViewState;
      } catch {
        viewState = null;
      }
      get().openTab(
        record.file_path,
        resolveFormat(record.file_path),
        viewState,
      );
    } catch (error) {
      console.error("Failed to restore closed tab:", error);
    }
  },
}));
