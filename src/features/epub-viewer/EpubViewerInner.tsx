import { useEffect, useRef, useState } from "react";
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
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setTabHandle = useTabStore((s) => s.setHandle);

  const { data: bytes, isPending, isError, error: readError } = useQuery({
    queryKey: ["epub-file", filePath],
    queryFn: () => readFile(filePath),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!bytes) return;
    let isCancelled = false;
    const filename = filePath.replace(/\\/g, "/").split("/").pop() ?? "book.epub";
    const file = new File([bytes], filename, { type: "application/epub+zip" });
    const viewerHandle = new EpubViewerHandle(filePath);
    setError(null);
    setInitializing(true);

    const container = containerRef.current;
    if (container) {
      container.innerHTML = "";
      container.appendChild(viewerHandle.getViewElement());
    }

    viewerHandle
      .init(file)
      .then(() => {
        if (isCancelled) {
          viewerHandle.dispose();
          return;
        }
        setTabHandle(tabId, viewerHandle);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error("Failed to initialize EPUB viewer:", err);
        setError(err.message || "Unknown error occurred");
      })
      .finally(() => {
        if (!isCancelled) setInitializing(false);
      });

    return () => {
      isCancelled = true;
      viewerHandle.dispose();
      if (container) container.innerHTML = "";
    };
  }, [bytes, tabId, filePath, setTabHandle]);

  return (
    <div className="relative flex h-full w-full flex-col bg-background overflow-hidden">
      <div ref={containerRef} className="flex-1 w-full h-full min-h-0 flex flex-col" />
      {(isPending || (bytes && initializing)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground text-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
            <div>Loading EPUB with foliate-js...</div>
          </div>
        </div>
      )}
      {(isError || !bytes || error) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background text-destructive text-sm p-4">
          <BookOpen size={64} className="opacity-30" />
          <div className="text-center max-w-md">
            <div className="font-medium text-lg mb-2">Failed to load EPUB</div>
            <div className="text-xs text-muted-foreground mb-4 p-3 bg-muted/20 rounded">
              {readError?.message ?? error ?? "Unknown error occurred"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
