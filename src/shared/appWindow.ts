import { invoke } from "@tauri-apps/api/core";

/**
 * Closes the main Tauri window, which exits the app. The bare JS
 * `window.close()` only darkens the WebView without closing the window, so it
 * is used only as a fallback when the window plugin is unavailable (e.g. in a
 * plain browser).
 */
export function closeAppWindow(): void {
  invoke("plugin:window|close").catch(() => {
    window.close();
  });
}