import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { log } from "../../shared/log";
import { useTabStore } from "../tabs/TabStore";
import { PdfViewerHandle } from "./PdfViewerHandle";
import { fitSpreadScale, spreadRowLeft } from "./pdfLayout";
import { OverscrollIndicator } from "../../components/OverscrollIndicator";
import type { Config, PageDimensions } from "../../shared/bindings";
import type { OverscrollFeedback } from "../../shared/overscroll";
import type { ColumnCount, ViewMode } from "../../shared/types";
import { useSearchState } from "../search/searchState";
import { pdfPageUrl } from "../../shared/customProtocolUrl";

interface PdfViewProps {
  tabId: string;
  filePath: string;
}

/** Extra scroll distance kept mounted ahead of / behind the viewport. */
const WINDOW_BEFORE_PX = 800;
const WINDOW_AFTER_PX = 1600;
/** Vertical space between page rows (spreads). */
const SPREAD_GAP_PX = 48;
/** Horizontal gap between the two pages of a 2-column spread. */
const SPREAD_INNER_GAP_PX = 24;
/** Horizontal padding kept on each side of the scroll container. */
const SPREAD_OUTER_MARGIN_PX = 16;

interface LayoutPage {
  pageIndex: number;
  pdfWidth: number;
  pdfHeight: number;
  displayWidth: number;
  displayHeight: number;
}

interface SpreadLayout {
  pages: LayoutPage[];
  offset: number;
  height: number;
}

function clampDisplayWidth(nativeWidth: number): number {
  return Math.min(1200, Math.max(400, nativeWidth));
}

