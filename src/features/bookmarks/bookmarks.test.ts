import { describe, expect, it } from "vitest";
import {
  bookmarkLabel,
  makePagePosition,
  parseBookmarkPosition,
  resolveEpubBookmarkLabel,
  type EpubBookInfo,
} from "./bookmarks";

const mockBook = (sections: Array<{ id: string; size: number }>): EpubBookInfo => ({
  toc: [
    { label: "Cover", href: "cover.xhtml" },
    { label: "Chapter 1", href: "ch1.xhtml", subitems: [{ label: "1.1", href: "ch1.xhtml#s1" }] },
    { label: "Chapter 2", href: "ch2.xhtml" },
  ],
  sections,
  resolveCFI: (cfi) => {
    const match = cfi.match(/epubcfi\(\/6\/(\d+)/);
    const idx = match ? Number.parseInt(match[1], 10) - 1 : -1;
    return { index: idx };
  },
});

describe("makePagePosition", () => {
  it("keys PDF positions on the page index only", () => {
    expect(
      makePagePosition({
        format: "pdf",
        pageIndex: 3,
        scrollOffset: 500,
        pageCount: 10,
      }),
    ).toEqual({ format: "pdf", pageIndex: 3 });
  });

  it("keys EPUB positions on the CFI", () => {
    expect(
      makePagePosition({ format: "epub", cfi: "epubcfi(/6/4)" }),
    ).toEqual({ format: "epub", cfi: "epubcfi(/6/4)" });
  });
});

describe("parseBookmarkPosition", () => {
  it("parses a stored PDF position", () => {
    expect(
      parseBookmarkPosition('{"format":"pdf","pageIndex":7}'),
    ).toEqual({ format: "pdf", pageIndex: 7 });
  });

  it("returns null for invalid JSON", () => {
    expect(parseBookmarkPosition("not-json")).toBeNull();
  });

  it("returns null for an unknown format", () => {
    expect(parseBookmarkPosition('{"format":"docx"}')).toBeNull();
  });
});

describe("bookmarkLabel", () => {
  it("formats a PDF position as a 1-based page", () => {
    expect(bookmarkLabel({ format: "pdf", pageIndex: 0 })).toBe("Page 1");
  });

  it("returns a clean label for an EPUB position", () => {
    expect(bookmarkLabel({ format: "epub", cfi: "epubcfi(/6/4)" })).toBe(
      "EPUB Location",
    );
  });
});

describe("resolveEpubBookmarkLabel", () => {
  it("resolves the section heading and location for a CFI", () => {
    const book = mockBook([
      { id: "cover.xhtml", size: 100 },
      { id: "ch1.xhtml", size: 3000 },
      { id: "ch2.xhtml", size: 2000 },
    ]);
    expect(resolveEpubBookmarkLabel("epubcfi(/6/3)", book)).toEqual({
      heading: "Chapter 2",
      page: "Loc 2",
    });
  });

  it("matches the deepest TOC entry for the section", () => {
    const book = mockBook([
      { id: "cover.xhtml", size: 100 },
      { id: "ch1.xhtml", size: 3000 },
    ]);
    expect(resolveEpubBookmarkLabel("epubcfi(/6/2)", book)).toEqual({
      heading: "1.1",
      page: "Loc 0",
    });
  });

  it("returns null when the CFI cannot be resolved", () => {
    const book: EpubBookInfo = { resolveCFI: () => null };
    expect(resolveEpubBookmarkLabel("epubcfi(/6/1)", book)).toBeNull();
  });

  it("returns null for a CFI outside the spine", () => {
    const book = mockBook([{ id: "cover.xhtml", size: 100 }]);
    expect(resolveEpubBookmarkLabel("epubcfi(/6/99)", book)).toBeNull();
  });
});
