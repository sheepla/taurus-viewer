import { create } from "zustand";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";

export type DocumentFormat = "pdf" | "epub";

export interface Tab {
  id: string;
  filePath: string;
  format: DocumentFormat;
  title: string;
  handle: DocumentViewerHandle | null;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (filePath: string, format: DocumentFormat) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string | null) => void;
  activateNext: () => void;
  activatePrev: () => void;
  setHandle: (id: string, handle: DocumentViewerHandle) => void;
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

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab(filePath, format) {
    const id = generateTabId();
    const tab: Tab = {
      id,
      filePath,
      format,
      title: formatTitle(filePath),
      handle: null,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
  },

  closeTab(id) {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    // Dispose handle before removing.
    tabs[index]?.handle?.dispose();

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
}));
