import { describe, expect, it } from "vitest";
import type { DocumentPosition, OutlineNode } from "../../shared/types";
import {
  findOutlineIndexForPosition,
  flattenOutline,
} from "./outlinePosition";

const PDF_OUTLINE: OutlineNode[] = [
  {
    title: "Chapter 1",
    destination: { format: "pdf", pageIndex: 0 },
    children: [
      {
        title: "Section 1.1",
        destination: { format: "pdf", pageIndex: 1 },
        children: [],
      },
      {
        title: "Section 1.2",
        destination: { format: "pdf", pageIndex: 2 },
        children: [],
      },
    ],
  },
  { title: "Chapter 2", destination: { format: "pdf", pageIndex: 3 }, children: [] },
  { title: "Chapter 3", destination: { format: "pdf", pageIndex: 5 }, children: [] },
];

function pdfPosition(pageIndex: number): DocumentPosition {
  return { format: "pdf", pageIndex, scrollOffset: 0, pageCount: 10 };
}

describe("flattenOutline", () => {
  it("depth-first flattens nested nodes carrying their depth", () => {
    expect(flattenOutline(PDF_OUTLINE)).toEqual([
      { node: PDF_OUTLINE[0], depth: 0 },
      { node: PDF_OUTLINE[0]?.children[0], depth: 1 },
      { node: PDF_OUTLINE[0]?.children[1], depth: 1 },
      { node: PDF_OUTLINE[1], depth: 0 },
      { node: PDF_OUTLINE[2], depth: 0 },
    ]);
  });
});

describe("findOutlineIndexForPosition", () => {
  it("returns null for an empty list", () => {
    expect(findOutlineIndexForPosition([], pdfPosition(0))).toBeNull();
  });

  it("selects the deepest PDF entry at or before the current page", () => {
    const visible = flattenOutline(PDF_OUTLINE);
    expect(findOutlineIndexForPosition(visible, pdfPosition(2))).toBe(2);
    expect(findOutlineIndexForPosition(visible, pdfPosition(3))).toBe(3);
    expect(findOutlineIndexForPosition(visible, pdfPosition(4))).toBe(3);
  });

  it("selects the last entry whose page is at or before the current page", () => {
    const visible = flattenOutline(PDF_OUTLINE);
    expect(findOutlineIndexForPosition(visible, pdfPosition(5))).toBe(4);
  });

  it("selects 0 when the reader is before the first outline entry", () => {
    const outline: OutlineNode[] = [
      { title: "Intro", destination: { format: "pdf", pageIndex: 2 }, children: [] },
    ];
    expect(findOutlineIndexForPosition(flattenOutline(outline), pdfPosition(1))).toBe(0);
  });

  it("matches an EPUB section by href", () => {
    const outline: OutlineNode[] = [
      {
        title: "Chapter 1",
        destination: { format: "epub", href: "ch1.xhtml" },
        children: [
          {
            title: "Intro",
            destination: { format: "epub", href: "ch1.xhtml#intro" },
            children: [],
          },
        ],
      },
      { title: "Chapter 2", destination: { format: "epub", href: "ch2.xhtml" }, children: [] },
    ];
    const visible = flattenOutline(outline);
    expect(
      findOutlineIndexForPosition(visible, {
        format: "epub",
        cfi: "epubcfi(/6/4)",
        href: "ch2.xhtml",
      }),
    ).toBe(2);
    expect(
      findOutlineIndexForPosition(visible, {
        format: "epub",
        cfi: "epubcfi(/6/4)",
        href: "ch1.xhtml#intro",
      }),
    ).toBe(1);
  });

  it("falls back to fraction matching for TOC-less fallback nodes", () => {
    const fallback: OutlineNode[] = Array.from({ length: 10 }, (_, i) => {
      const frac = (i + 1) / 10;
      return {
        title: `Position ${Math.round(frac * 100)}%`,
        destination: {
          format: "epub",
          fraction: frac,
        } as unknown as OutlineNode["destination"],
        children: [],
      };
    });
    const visible = flattenOutline(fallback);
    expect(
      findOutlineIndexForPosition(visible, {
        format: "epub",
        cfi: "epubcfi(/0)",
        fraction: 0.55,
      }),
    ).toBe(4);
  });

  it("returns null when an EPUB position matches nothing", () => {
    const outline: OutlineNode[] = [
      { title: "A", destination: { format: "epub", href: "a.xhtml" }, children: [] },
    ];
    const visible = flattenOutline(outline);
    expect(
      findOutlineIndexForPosition(visible, { format: "epub", cfi: "epubcfi(/1)" }),
    ).toBeNull();
    expect(
      findOutlineIndexForPosition(visible, {
        format: "epub",
        cfi: "epubcfi(/1)",
        href: "missing.xhtml",
      }),
    ).toBeNull();
  });
});
