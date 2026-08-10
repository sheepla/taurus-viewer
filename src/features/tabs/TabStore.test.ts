import { beforeEach, describe, expect, it } from "vitest";
import { useTabStore } from "./TabStore";

describe("TabStore", () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null });
  });

  it("opens a new tab and activates it", () => {
    useTabStore.getState().openTab("/path/to/doc.pdf", "pdf");
    const { tabs, activeTabId } = useTabStore.getState();

    expect(tabs.length).toBe(1);
    expect(tabs[0]?.title).toBe("doc.pdf");
    expect(tabs[0]?.format).toBe("pdf");
    expect(activeTabId).toBe(tabs[0]?.id);
  });

  it("closes active tab and shifts focus to adjacent tab", () => {
    const store = useTabStore.getState();
    store.openTab("/doc1.pdf", "pdf");
    store.openTab("/doc2.epub", "epub");

    let { tabs } = useTabStore.getState();
    const firstTabId = tabs[0]?.id ?? "";
    const secondTabId = tabs[1]?.id ?? "";

    // Close active (second) tab
    useTabStore.getState().closeTab(secondTabId);

    tabs = useTabStore.getState().tabs;
    const activeTabId = useTabStore.getState().activeTabId;

    expect(tabs.length).toBe(1);
    expect(activeTabId).toBe(firstTabId);
  });
});
