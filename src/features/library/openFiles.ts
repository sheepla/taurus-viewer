import { toast } from "sonner";
import { log } from "../../shared/log";
import { useTabStore, type DocumentFormat } from "../tabs/TabStore";

export function resolveFormatFromPath(path: string): DocumentFormat | null {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "epub") return "epub";
  if (ext === "pdf") return "pdf";
  return null;
}

/** Payload of a Tauri webview drag-drop event (structural subset). */
export interface DragDropPayload {
  type: "enter" | "over" | "drop" | "leave";
  paths?: string[];
}

export function extractPathsFromDropPayload(payload: DragDropPayload): string[] {
  return payload.type === "drop" ? (payload.paths ?? []) : [];
}

export function filesToPaths(files: Iterable<File>): string[] {
  return Array.from(files, (file) => file.name);
}

/**
 * Opens every supported document path as a new tab. Unsupported types are
 * skipped and reported via a toast so a mixed drop still opens the valid files.
 */
export function openFiles(paths: string[]): void {
  const openTab = useTabStore.getState().openTab;
  let opened = 0;
  for (const path of paths) {
    const format = resolveFormatFromPath(path);
    if (!format) {
      const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
      toast.info(`Unsupported file type: ${name}`);
      continue;
    }
    openTab(path, format);
    opened += 1;
  }
  if (opened > 0) {
    log.info(`[openFiles] opened ${opened} document(s)`);
  }
}