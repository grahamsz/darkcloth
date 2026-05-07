import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  calculateBtzsExposure,
  findBtzsLookupSeries,
  formatExposureEfs,
  formatExposureG,
  formatExposureSbr,
  formatIdealShutterSeconds,
} from "./photoExposure";
import { buildImportedBtzsXdfPreview } from "./btzs/import";
import { parseBtzsXdf } from "./btzs/xdf";

const sampleProfilesDir = fileURLToPath(new URL("../../../sample_profiles/", import.meta.url));

function loadSampleProfile(fileName: string) {
  const bytes = new Uint8Array(readFileSync(join(sampleProfilesDir, fileName)));
  const parsed = parseBtzsXdf(bytes);
  const preview = buildImportedBtzsXdfPreview(
    { name: fileName, size: bytes.byteLength },
    parsed,
  );

  return { bytes, parsed, preview };
}

describe("BTZS sample profile calculations", () => {
  const sampleProfileNames = readdirSync(sampleProfilesDir)
    .filter((fileName) => fileName.endsWith(".xdf"))
    .sort();

  it.each(sampleProfileNames)("imports %s as usable Average G lookup charts", (fileName) => {
    const { bytes, parsed, preview } = loadSampleProfile(fileName);

    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(parsed.displayName.trim()).not.toBe("");
    expect(parsed.processLabel.trim()).not.toBe("");
    expect(parsed.paperES).toBeGreaterThan(0);
    expect(parsed.efsGPoints.length).toBeGreaterThanOrEqual(3);
    expect(parsed.devGPoints.length).toBeGreaterThanOrEqual(3);

    const developmentTimeSeries = findBtzsLookupSeries(preview.chartData, "developmentTime");
    const effectiveFilmSpeedSeries = findBtzsLookupSeries(preview.chartData, "effectiveFilmSpeed");

    expect(developmentTimeSeries).toMatchObject({ axis: "averageG", metric: "developmentTime" });
    expect(effectiveFilmSpeedSeries).toMatchObject({ axis: "averageG", metric: "effectiveFilmSpeed" });
    expect(developmentTimeSeries?.points).toHaveLength(parsed.devGPoints.length);
    expect(effectiveFilmSpeedSeries?.points).toHaveLength(parsed.efsGPoints.length);
  });

  it("matches the FP4+ DDX 1+4 BTZS metering example", () => {
    const { parsed, preview } = loadSampleProfile("FP4+ DDX 1+4.xdf");
    const result = calculateBtzsExposure({
      lowEv: 13,
      lowZone: 3,
      highEv: 17,
      highZone: 7,
      paperEs: parsed.paperES,
      meterIso: 100,
      chartData: preview.chartData,
      precedence: "aperture",
      aperture: 22,
      reciprocityPFactor: 1,
    });

    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.sbr).toBeCloseTo(7, 12);
    expect(result.requiredG).toBeCloseTo(1 / (0.3 * 7), 12);
    expect(result.effectiveFilmSpeed).toBeCloseTo(70.28206337532077, 12);
    expect(result.developmentTimeMinutes).toBeCloseTo(7.102849833213955, 12);
    expect(result.exposure?.aperture).toBe(22);
    expect(result.exposure?.idealShutterSeconds).toBeCloseTo(0.02101604179379657, 12);
    expect(result.exposure?.rawShutterSeconds).toBeCloseTo(0.02101604179379657, 12);
    expect(result.exposure?.finalShutterSeconds).toBeCloseTo(0.02101604179379657, 12);
    expect(result.exposure?.reciprocityApplied).toBe(false);

    expect(formatExposureSbr(result.sbr)).toBe("7.0");
    expect(formatExposureG(result.requiredG)).toBe("0.476");
    expect(formatExposureEfs(result.effectiveFilmSpeed)).toBe("70");
    expect(formatIdealShutterSeconds(result.exposure?.idealShutterSeconds)).toBe("1/48");
  });

  it("matches the APX DI#13 1+9 Lo SBR 12 interpolation example", () => {
    const { parsed, preview } = loadSampleProfile("APX DI#13 1+9 Lo.xdf");
    const result = calculateBtzsExposure({
      lowEv: 6.55,
      lowZone: 3,
      highEv: 12.55,
      highZone: 6.5,
      paperEs: parsed.paperES,
      meterIso: 100,
      chartData: preview.chartData,
      precedence: "aperture",
      aperture: 11,
      reciprocityPFactor: 1,
    });

    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.sbr).toBeCloseTo(12, 12);
    expect(result.requiredG).toBeCloseTo(1.05 / (0.3 * 12), 12);
    expect(result.effectiveFilmSpeed).toBeCloseTo(48.83725911818769, 12);
    expect(result.developmentTimeMinutes).toBeCloseTo(5.814814814814816, 12);
    expect(result.exposure?.aperture).toBe(11);
    expect(result.exposure?.idealShutterSeconds).toBeCloseTo(0.6610398257036031, 12);
    expect(result.exposure?.rawShutterSeconds).toBeCloseTo(0.6610398257036031, 12);
    expect(result.exposure?.finalShutterSeconds).toBeCloseTo(0.6610398257036031, 12);
    expect(result.exposure?.reciprocityApplied).toBe(false);

    expect(formatExposureSbr(result.sbr)).toBe("12.0");
    expect(formatExposureG(result.requiredG)).toBe("0.292");
    expect(formatExposureEfs(result.effectiveFilmSpeed)).toBe("49");
    expect(formatIdealShutterSeconds(result.exposure?.idealShutterSeconds)).toBe("0.661");
  });

  it("adds flare factor to required G for the TMX DI#13 1+9 Lo profile", () => {
    const { parsed, preview } = loadSampleProfile("TMX DI#13 1+9 Lo.xdf");
    const result = calculateBtzsExposure({
      lowEv: 7,
      lowZone: 3,
      highEv: 12,
      highZone: 6.5,
      paperEs: parsed.paperES,
      flareFactor: 0.02,
      meterIso: 100,
      chartData: preview.chartData,
      precedence: "aperture",
      aperture: 16,
      reciprocityPFactor: 1.15,
    });

    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.sbr).toBeCloseTo(10, 12);
    expect(result.requiredG).toBeCloseTo(0.37, 12);
    expect(result.effectiveFilmSpeed).toBeCloseTo(94.39131527847252, 12);
    expect(result.developmentTimeMinutes).toBeCloseTo(10, 12);
    expect(result.exposure?.aperture).toBe(16);
    expect(result.exposure?.idealShutterSeconds).toBeCloseTo(0.5297097498057995, 12);
    expect(result.exposure?.rawShutterSeconds).toBeCloseTo(0.5297097498057995, 12);
    expect(result.exposure?.finalShutterSeconds).toBeCloseTo(0.6304233631832132, 12);
    expect(result.exposure?.reciprocityApplied).toBe(true);

    expect(formatExposureSbr(result.sbr)).toBe("10.0");
    expect(formatExposureG(result.requiredG)).toBe("0.37");
    expect(formatExposureEfs(result.effectiveFilmSpeed)).toBe("94");
    expect(formatIdealShutterSeconds(result.exposure?.idealShutterSeconds)).toBe("0.53");
  });
});
