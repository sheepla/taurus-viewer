import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTabStore } from "../tabs/TabStore";
import type { LibraryEntry } from "../../shared/bindings";
import { BookOpen, FileText } from "lucide-react";
import { create } from "zustand";

interface CommandPaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

export function CommandPalette() {
  const { isOpen, close } = useCommandPaletteStore();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { tabs, activateTab, openTab } = useTabStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const { data: libraryEntries = [] } = useQuery({
    queryKey: ["palette-search", debouncedQuery],
    queryFn: () =>
      invoke<LibraryEntry[]>("palette_search_library", {
        query: debouncedQuery,
      }),
    enabled: isOpen,
    staleTime: 30_000,
  });

  const filteredTabs = tabs.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase()) ||
    t.filePath.toLowerCase().includes(query.toLowerCase())
  );
  const candidates = [
    ...filteredTabs.map((tab) => ({ kind: "tab" as const, id: tab.id })),
    ...libraryEntries.map((entry) => ({ kind: "library" as const, id: entry.id })),
  ];

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, candidates.length - 1)));
  }, [candidates.length]);

  useEffect(() => {
    // Keep the selected candidate visible when navigating with the arrow keys.
    listRef.current
      ?.querySelector(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key.toLowerCase() === "n")) {
      e.preventDefault();
      setSelectedIndex((index) => (index + 1) % Math.max(1, candidates.length));
      return;
    }
    if (e.key === "ArrowUp" || (e.ctrlKey && e.key.toLowerCase() === "p")) {
      e.preventDefault();
      setSelectedIndex((index) => (index - 1 + candidates.length) % Math.max(1, candidates.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const selected = candidates[selectedIndex];
      if (selected?.kind === "tab") {
        handleSelectTab(selected.id);
      } else if (selected?.kind === "library") {
        const entry = libraryEntries.find((item) => item.id === selected.id);
        if (entry) handleSelectEntry(entry);
      }
    }
  }
  function handleSelectTab(tabId: string) {
    activateTab(tabId);
    close();
  }

  function handleSelectEntry(entry: LibraryEntry) {
    openTab(entry.path, entry.format === "epub" ? "epub" : "pdf");
    close();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-xl p-0 overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            Jump to
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 pt-3">
          <Input
            ref={inputRef}
            autoFocus
            placeholder="Search open tabs or library documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="font-mono text-sm"
          />
        </div>
        <div
          data-testid="palette-list"
          ref={listRef}
          className="my-2 max-h-72 overflow-y-auto px-2 pb-2 space-y-1"
        >
          {filteredTabs.length > 0 && (
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Open Tabs
            </div>
          )}
          {filteredTabs.map((tab, index) => (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              data-index={index}
              onClick={() => handleSelectTab(tab.id)}
              className={`flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer transition-colors text-xs ${selectedIndex === filteredTabs.findIndex((item) => item.id === tab.id) ? "bg-accent" : ""}`}
            >
              <FileText size={14} className="text-primary shrink-0" />
              <div className="flex flex-col truncate">
                <span className="font-medium truncate">{tab.title}</span>
                <span className="text-[10px] text-muted-foreground truncate">{tab.filePath}</span>
              </div>
              <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded uppercase">Tab</span>
            </div>
          ))}

          {libraryEntries.length > 0 && (
            <div className="px-2 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Library Documents
            </div>
          )}
          {libraryEntries.map((entry, index) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              data-index={filteredTabs.length + index}
              onClick={() => handleSelectEntry(entry)}
              className={`flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer transition-colors text-xs ${selectedIndex === filteredTabs.length + libraryEntries.findIndex((item) => item.id === entry.id) ? "bg-accent" : ""}`}
            >
              <BookOpen size={14} className="text-muted-foreground shrink-0" />
              <div className="flex flex-col truncate">
                <span className="font-medium truncate">{entry.title}</span>
                <span className="text-[10px] text-muted-foreground truncate">{entry.path}</span>
              </div>
              <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded uppercase">{entry.format}</span>
            </div>
          ))}

          {filteredTabs.length === 0 && libraryEntries.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No matching documents or tabs found.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
