import { describe, expect, it } from "vitest";
import { buildBtzsChartExpandedRange, formatBtzsChartCell, formatBtzsDisplayNumber } from "./chart-display";

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

describe("buildBtzsChartExpandedRange", () => {
  it("projects the displayed BTZS curve range from the same extrapolation stop setting used by lookups", () => {
    const range = buildBtzsChartExpandedRange({
      chart: {
        title: "Average G vs Development Time",
        xAxisLabel: "Average G",
        yAxisLabel: "Development Time",
      },
      xKey: "averageG",
      yKey: "developmentTime",
      points: [
        { x: 0.5, y: 5 },
        { x: 1, y: 10 },
      ],
      curveInterpolationEnabled: true,
      extrapolationStops: 1,
    });

    expect(range).not.toBeNull();
    if (!range) throw new Error("Expected an expanded BTZS range.");
    expect(range).toMatchObject({
      axis: "averageG",
      metric: "developmentTime",
      measuredMin: 0.5,
      measuredMax: 1,
      expandedMin: 0.25,
      expandedMax: 2,
    });
    expect(range?.points).toEqual([
      { label: "Lower expanded limit", x: 0.25, y: 2.5 },
      { label: "Upper expanded limit", x: 2, y: 20 },
    ]);
    expect(range.curvePoints.length).toBeGreaterThan(20);
    expect(range.curvePoints[0]).toEqual({ x: 0.25, y: 2.5 });
    expect(range.curvePoints[range.curvePoints.length - 1]).toEqual({ x: 2, y: 20 });
    expect(range.measuredCurvePoints[0]).toEqual({ x: 0.5, y: 5 });
    expect(range.measuredCurvePoints[range.measuredCurvePoints.length - 1]).toEqual({ x: 1, y: 10 });
  });

  it("does not emit expanded rows when range expansion is disabled", () => {
    const range = buildBtzsChartExpandedRange({
      chart: {
        title: "Average G vs Development Time",
        xAxisLabel: "Average G",
        yAxisLabel: "Development Time",
      },
      xKey: "averageG",
      yKey: "developmentTime",
      points: [
        { x: 0.5, y: 5 },
        { x: 1, y: 10 },
      ],
      extrapolationStops: 0,
    });

    expect(range).toBeNull();
  });
});
