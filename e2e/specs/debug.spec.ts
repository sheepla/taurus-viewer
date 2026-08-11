import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const epubBase64 = readFileSync(
  resolve(process.cwd(), "testdata/epub_sample_file_1MB.epub")
).toString("base64");

describe("Debug nav reload", () => {
  it("check if url() reload resets state", async () => {
    await browser.url("/");
    await browser.pause(300);
    await browser.execute(() => {
      (window as any).__marker = Date.now();
      localStorage.setItem("__marker", String(Date.now()));
    });
    const before = await browser.execute(() => (window as any).__marker);

    await browser.url("/");
    await browser.pause(300);
    const after = await browser.execute(() => {
      return { marker: (window as any).__marker ?? null, ls: localStorage.getItem("__marker") };
    });
    console.log("MARKER BEFORE:", before);
    console.log("MARKER AFTER RELOAD:", JSON.stringify(after));
  });

  it("simulate test6 sequence: mock+click+palette", async () => {
    await browser.execute((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const calls: string[] = [];
      (window as any).__mockCalls = calls;
      (window as any).__TAURI_INTERNALS__.invoke = async (cmd: string, _args: unknown) => {
        calls.push(cmd);
        if (cmd === "epub_open") return { session_id: "e2e_session_1" };
        if (cmd === "epub_close") return null;
        if (cmd === "plugin:fs|read_file") return Array.from(bytes);
        if (cmd === "palette_search_library") {
          return [{
            id: 1, folder_id: 1, path: "C:/testdata/epub_sample_file_1MB.epub",
            format: "epub", title: "EPUB Sample", size: 8538, mtime: 0,
            status: "ok", error_message: null, thumbnail_path: null,
            created_at: "", updated_at: "",
          }];
        }
        if (cmd === "library_list_folders") return [];
        if (cmd === "library_list_entries") return [];
        return null;
      };
    }, epubBase64);
    const body = await $("body");
    await body.click();
    await browser.pause(200);
    await browser.keys(["Control", "p"]);
    await browser.pause(600);
    const calls = await browser.execute(() => (window as any).__mockCalls ?? []);
    console.log("CALLS:", JSON.stringify(calls));
    const paletteBody = await browser.execute(() => {
      const dlg = document.querySelector("[role='dialog']");
      return dlg ? dlg.textContent : "NO DIALOG";
    });
    console.log("PALETTE:", JSON.stringify(paletteBody));
  });
});
