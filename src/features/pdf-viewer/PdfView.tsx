import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabStore } from "../tabs/TabStore";
import { PdfViewerHandle } from "./PdfViewerHandle";

interface PdfViewProps {
  tabId: string;
  filePath: string;
}

export function PdfView({ tabId, filePath }: PdfViewProps) {
  const [handle, setHandle] = useState<PdfViewerHandle | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setTabHandle = useTabStore((s) => s.setHandle);

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
        console.error("Error details:", JSON.stringify(err, null, 2));
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
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Please check:</p>
            <ul className="list-disc list-inside space-y-1 text-left">
              <li>File exists and is accessible</li>
              <li>File is a valid PDF document</li>
              <li>File is not password protected</li>
              <li>File is not corrupted</li>
            </ul>
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
        <div className="text-xs text-muted-foreground">
          PDF viewer initialization completed but no session was created.
        </div>
      </div>
    );
  }

  if (pageCount === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
        <div className="font-medium">PDF appears to be empty</div>
        <div className="text-xs">
          The PDF file has no pages or could not be processed.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-muted/20 p-4">
      <div className="mx-auto flex flex-col items-center gap-6 max-w-4xl w-full">
        {Array.from({ length: pageCount }, (_, index) => (
          <div
            key={index}
            className="flex flex-col items-center rounded bg-background p-2 shadow-sm border border-border"
          >
            <img
              src={`http://taurus-page.localhost/${sessionId}/${index}?w=1200`}
              alt={`Page ${index + 1}`}
              className="max-w-full h-auto object-contain"
              style={{ filter: invertColors ? "invert(1) hue-rotate(180deg)" : "none" }}
              loading="lazy"
              onError={(e) => {
                console.error(`Failed to load page ${index + 1}:`, e);
                (e.target as HTMLImageElement).src = "data:image/svg+xml," + encodeURIComponent(`
                  <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
                    <rect width="100%" height="100%" fill="#f0f0f0"/>
                    <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="Arial" font-size="14" fill="#666">
                      Failed to load page ${index + 1}
                    </text>
                  </svg>
                `);
              }}
            />
            <span className="mt-2 text-muted-foreground text-xs">
              Page {index + 1} of {pageCount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
