import { useEffect, useState, type DragEvent } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useNavigate } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import { log } from "../../shared/log";
import {
  extractPathsFromDropPayload,
  filesToPaths,
  openFiles,
} from "./openFiles";

function hasNativeDragDrop(): boolean {
  // `getCurrentWebview()` requires the real `__TAURI_INTERNALS__.metadata`
  // injected by the Tauri runtime. It is absent in the browser/e2e IPC mocks,
  // where the HTML5 drop handlers must be used instead.
  return (
    typeof window !== "undefined" &&
    (window as unknown as {
      __TAURI_INTERNALS__?: { metadata?: { currentWebview?: unknown } };
    }).__TAURI_INTERNALS__?.metadata?.currentWebview != null
  );
}

/**
 * Drop zone shown at the top of the Home screen. Clicking it opens the file
 * manager; dropping PDF/EPUB files on it (or anywhere on the Home screen)
 * opens them directly. Native Tauri provides real file paths via the webview
 * drag-drop event, while browsers fall back to HTML5 drop with file names.
 */
export function DropZone() {
  const navigate = useNavigate();
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!hasNativeDragDrop()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setDragActive(true);
          return;
        }
        if (payload.type === "leave") {
          setDragActive(false);
          return;
        }
        setDragActive(false);
        const paths = extractPathsFromDropPayload(payload);
        if (paths.length > 0) {
          log.debug(`[DropZone] native drop: ${paths.join(", ")}`);
          openFiles(paths);
          navigate({ to: "/" });
        }
      })
      .then((unlistenFn) => {
        if (cancelled) unlistenFn();
        else unlisten = unlistenFn;
      })
      .catch((err) =>
        log.warn("[DropZone] failed to register drag-drop listener:", err),
      );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [navigate]);

  async function handleClick() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: true,
      filters: [{ name: "Documents", extensions: ["pdf", "epub"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length > 0) {
      log.debug(`[DropZone] dialog: ${paths.join(", ")}`);
      openFiles(paths);
      navigate({ to: "/" });
    }
  }

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setDragActive(false);
    // Native Tauri routes file drops through onDragDropEvent, so only the
    // browser fallback (dev / e2e) processes the HTML5 drop here.
    if (hasNativeDragDrop()) return;
    const paths = filesToPaths(e.dataTransfer.files);
    if (paths.length > 0) {
      log.debug(`[DropZone] html5 drop: ${paths.join(", ")}`);
      openFiles(paths);
      navigate({ to: "/" });
    }
  }

  return (
    <button
      type="button"
      data-drop-zone
      onClick={() => void handleClick()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={[
        "flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-sm transition-colors",
        dragActive
          ? "border-primary bg-accent text-primary"
          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/60 hover:bg-accent/50",
      ].join(" ")}
    >
      <FileUp size={22} />
      <span className="font-medium">Drop PDF or EPUB files here</span>
      <span className="text-xs opacity-80">or click to browse</span>
    </button>
  );
}