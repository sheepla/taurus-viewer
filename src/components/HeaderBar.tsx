import { useState, useEffect } from "react";
import { Columns2, LayoutList, Minus, Plus, ScrollText, Settings, Square } from "lucide-react";
import { useTabStore } from "@/features/tabs/TabStore";
import { useSettingsModalStore } from "./settingsModalStore";
import { ThemeToggle } from "./theme-toggle";
import type { ViewMode } from "../shared/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function currentZoom(handle: NonNullable<ReturnType<typeof useTabStore.getState>["tabs"][0]["handle"]>): number {
  return typeof handle.getZoom === "function" ? handle.getZoom() : 1.0;
}

export function HeaderBar() {
  const openSettings = useSettingsModalStore((s) => s.open);
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const handle = activeTab?.handle ?? null;

  const [zoom, setZoom] = useState<number>(() =>
    handle ? currentZoom(handle) : 1.0,
  );
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    handle?.getViewMode?.() ?? "scroll",
  );
  const [columns, setColumnsState] = useState<number>(() =>
    handle?.getColumns?.() ?? 1,
  );

  useEffect(() => {
    if (!handle) return;
    if (typeof handle.getViewMode === "function") {
      setViewModeState(handle.getViewMode());
    }
    if (typeof handle.getColumns === "function") {
      setColumnsState(handle.getColumns());
    }
    if (typeof handle.getZoom === "function") {
      setZoom(handle.getZoom());
    }

    const unsubZoom = handle.onZoomChange?.((z) => setZoom(z));
    const unsubView = handle.onViewModeChange?.((v) => setViewModeState(v));
    const unsubCols = handle.onColumnsChange?.((c) => setColumnsState(c));

    return () => {
      unsubZoom?.();
      unsubView?.();
      unsubCols?.();
    };
  }, [handle]);

  function applyZoom(next: number) {
    if (!handle) return;
    const clamped = Math.max(0.25, Math.min(4.0, Math.round(next * 10) / 10));
    handle.setZoom(clamped);
    setZoom(clamped);
  }

  function changeViewMode(mode: ViewMode) {
    if (!handle) return;
    if (handle.capabilities.viewModes.includes(mode)) {
      handle.setViewMode(mode);
      setViewModeState(mode);
    }
  }

  function changeColumns(cols: number) {
    if (!handle || typeof handle.setColumns !== "function") return;
    handle.setColumns(cols);
    setColumnsState(cols);
  }

  function handleViewModeChange(value: string) {
    changeViewMode(value as ViewMode);
  }

  function handleColumnsChange(value: string) {
    changeColumns(Number(value));
  }

  const title = activeTab?.title ?? "TaurusViewer";

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
      <span className="min-w-0 truncate text-sm font-semibold" title={title}>
        {title}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {/* View Mode Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="View mode"
              title="View mode (Scroll / Pages)"
              disabled={!handle}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            >
              {viewMode === "scroll" ? <ScrollText size={15} /> : <LayoutList size={15} />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={viewMode} onValueChange={handleViewModeChange}>
              <DropdownMenuRadioItem
                value="scroll"
                className="gap-2"
                disabled={!handle || !handle.capabilities.viewModes.includes("scroll")}
              >
                <ScrollText size={14} />
                <span>Scroll</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value="pages"
                className="gap-2"
                disabled={!handle || !handle.capabilities.viewModes.includes("pages")}
              >
                <LayoutList size={14} />
                <span>Pages</span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Column Mode Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Column layout"
              title={columns === 1 ? "1 Column" : "2 Columns"}
              disabled={!handle}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            >
              {columns === 1 ? <Square size={15} /> : <Columns2 size={15} />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={columns.toString()} onValueChange={handleColumnsChange}>
              <DropdownMenuRadioItem value="1" className="gap-2">
                <Square size={14} />
                <span>1 Column</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="2" className="gap-2">
                <Columns2 size={14} />
                <span>2 Columns</span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Zoom Controls (10% increments) */}
        <div className="flex items-center rounded-md border border-border bg-background p-0.5 gap-0.5">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => applyZoom(zoom - 0.1)}
            disabled={!handle}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            aria-label="Zoom reset"
            title="Reset zoom"
            onClick={() => applyZoom(1.0)}
            disabled={!handle}
            className="h-7 rounded px-1.5 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => applyZoom(zoom + 0.1)}
            disabled={!handle}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Settings */}
        <button
          type="button"
          onClick={openSettings}
          aria-label="Settings"
          title="Settings"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Settings size={15} />
        </button>

        {/* Theme Toggle (Right end) */}
        <ThemeToggle />
      </div>
    </div>
  );
}
