import { useState } from "react";
import type { ReactNode } from "react";
import { Bookmark, ListTree, Minus, Plus, Search, Settings } from "lucide-react";
import { useUiModeStore, type UiMode } from "@/features/shell/uiModeStore";
import { useTabStore } from "@/features/tabs/TabStore";
import { useSettingsModalStore } from "./settingsModalStore";
import { ThemeToggle } from "./theme-toggle";

function currentZoom(handle: NonNullable<ReturnType<typeof useTabStore.getState>["tabs"][0]["handle"]>): number {
  return typeof handle.getZoom === "function" ? handle.getZoom() : 1.0;
}

const SIDEBAR_MODES: Array<{
  mode: Extract<UiMode, "SEARCH" | "TREE" | "BOOKMARKS">;
  label: string;
  icon: ReactNode;
}> = [
  { mode: "TREE", label: "Outline", icon: <ListTree size={15} /> },
  { mode: "SEARCH", label: "Search", icon: <Search size={15} /> },
  { mode: "BOOKMARKS", label: "Bookmarks", icon: <Bookmark size={15} /> },
];

export function HeaderBar() {
  const openSettings = useSettingsModalStore((s) => s.open);
  const currentMode = useUiModeStore((s) => s.currentMode);
  const setMode = useUiModeStore((s) => s.setMode);
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const handle = activeTab?.handle ?? null;
  const [zoom, setZoom] = useState<number>(() =>
    handle ? currentZoom(handle) : 1.0,
  );

  function applyZoom(next: number) {
    if (!handle) return;
    const clamped = Math.max(0.25, Math.min(4.0, next));
    handle.setZoom(clamped);
    setZoom(clamped);
  }

  const title = activeTab?.title ?? "TaurusViewer";

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
      <span className="min-w-0 truncate text-sm font-semibold" title={title}>
        {title}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {SIDEBAR_MODES.map((item) => (
          <button
            key={item.mode}
            type="button"
            aria-label={item.label}
            title={item.label}
            onClick={() => setMode(currentMode === item.mode ? "NORMAL" : item.mode)}
            disabled={!handle}
            data-active={currentMode === item.mode ? "true" : undefined}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
          >
            {item.icon}
          </button>
        ))}
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => applyZoom((handle ? currentZoom(handle) : zoom) - 0.25)}
          disabled={!handle}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          aria-label="Zoom reset"
          onClick={() => applyZoom(1.0)}
          disabled={!handle}
          className="h-7 rounded-md px-2 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => applyZoom((handle ? currentZoom(handle) : zoom) + 0.25)}
          disabled={!handle}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
        >
          <Plus size={15} />
        </button>
        <ThemeToggle />
        <button
          type="button"
          onClick={openSettings}
          aria-label="Settings"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Settings size={15} />
        </button>
      </div>
    </div>
  );
}
