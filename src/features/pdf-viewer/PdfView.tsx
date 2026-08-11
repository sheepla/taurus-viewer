import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabStore } from "../tabs/TabStore";
import { PdfViewerHandle } from "./PdfViewerHandle";

interface PdfViewProps {
  tabId: string;
  filePath: string;
}

function PageItem({
  sessionId,
  index,
  pageCount,
  invertColors,
  pageIndex,
}: {
  sessionId: string;
  index: number;
  pageCount: number;
  invertColors: boolean;
  pageIndex: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-page-index={pageIndex}
      className="flex flex-col items-center rounded bg-background p-2 shadow-sm border border-border min-h-[500px] w-full justify-center"
    >
      {isVisible ? (
        <img
          src={`http://taurus-page.localhost/${sessionId}/${index}?w=1200`}
          alt={`Page ${index + 1}`}
          className="max-w-full h-auto object-contain"
          style={{ filter: invertColors ? "invert(1) hue-rotate(180deg)" : "none" }}
          onError={(e) => {
            console.error(`Failed to load page ${index + 1}:`, e);
            (e.target as HTMLImageElement).src =
              "data:image/svg+xml," +
              encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
                  <rect width="100%" height="100%" fill="#f0f0f0"/>
                  <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="Arial" font-size="14" fill="#666">
                    Failed to load page ${index + 1}
                  </text>
                </svg>
              `);
          }}
        />
      ) : (
        <div className="text-muted-foreground text-xs animate-pulse">
          Loading page {index + 1}...
        </div>
      )}
      <span className="mt-2 text-muted-foreground text-xs">
        Page {index + 1} of {pageCount}
      </span>
    </div>
  );
}

export function PdfView({ tabId, filePath }: PdfViewProps) {
  const [handle, setHandle] = useState<PdfViewerHandle | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setTabHandle = useTabStore((s) => s.setHandle);

  const scrollContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && handle) {
        handle.attachScrollContainer(el);
      }
    },
    [handle],
  );

  useEffect(() => {
    const viewerHandle = new PdfViewerHandle(filePath);
    setError(null);
    setLoading(true);

    console.log(`Starting PDF initialization for: ${filePath}`);

    viewerHandle
      .init()
      .then(() => {
        console.log("PDF viewer initialized successfully");
        setHandle(viewerHandle);
        setPageCount(viewerHandle.getPageCount());
        setTabHandle(tabId, viewerHandle);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to initialize PDF viewer:", err);
        setError(err.message || "Unknown error occurred");
        setLoading(false);
      });

    return () => {
      viewerHandle.dispose();
    };
  }, [tabId, filePath, setTabHandle]);

  const [invertColors, setInvertColors] = useState(false);

  useEffect(() => {
    invoke<any>("config_load")
      .then((result) => {
        if (result.status === "ok" && result.data?.document) {
          setInvertColors(result.data.document.invert_colors);
        }
      })
      .catch((err) => {
        console.warn("Failed to load config:", err);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
          <div>Loading PDF...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-destructive text-sm p-4">
        <div className="text-center max-w-md">
          <div className="font-medium text-lg mb-2">Failed to load PDF</div>
          <div className="text-xs text-muted-foreground mb-4 p-3 bg-muted/20 rounded">
            {error}
          </div>
        </div>
      </div>
    );
  }

  const sessionId = handle?.getSessionId();
  if (!sessionId) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-destructive text-sm">
        <div className="font-medium">No PDF session available</div>
      </div>
    );
  }

  if (pageCount === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
        <div className="font-medium">PDF appears to be empty</div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-muted/20 p-4"
      ref={scrollContainerRef}>
      <div className="mx-auto flex flex-col items-center gap-6 max-w-4xl w-full">
        {Array.from({ length: pageCount }, (_, index) => (
          <PageItem
            key={index}
            pageIndex={index}
            sessionId={sessionId}
            index={index}
            pageCount={pageCount}
            invertColors={invertColors}
          />
        ))}
      </div>
    </div>
  );
}
