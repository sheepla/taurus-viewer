import { useNavigate } from "@tanstack/react-router";
import { useTabStore } from "./TabStore";
import { X } from "lucide-react";

export function TabBar() {
  const { tabs, activeTabId, activateTab, closeTab } = useTabStore();
  const navigate = useNavigate();

  if (tabs.length === 0) return null;

  function handleTabClick(tabId: string) {
    activateTab(tabId);
    navigate({ to: "/" });
  }

  return (
    <div className="flex h-9 items-center gap-px overflow-x-auto border-b border-border bg-muted/40 px-1">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="button"
          tabIndex={0}
          onClick={() => handleTabClick(tab.id)}
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
    </div>
  );
}
