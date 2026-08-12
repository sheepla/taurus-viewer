import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Bookmark, BookmarkPlus, Star, Trash2 } from "lucide-react";
import { useTabStore } from "@/features/tabs/TabStore";
import {
  bookmarkLabel,
  makePagePosition,
  parseBookmarkPosition,
} from "./bookmarks";

interface BookmarkRecord {
  id: number;
  file_path: string;
  format: string;
  page_position: string;
  created_at: string;
}

/**
 * BOOKMARKS-mode sidebar panel: lists the active document's bookmarks and
 * lets the user jump to one or remove it. Supports j/k/arrow keys, Enter to jump,
 * and x/Delete to remove bookmarks.
 */
export function BookmarksPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const handle = activeTab?.handle ?? null;
  const queryClient = useQueryClient();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const query = useQuery({
    queryKey: ["bookmarks", activeTab?.filePath ?? ""],
    queryFn: () =>
      invoke<BookmarkRecord[]>("bookmark_list", {
        filePath: activeTab?.filePath,
      }),
    enabled: Boolean(activeTab?.filePath),
  });

  const toggle = useMutation({
    mutationFn: (record: {
      file_path: string;
      format: string;
      page_position: string;
    }) =>
      invoke("bookmark_toggle", {
        filePath: record.file_path,
        format: record.format,
        pagePosition: record.page_position,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const records = query.data ?? [];

  useEffect(() => {
    panelRef.current?.focus();
  }, [activeTab?.filePath]);

  useEffect(() => {
    if (selectedIndex >= records.length && records.length > 0) {
      setSelectedIndex(records.length - 1);
    }
  }, [records.length, selectedIndex]);

  if (!activeTab) return null;

  const toggleCurrentPage = () => {
    if (!handle) return;
    const position = makePagePosition(handle.getCurrentPosition());
    toggle.mutate({
      file_path: activeTab.filePath,
      format: activeTab.format,
      page_position: JSON.stringify(position),
    });
  };

  const jump = (raw: string) => {
    if (!handle) return;
    const position = parseBookmarkPosition(raw);
    if (position) handle.goToPosition(position);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (records.length === 0) return;
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(records.length - 1, i + 1));
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const rec = records[selectedIndex];
      if (rec) jump(rec.page_position);
    } else if (e.key === "x" || e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const rec = records[selectedIndex];
      if (rec) {
        toggle.mutate(rec);
      }
    }
  };

  return (
    <div
      ref={panelRef}
      data-sidebar-panel
      className="flex h-full flex-col outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        onClick={toggleCurrentPage}
        className="m-2 flex h-8 items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <BookmarkPlus size={13} />
        <span>Toggle current page</span>
      </button>

      {records.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          No bookmarks yet. Press <kbd className="rounded bg-muted px-1">m</kbd>{" "}
          to bookmark the current page.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {records.map((record, index) => {
            const position = parseBookmarkPosition(record.page_position);
            const isSelected = index === selectedIndex;
            return (
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIndex(index);
                    jump(record.page_position);
                  }}
                  className={`group flex h-8 w-full items-center gap-2 rounded px-3 text-xs transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <Star size={12} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {position ? bookmarkLabel(position) : "Unknown position"}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Remove bookmark"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle.mutate(record);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        toggle.mutate(record);
                      }
                    }}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex h-8 items-center gap-1.5 border-t border-border px-3 text-[11px] text-muted-foreground">
        <Bookmark size={12} />
        <span>{records.length} bookmark{records.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}
