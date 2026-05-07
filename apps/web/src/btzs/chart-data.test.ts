import { describe, expect, it } from "vitest";
import { buildImportedBtzsXdfPreview } from "./import";
import { buildBtzsChartDataFromSeries, splitBtzsChartData } from "./chart-data";
import type { ParsedBtzsXdf } from "./xdf";

const FIXTURE: ParsedBtzsXdf = {
  versionOrType: 2,
  displayName: "FP4+ DDX 1+4",
  reciprocityExpIndex: 2,
  reciprocityGIndex: 1,
  useReciprocity: 1,
  processLabel: "DDX 1+4.00 @ 68.00F",
  paperES: 1.05,
  efsGPoints: [
    { effectiveFilmSpeed: 42.2242531447325, averageGradient: 0.36505307074053617 },
    { effectiveFilmSpeed: 59.71411145835508, averageGradient: 0.4291633967600443 },
  ],
  devGPoints: [
    { developmentMinutes: 4.0, averageGradient: 0.36505307074053617 },
    { developmentMinutes: 5.5, averageGradient: 0.4291633967600443 },
  ],
};

describe("splitBtzsChartData", () => {
  it("turns supported BTZS chart data into editable tables and preserves other charts", () => {
    const preview = buildImportedBtzsXdfPreview({ name: "fp4-ddx.xdf", size: 2048 }, FIXTURE);
    const extraChart = {
      title: "Development Time vs SBR",
      xAxisLabel: "SBR",
      yAxisLabel: "Development Time",
      points: [{ sbr: 0.9, developmentTime: 6.5 }],
      note: "keep me",
    };

    const split = splitBtzsChartData([...preview.chartData, extraChart]);

    expect(split.series).toHaveLength(2);
    expect(split.series[0]).toMatchObject({
      kind: "developmentTime",
      sectionTitle: "Average G to Development Time",
      rows: [
        { averageG: "0.36505307074053617", value: "4" },
        { averageG: "0.4291633967600443", value: "5.5" },
      ],
    });
    expect(split.series[1]).toMatchObject({
      kind: "effectiveFilmSpeed",
      sectionTitle: "Average G to EFS",
      rows: [
        { averageG: "0.36505307074053617", value: "42.2242531447325" },
        { averageG: "0.4291633967600443", value: "59.71411145835508" },
      ],
    });
    expect(split.otherChartData).toEqual([extraChart]);

    const rebuilt = buildBtzsChartDataFromSeries(split.series, split.otherChartData);
    expect(rebuilt).toEqual([...preview.chartData, extraChart]);
  });

  it("rejects invalid chart cells with a useful error", () => {
    const preview = buildImportedBtzsXdfPreview({ name: "fp4-ddx.xdf", size: 2048 }, FIXTURE);
    const split = splitBtzsChartData(preview.chartData);
    split.series[0].rows[0].value = "not-a-number";

    expect(() => buildBtzsChartDataFromSeries(split.series)).toThrow(
      /Average G to Development Time row 1: Development Time must be a number\./,
    );
  });

  it("omits blank chart tables entirely", () => {
    const split = splitBtzsChartData(null);

    expect(buildBtzsChartDataFromSeries(split.series)).toBeNull();
  });
});
