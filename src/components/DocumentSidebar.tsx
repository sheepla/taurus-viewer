import { Bookmark, ListTree, Search } from "lucide-react";
import { BookmarksPanel } from "@/features/bookmarks/BookmarksPanel";
import { OutlinePanel } from "@/features/outline/OutlinePanel";
import { SearchPanel } from "@/features/search/SearchPanel";
import { useUiModeStore, type UiMode } from "@/features/shell/uiModeStore";
import { useTabStore } from "@/features/tabs/TabStore";

const TABS: { mode: UiMode; key: string; icon: React.ReactNode; label: string }[] = [
  { mode: "SEARCH", key: "search", icon: <Search size={13} />, label: "Search" },
  { mode: "TREE", key: "tree", icon: <ListTree size={13} />, label: "Outline" },
  {
    mode: "BOOKMARKS",
    key: "bookmarks",
    icon: <Bookmark size={13} />,
    label: "Bookmarks",
  },
];

/**
 * Document-bound sidebar. Visible only in SEARCH / TREE / BOOKMARKS modes;
 * the sidebar tab is the mode itself (1:1 mapping, per requirements v0.5).
 */
export function DocumentSidebar() {
  const currentMode = useUiModeStore((s) => s.currentMode);
  const setMode = useUiModeStore((s) => s.setMode);
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const handle = activeTab?.handle ?? null;

  if (currentMode === "NORMAL" || currentMode === "COMMAND" || !activeTab) {
    return null;
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="flex h-9 items-center gap-1 border-b border-border px-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMode(tab.mode)}
            className={[
              "flex h-7 flex-1 items-center justify-center gap-1.5 rounded text-xs font-medium transition-colors cursor-pointer select-none",
              currentMode === tab.mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            ].join(" ")}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {currentMode === "TREE" && (
          <OutlinePanel handle={handle} filePath={activeTab.filePath} />
        )}
        {currentMode === "SEARCH" && <SearchPanel handle={handle} />}
        {currentMode === "BOOKMARKS" && <BookmarksPanel />}
      </div>
    </aside>
  );
}
