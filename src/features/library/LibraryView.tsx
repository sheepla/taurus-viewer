import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, RefreshCw } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { LibraryEntry, LibraryFolder } from "../../shared/bindings";
import { useTabStore } from "../tabs/TabStore";

export function LibraryView() {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const openTab = useTabStore((s) => s.openTab);
  const navigate = useNavigate();

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
      await invoke("library_add_folder", { path });
      await invoke("library_scan_folder", { path });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["library"] }),
  });

  const refreshing = foldersQuery.isFetching || entriesQuery.isFetching;
  const folders = foldersQuery.data ?? [];
  const entries = entriesQuery.data ?? [];

  async function handleRefresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "folders"] }),
      queryClient.invalidateQueries({ queryKey: ["library", "entries"] }),
    ]);
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
    } catch (err) {
      console.error("Failed to scan folder:", err);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <h2 className="font-semibold text-lg">Document Library</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : undefined}
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

      <div className="flex-1 overflow-y-auto p-4">
        {entries.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-muted-foreground text-sm">
            <p className="mb-2">No documents in library.</p>
            <p className="text-xs">
              Add a folder containing PDF or EPUB files.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  openTab(
                    entry.path,
                    entry.format === "epub" ? "epub" : "pdf",
                  );
                  navigate({ to: "/" });
                }}
                className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:border-primary hover:shadow-md"
              >
                <div className="flex aspect-[3/4] w-full items-center justify-center bg-muted/30">
                  {entry.thumbnail_path ? (
                      <img
                        src={`http://taurus-thumb.localhost/${entry.id}`}
                        alt={entry.title}
                        className="h-full w-full object-cover"
                      />
                  ) : (
                    <span className="font-semibold text-muted-foreground uppercase text-xs">
                      {entry.format}
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
            ))}
          </div>
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
