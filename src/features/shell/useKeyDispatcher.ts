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
import { log } from "../../shared/log";
import type { DocumentViewerHandle, PanDirection } from "../../shared/viewer-handle";
import type { ColumnCount, PageTurn, ViewMode } from "../../shared/types";
import type { LibraryEntry, LibraryFolder } from "../../shared/bindings";
import {
  flattenLibraryOrder,
  groupKeyFor,
  moveFocusIndex,
} from "../library/libraryOrder";
import { useLibraryFocusStore } from "../library/libraryFocusStore";
import { useLibraryAccordionStore } from "../library/libraryAccordionStore";
import { useHelpModalStore } from "../../components/HelpModal";
import { closeAppWindow } from "../../shared/appWindow";

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** Maps a normalized key name to its continuous pan direction, or null. */
const PAN_DIRECTION_KEYS: Record<string, PanDirection> = {
  j: "down",
  k: "up",
  h: "left",
  l: "right",
  arrowdown: "down",
  arrowup: "up",
  arrowleft: "left",
  arrowright: "right",
};

function panDirectionForKey(key: string): PanDirection | null {
  return PAN_DIRECTION_KEYS[key] ?? null;
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

function scrollLibraryFocusIntoView(): void {
  const { focusedIndex } = useLibraryFocusStore.getState();
  if (focusedIndex === null) return;
  const el = document.querySelector<HTMLElement>(
    `[data-library-focus="${focusedIndex}"]`,
  );
  el?.scrollIntoView({ block: "nearest", inline: "nearest" });
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

function toggleColumns(handle: DocumentViewerHandle): void {
  const current: ColumnCount = typeof handle.getColumns === "function" ? handle.getColumns() ?? 1 : 1;
  const next: ColumnCount = current === 1 ? 2 : 1;
  if (typeof handle.setColumns === "function") {
    handle.setColumns(next);
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
    .catch(log.error);
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
  const isHelpOpen = useHelpModalStore((s) => s.isOpen);

  useEffect(() => {
    // The handle currently holding an active pan gesture, stopped on keyup.
    let activePan: DocumentViewerHandle | null = null;

    const handler = (e: KeyboardEvent) => {
      if (isCommandBarOpen || isPaletteOpen) return;
      if (isEditableTarget(e.target)) return;

      // Tab management shortcuts (Ctrl-combinations).
      if (e.ctrlKey || e.metaKey) {
        const store = useTabStore.getState();
        const key = e.key.toLowerCase();

        // Keep the WebView's native print dialog (Ctrl+P) from appearing; a
        // print feature may be added later, but not yet.
        if (key === "p") {
          e.preventDefault();
          return;
        }

        if (key === "w") {
          e.preventDefault();
          const active = store.activeTabId;
          if (active) {
            store.closeTab(active);
          } else {
            // No document tab is open (Home is active): quit the app. The bare
            // window.close() would only darken the WebView without exiting.
            closeAppWindow();
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

      // While the help modal is open, scroll keys target the help content and
      // every other key is swallowed so the underlying viewer never moves.
      if (isHelpOpen) {
        const helpEl = document.querySelector<HTMLElement>("[data-help-scroll]");
        const scroll = (delta: number) => {
          if (helpEl) helpEl.scrollTop += delta;
        };
        if (key === "j" || key === "arrowdown") {
          e.preventDefault();
          scroll(240);
          return;
        }
        if (key === "k" || key === "arrowup") {
          e.preventDefault();
          scroll(-240);
          return;
        }
        if (key === "d") {
          e.preventDefault();
          scroll(480);
          return;
        }
        if (key === "u") {
          e.preventDefault();
          scroll(-480);
          return;
        }
        if (key === "f" || key === "b") {
          e.preventDefault();
          scroll(key === "f" ? 720 : -720);
          return;
        }
        if (key === " " || key === "pagedown") {
          e.preventDefault();
          scroll(e.shiftKey ? -720 : 720);
          return;
        }
        if (key === "pageup") {
          e.preventDefault();
          scroll(-720);
          return;
        }
        if (e.key === "g" || key === "home") {
          e.preventDefault();
          if (helpEl) helpEl.scrollTop = 0;
          return;
        }
        if (e.key === "G" || key === "end") {
          e.preventDefault();
          if (helpEl) helpEl.scrollTop = helpEl.scrollHeight;
          return;
        }
        e.preventDefault();
        return;
      }

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

      // Mode transitions — handled before the sidebar-panel swallow so they
      // always work regardless of where focus is (e.g. pressing `t` again to
      // leave TREE mode while the outline panel is focused).
      if (key === "/") {
        if (!handle) return;
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
        setMode(currentMode === "TREE" ? "NORMAL" : "TREE");
        return;
      }
      if (key === "b" && e.shiftKey) {
        e.preventDefault();
        setMode(currentMode === "BOOKMARKS" ? "NORMAL" : "BOOKMARKS");
        return;
      }
      if (key === "v") {
        e.preventDefault();
        setMode("VISUAL");
        return;
      }
      if (key === "m") {
        if (!handle) return;
        e.preventDefault();
        toggleBookmark(queryClient);
        return;
      }

      if (currentMode !== "NORMAL") {
        const sidebarPanel = document.querySelector("[data-sidebar-panel]");
        if (sidebarPanel?.contains(e.target as Node) || sidebarPanel?.contains(document.activeElement)) {
          if (key === "tab") {
            // Sidebar panels own their Tab handling (e.g. the outline panel
            // cycles its selection); never let Tab move the focus frame.
            e.preventDefault();
          }
          return;
        }
      }

      // Home screen: traverse the library grid with hjkl/cursor keys and
      // open the focused document with Enter. The focused group is expanded
      // automatically so the target card is always visible.
      if (!handle) {
        if (e.key === "g" || key === "home") {
          e.preventDefault();
          const list = document.querySelector<HTMLElement>("[data-library-scroll]");
          if (list) list.scrollTop = 0;
          return;
        }
        if (e.key === "G" || key === "end") {
          e.preventDefault();
          const list = document.querySelector<HTMLElement>("[data-library-scroll]");
          if (list) list.scrollTop = list.scrollHeight;
          return;
        }
        const folders =
          queryClient.getQueryData<LibraryFolder[]>(["library", "folders"]) ?? [];
        const entries =
          queryClient.getQueryData<LibraryEntry[]>(["library", "entries"]) ?? [];
        const flat = flattenLibraryOrder(folders, entries);
        if (flat.length > 0) {
          const focusStore = useLibraryFocusStore.getState();
          const accordionStore = useLibraryAccordionStore.getState();
          const current = Math.min(focusStore.focusedIndex ?? 0, flat.length - 1);
          const columns = Math.max(1, focusStore.columns);
          const reveal = (entry: LibraryEntry) =>
            accordionStore.ensureOpen(groupKeyFor(entry, folders));

          if (key === "j" || key === "arrowdown") {
            e.preventDefault();
            const next = moveFocusIndex(current, "down", flat.length, columns);
            reveal(flat[next]);
            focusStore.setFocusedIndex(next);
            scrollLibraryFocusIntoView();
            return;
          }
          if (key === "k" || key === "arrowup") {
            e.preventDefault();
            const next = moveFocusIndex(current, "up", flat.length, columns);
            reveal(flat[next]);
            focusStore.setFocusedIndex(next);
            scrollLibraryFocusIntoView();
            return;
          }
          if (key === "h" || key === "arrowleft") {
            e.preventDefault();
            const next = moveFocusIndex(current, "left", flat.length, columns);
            reveal(flat[next]);
            focusStore.setFocusedIndex(next);
            scrollLibraryFocusIntoView();
            return;
          }
          if (key === "l" || key === "arrowright") {
            e.preventDefault();
            const next = moveFocusIndex(current, "right", flat.length, columns);
            reveal(flat[next]);
            focusStore.setFocusedIndex(next);
            scrollLibraryFocusIntoView();
            return;
          }
          if (key === "enter") {
            e.preventDefault();
            reveal(flat[current]);
            useTabStore
              .getState()
              .openTab(flat[current].path, flat[current].format === "epub" ? "epub" : "pdf");
            navigate({ to: "/" });
            return;
          }
        }
        return;
      }

      if (e.key === "g" || key === "home") {
        e.preventDefault();
        handle.navigate({ kind: "edge", edge: "start" });
        return;
      }
      if (e.key === "G" || key === "end") {
        e.preventDefault();
        handle.navigate({ kind: "edge", edge: "end" });
        return;
      }

      // Hold-to-pan: the first keydown starts a smooth scroll loop and the OS
      // auto-repeat is suppressed (the loop drives the scrolling). If the
      // gesture cannot start (e.g. page-turn mode), fall through to the
      // one-shot actions below.
      const panDirection = panDirectionForKey(key);
      if (panDirection) {
        if (e.repeat) {
          if (activePan === handle) {
            e.preventDefault();
            return;
          }
        } else if (handle.startPan) {
          const started = handle.startPan(panDirection);
          activePan = started ? handle : null;
          if (started) {
            e.preventDefault();
            return;
          }
        }
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
      if (key === "c") {
        e.preventDefault();
        toggleColumns(handle);
        return;
      }
      if (e.key === "=") {
        e.preventDefault();
        handle.setZoom(1.0);
        return;
      }
      if (e.key === "+") {
        e.preventDefault();
        zoomStep(handle, 1.1);
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        zoomStep(handle, 0.9);
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
      (window as any).__navCalled = true;
      handle.navigate(turn);
    };

    const keyUpHandler = (e: KeyboardEvent) => {
      if (!activePan) return;
      if (panDirectionForKey(e.key.toLowerCase())) {
        activePan.stopPan?.();
        activePan = null;
      }
    };

    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", keyUpHandler);
    return () => {
      activePan?.stopPan?.();
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", keyUpHandler);
    };
  }, [isCommandBarOpen, isPaletteOpen, isHelpOpen, currentMode, setMode, navigate, openHelp]);

  // Suppress the WebView's native browser context menu (right-click). The
  // app does not use it; a dedicated context menu may be added later.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);

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
