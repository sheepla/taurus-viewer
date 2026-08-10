import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { EpubViewerHandle } from "./EpubViewerHandle";
import { useTabStore } from "../tabs/TabStore";

interface EpubViewerInnerProps {
  tabId: string;
  filePath: string;
}

export function EpubViewerInner({ tabId, filePath }: EpubViewerInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setTabHandle = useTabStore((s) => s.setHandle);

  useEffect(() => {
    const viewerHandle = new EpubViewerHandle(filePath);
    setError(null);
    setLoading(true);

    viewerHandle
      .init()
      .then(() => {
        setTabHandle(tabId, viewerHandle);
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          containerRef.current.appendChild(viewerHandle.getViewElement());
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to initialize EPUB viewer:", err);
        setError(err.message || "Unknown error occurred");
        setLoading(false);
      });

    return () => {
      viewerHandle.dispose();
    };
  }, [tabId, filePath, setTabHandle]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
          <div>Loading EPUB with foliate-js...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-destructive text-sm p-4">
        <BookOpen size={64} className="opacity-30" />
        <div className="text-center max-w-md">
          <div className="font-medium text-lg mb-2">Failed to load EPUB</div>
          <div className="text-xs text-muted-foreground mb-4 p-3 bg-muted/20 rounded">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-background overflow-hidden">
      <div ref={containerRef} className="flex-1 w-full h-full" />
    </div>
  );
}
