import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfViewerHandle } from "./PdfViewerHandle";
import type { DocumentPosition } from "../../shared/types";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-log", () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

async function makeHandle(pageCount = 5): Promise<PdfViewerHandle> {
  invokeMock.mockResolvedValue({
    session_id: "test-session",
    page_count: pageCount,
    title: null,
  });
  const handle = new PdfViewerHandle("/tmp/doc.pdf");
  await handle.init();
  return handle;
}

describe("PdfViewerHandle", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("turns pages from vertical scroll keys in PAGES mode", async () => {
    const handle = await makeHandle();
    handle.setViewMode("pages");
    const positions: DocumentPosition[] = [];
    handle.onPositionChange((pos) => positions.push(pos));

    handle.navigate({ kind: "scroll", deltaY: 240 });
    expect(handle.getCurrentPosition()).toMatchObject({ format: "pdf", pageIndex: 1 });
    handle.navigate({ kind: "scroll", deltaY: 240 });
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 2 });
    handle.navigate({ kind: "scroll", deltaY: -240 });
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 1 });
    expect(positions.length).toBe(3);
  });

  it("turns pages with page-turn keys in PAGES mode", async () => {
    const handle = await makeHandle();
    handle.setViewMode("pages");
    handle.navigate({ kind: "right" });
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 1 });
    handle.navigate({ kind: "left" });
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 0 });
    handle.navigate({ kind: "next" });
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 1 });
  });

  it("clamps page turns at the document boundaries", async () => {
    const handle = await makeHandle();
    handle.setViewMode("pages");
    handle.navigate({ kind: "scroll", deltaY: -240 });
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 0 });
    handle.navigate({ kind: "page", index: 4 });
    handle.navigate({ kind: "scroll", deltaY: 240 });
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 4 });
  });

  it("does not re-notify when navigating to the current page", async () => {
    const handle = await makeHandle();
    handle.setViewMode("pages");
    const positions: DocumentPosition[] = [];
    handle.onPositionChange((pos) => positions.push(pos));
    handle.navigate({ kind: "page", index: 0 });
    expect(positions.length).toBe(0);
  });

  it("scrolls the container for vertical scroll keys in SCROLL mode", async () => {
    const handle = await makeHandle();
    const el = document.createElement("div");
    const scrollBy = vi.fn();
    (el as unknown as { scrollBy: unknown }).scrollBy = scrollBy;
    handle.attachScrollContainer(el);

    handle.navigate({ kind: "scroll", deltaY: 240 });
    expect(scrollBy).toHaveBeenCalledWith({ top: 240, behavior: "auto" });
  });

  it("pans horizontally in SCROLL mode when the container overflows", async () => {
    const handle = await makeHandle();
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 2000 });
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 800 });
    const scrollBy = vi.fn();
    (el as unknown as { scrollBy: unknown }).scrollBy = scrollBy;
    handle.attachScrollContainer(el);

    handle.navigate({ kind: "right" });
    expect(scrollBy).toHaveBeenCalledWith({ left: 600, behavior: "auto" });
    handle.navigate({ kind: "left" });
    expect(scrollBy).toHaveBeenCalledWith({ left: -600, behavior: "auto" });
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 0 });
  });

  it("turns pages in SCROLL mode when the container does not overflow", async () => {
    const handle = await makeHandle();
    const el = document.createElement("div");
    const scrollBy = vi.fn();
    (el as unknown as { scrollBy: unknown }).scrollBy = scrollBy;
    handle.attachScrollContainer(el);

    handle.navigate({ kind: "right" });
    expect(scrollBy).not.toHaveBeenCalled();
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 1 });
  });

  it("turns pages instead of panning when zoomed but not overflowing", async () => {
    const handle = await makeHandle();
    handle.setZoom(1.5);
    const el = document.createElement("div");
    const scrollBy = vi.fn();
    (el as unknown as { scrollBy: unknown }).scrollBy = scrollBy;
    handle.attachScrollContainer(el);

    handle.navigate({ kind: "right" });
    expect(scrollBy).not.toHaveBeenCalled();
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 1 });
  });

  it("restores the persisted columns, zoom and position", async () => {
    const handle = await makeHandle();
    handle.setViewMode("pages");
    handle.restore({
      position: { format: "pdf", pageIndex: 3, scrollOffset: 0, pageCount: 5 },
      zoom: 1.5,
      viewMode: "pages",
      columns: 2,
    });
    expect(handle.getColumns()).toBe(2);
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 3 });
    expect(handle.getZoom()).toBe(1.5);
  });

  it("turns the page via the wheel gesture in PAGES mode", async () => {
    const handle = await makeHandle();
    handle.setViewMode("pages");
    const el = document.createElement("div");
    handle.attachScrollContainer(el);

    for (let i = 0; i < 3; i += 1) {
      el.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 20, bubbles: true, cancelable: true }),
      );
    }
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 1 });
  });

  it("keeps the page unchanged when overscrolling at the document edge", async () => {
    const handle = await makeHandle();
    const el = document.createElement("div");
    handle.attachScrollContainer(el);

    // The container never scrolls (jsdom), so after the first wheel the
    // boundary detector sees a blocked position at the top.
    el.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -20, bubbles: true, cancelable: true }),
    );
    for (let i = 0; i < 3; i += 1) {
      el.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -20, bubbles: true, cancelable: true }),
      );
    }
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 0 });
  });

  it("reports the true page index when windowed pages do not start at zero", async () => {
    const handle = await makeHandle(20);
    const container = document.createElement("div");
    handle.attachScrollContainer(container);

    const positions: DocumentPosition[] = [];
    handle.onPositionChange((pos) => positions.push(pos));

    // Simulate a windowed render: the mounted pages start at 10, so the
    // NodeList index no longer equals the page index.
    [10, 11, 12].forEach((pageIndex, i) => {
      const page = document.createElement("div");
      page.dataset.pageIndex = String(pageIndex);
      Object.defineProperty(page, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ top: i * 100 }),
      });
      container.appendChild(page);
    });

    container.dispatchEvent(new Event("scroll"));
    expect(handle.getCurrentPosition()).toMatchObject({ pageIndex: 10 });
    expect(positions[positions.length - 1]).toMatchObject({ pageIndex: 10 });
  });
});
