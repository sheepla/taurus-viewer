import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EPUB_PATH = "C:/testdata/epub_sample_file_1MB.epub";
const epubBase64 = readFileSync(
  resolve(process.cwd(), "testdata/epub_sample_file_1MB.epub")
).toString("base64");

describe("Isolate EPUB E2E", () => {
  beforeEach(async () => {
    await browser.url("/");
    await browser.pause(500);
  });

  it("clone of test 6", async () => {
    await browser.execute((b64, epubPath) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const calls: string[] = [];
      const errors: string[] = [];
      (window as any).__mockCalls = calls;
      (window as any).__mockErrors = errors;
      const origConsoleError = console.error;
      const origConsoleLog = console.log;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
        origConsoleError(...args);
      };
      console.log = (...args: unknown[]) => {
        errors.push("[log] " + args.map(String).join(" "));
        origConsoleLog(...args);
      };
      window.addEventListener("error", (e) => errors.push("window.onerror: " + e.message));
      (window as any).__TAURI_INTERNALS__.invoke = async (cmd: string, _args: unknown) => {
        calls.push(cmd);
        if (cmd === "epub_open") return { session_id: "e2e_session_1" };
        if (cmd === "epub_close") return null;
        if (cmd === "plugin:fs|read_file") return Array.from(bytes);
        if (cmd === "palette_search_library") {
          return [{
            id: 1, folder_id: 1, path: epubPath, format: "epub",
            title: "EPUB Sample", size: 8538, mtime: 0, status: "ok",
            error_message: null, thumbnail_path: null, created_at: "", updated_at: "",
          }];
        }
        if (cmd === "library_list_folders") return [];
        if (cmd === "library_list_entries") return [];
        return null;
      };
    }, epubBase64, EPUB_PATH);

    const body = await $("body");
    await body.click();
    await browser.pause(200);
    let calls = await browser.execute(() => (window as any).__mockCalls ?? []);
    console.log("ISOLATE CALLS AFTER CLICK:", JSON.stringify(calls));
    await browser.keys(["Control", "p"]);
    await browser.pause(200);
    calls = await browser.execute(() => (window as any).__mockCalls ?? []);
    console.log("ISOLATE CALLS AFTER PALETTE:", JSON.stringify(calls));
    await browser.pause(800);
    calls = await browser.execute(() => (window as any).__mockCalls ?? []);
    console.log("ISOLATE CALLS AFTER WAIT:", JSON.stringify(calls));
    const qs = await browser.execute(() => {
      const qc = (window as any).__queryClient;
      if (!qc) return { error: "no queryClient" };
      const q = qc.getQueryState(["palette-search", ""]);
      return {
        state: q ? { status: q.status, dataLength: q.data?.length, fetchStatus: q.fetchStatus, error: q.error ? String(q.error) : null } : null,
        cacheKeys: qc.getQueryCache().getAll().map((x: any) => x.queryKey),
      };
    });
    console.log("ISOLATE QUERY STATE:", JSON.stringify(qs));
    const paletteBody = await browser.execute(() => {
      const dlg = document.querySelector("[role='dialog']");
      return dlg ? dlg.textContent : "NO DIALOG";
    });
    console.log("ISOLATE PALETTE:", JSON.stringify(paletteBody));
    const probe = await browser.execute(() => {
      const dialogs = Array.from(document.querySelectorAll("[role='dialog']"));
      const allBodyText = document.body.innerText ?? "";
      return {
        dialogCount: dialogs.length,
        dialogs: dialogs.map((d) => d.textContent),
        hasEpubSample: allBodyText.includes("EPUB Sample"),
        hasLibraryHeader: allBodyText.includes("Library Documents"),
        hasNoMatch: allBodyText.includes("No matching"),
        bodySnippet: allBodyText.slice(0, 500),
      };
    });
    console.log("ISOLATE PROBE:", JSON.stringify(probe, null, 2));

    const entry = await $('[role="button"]*=EPUB Sample');
    await entry.waitForDisplayed({ timeout: 5000 });
    await entry.click();
    await browser.pause(3000);
    const afterClick = await browser.execute(() => {
      const main = document.querySelector("main") ?? document.body;
      const viewerText = (document.querySelector("foliate-view")?.outerHTML) ?? "NO FOLIATE-VIEW";
      return {
        calls: (window as any).__mockCalls ?? [],
        errors: (window as any).__mockErrors ?? [],
        viewerText,
        mainSnippet: (main.innerText ?? "").slice(0, 400),
        foliateCount: document.querySelectorAll("foliate-view").length,
      };
    });
    console.log("ISOLATE AFTER CLICK:", JSON.stringify(afterClick, null, 2));
    const viewer = await $("foliate-view");
    await viewer.waitForExist({ timeout: 15000 });
    await expect(viewer).toBeDisplayed();
  });
});
