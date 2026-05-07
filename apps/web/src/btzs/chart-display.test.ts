import { describe, expect, it } from "vitest";
import { formatBtzsChartCell, formatBtzsDisplayNumber } from "./chart-display";

describe("formatBtzsDisplayNumber", () => {
  it("rounds numeric values to at most two decimals without grouping", () => {
    expect(formatBtzsDisplayNumber(0.36505307074053617)).toBe("0.37");
    expect(formatBtzsDisplayNumber(42.2242531447325)).toBe("42.22");
    expect(formatBtzsDisplayNumber(5.5)).toBe("5.5");
    expect(formatBtzsDisplayNumber(4)).toBe("4");
  });
});

describe("formatBtzsChartCell", () => {
  it("rounds numeric cell values and preserves non-numeric text", () => {
    expect(formatBtzsChartCell(42.2242531447325)).toBe("42.22");
    expect(formatBtzsChartCell("0.36505307074053617")).toBe("0.37");
    expect(formatBtzsChartCell("68.00F")).toBe("68.00F");
    expect(formatBtzsChartCell(null)).toBe("—");
  });
});
