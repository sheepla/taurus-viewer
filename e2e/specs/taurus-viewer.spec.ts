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
        invoke: async (cmd: string, args: unknown) => {
          calls.push(cmd);
          if (cmd === "epub_open") return { session_id: "e2e_session_1" };
          if (cmd === "epub_close") return null;
          if (cmd === "plugin:fs|read_file") return Array.from(bytes);
          if (cmd === "pdf_open") {
            return { session_id: "e2e_pdf_session_1", page_count: 12, title: null };
          }
          if (cmd === "pdf_close") return null;
          if (cmd === "pdf_get_page_sizes") {
            return Array.from({ length: 12 }, () => ({ width: 800, height: 1131 }));
          }
          if (cmd === "pdf_get_text_layer") return [];
          if (cmd === "pdf_get_page_highlights") return [];
          if (cmd === "pdf_get_outline") {
            return [
              { title: "Section A", page_index: 0, children: [] },
              { title: "Section B", page_index: 3, children: [] },
              { title: "Section C", page_index: 8, children: [] },
            ];
          }
          if (cmd === "pdf_search") return [];
          if (cmd === "config_load") {
            return {
              schema_version: 1,
              ui: { theme: "system", sidebar_open: true },
              document: {
                default_layout: "scroll",
                default_zoom: null,
                invert_colors: false,
              },
            };
          }
          if (cmd === "palette_search_library") {
            const query = ((args as { query?: string } | null)?.query ?? "").toLowerCase();
            if (query) {
              return Array.from({ length: 40 }, (_, i) => ({
                id: 100 + i,
                folder_id: 1,
                path: `C:/test/test_document_${i + 1}.pdf`,
                format: i % 2 === 0 ? "pdf" : "epub",
                title: `Test Document ${i + 1}`,
                size: 1000 + i,
                mtime: 0,
                status: "ok",
                error_message: null,
                thumbnail_path: null,
                created_at: "",
                updated_at: "",
              }));
            }
            return [
              {
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
              },
              {
                id: 2,
                folder_id: 1,
                path: "C:/testdata/pdf_sample_file.pdf",
                format: "pdf",
                title: "PDF Sample",
                size: 2048,
                mtime: 0,
                status: "ok",
                error_message: null,
                thumbnail_path: null,
                created_at: "",
                updated_at: "",
              },
            ];
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

  async function openPdf() {
    const body = await $("body");
    await body.click();
    await browser.keys(["Control", "k"]);
    const entry = await $('[role="button"]*=PDF Sample');
    await entry.waitForDisplayed({ timeout: 5000 });
    await entry.click();
    await browser.waitUntil(
      async () =>
        (await browser.execute(
          () => document.querySelector('[data-page-index="0"]') !== null,
        )) === true,
      { timeout: 15000, timeoutMsg: "PDF pages were never rendered" },
    );
  }

  async function statusBarText(): Promise<string> {
    return browser.execute(() => {
      const status = document.querySelector('[data-testid="status-bar"]');
      return status?.textContent ?? "";
    });
  }

  async function pdfScrollContainer() {
    return browser.execute(() => {
      const first = document.querySelector('[data-page-index="0"]');
      const container = first?.closest(".overflow-auto") as HTMLElement | null;
      if (container) container.scrollTop = container.scrollHeight;
      return container !== null;
    });
  }

  async function getContainerPosition(): Promise<number> {
    return browser.execute(() => {
      const v = document.querySelector("foliate-view") as any;
      return typeof v?.renderer?.containerPosition === "number"
        ? v.renderer.containerPosition
        : -1;
    });
  }

  async function getSectionIndex(): Promise<number> {
    return browser.execute(() => {
      const v = document.querySelector("foliate-view") as any;
      const index = v?.renderer?.getContents?.()?.[0]?.index;
      return typeof index === "number" ? index : -1;
    });
  }

  async function switchToScrollMode() {
    await browser.keys(["s"]);
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => {
          const v = document.querySelector("foliate-view") as any;
          return v?.renderer?.getAttribute?.("flow") === "scrolled";
        })) === true,
      { timeout: 5000, timeoutMsg: "SCROLL flow was not activated" },
    );
  }

  // The sample EPUB has a single linear section, so append a second one for
  // the SCROLL-mode navigation tests. The shared array is also used by the
  // renderer, and the copied section's `load` closure still fetches real
  // content, so foliate can render it as a separate chapter.
  async function addSecondSection() {
    await browser.execute(() => {
      const v = document.querySelector("foliate-view") as any;
      const section = v.book.sections.find((s: any) => s.linear !== "no");
      v.book.sections.push({ ...section, id: "text/ch001_copy.xhtml" });
    });
  }

  it("should display library view by default when no tabs are open", async () => {
    const heading = await $("h2=Document Library");
    await expect(heading).toBeDisplayed();
  });

  it("should show Home tab icon in tab bar", async () => {
    const homeTab = await $("span=Home");
    await expect(homeTab).toBeDisplayed();
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

  it("should keep the selected candidate in view when navigating the command palette", async () => {
    const body = await $("body");
    await body.click();
    await browser.keys(["Control", "k"]);
    const paletteInput = await $('input[placeholder="Search open tabs or library documents..."]');
    await paletteInput.waitForDisplayed({ timeout: 5000 });
    await paletteInput.setValue("Test");

    const list = await $('[data-testid="palette-list"]');
    await list.waitForExist({ timeout: 5000 });
    await browser.waitUntil(
      async () => (await list.$$('[data-index]')).length >= 40,
      {
        timeout: 5000,
        timeoutMsg: "palette did not render the 40 search candidates",
      },
    );

    const before = (await list.getProperty("scrollTop")) as number;
    for (let i = 0; i < 30; i += 1) {
      await browser.keys(["ArrowDown"]);
    }
    await browser.waitUntil(
      async () => ((await list.getProperty("scrollTop")) as number) > before,
      {
        timeout: 5000,
        timeoutMsg: "palette did not auto-scroll to the selected candidate",
      },
    );
  });

  it("should open and render an EPUB file via command palette", async () => {
    await openEpubFromPalette();
  });

  it("should show the file name (without extension) as the tab title when the EPUB has no metadata title", async () => {
    await openEpubFromPalette();
    const tab = await $('[role="button"]*=epub_sample_file_1MB');
    await expect(tab).toBeDisplayed();
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

  it("should turn the page via overscroll wheel input", async () => {
    await openEpubFromPalette();
    // Move off the first page so a page turn is possible, then wait for the
    // navigation to fully settle (foliate locks page turns for ~100ms).
    await browser.keys(["ArrowRight"]);
    await browser.waitUntil(
      async () => {
        const a = await getFraction();
        await browser.pause(150);
        return (await getFraction()) === a;
      },
      {
        timeout: 10000,
        timeoutMsg: "fraction never settled after ArrowRight",
      },
    );
    const before = await getFraction();

    // Overscroll: accumulated wheel deltas trigger a page turn once the
    // threshold is crossed (works in both SCROLL and PAGES modes).
    await browser.execute(() => {
      const v = document.querySelector("foliate-view") as any;
      for (let i = 0; i < 8; i += 1) {
        v.dispatchEvent(
          new WheelEvent("wheel", { deltaY: 30, bubbles: true, cancelable: true }),
        );
      }
    });

    await browser.waitUntil(
      async () => (await getFraction()) > before,
      {
        timeout: 10000,
        timeoutMsg: "fraction did not advance after overscroll wheel input",
      },
    );
  });

  it("should render each section as one long scrollable page in SCROLL mode", async () => {
    await openEpubFromPalette();
    await switchToScrollMode();
    // The ~1MB sample section is many viewport-heights tall.
    const { viewSize, size } = await browser.execute(() => {
      const v = document.querySelector("foliate-view") as any;
      return { viewSize: v.renderer.viewSize, size: v.renderer.size };
    });
    expect(viewSize).toBeGreaterThan(size * 2);
  });

  it("should scroll within a section with j/k in SCROLL mode", async () => {
    await openEpubFromPalette();
    await switchToScrollMode();
    const before = await getContainerPosition();
    for (let i = 0; i < 12; i += 1) await browser.keys(["j"]);
    await browser.waitUntil(
      async () => (await getContainerPosition()) > before,
      {
        timeout: 5000,
        timeoutMsg: "j key did not scroll within the section",
      },
    );
    const afterDown = await getContainerPosition();
    await browser.keys(["k"]);
    await browser.waitUntil(
      async () => (await getContainerPosition()) < afterDown,
      {
        timeout: 5000,
        timeoutMsg: "k key did not scroll back within the section",
      },
    );
  });

  it("should advance to the next section via overscroll at the section edge in SCROLL mode", async () => {
    await openEpubFromPalette();
    await addSecondSection();
    await switchToScrollMode();
    // Pin the container to the bottom of the section before every wheel event
    // so the boundary detection always sees a blocked scroll position.
    const indexBefore = await getSectionIndex();
    await browser.execute(() => {
      const v = document.querySelector("foliate-view") as any;
      for (let i = 0; i < 40; i += 1) {
        v.renderer.containerPosition = v.renderer.viewSize;
        v.dispatchEvent(
          new WheelEvent("wheel", { deltaY: 30, bubbles: true, cancelable: true }),
        );
      }
    });
    await browser.waitUntil(
      async () => (await getSectionIndex()) > indexBefore,
      {
        timeout: 10000,
        timeoutMsg: "overscroll at the section edge did not advance the section",
      },
    );
  });

  it("should advance to the next chapter with page-turn keys in SCROLL mode", async () => {
    await openEpubFromPalette();
    await addSecondSection();
    await switchToScrollMode();
    const indexBefore = await getSectionIndex();
    await browser.keys(["ArrowRight"]);
    await browser.waitUntil(
      async () => (await getSectionIndex()) > indexBefore,
      {
        timeout: 10000,
        timeoutMsg: "page turn did not advance to the next chapter in SCROLL mode",
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

  it("should close the outline sidebar when pressing t again", async () => {
    await openEpubFromPalette();
    await browser.keys(["t"]);
    await $("aside ul li button").waitForDisplayed({ timeout: 5000 });
    // The outline panel owns focus, so `t` must toggle even from inside it.
    await browser.keys(["t"]);
    await browser.waitUntil(
      async () => !(await $("aside ul li button").isExisting()),
      {
        timeout: 5000,
        timeoutMsg: "outline sidebar did not close after pressing t again",
      },
    );
  });

  it("should open and close the bookmarks sidebar with B", async () => {
    await openEpubFromPalette();
    await browser.keys(["Shift", "b"]);
    const toggleBtn = await $("button*=Toggle current page");
    await toggleBtn.waitForDisplayed({ timeout: 5000 });
    await browser.keys(["Shift", "b"]);
    await browser.waitUntil(
      async () => !(await toggleBtn.isExisting()),
      {
        timeout: 5000,
        timeoutMsg: "bookmarks sidebar did not close after pressing B again",
      },
    );
  });

  it("should keep the outline selection following the reading position", async () => {
    await openEpubFromPalette();

    // Give the outline a small, known TOC so the follow target is deterministic.
    await browser.execute(() => {
      const v = document.querySelector("foliate-view") as any;
      v.book = {
        ...v.book,
        toc: [
          { label: "Section A", href: "a.xhtml" },
          { label: "Section B", href: "b.xhtml" },
          { label: "Section C", href: "c.xhtml" },
        ],
      };
    });

    await browser.keys(["t"]);
    await $("aside ul li button").waitForDisplayed({ timeout: 5000 });

    // The current position is reflected on the outline as soon as it opens.
    await expect($('[data-selected="true"]')).toBeDisplayed();

    // Move to another section (a real relocate event, as fired by page turns)
    // and verify the outline follows to the matching entry.
    await browser.execute(() => {
      const v = document.querySelector("foliate-view") as any;
      v.lastLocation = {
        ...v.lastLocation,
        tocItem: { label: "Section C", href: "c.xhtml" },
      };
      v.dispatchEvent(new CustomEvent("relocate"));
    });

    await browser.waitUntil(
      async () => (await $('[data-selected="true"]').getText()) === "Section C",
      {
        timeout: 10000,
        timeoutMsg: "outline did not follow the reading position",
      },
    );
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

  it("should turn pages with j/k in EPUB PAGES mode", async () => {
    await openEpubFromPalette();
    const before = await getFraction();
    await browser.keys(["j"]);
    await browser.waitUntil(
      async () => (await getFraction()) > before,
      {
        timeout: 10000,
        timeoutMsg: "j did not turn the page forward in PAGES mode",
      },
    );
    // foliate locks page turns for ~100ms, so wait for the navigation to
    // settle before pressing k.
    await browser.waitUntil(
      async () => {
        const a = await getFraction();
        await browser.pause(150);
        return (await getFraction()) === a;
      },
      {
        timeout: 10000,
        timeoutMsg: "fraction never settled after j",
      },
    );
    const afterJ = await getFraction();
    await browser.keys(["k"]);
    await browser.waitUntil(
      async () => (await getFraction()) < afterJ,
      {
        timeout: 10000,
        timeoutMsg: "k did not turn the page back in PAGES mode",
      },
    );
  });

  it("should open a PDF and render pages in SCROLL mode", async () => {
    await openPdf();
    await expect($('[data-testid="status-bar"]')).toHaveText(/Page 1 \/ 12/);
    await expect($('[data-page-index="0"]')).toBeDisplayed();
  });

  it("should render pages beyond the initial window after scrolling", async () => {
    await openPdf();
    await browser.waitUntil(
      async () => (await pdfScrollContainer()) === true,
      { timeout: 5000, timeoutMsg: "PDF scroll container was not found" },
    );
    await browser.waitUntil(
      async () =>
        (await browser.execute(
          () => document.querySelector('[data-page-index="11"]') !== null,
        )) === true,
      {
        timeout: 10000,
        timeoutMsg: "last page was never mounted after scrolling",
      },
    );
  });

  it("should switch to PAGES mode with s and turn pages with l/h", async () => {
    await openPdf();
    await browser.keys(["s"]);
    await browser.waitUntil(
      async () => (await statusBarText()).includes("pages"),
      { timeout: 5000, timeoutMsg: "s did not switch to PAGES mode" },
    );
    await browser.keys(["l"]);
    await browser.waitUntil(
      async () => (await statusBarText()).includes("Page 2 / 12"),
      {
        timeout: 10000,
        timeoutMsg: "PAGES-mode l did not advance the page",
      },
    );
    await browser.keys(["h"]);
    await browser.waitUntil(
      async () => (await statusBarText()).includes("Page 1 / 12"),
      {
        timeout: 10000,
        timeoutMsg: "PAGES-mode h did not go back a page",
      },
    );
  });

  it("should turn pages with j/k in PDF PAGES mode", async () => {
    await openPdf();
    await browser.keys(["s"]);
    await browser.waitUntil(
      async () => (await statusBarText()).includes("pages"),
      { timeout: 5000, timeoutMsg: "s did not switch to PAGES mode" },
    );
    await browser.keys(["j"]);
    await browser.waitUntil(
      async () => (await statusBarText()).includes("Page 2 / 12"),
      {
        timeout: 10000,
        timeoutMsg: "PAGES-mode j did not advance the page",
      },
    );
    await browser.keys(["k"]);
    await browser.waitUntil(
      async () => (await statusBarText()).includes("Page 1 / 12"),
      {
        timeout: 10000,
        timeoutMsg: "PAGES-mode k did not go back a page",
      },
    );
  });
});
