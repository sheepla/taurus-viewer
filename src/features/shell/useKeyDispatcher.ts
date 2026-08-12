import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCommandModeStore } from "../command-mode/commandModeStore";
import { useCommandPaletteStore } from "../command-mode/CommandPalette";
import { useTabStore } from "../tabs/TabStore";
import { useUiModeStore } from "./uiModeStore";
import { makePagePosition } from "../bookmarks/bookmarks";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";
import type { PageTurn, ViewMode } from "../../shared/types";
import { useHelpModalStore } from "../../components/HelpModal";

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function resolveFormat(filePath: string): "pdf" | "epub" {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext === "epub" ? "epub" : "pdf";
}

function getActiveHandle(): DocumentViewerHandle | null {
  const state = useTabStore.getState();
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  return tab?.handle ?? null;
}

function zoomStep(handle: DocumentViewerHandle, factor: number): void {
  const current = typeof handle.getZoom === "function" ? handle.getZoom() ?? 1.0 : 1.0;
  const next = Math.max(0.25, Math.min(4.0, current * factor));
  handle.setZoom(next);
}

function toggleViewMode(handle: DocumentViewerHandle): void {
  const current =
    typeof handle.getViewMode === "function" ? handle.getViewMode() ?? "scroll" : "scroll";
  const next: ViewMode = current === "scroll" ? "pages" : "scroll";
  if (handle.capabilities.viewModes.includes(next)) {
    handle.setViewMode(next);
  } else {
    toast.info(`View mode "${next}" is not supported for this document`);
  }
}

function toggleBookmark(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  const state = useTabStore.getState();
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab?.handle) return;

  const position = makePagePosition(tab.handle.getCurrentPosition());
  void invoke<boolean>("bookmark_toggle", {
    filePath: tab.filePath,
    format: tab.format,
    pagePosition: JSON.stringify(position),
  })
    .then((nowBookmarked) => {
      toast.info(nowBookmarked ? "Bookmark added" : "Bookmark removed");
      void queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    })
    .catch(console.error);
}

/**
 * Global keyboard dispatcher.
 *
 * - Handles document navigation (page turns) and mode transitions
 *   (NORMAL/SEARCH/TREE/BOOKMARKS/VISUAL) for the active document tab.
 * - Tab shortcuts (Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+W, Ctrl+number,
 *   Ctrl+Shift+T) are handled here as well.
 * - Command bar input and the command palette suspend these bindings.
 */
