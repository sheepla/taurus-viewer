import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabStore } from "./TabStore";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";
import type { TabViewState } from "../../shared/types";

interface TabSessionRecord {
  position_index: number;
  file_path: string;
  format: "pdf" | "epub";
  view_state: string;
}

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
    let restored = false;

    void (async () => {
      try {
        const sessions = await invoke<TabSessionRecord[]>("tab_load_sessions");
        const openTab = useTabStore.getState().openTab;
        for (const session of sessions) {
          let restoreState: TabViewState | null = null;
          try {
            restoreState = JSON.parse(session.view_state) as TabViewState;
          } catch {
            restoreState = null;
          }
          openTab(session.file_path, session.format, restoreState);
        }
      } catch (error) {
        console.error("Failed to restore tab sessions:", error);
      } finally {
        restored = true;
      }
    })();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useTabStore.subscribe(() => {
      if (!restored) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void invoke("tab_save_sessions", { tabs: serializeTabs() }).catch(
          console.error,
        );
      }, 500);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
