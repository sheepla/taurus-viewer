import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { readFile } from "@tauri-apps/plugin-fs";
import { BookOpen } from "lucide-react";
import { EpubViewerHandle } from "./EpubViewerHandle";
import { useTabStore } from "../tabs/TabStore";

interface EpubViewerInnerProps {
  tabId: string;
  filePath: string;
}

export function EpubViewerInner({ tabId, filePath }: EpubViewerInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const setTabHandle = useTabStore((s) => s.setHandle);
  const setTabRestored = useTabStore((s) => s.setTabRestored);
  const restoreState = useTabStore(
    (s) => s.tabs.find((t) => t.id === tabId)?.restoreState ?? null,
  );

  const viewerQuery = useQuery({
    queryKey: ["epub-viewer", tabId, filePath],
    queryFn: async () => {
      const bytes = await readFile(filePath);
      const filename =
        filePath.replace(/\\/g, "/").split("/").pop() ?? "book.epub";
      const file = new File([bytes], filename, { type: "application/epub+zip" });
      const viewerHandle = new EpubViewerHandle(filePath);
      const container = containerRef.current;
      if (container) {
        container.innerHTML = "";
        container.appendChild(viewerHandle.getViewElement());
      }
      try {
        await viewerHandle.init(file);
      } catch (error) {
        viewerHandle.dispose();
        throw error;
      }
      return viewerHandle;
    },
    staleTime: Infinity,
    gcTime: 0,
  });

  const handle = viewerQuery.data ?? null;

  useEffect(() => {
    if (!handle) return;
    setTabHandle(tabId, handle);
    if (restoreState) {
      handle.restore(restoreState);
      setTabRestored(tabId);
    }
    return () => handle.dispose();
  }, [handle, tabId, setTabHandle, setTabRestored, restoreState]);

  return (
    <div className="relative flex h-full w-full flex-col bg-background overflow-hidden">
      <div ref={containerRef} className="flex-1 w-full h-full min-h-0 flex flex-col" />
      {viewerQuery.isPending && (
        <div className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground text-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
            <div>Loading EPUB...</div>
          </div>
        </div>
      )}
      {viewerQuery.isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background text-destructive text-sm p-4">
          <BookOpen size={64} className="opacity-30" />
          <div className="text-center max-w-md">
            <div className="font-medium text-lg mb-2">Failed to load EPUB</div>
            <div className="text-xs text-muted-foreground mb-4 p-3 bg-muted/20 rounded">
              {viewerQuery.error?.message ?? "Unknown error occurred"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
