import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTabStore } from "../tabs/TabStore";
import {
  extractPathsFromDropPayload,
  filesToPaths,
  openFiles,
  resolveFormatFromPath,
} from "./openFiles";

const { toastInfoMock } = vi.hoisted(() => ({
  toastInfoMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/plugin-log", () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { info: toastInfoMock },
}));

describe("openFiles helpers", () => {
  beforeEach(() => {
    toastInfoMock.mockReset();
    useTabStore.setState({ tabs: [], activeTabId: null });
  });

  it("resolves the document format from the file extension", () => {
    expect(resolveFormatFromPath("/docs/book.pdf")).toBe("pdf");
    expect(resolveFormatFromPath("C:\\docs\\book.epub")).toBe("epub");
    expect(resolveFormatFromPath("book.PDF")).toBe("pdf");
    expect(resolveFormatFromPath("notes.txt")).toBeNull();
    expect(resolveFormatFromPath("noextension")).toBeNull();
  });

  it("extracts paths only from a drop payload", () => {
    expect(extractPathsFromDropPayload({ type: "drop", paths: ["/a.pdf"] })).toEqual([
      "/a.pdf",
    ]);
    expect(extractPathsFromDropPayload({ type: "enter", paths: ["/a.pdf"] })).toEqual([]);
    expect(extractPathsFromDropPayload({ type: "over" })).toEqual([]);
    expect(extractPathsFromDropPayload({ type: "leave" })).toEqual([]);
  });

  it("converts dropped File objects to file names", () => {
    const files = [new File(["a"], "book.pdf"), new File(["b"], "novel.epub")];
    expect(filesToPaths(files)).toEqual(["book.pdf", "novel.epub"]);
  });

  it("opens supported documents as tabs with the right format", () => {
    openFiles(["C:/docs/a.pdf", "C:/docs/b.epub"]);

    const tabs = useTabStore.getState().tabs;
    expect(tabs.map((t) => t.filePath)).toEqual(["C:/docs/a.pdf", "C:/docs/b.epub"]);
    expect(tabs[0]?.format).toBe("pdf");
    expect(tabs[1]?.format).toBe("epub");
    expect(useTabStore.getState().activeTabId).toBe(tabs[1]?.id);
  });

  it("skips unsupported files and reports them via toast", () => {
    openFiles(["C:/docs/a.pdf", "C:/docs/notes.txt", "C:/docs/b.epub"]);

    const tabs = useTabStore.getState().tabs;
    expect(tabs.map((t) => t.filePath)).toEqual(["C:/docs/a.pdf", "C:/docs/b.epub"]);
    expect(toastInfoMock).toHaveBeenCalledWith("Unsupported file type: notes.txt");
  });
});