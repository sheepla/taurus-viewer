import { describe, expect, it } from "vitest";
import {
  bookmarkLabel,
  makePagePosition,
  parseBookmarkPosition,
} from "./bookmarks";

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

  it("returns the CFI for an EPUB position", () => {
    expect(bookmarkLabel({ format: "epub", cfi: "epubcfi(/6/4)" })).toBe(
      "epubcfi(/6/4)",
    );
  });
});
