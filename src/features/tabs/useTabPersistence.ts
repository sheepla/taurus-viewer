import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { log } from "../../shared/log";
import { useTabStore } from "./TabStore";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";
import type { TabViewState } from "../../shared/types";

interface PersistedTab {
  position_index: number;
  file_path: string;
  format: "pdf" | "epub";
  view_state: string;
}

function captureViewState(handle: DocumentViewerHandle): TabViewState {
  const zoom = typeof handle.getZoom === "function" ? handle.getZoom() : 1.0;
  const viewMode = typeof handle.getViewMode === "function" ? handle.getViewMode() : "scroll";
  return { position: handle.getCurrentPosition(), zoom, viewMode };
}

function emptyViewState(format: "pdf" | "epub"): TabViewState {
  return format === "pdf"
    ? {
        position: { format: "pdf", pageIndex: 0, scrollOffset: 0, pageCount: 1 },
        zoom: 1.0,
        viewMode: "scroll",
      }
    : { position: { format: "epub", cfi: "" }, zoom: 1.0, viewMode: "scroll" };
}

function serializeTabs(): PersistedTab[] {
  const { tabs } = useTabStore.getState();
  return tabs.map((tab, index) => ({
    position_index: index,
    file_path: tab.filePath,
    format: tab.format,
    view_state: JSON.stringify(
      tab.handle ? captureViewState(tab.handle) : emptyViewState(tab.format),
    ),
  }));
}

/**
 * Restores persisted document tabs on startup and persists the tab set
 * whenever it changes (debounced all-upsert via `tab_save_sessions`).
 */
export function useTabPersistence(): void {
  useEffect(() => {
    let restored = true;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useTabStore.subscribe(() => {
      if (!restored) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const tabs = serializeTabs();
        log.debug(`[TabPersistence] saving ${tabs.length} tab(s)`);
        void invoke("tab_save_sessions", { tabs }).catch(log.error);
      }, 500);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