function PageItem({
  sessionId,
  page,
  pageCount,
  invertColors,
  searchQuery,
  dpr,
}: {
  sessionId: string;
  page: LayoutPage;
  pageCount: number;
  invertColors: boolean;
  searchQuery: string;
  dpr: number;
}) {
  const { pageIndex, pdfWidth, pdfHeight, displayWidth, displayHeight } = page;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const targetWidth = Math.round(displayWidth * dpr);

  const textLayerQuery = useQuery({
    queryKey: ["pdf-text-layer", sessionId, pageIndex],
    queryFn: () =>
      invoke<Array<{ text: string; x: number; y: number; width: number; height: number }>>(
        "pdf_get_text_layer",
        { sessionId, pageIndex },
      ),
    staleTime: Infinity,
  });

  const highlightsQuery = useQuery({
    queryKey: ["pdf-highlights", sessionId, pageIndex, searchQuery],
    queryFn: () =>
      invoke<Array<{ x: number; y: number; width: number; height: number }>>(
        "pdf_get_page_highlights",
        { sessionId, pageIndex, query: searchQuery },
      ),
    enabled: Boolean(searchQuery && searchQuery.trim()),
    staleTime: Infinity,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const highlights = highlightsQuery.data;
    if (!highlights || pdfWidth === 0 || pdfHeight === 0) return;

    const scale = canvas.width / pdfWidth;
    ctx.fillStyle = "rgba(250, 204, 21, 0.4)";
    for (const rect of highlights) {
      const x = rect.x * scale;
      const w = rect.width * scale;
      const h = rect.height * scale;
      const y = (pdfHeight - (rect.y + rect.height)) * scale;
      ctx.fillRect(x, y, w, h);
    }
  }, [highlightsQuery.data, pdfWidth, pdfHeight, displayWidth, displayHeight, dpr]);

  return (
    <div data-page-index={pageIndex} className="flex flex-col items-center">
      <div
        className="relative max-w-none bg-background shadow-none"
        style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
      >
        {!imageLoaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted text-muted-foreground text-xs">
            Page {pageIndex + 1} of {pageCount}
          </div>
        )}
        <img
          src={pdfPageUrl(sessionId, pageIndex, targetWidth)}
          alt={`Page ${pageIndex + 1}`}
          className="block h-auto w-full object-contain"
          style={{ filter: invertColors ? "invert(1) hue-rotate(180deg)" : "none" }}
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
            log.error(`Failed to load page ${pageIndex + 1}:`, e);
            (e.target as HTMLImageElement).src =
              "data:image/svg+xml," +
              encodeURIComponent(`
                  <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
                    <rect width="100%" height="100%" fill="#f0f0f0"/>
                    <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="Arial" font-size="14" fill="#666">
                      Failed to load page ${pageIndex + 1}
                    </text>
                  </svg>
                `);
          }}
        />
        <canvas
          ref={canvasRef}
          width={Math.round(displayWidth * dpr)}
          height={Math.round(displayHeight * dpr)}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
        <div
          className="pointer-events-none absolute inset-0 select-text"
          aria-label={`Text layer for page ${pageIndex + 1}`}
        >
          {textLayerQuery.data?.map((run, runIndex) => (
            <span
              key={runIndex}
              className="pointer-events-auto absolute text-transparent selection:bg-yellow-300/50"
              style={{
                left: `${(run.x / pdfWidth) * 100}%`,
                bottom: `${(run.y / pdfHeight) * 100}%`,
                width: `${(run.width / pdfWidth) * 100}%`,
                height: `${(run.height / pdfHeight) * 100}%`,
              }}
            >
              {run.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PdfView({ tabId, filePath }: PdfViewProps) {
  const searchQuery = useSearchState((state) => state.query);
  const setTabHandle = useTabStore((s) => s.setHandle);
  const setTabTitle = useTabStore((s) => s.setTabTitle);
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
  const [zoom, setZoomState] = useState<number>(() => handle?.getZoom?.() ?? 1.0);
  const [columns, setColumnsState] = useState<ColumnCount>(() => handle?.getColumns?.() ?? 1);
  const [viewMode, setViewMode] = useState<ViewMode>(() => handle?.getViewMode?.() ?? "scroll");
  const [currentPage, setCurrentPage] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [overscroll, setOverscroll] = useState<OverscrollFeedback>({
    active: false,
    direction: "next",
    progress: 0,
    slow: false,
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dpr = useMemo(() => window.devicePixelRatio || 1, []);

  useEffect(() => {
    if (!handle) return;
    setZoomState(handle.getZoom?.() ?? 1.0);
    setColumnsState(handle.getColumns?.() ?? 1);
    setViewMode(handle.getViewMode?.() ?? "scroll");
    const unsubscribeZoom = handle.onZoomChange?.((z) => setZoomState(z));
    const unsubscribeColumns = handle.onColumnsChange?.((c) => setColumnsState(c));
    const unsubscribeViewMode = handle.onViewModeChange?.((m) => setViewMode(m));
    const unsubscribePosition = handle.onPositionChange((pos) => {
      if (pos.format === "pdf") setCurrentPage(pos.pageIndex);
    });
    const unsubscribeOverscroll = handle.onOverscrollChange?.(setOverscroll);
    return () => {
      unsubscribeZoom?.();
      unsubscribeColumns?.();
      unsubscribeViewMode?.();
      unsubscribePosition();
      unsubscribeOverscroll?.();
    };
  }, [handle]);

  useEffect(() => {
    if (!handle) return;
    setTabHandle(tabId, handle);
    const metadataTitle = handle.getTitle();
    if (metadataTitle) setTabTitle(tabId, metadataTitle);
    if (restoreState) {
      handle.restore(restoreState);
      setTabRestored(tabId);
    }
    return () => handle.dispose();
  }, [handle, tabId, setTabHandle, setTabTitle, setTabRestored, restoreState]);

  const sessionId = handle?.getSessionId();
  const pageCount = handle?.getPageCount() ?? 0;

  const pageSizesQuery = useQuery({
    queryKey: ["pdf-page-sizes", sessionId],
    queryFn: () => invoke<PageDimensions[]>("pdf_get_page_sizes", { sessionId }),
    enabled: Boolean(sessionId),
    staleTime: Infinity,
  });

  const scrollContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && handle) {
        handle.attachScrollContainer(el);
      }
      containerRef.current = el;
      if (el) {
        setViewportHeight(el.clientHeight);
        setViewportWidth(el.clientWidth);
      }
    },
    [handle],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
      setViewportWidth(el.clientWidth);
    });
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [handle]);

  const spreads = useMemo<SpreadLayout[]>(() => {
    const sizes = pageSizesQuery.data;
    if (!sizes || sizes.length === 0 || pageCount === 0) return [];

    const availableWidth = Math.max(
      1,
      viewportWidth - SPREAD_OUTER_MARGIN_PX * 2,
    );

    const layoutPage = (pageIndex: number): LayoutPage => {
      const size = sizes[pageIndex];
      const nativeWidth = size?.width ?? 800;
      const nativeHeight = size?.height ?? (nativeWidth * 1.414);
      const displayWidth = clampDisplayWidth(nativeWidth) * zoom;
      const displayHeight = (nativeWidth > 0 ? displayWidth * (nativeHeight / nativeWidth) : displayWidth * 1.414);
      return { pageIndex, pdfWidth: nativeWidth, pdfHeight: nativeHeight, displayWidth, displayHeight };
    };

    const grouped: number[][] = [];
    if (columns === 2) {
      for (let i = 0; i < pageCount; i += 2) {
        grouped.push(i + 1 < pageCount ? [i, i + 1] : [i]);
      }
    } else {
      for (let i = 0; i < pageCount; i++) grouped.push([i]);
    }

    let offset = 0;
    return grouped.map((group) => {
      const pages = group.map(layoutPage);
      const rowWidth =
        pages.reduce((sum, p) => sum + p.displayWidth, 0) +
        (pages.length - 1) * SPREAD_INNER_GAP_PX;
      const scale = fitSpreadScale(zoom, rowWidth, availableWidth);
      const scaled = pages.map((p) => ({
        ...p,
        displayWidth: p.displayWidth * scale,
        displayHeight: p.displayHeight * scale,
      }));
      const height = Math.max(...scaled.map((p) => p.displayHeight));
      const spread = { pages: scaled, offset, height };
      offset += height + SPREAD_GAP_PX;
      return spread;
    });
  }, [pageSizesQuery.data, pageCount, zoom, columns, viewportWidth]);

  useEffect(() => {
    if (!handle) return;
    const resolver = (index: number): number | null => {
      const spread = spreads.find((s) => s.pages.some((p) => p.pageIndex === index));
      return spread ? spread.offset : null;
    };
    handle.setScrollTargetResolver(resolver);
    return () => handle.setScrollTargetResolver(null);
  }, [handle, spreads]);

  const totalHeight = spreads.length > 0 ? spreads[spreads.length - 1].offset + spreads[spreads.length - 1].height : 0;

  const windowStart = scrollTop - WINDOW_BEFORE_PX;
  const windowEnd = scrollTop + viewportHeight + WINDOW_AFTER_PX;

  const visibleSpreads = useMemo(() => {
    if (spreads.length === 0) return [];
    let first = spreads.findIndex((s) => s.offset + s.height >= windowStart);
    if (first === -1) first = spreads.length;
    let last = spreads.findIndex((s) => s.offset > windowEnd);
    if (last === -1) last = spreads.length;
    return spreads.slice(Math.max(0, first), last);
  }, [spreads, windowStart, windowEnd]);

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

  const invertColors = configQuery.data?.document.invert_colors ?? false;

  if (viewMode === "pages") {
    const spread =
      spreads.find((s) => s.pages.some((p) => p.pageIndex === currentPage)) ??
      spreads[0] ??
      null;
    const spreadWidth = spread
      ? spread.pages.reduce((sum, p) => sum + p.displayWidth, 0) +
        (spread.pages.length - 1) * SPREAD_INNER_GAP_PX
      : 0;
    const spreadHeight = spread
      ? Math.max(...spread.pages.map((p) => p.displayHeight))
      : 0;
    const availableWidth = Math.max(1, viewportWidth - 32);
    const availableHeight = Math.max(1, viewportHeight - 32);
    const fitScale = spread
      ? Math.min(1, availableWidth / spreadWidth, availableHeight / spreadHeight)
      : 1;

    return (
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-muted/20 p-4"
        ref={scrollContainerRef}
      >
        {pageSizesQuery.isLoading || !spread ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
              <div>Loading PDF...</div>
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div
              className="flex"
              style={{
                width: `${spreadWidth}px`,
                height: `${spreadHeight}px`,
                gap: SPREAD_INNER_GAP_PX,
                transform: `scale(${fitScale})`,
              }}
            >
              {spread.pages.map((page) => (
                <PageItem
                  key={page.pageIndex}
                  sessionId={sessionId}
                  page={page}
                  pageCount={pageCount}
                  invertColors={invertColors}
                  searchQuery={searchQuery}
                  dpr={dpr}
                />
              ))}
            </div>
          </div>
        )}
        <OverscrollIndicator feedback={overscroll} />
      </div>
    );
  }

  return (
    <div
      className="document-scroll flex h-full w-full flex-col overflow-auto bg-muted/20 p-4"
      ref={scrollContainerRef}
    >
      {pageSizesQuery.isLoading || spreads.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
            <div>Loading PDF...</div>
          </div>
        </div>
      ) : (
        <div className="relative w-full shrink-0" style={{ height: `${totalHeight}px` }}>
          {visibleSpreads.map((spread) => {
            const rowWidth =
              spread.pages.reduce((sum, p) => sum + p.displayWidth, 0) +
              (spread.pages.length - 1) * SPREAD_INNER_GAP_PX;
            const contentWidth = Math.max(
              1,
              viewportWidth - SPREAD_OUTER_MARGIN_PX * 2,
            );
            return (
              <div
                key={spread.pages.map((p) => p.pageIndex).join("-")}
                className="absolute flex"
                style={{
                  top: `${spread.offset}px`,
                  left: `${spreadRowLeft(rowWidth, contentWidth)}px`,
                  gap: SPREAD_INNER_GAP_PX,
                }}
              >
                {spread.pages.map((page) => (
                  <PageItem
                    key={page.pageIndex}
                    sessionId={sessionId}
                    page={page}
                    pageCount={pageCount}
                    invertColors={invertColors}
                    searchQuery={searchQuery}
                    dpr={dpr}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
      <OverscrollIndicator feedback={overscroll} />
    </div>
  );
}
