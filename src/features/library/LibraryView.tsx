import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { log } from "../../shared/log";
import type { AddFolderOutcome, LibraryEntry, LibraryFolder } from "../../shared/bindings";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useTabStore } from "../tabs/TabStore";
import {
  flattenLibraryOrder,
  folderName,
  groupEntriesByFolder,
} from "./libraryOrder";
import { useLibraryFocusStore } from "./libraryFocusStore";
import { useLibraryAccordionStore } from "./libraryAccordionStore";
import { DropZone } from "./DropZone";

function LibraryEntryCard({
  entry,
  focused,
  openTab,
  navigate,
}: {
  entry: LibraryEntry;
  focused: boolean;
  openTab: (path: string, format: "pdf" | "epub") => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [imgError, setImgError] = useState(false);
  const setFocusedIndex = useLibraryFocusStore((s) => s.setFocusedIndex);

  return (
    <button
      type="button"
      onClick={() => {
        setFocusedIndex(null);
        openTab(entry.path, entry.format === "epub" ? "epub" : "pdf");
        navigate({ to: "/" });
      }}
      className={`group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:border-primary hover:shadow-md ${
        focused ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden bg-muted/30">
        {!imgError && entry.thumbnail_path !== null ? (
          <img
            src={`http://taurus-thumb.localhost/${entry.id}`}
            alt={entry.title}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="font-semibold text-muted-foreground uppercase text-xs">
            {entry.format}
          </span>
        )}
        {entry.status === "error" && (
          <span className="absolute top-1 right-1 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
            Error
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p
          className="truncate font-medium text-xs text-foreground group-hover:text-primary"
          title={entry.title}
        >
          {entry.title}
        </p>
        <span className="text-[10px] text-muted-foreground uppercase">
          {entry.format}
        </span>
      </div>
    </button>
  );
}

export function LibraryView() {
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const [scanning, setScanning] = useState(false);
  const openTab = useTabStore((s) => s.openTab);
  const restorePersistedTabs = useTabStore((s) => s.restorePersistedTabs);
  const navigate = useNavigate();
  const focusedIndex = useLibraryFocusStore((s) => s.focusedIndex);
  const setColumns = useLibraryFocusStore((s) => s.setColumns);
  const openIds = useLibraryAccordionStore((s) => s.openIds);
  const setOpenIds = useLibraryAccordionStore((s) => s.setOpenIds);

  const foldersQuery = useQuery({
    queryKey: ["library", "folders"],
    queryFn: () => invoke<LibraryFolder[]>("library_list_folders"),
  });

  const entriesQuery = useQuery({
    queryKey: ["library", "entries"],
    queryFn: () => invoke<LibraryEntry[]>("library_list_entries"),
  });

  const addFolder = useMutation({
    mutationFn: async (path: string) => {
      const outcome = await invoke<AddFolderOutcome>("library_add_folder", { path });
      await invoke("library_scan_folder", { path });
      return outcome;
    },
    onSuccess: (outcome) => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      if ("AlreadyExists" in outcome) {
        toast.info("Folder already added");
      }
    },
  });

  const removeFolder = useMutation({
    mutationFn: async (path: string) => {
      await invoke("library_remove_folder", { path });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["library"] }),
  });

  const refreshing = foldersQuery.isFetching || entriesQuery.isFetching;
  const folders = foldersQuery.data ?? [];
  const entries = entriesQuery.data ?? [];

  const groups = useMemo(() => groupEntriesByFolder(folders, entries), [folders, entries]);
  const flatEntries = useMemo(
    () => flattenLibraryOrder(folders, entries),
    [folders, entries],
  );
  const focusIndexById = useMemo(() => {
    const map = new Map<number, number>();
    flatEntries.forEach((entry, index) => map.set(entry.id, index));
    return map;
  }, [flatEntries]);
  const hasFolders = folders.length > 0;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      const grid = el.querySelector<HTMLElement>("[data-library-grid]");
      if (!grid) return;
      const count = getComputedStyle(grid)
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length;
      if (count > 0) setColumns(count);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [setColumns]);

  async function handleRefresh() {
    setScanning(true);
    try {
      await Promise.all(
        folders.map((folder) =>
          invoke("library_scan_folder", { path: folder.path }),
        ),
      );
    } catch (err) {
      log.error("Failed to rescan folders:", err);
    } finally {
      setScanning(false);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "folders"] }),
      queryClient.invalidateQueries({ queryKey: ["library", "entries"] }),
    ]);
    log.debug(`[LibraryView] refreshed ${folders.length} folder(s)`);
  }

  async function handleAddFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Document Folder",
      });

      if (!selected || typeof selected !== "string") return;

      setScanning(true);
      await addFolder.mutateAsync(selected);
      log.debug(`[LibraryView] added folder: ${selected}`);
    } catch (err) {
      log.error("Failed to scan folder:", err);
    } finally {
      setScanning(false);
    }
  }

  function renderGroupGrid(group: (typeof groups)[number]) {
    return (
      <div
        data-library-grid
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      >
        {group.entries.map((entry) => {
          const index = focusIndexById.get(entry.id) ?? 0;
          return (
            <div key={entry.id} data-library-focus={index}>
              <LibraryEntryCard
                entry={entry}
                focused={index === focusedIndex}
                openTab={openTab}
                navigate={navigate}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <h2 className="font-semibold text-lg">Document Library</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void restorePersistedTabs()}
            className="flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <RotateCcw size={14} />
            Restore Tabs
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || scanning}
            className="flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={refreshing || scanning ? "animate-spin" : undefined}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleAddFolder}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <FolderPlus size={14} />
            Add Folder
          </button>
        </div>
      </div>

      <div ref={contentRef} data-library-scroll className="flex-1 overflow-y-auto p-4">
        <div className="mb-4">
          <DropZone />
        </div>
        {entries.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-muted-foreground text-sm">
            <p className="mb-2">No documents in library.</p>
            <p className="text-xs">
              Add a folder containing PDF or EPUB files.
            </p>
          </div>
        ) : hasFolders ? (
          <Accordion
            type="multiple"
            value={openIds}
            onValueChange={setOpenIds}
            className="flex flex-col gap-2"
          >
            {groups.map((group) => {
              const key = group.folder ? String(group.folder.id) : "ungrouped";
              return (
                <AccordionItem
                  key={key}
                  value={key}
                  className="rounded-lg border px-1"
                >
                  <AccordionTrigger className="px-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">
                        {group.folder ? folderName(group.folder.path) : "Ungrouped"}
                      </span>
                      <span className="shrink-0 text-[10px] font-normal text-muted-foreground uppercase">
                        {group.entries.length} item(s)
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-2">
                    {group.folder && (
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void removeFolder.mutateAsync(group.folder!.path)}
                          className="flex shrink-0 items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                        >
                          <Trash2 size={12} />
                          Remove folder
                        </button>
                      </div>
                    )}
                    {renderGroupGrid(group)}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : (
          groups.map((group) => (
            <section key="ungrouped" className="mb-8 last:mb-0">
              <div className="mb-3 flex items-center justify-between">
                <h3
                  className="flex min-w-0 items-center gap-2 text-sm font-semibold"
                  title={group.folder?.path ?? "Ungrouped"}
                >
                  <span className="truncate">Ungrouped</span>
                  <span className="shrink-0 text-[10px] font-normal text-muted-foreground uppercase">
                    {group.entries.length} item(s)
                  </span>
                </h3>
              </div>
              {renderGroupGrid(group)}
            </section>
          ))
        )}
      </div>

      {folders.length > 0 && (
        <div className="border-t bg-muted/10 p-3 text-xs text-muted-foreground">
          Watching {folders.length} folder(s)
        </div>
      )}
    </div>
  );
}
