import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTabStore } from "../tabs/TabStore";
import type { LibraryEntry } from "../../shared/bindings";
import { BookOpen, FileText, Search } from "lucide-react";
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
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const { tabs, activateTab, openTab } = useTabStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      invoke<LibraryEntry[]>("palette_search_library", { query: "" })
        .then(setLibraryEntries)
        .catch(console.error);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      invoke<LibraryEntry[]>("palette_search_library", { query })
        .then(setLibraryEntries)
        .catch(console.error);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const filteredTabs = tabs.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase()) ||
    t.filePath.toLowerCase().includes(query.toLowerCase())
  );

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
            <Search size={14} />
            Command Palette (Jump to Tab or Library)
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 pt-3">
          <Input
            ref={inputRef}
            autoFocus
            placeholder="Search open tabs or library documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <div className="my-2 max-h-72 overflow-y-auto px-2 pb-2 space-y-1">
          {filteredTabs.length > 0 && (
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Open Tabs
            </div>
          )}
          {filteredTabs.map((tab) => (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectTab(tab.id)}
              className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer transition-colors text-xs"
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
          {libraryEntries.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectEntry(entry)}
              className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer transition-colors text-xs"
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
