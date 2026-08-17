import { beforeEach, describe, expect, it, vi } from "vitest";
import { pdfPageUrl, thumbnailUrl } from "./customProtocolUrl";

const convertFileSrc = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc }));

describe("custom protocol URLs", () => {
  beforeEach(() => {
    convertFileSrc.mockReset();
  });

  it("builds a Linux/macOS PDF page URL through Tauri's URL converter", () => {
    convertFileSrc.mockImplementation(
      (path: string, protocol: string) => `${protocol}://localhost/${encodeURIComponent(path)}`,
    );

    expect(pdfPageUrl("pdf session 1", 2, 1200)).toBe(
      "taurus-page://localhost/pdf%20session%201/2?w=1200",
    );
    expect(convertFileSrc).toHaveBeenCalledWith("pdf session 1", "taurus-page");
  });

  it("builds a Windows/Android PDF page URL through Tauri's URL converter", () => {
    convertFileSrc.mockImplementation(
      (path: string, protocol: string) =>
        `http://${protocol}.localhost/${encodeURIComponent(path)}`,
    );

    expect(pdfPageUrl("pdf-1", 0, 800)).toBe(
      "http://taurus-page.localhost/pdf-1/0?w=800",
    );
  });

  it("builds thumbnail URLs through the same platform-aware converter", () => {
    convertFileSrc.mockReturnValue("taurus-thumb://localhost/42");

    expect(thumbnailUrl(42)).toBe("taurus-thumb://localhost/42");
    expect(convertFileSrc).toHaveBeenCalledWith("42", "taurus-thumb");
  });
});