export function useKeyDispatcher(): void {
  const isCommandBarOpen = useCommandModeStore((s) => s.isOpen);
  const isPaletteOpen = useCommandPaletteStore((s) => s.isOpen);
  const currentMode = useUiModeStore((s) => s.currentMode);
  const setMode = useUiModeStore((s) => s.setMode);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openHelp = useHelpModalStore((s) => s.open);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isCommandBarOpen || isPaletteOpen) return;
      if (isEditableTarget(e.target)) return;

      // Tab management shortcuts (Ctrl-combinations).
      if (e.ctrlKey || e.metaKey) {
        const store = useTabStore.getState();
        const key = e.key.toLowerCase();

        if (key === "w") {
          e.preventDefault();
          const active = store.activeTabId;
          if (active) {
            store.closeTab(active);
          } else {
            window.close();
          }
          return;
        }

        if (key === "t" && !e.shiftKey) {
          e.preventDefault();
          store.activateTab(null);
          navigate({ to: "/" });
          return;
        }

        if (key === "tab") {
          e.preventDefault();
          if (e.shiftKey) {
            store.activatePrev();
          } else {
            store.activateNext();
          }
          navigate({ to: "/" });
          return;
        }

        if (key === "t" && e.shiftKey) {
          e.preventDefault();
          void store.restoreLastClosedTab().then(() => navigate({ to: "/" }));
          return;
        }

        if (/^[1-9]$/.test(key)) {
          e.preventDefault();
          const index = key === "9"
            ? store.tabs.length - 1
            : Number.parseInt(key, 10) - 1;
          const tab = store.tabs[index];
          if (tab) {
            store.activateTab(tab.id);
            navigate({ to: "/" });
          }
          return;
        }

        return;
      }

      if (e.altKey) return;

      // Escape returns to NORMAL from any mode.
      if (e.key === "Escape") {
        if (currentMode !== "NORMAL") {
          setMode("NORMAL");
        }
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        openHelp();
        return;
      }

      if (e.key === "D") {
        e.preventDefault();
        window.dispatchEvent(new Event("taurus:toggle-theme"));
        return;
      }

      const handle = getActiveHandle();
      const key = e.key.toLowerCase();

      if (e.key === "~") {
        e.preventDefault();
        useTabStore.getState().activateTab(null);
        navigate({ to: "/" });
        return;
      }

      if (currentMode === "VISUAL") {
        if (key === "y") {
          e.preventDefault();
          const selection = window.getSelection()?.toString() ?? "";
          if (selection) {
            void navigator.clipboard?.writeText(selection).then(
              () => toast.success("Selection copied"),
              () => toast.error("Could not copy selection"),
            );
          }
          setMode("NORMAL");
        }
        return;
      }

      if (currentMode !== "NORMAL") {
        if (key === "tab") {
          e.preventDefault();
          document
            .querySelector<HTMLElement>("[data-sidebar-panel]")
            ?.focus();
        }
        return;
      }

      if (!handle) return;

      // Mode transitions.
      if (key === "/") {
        e.preventDefault();
        setMode("SEARCH");
        setTimeout(() => {
          document
            .querySelector<HTMLInputElement>(
              'input[aria-label="Search in document"]',
            )
            ?.focus();
        }, 50);
        return;
      }
      if (key === "t") {
        e.preventDefault();
        setMode("TREE");
        return;
      }
      if (key === "b" && e.shiftKey) {
        e.preventDefault();
        setMode("BOOKMARKS");
        return;
      }
      if (key === "v") {
        e.preventDefault();
        setMode("VISUAL");
        return;
      }
      if (key === "m") {
        e.preventDefault();
        toggleBookmark(queryClient);
        return;
      }

      if (key === "j" || key === "arrowdown") {
        e.preventDefault();
        handle.navigate({ kind: "scroll", deltaY: 240 });
        return;
      }
      if (key === "k" || key === "arrowup") {
        e.preventDefault();
        handle.navigate({ kind: "scroll", deltaY: -240 });
        return;
      }
      if (key === "d") {
        e.preventDefault();
        handle.navigate({ kind: "scroll", deltaY: 480 });
        return;
      }
      if (key === "u") {
        e.preventDefault();
        handle.navigate({ kind: "scroll", deltaY: -480 });
        return;
      }
      if (key === "f" || key === "b") {
        e.preventDefault();
        handle.navigate({ kind: "scroll", deltaY: key === "f" ? 720 : -720 });
        return;
      }

      // View control.
      if (key === "s") {
        e.preventDefault();
        toggleViewMode(handle);
        return;
      }
      if (e.key === "=") {
        e.preventDefault();
        handle.setZoom(1.0);
        return;
      }
      if (e.key === "+") {
        e.preventDefault();
        zoomStep(handle, 1.25);
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        zoomStep(handle, 0.8);
        return;
      }

      // Open a document from the file manager.
      if (key === "o") {
        e.preventDefault();
        void (async () => {
          const { open } = await import("@tauri-apps/plugin-dialog");
          const selected = await open({
            multiple: false,
            filters: [{ name: "Documents", extensions: ["pdf", "epub"] }],
          });
          if (selected && typeof selected === "string") {
            useTabStore.getState().openTab(selected, resolveFormat(selected));
            navigate({ to: "/" });
          }
        })();
        return;
      }

      // Page turns.
      let turn: PageTurn;
      if (key === "arrowright" || key === "l") {
        turn = { kind: "right" };
      } else if (key === "arrowleft" || key === "h") {
        turn = { kind: "left" };
      } else if (key === " " || key === "pagedown") {
        turn = { kind: e.shiftKey ? "prev" : "next" };
      } else if (key === "pageup") {
        turn = { kind: "prev" };
      } else {
        return;
      }
      e.preventDefault();
      handle.navigate(turn);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isCommandBarOpen, isPaletteOpen, currentMode, setMode, navigate, openHelp]);

  useEffect(() => {
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (isCommandBarOpen || isPaletteOpen || isEditableTarget(event.target)) return;
      const handle = getActiveHandle();
      if (!handle) return;
      event.preventDefault();
      const current = typeof handle.getZoom === "function" ? handle.getZoom() ?? 1 : 1;
      zoomStep(handle, event.deltaY < 0 ? 1.1 : 0.9);
      if (typeof handle.getZoom === "function" && handle.getZoom() === current) {
        toast.info("Zoom is not supported for this document");
      }
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, [isCommandBarOpen, isPaletteOpen]);
}
