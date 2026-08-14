import { describe, expect, it } from "vitest";
import { fitSpreadScale } from "./pdfLayout";

describe("fitSpreadScale", () => {
  it("shrinks a spread that is wider than the viewport at 100%", () => {
    expect(fitSpreadScale(1, 2400, 1600)).toBeCloseTo(0.6667, 3);
  });

  it("scales proportionally below 100%", () => {
    expect(fitSpreadScale(0.5, 2400, 1600)).toBeCloseTo(0.3333, 3);
  });

  it("keeps native size when the spread fits at 100%", () => {
    expect(fitSpreadScale(1, 800, 1600)).toBe(1);
  });

  it("does not cap the scale above 100%", () => {
    expect(fitSpreadScale(1.5, 2400, 1600)).toBe(1.5);
  });

  it("handles a spread wider than the available width at any zoom", () => {
    expect(fitSpreadScale(0.25, 2400, 1600)).toBeCloseTo(0.1667, 3);
  });
});
