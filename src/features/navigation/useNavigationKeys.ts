import { useEffect } from "react";
import { useCommandModeStore } from "../command-mode/commandModeStore";
import { useCommandPaletteStore } from "../command-mode/CommandPalette";
import { useTabStore } from "../tabs/TabStore";
import type { PageTurn } from "../../shared/types";

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Global page-turn key bindings dispatched to the active document tab.
 *
 * Directional keys (arrow left/right, h/l) use the RTL-aware "left"/"right"
 * navigation. Reading-order keys (Space/Shift+Space/PageDown/PageUp) use
 * "next"/"prev".
 */
export function useNavigationKeys(): void {
  const isCommandBarOpen = useCommandModeStore((s) => s.isOpen);
  const isPaletteOpen = useCommandPaletteStore((s) => s.isOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isCommandBarOpen || isPaletteOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();
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

      const state = useTabStore.getState();
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab?.handle) return;

      e.preventDefault();
      tab.handle.navigate(turn);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isCommandBarOpen, isPaletteOpen]);
}
