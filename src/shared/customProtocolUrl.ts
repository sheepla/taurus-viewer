import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Builds a URL for a Tauri custom protocol without hard-coding its
 * platform-specific origin. Tauri uses `<scheme>://localhost` on Linux/macOS
 * and `http://<scheme>.localhost` on Windows/Android.
 */
export function pdfPageUrl(sessionId: string, pageIndex: number, width: number): string {
  const sessionUrl = convertFileSrc(sessionId, "taurus-page");
  return `${sessionUrl}/${encodeURIComponent(pageIndex)}?w=${encodeURIComponent(width)}`;
}

export function thumbnailUrl(entryId: number): string {
  return convertFileSrc(String(entryId), "taurus-thumb");
}
