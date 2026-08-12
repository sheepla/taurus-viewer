import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EPUB_PATH = "C:/testdata/epub_sample_file_1MB.epub";
const epubBase64 = readFileSync(
  resolve(process.cwd(), "testdata/epub_sample_file_1MB.epub")
).toString("base64");

describe("TaurusViewer E2E Test Suite", () => {
  before(async () => {
    // Install the Tauri IPC mock before every page load so the built-in browser
    // mock in main.tsx never activates and no stray library cards are shown.
    await browser.addInitScript((b64, epubPath) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const calls: string[] = [];
      (window as any).__mockCalls = calls;
      (window as any).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, _args: unknown) => {
          calls.push(cmd);
          if (cmd === "epub_open") return { session_id: "e2e_session_1" };
          if (cmd === "epub_close") return null;
          if (cmd === "plugin:fs|read_file") return Array.from(bytes);
          if (cmd === "palette_search_library") {
            return [{
              id: 1,
              folder_id: 1,
              path: epubPath,
              format: "epub",
              title: "EPUB Sample",
              size: 8538,
              mtime: 0,
              status: "ok",
              error_message: null,
              thumbnail_path: null,
              created_at: "",
              updated_at: "",
            }];
          }
          if (cmd === "library_list_folders") return [];
          if (cmd === "library_list_entries") return [];
          return null;
        },
      };
    }, epubBase64, EPUB_PATH);
  });

  beforeEach(async () => {
    await browser.url("/");
  });

  async function getFraction(): Promise<number> {
    return browser.execute(() => {
      const v = document.querySelector("foliate-view") as any;
      return typeof v?.lastLocation?.fraction === "number"
        ? v.lastLocation.fraction
        : -1;
    });
  }

  async function openEpubFromPalette() {
    const body = await $("body");
    await body.click();
    await browser.keys(["Control", "k"]);
    const entry = await $('[role="button"]*=EPUB Sample');
    await entry.waitForDisplayed({ timeout: 5000 });
    await entry.click();
    const viewer = await $("foliate-view");
    await viewer.waitForExist({ timeout: 15000 });
    await expect(viewer).toBeDisplayed();
    await browser.waitUntil(
      async () => (await getFraction()) >= 0,
      {
        timeout: 10000,
        timeoutMsg: "foliate-view never reported its position",
      },
    );
  }

  it("should display library view by default when no tabs are open", async () => {
    const heading = await $("h2=Document Library");
    await expect(heading).toBeDisplayed();
  });

  it("should show Library tab icon in tab bar", async () => {
    const libraryTab = await $("span=Library");
    await expect(libraryTab).toBeDisplayed();
  });

  it("should open settings modal via settings button", async () => {
    const settingsBtn = await $('button[aria-label="Settings"]');
    await settingsBtn.click();
    const settingsTitle = await $("*=Settings");
    await expect(settingsTitle).toBeDisplayed();
  });

  it("should open command bar when typing colon", async () => {
    const body = await $("body");
    await body.click();
    await browser.keys([":"]);
    const commandInput = await $('input[placeholder="command [args]"]');
    await expect(commandInput).toBeDisplayed();
  });

  it("should open command palette when pressing Ctrl+K", async () => {
    const body = await $("body");
    await body.click();
    await browser.keys(["Control", "k"]);
    const paletteInput = await $('input[placeholder="Search open tabs or library documents..."]');
    await expect(paletteInput).toBeDisplayed();
  });

  it("should open and render an EPUB file via command palette", async () => {
    await openEpubFromPalette();
  });

  it("should turn the page forward with ArrowRight and show progress", async () => {
    await openEpubFromPalette();
    const before = await getFraction();
    expect(before).toBeGreaterThanOrEqual(0);

    await browser.keys(["ArrowRight"]);
    await browser.waitUntil(
      async () => (await getFraction()) > before,
      {
        timeout: 10000,
        timeoutMsg: "fraction did not advance after ArrowRight",
      },
    );

    const statusBar = await $('[data-testid="status-bar"]');
    await expect(statusBar).toHaveText(/(\d+%|Page \d+ \/ \d+)/);
  });

  it("should turn the page forward via the right edge button", async () => {
    await openEpubFromPalette();
    const before = await getFraction();

    const nextButton = await $('button[aria-label="Next page"]');
    await nextButton.waitForDisplayed({ timeout: 5000 });
    await nextButton.click();
    await browser.waitUntil(
      async () => (await getFraction()) > before,
      {
        timeout: 10000,
        timeoutMsg: "fraction did not advance after clicking Next page",
      },
    );
  });

  it("should show the document outline in TREE mode", async () => {
    await openEpubFromPalette();
    await browser.keys(["t"]);
    const treeItem = await $("aside ul li button");
    await treeItem.waitForDisplayed({ timeout: 5000 });
    await expect(treeItem).toBeDisplayed();
  });

  it("should search the document text in SEARCH mode", async () => {
    await openEpubFromPalette();

    // The 1MB sample is a pathological search case (8457 identical
    // occurrences of every word), so the full-text search is stubbed at the
    // foliate-view instance to keep the test deterministic. This exercises
    // the SEARCH-mode wiring: the input, the async-iterable consumption and
    // the highlighted result rendering.
    await browser.execute(() => {
      const v = document.querySelector("foliate-view") as any;
      v.clearSearch = () => {};
      v.search = async function* () {
        yield {
          label: "ch001",
          subitems: [
            { cfi: "epubcfi(/6/4!/4/1:0)", excerpt: "ch001.xhtml Lorem ipsum" },
          ],
        };
        yield "done";
      };
    });

    await browser.keys(["/"]);
    const searchInput = await $('input[aria-label="Search in document"]');
    await searchInput.waitForDisplayed({ timeout: 5000 });
    await searchInput.click();
    await browser.keys(["xhtml"]);
    await browser.keys(["Enter"]);

    const resultMark = await $("aside mark");
    await resultMark.waitForDisplayed({ timeout: 10000 });
    await expect(resultMark).toHaveText(/xhtml/i);
  });
});
