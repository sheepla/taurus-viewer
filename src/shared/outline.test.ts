import { describe, expect, it } from "vitest";
import { epubOutlineToNodes, pdfOutlineToNodes } from "./outline";
import type { PdfOutlineNode } from "./bindings";

describe("pdfOutlineToNodes", () => {
  it("maps titles and page indices, preserving nesting", () => {
    const raw: PdfOutlineNode[] = [
      {
        title: "Chapter 1",
        page_index: 0,
        children: [
          { title: "Section 1.1", page_index: 1, children: [] },
          { title: "Section 1.2", page_index: 2, children: [] },
        ],
      },
      { title: "Chapter 2", page_index: 3, children: [] },
    ];

    const nodes = pdfOutlineToNodes(raw);

    expect(nodes).toEqual([
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
      {
        title: "Chapter 2",
        destination: { format: "pdf", pageIndex: 3 },
        children: [],
      },
    ]);
  });

  it("handles an empty outline", () => {
    expect(pdfOutlineToNodes([])).toEqual([]);
  });
});

describe("epubOutlineToNodes", () => {
  it("maps label and href to an epub destination", () => {
    const nodes = epubOutlineToNodes([
      {
        label: "Chapter 1",
        href: "https://example.com/book/ch1.xhtml",
        subitems: [{ label: "Intro", href: "https://example.com/book/ch1.xhtml#intro" }],
      },
    ]);

    expect(nodes).toEqual([
      {
        title: "Chapter 1",
        destination: {
          format: "epub",
          href: "https://example.com/book/ch1.xhtml",
        },
        children: [
          {
            title: "Intro",
            destination: {
              format: "epub",
              href: "https://example.com/book/ch1.xhtml#intro",
            },
            children: [],
          },
        ],
      },
    ]);
  });

  it("returns an empty list for null/undefined TOCs", () => {
    expect(epubOutlineToNodes(null)).toEqual([]);
    expect(epubOutlineToNodes(undefined)).toEqual([]);
  });

  it("keeps entries without an href with an empty href", () => {
    const nodes = epubOutlineToNodes([{ label: "Untitled", href: null }]);
    expect(nodes[0]?.destination).toEqual({ format: "epub", href: "" });
  });
});
