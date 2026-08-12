import { useNavigate } from "@tanstack/react-router";
import { useTabStore } from "./TabStore";
import { Library, Plus, X } from "lucide-react";

export function TabBar() {
  const { tabs, activeTabId, activateTab, closeTab, reorderTabs } = useTabStore();
  const navigate = useNavigate();

  function handleLibraryClick() {
    activateTab(null);
    navigate({ to: "/" });
  }

  function handleTabClick(tabId: string) {
    activateTab(tabId);
    navigate({ to: "/" });
  }

  return (
    <div className="flex h-9 items-center gap-1 overflow-x-auto border-b border-border bg-muted/40 px-2">
      <button
        type="button"
        onClick={handleLibraryClick}
        className={[
          "group flex h-7 items-center gap-1.5 rounded px-2.5 text-xs transition-colors cursor-pointer select-none font-medium",
          activeTabId === null
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
        ].join(" ")}
      >
        <Library size={13} />
        <span>Home</span>
      </button>

      {tabs.length > 0 && <div className="h-4 w-px bg-border mx-1" />}

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="button"
          tabIndex={0}
          onClick={() => handleTabClick(tab.id)}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", tab.id);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const sourceId = event.dataTransfer.getData("text/plain");
            if (sourceId) reorderTabs(sourceId, tab.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleTabClick(tab.id);
            }
          }}
          className={[
            "group flex h-7 max-w-48 items-center gap-1.5 rounded px-2.5 text-xs transition-colors cursor-pointer select-none",
            tab.id === activeTabId
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          ].join(" ")}
        >
          <span className="truncate">{tab.title}</span>
          <button
            type="button"
            aria-label={`Close ${tab.title}`}
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
          >
            <X size={10} />
          </button>
        </div>
      ))}

      <button
        type="button"
        aria-label="Open new tab"
        title="Open new tab"
        onClick={() => {
          activateTab(null);
          navigate({ to: "/" });
        }}
        className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
