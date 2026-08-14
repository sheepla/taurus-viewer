import { describe, expect, it } from "vitest";
import { resolveEpubTitle } from "./epubTitle";

describe("resolveEpubTitle", () => {
  it("returns a plain string title", () => {
    expect(resolveEpubTitle("The Book")).toBe("The Book");
  });

  it("trims whitespace", () => {
    expect(resolveEpubTitle("  The Book  ")).toBe("The Book");
  });

  it("resolves the first non-empty value of a language map", () => {
    expect(resolveEpubTitle({ en: "English Title", ja: "日本語タイトル" })).toBe(
      "English Title",
    );
  });

  it("skips empty language-map values", () => {
    expect(resolveEpubTitle({ en: "  ", ja: "日本語タイトル" })).toBe(
      "日本語タイトル",
    );
  });

  it("returns null for null, undefined, numbers, and empty strings", () => {
    expect(resolveEpubTitle(null)).toBeNull();
    expect(resolveEpubTitle(undefined)).toBeNull();
    expect(resolveEpubTitle(42)).toBeNull();
    expect(resolveEpubTitle("")).toBeNull();
    expect(resolveEpubTitle({})).toBeNull();
  });
});