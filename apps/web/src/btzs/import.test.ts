import { describe, expect, it } from "vitest";
import { buildImportedBtzsProfileCreate, buildImportedBtzsXdfPreview } from "./import";
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

describe("buildImportedBtzsXdfPreview", () => {
  it("maps parsed XDF metadata into a BTZS import draft", () => {
    const preview = buildImportedBtzsXdfPreview({ name: "fp4-ddx.xdf", size: 2048 }, FIXTURE);

    expect(preview.name).toBe("FP4+ DDX 1+4");
    expect(preview.displayName).toBe("FP4+ DDX 1+4");
    expect(preview.processLabel).toBe("DDX 1+4.00 @ 68.00F");
    expect(preview.developerName).toBe("DDX");
    expect(preview.dilution).toBe("1+4.00");
    expect(preview.temperatureText).toBe("68.00F");
    expect(preview.paperEs).toBe("1.05");
    expect(preview.reciprocityCode).toBe("R: C2");
    expect(preview.useReciprocityText).toBe("Yes");
    expect(preview.efsPointCount).toBe(2);
    expect(preview.devPointCount).toBe(2);
    expect(preview.rawXdf).toEqual({
      versionOrType: 2,
      displayName: "FP4+ DDX 1+4",
      processLabel: "DDX 1+4.00 @ 68.00F",
      paperES: 1.05,
      reciprocityExpIndex: 2,
      reciprocityGIndex: 1,
      useReciprocity: 1,
    });
    expect(preview.chartData).toHaveLength(2);
    expect(preview.chartData[0]).toMatchObject({
      title: "Average G vs Development Time",
      xAxisLabel: "Average G",
      yAxisLabel: "Development Time",
    });
    expect(preview.chartData[0].points).toEqual([
      { averageG: 0.36505307074053617, developmentTime: 4 },
      { averageG: 0.4291633967600443, developmentTime: 5.5 },
    ]);
    expect(preview.chartData[1]).toMatchObject({
      title: "Effective Film Speed vs Average G",
      xAxisLabel: "Average G",
      yAxisLabel: "Effective Film Speed",
    });
    expect(preview.sourceFiles[0]).toMatchObject({
      label: "FP4+ DDX 1+4",
      filename: "fp4-ddx.xdf",
      type: "xdf",
      source: "BTZS / ExpoDev XDF import",
      displayName: "FP4+ DDX 1+4",
      processLabel: "DDX 1+4.00 @ 68.00F",
      versionOrType: 2,
      paperES: 1.05,
      reciprocityExpIndex: 2,
      reciprocityGIndex: 1,
      useReciprocity: 1,
    });
  });
});

describe("buildImportedBtzsProfileCreate", () => {
  it("produces the BTZS create payload for the worker API", () => {
    const preview = buildImportedBtzsXdfPreview({ name: "fp4-ddx.xdf", size: 2048 }, FIXTURE);
    const payload = buildImportedBtzsProfileCreate(preview);

    expect(payload).toEqual({
      type: "btzs",
      name: "FP4+ DDX 1+4",
      developerName: "DDX",
      dilution: "1+4.00",
      temperatureText: "68.00F",
      keyValuesText: preview.keyValuesText,
      rawXdf: preview.rawXdf,
      chartData: preview.chartData,
      sourceFiles: preview.sourceFiles,
    });
  });
});
