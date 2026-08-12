import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTabStore } from "../tabs/TabStore";
import { PdfViewerHandle } from "./PdfViewerHandle";
import type { Config } from "../../shared/bindings";
import { useSearchState } from "../search/searchState";

interface PdfViewProps {
  tabId: string;
  filePath: string;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match = lowerText.indexOf(lowerQuery, cursor);
  while (match >= 0) {
    if (match > cursor) parts.push(text.slice(cursor, match));
    parts.push(
      <mark key={`${match}-${query}`} className="bg-yellow-300/80 text-foreground">
        {text.slice(match, match + query.length)}
      </mark>,
    );
    cursor = match + query.length;
    match = lowerText.indexOf(lowerQuery, cursor);
  }
  if (cursor === 0) return <>{text}</>;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function PageItem({
  sessionId,
  index,
  pageCount,
  invertColors,
  pageIndex,
  searchQuery,
  zoom,
}: {
  sessionId: string;
  index: number;
  pageCount: number;
  invertColors: boolean;
  pageIndex: number;
  searchQuery: string;
  zoom: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const textLayerQuery = useQuery({
    queryKey: ["pdf-text-layer", sessionId, pageIndex],
    queryFn: () => invoke<Array<{ text: string; x: number; y: number; width: number; height: number }>>("pdf_get_text_layer", { sessionId, pageIndex }),
    enabled: isVisible,
    staleTime: Infinity,
  });
  const dimensionsQuery = useQuery({
    queryKey: ["pdf-page-dimensions", sessionId, pageIndex],
    queryFn: () => invoke<{ width: number; height: number }>("pdf_get_page_dimensions", { sessionId, pageIndex }),
    enabled: isVisible,
    staleTime: Infinity,
  });

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
        <div
          className="relative max-w-full"
          style={{ width: `${Math.max(100, zoom * 100)}%` }}
        >
          <img
            src={`http://taurus-page.localhost/${sessionId}/${index}?w=${Math.round(1200 * zoom)}`}
            alt={`Page ${index + 1}`}
            className="block h-auto w-full object-contain"
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
          <div className="pointer-events-none absolute inset-0 select-text" aria-label={`Text layer for page ${index + 1}`}>
            {textLayerQuery.data?.map((run, runIndex) => {
              const dimensions = dimensionsQuery.data;
              if (!dimensions) return null;
              return (
              <span
                key={runIndex}
                className={`pointer-events-auto absolute selection:bg-yellow-300/50 ${searchQuery && run.text.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase()) ? "bg-yellow-300/70 text-foreground" : "text-transparent"}`}
                style={{
                  left: `${(run.x / dimensions.width) * 100}%`,
                  bottom: `${(run.y / dimensions.height) * 100}%`,
                  width: `${(run.width / dimensions.width) * 100}%`,
                  height: `${(run.height / dimensions.height) * 100}%`,
                }}
              >
                <HighlightedText text={run.text} query={searchQuery} />
              </span>
              );
            })}
          </div>
        </div>
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
  const searchQuery = useSearchState((state) => state.query);
  const setTabHandle = useTabStore((s) => s.setHandle);
  const setTabRestored = useTabStore((s) => s.setTabRestored);
  const restoreState = useTabStore(
    (s) => s.tabs.find((t) => t.id === tabId)?.restoreState ?? null,
  );

  const viewerQuery = useQuery({
    queryKey: ["pdf-viewer", tabId, filePath],
    queryFn: async () => {
      const viewerHandle = new PdfViewerHandle(filePath);
      try {
        await viewerHandle.init();
      } catch (error) {
        viewerHandle.dispose();
        throw error;
      }
      return viewerHandle;
    },
    staleTime: Infinity,
    gcTime: 0,
  });

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: () => invoke<Config>("config_load"),
    staleTime: Infinity,
  });

  const handle = viewerQuery.data ?? null;
  const zoom = handle?.getZoom?.() ?? 1;

  useEffect(() => {
    if (!handle) return;
    setTabHandle(tabId, handle);
    if (restoreState) {
      handle.restore(restoreState);
      setTabRestored(tabId);
    }
    return () => handle.dispose();
  }, [handle, tabId, setTabHandle, setTabRestored, restoreState]);

  const scrollContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && handle) {
        handle.attachScrollContainer(el);
      }
    },
    [handle],
  );

  if (viewerQuery.isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
          <div>Loading PDF...</div>
        </div>
      </div>
    );
  }

  if (viewerQuery.isError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-destructive text-sm p-4">
        <div className="text-center max-w-md">
          <div className="font-medium text-lg mb-2">Failed to load PDF</div>
          <div className="text-xs text-muted-foreground mb-4 p-3 bg-muted/20 rounded">
            {viewerQuery.error?.message ?? "Unknown error occurred"}
          </div>
        </div>
      </div>
    );
  }

  const sessionId = handle?.getSessionId();
  const pageCount = handle?.getPageCount() ?? 0;
  const invertColors = configQuery.data?.document.invert_colors ?? false;

  if (!sessionId) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-destructive text-sm">
        <div className="font-medium text-muted-foreground">Loading PDF session...</div>
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
    <div
      className="flex h-full w-full flex-col overflow-y-auto bg-muted/20 p-4"
      ref={scrollContainerRef}
    >
      <div className="mx-auto flex flex-col items-center gap-6 max-w-4xl w-full">
        {Array.from({ length: pageCount }, (_, index) => (
          <PageItem
            key={index}
            pageIndex={index}
            sessionId={sessionId}
            index={index}
            pageCount={pageCount}
            invertColors={invertColors}
            searchQuery={searchQuery}
            zoom={zoom}
          />
        ))}
      </div>
    </div>
  );
}
