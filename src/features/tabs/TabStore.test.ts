import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTabStore } from "./TabStore";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";
import type { DocumentPosition, TabViewState } from "../../shared/types";

const { invokeMock, toastInfoMock } = vi.hoisted(() => ({
  invokeMock: vi.fn().mockResolvedValue(null),
  toastInfoMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("sonner", () => ({
  toast: { info: toastInfoMock },
}));

const PDF_POSITION: DocumentPosition = {
  format: "pdf",
  pageIndex: 2,
  scrollOffset: 100,
  pageCount: 10,
};

function makeFakeHandle(): DocumentViewerHandle {
  return {
    capabilities: { viewModes: ["scroll", "pages"], hasOutline: true, hasTextSearch: false },
    dispose: vi.fn(),
    getCurrentPosition: () => PDF_POSITION,
    getProgress: () => 0.2,
    setZoom: vi.fn(),
    setViewMode: vi.fn(),
    navigate: vi.fn(),
    onPositionChange: () => () => {},
    onReady: () => () => {},
    restore: vi.fn(),
    goToPosition: vi.fn(),
    search: () => ({} as AsyncIterable<never>),
    clearSearch: vi.fn(),
    getOutline: () => Promise.resolve([]),
  };
}

describe("TabStore", () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null });
    vi.clearAllMocks();
  });

  it("opens a new tab and activates it", () => {
    useTabStore.getState().openTab("/path/to/doc.pdf", "pdf");
    const { tabs, activeTabId } = useTabStore.getState();

    expect(tabs.length).toBe(1);
    expect(tabs[0]?.title).toBe("doc.pdf");
    expect(tabs[0]?.format).toBe("pdf");
    expect(activeTabId).toBe(tabs[0]?.id);
  });

  it("carries the restore state on a restored tab", () => {
    const restoreState: TabViewState = {
      position: { format: "pdf", pageIndex: 5, scrollOffset: 0, pageCount: 10 },
      zoom: 1.25,
      viewMode: "pages",
    };
    useTabStore.getState().openTab("/restored.pdf", "pdf", restoreState);
    const tab = useTabStore.getState().tabs[0];

    expect(tab?.restoreState).toEqual(restoreState);
  });

  it("clears the restore state via setTabRestored", () => {
    const restoreState: TabViewState = {
      position: { format: "pdf", pageIndex: 0, scrollOffset: 0, pageCount: 10 },
      zoom: 1,
      viewMode: "scroll",
    };
    const store = useTabStore.getState();
    store.openTab("/restored.pdf", "pdf", restoreState);
    const tabId = useTabStore.getState().tabs[0]?.id ?? "";

    useTabStore.getState().setTabRestored(tabId);
    expect(useTabStore.getState().tabs[0]?.restoreState).toBeNull();
  });

  it("closes active tab and shifts focus to adjacent tab", () => {
    const store = useTabStore.getState();
    store.openTab("/doc1.pdf", "pdf");
    store.openTab("/doc2.epub", "epub");

    let { tabs } = useTabStore.getState();
    const firstTabId = tabs[0]?.id ?? "";
    const secondTabId = tabs[1]?.id ?? "";

    useTabStore.getState().closeTab(secondTabId);

    tabs = useTabStore.getState().tabs;
    const activeTabId = useTabStore.getState().activeTabId;

    expect(tabs.length).toBe(1);
    expect(activeTabId).toBe(firstTabId);
  });

  it("pushes the closed tab onto the persistent stack on close", () => {
    const store = useTabStore.getState();
    store.openTab("/doc1.pdf", "pdf");
    const tabId = useTabStore.getState().tabs[0]?.id ?? "";
    useTabStore.getState().setHandle(tabId, makeFakeHandle());

    useTabStore.getState().closeTab(tabId);

    expect(invokeMock).toHaveBeenCalledWith(
      "tab_push_closed",
      expect.objectContaining({ filePath: "/doc1.pdf", format: "pdf" }),
    );
  });

  it("restores the most recently closed tab via restoreLastClosedTab", async () => {
    const store = useTabStore.getState();
    store.openTab("/doc1.pdf", "pdf");
    const tabId = useTabStore.getState().tabs[0]?.id ?? "";
    useTabStore.getState().setHandle(tabId, makeFakeHandle());
    useTabStore.getState().closeTab(tabId);

    invokeMock.mockResolvedValueOnce({
      file_path: "/doc1.pdf",
      format: "pdf",
      view_state: JSON.stringify({
        position: { format: "pdf", pageIndex: 2, scrollOffset: 100, pageCount: 10 },
        zoom: 1,
        viewMode: "scroll",
      }),
    });

    await useTabStore.getState().restoreLastClosedTab();

    const tabs = useTabStore.getState().tabs;
    expect(tabs.length).toBe(1);
    expect(tabs[0]?.filePath).toBe("/doc1.pdf");
    expect(tabs[0]?.restoreState).not.toBeNull();
  });

  it("shows an info toast when there is no closed tab to restore", async () => {
    invokeMock.mockResolvedValueOnce(null);

    await useTabStore.getState().restoreLastClosedTab();

    expect(toastInfoMock).toHaveBeenCalledWith("No closed tab to restore");
  });
});
