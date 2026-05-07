import { describe, expect, it } from "vitest";
import {
  formatRawXdfPaperEsDisplay,
  formatRawXdfReciprocityCode,
  formatRawXdfUseReciprocity,
  inferProcessParts,
  parseBtzsXdf,
} from "./xdf";

interface PointFixture {
  effectiveFilmSpeed: number;
  averageGradient: number;
}

interface DevPointFixture {
  developmentMinutes: number;
  averageGradient: number;
}

interface XdfFixtureInput {
  versionOrType: number;
  displayName: string;
  reciprocityExpIndex: number;
  reciprocityGIndex: number;
  useReciprocity: number;
  processLabel: string;
  paperES: number;
  efsGPoints: PointFixture[];
  devGPoints: DevPointFixture[];
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function writeU8(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff);
}

function writeU32LE(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, true);
  return new Uint8Array(buffer);
}

function writeI32LE(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setInt32(0, value, true);
  return new Uint8Array(buffer);
}

function writeF64LE(value: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  return new Uint8Array(buffer);
}

function writePrefixedText(value: string): Uint8Array {
  const bytes = encodeText(value);
  if (bytes.length > 0xff) {
    throw new Error("Test fixture string is too long");
  }

  return concatBytes([writeU8(bytes.length), bytes]);
}

function buildXdfFixture(input: XdfFixtureInput): Uint8Array {
  const chunks: Uint8Array[] = [
    writeU32LE(input.versionOrType),
    writePrefixedText(input.displayName),
    writeI32LE(input.reciprocityExpIndex),
    writeI32LE(input.reciprocityGIndex),
    writeI32LE(input.useReciprocity),
    writePrefixedText(input.processLabel),
    writeI32LE(input.paperES),
    writeU32LE(input.efsGPoints.length),
  ];

  for (const point of input.efsGPoints) {
    chunks.push(writeF64LE(point.effectiveFilmSpeed), writeF64LE(point.averageGradient));
  }

  chunks.push(writeU32LE(input.devGPoints.length));

  for (const point of input.devGPoints) {
    chunks.push(writeF64LE(point.developmentMinutes), writeF64LE(point.averageGradient));
  }

  return concatBytes(chunks);
}

function expectClose(actual: number, expected: number, tolerance = 1e-12): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function expectPointClose(actual: PointFixture, expected: PointFixture): void {
  expectClose(actual.effectiveFilmSpeed, expected.effectiveFilmSpeed);
  expectClose(actual.averageGradient, expected.averageGradient);
}

function expectDevPointClose(actual: DevPointFixture, expected: DevPointFixture): void {
  expectClose(actual.developmentMinutes, expected.developmentMinutes);
  expectClose(actual.averageGradient, expected.averageGradient);
}

const FP4_DDX_FIXTURE: XdfFixtureInput = {
  versionOrType: 2,
  displayName: "FP4+ DDX 1+4",
  reciprocityExpIndex: 2,
  reciprocityGIndex: 1,
  useReciprocity: 1,
  processLabel: "DDX 1+4.00 @ 68.00F",
  paperES: 105,
  efsGPoints: [
    { effectiveFilmSpeed: 42.2242531447325, averageGradient: 0.36505307074053617 },
    { effectiveFilmSpeed: 59.71411145835508, averageGradient: 0.4291633967600443 },
    { effectiveFilmSpeed: 76.99360230925429, averageGradient: 0.5025125628140712 },
    { effectiveFilmSpeed: 90.50966799187638, averageGradient: 0.5825242718446614 },
    { effectiveFilmSpeed: 101.5936673259626, averageGradient: 0.7028753993610241 },
  ],
  devGPoints: [
    { developmentMinutes: 4.0, averageGradient: 0.36505307074053617 },
    { developmentMinutes: 5.5, averageGradient: 0.4291633967600443 },
    { developmentMinutes: 8.0, averageGradient: 0.5025125628140712 },
    { developmentMinutes: 11.0, averageGradient: 0.5825242718446614 },
    { developmentMinutes: 16.0, averageGradient: 0.7028753993610241 },
  ],
};

describe("inferProcessParts", () => {
  it("splits a process label conservatively", () => {
    expect(inferProcessParts("DDX 1+4.00 @ 68.00F")).toEqual({
      developerName: "DDX",
      dilution: "1+4.00",
      temperatureText: "68.00F",
    });
  });

  it("falls back to the full label when parsing fails", () => {
    expect(inferProcessParts("DDX @ 68.00F")).toEqual({
      developerName: "DDX @ 68.00F",
    });
  });
});

describe("parseBtzsXdf", () => {
  it("parses the FP4+ DDX 1+4 fixture", () => {
    const parsed = parseBtzsXdf(buildXdfFixture(FP4_DDX_FIXTURE));

    expect(parsed.versionOrType).toBe(2);
    expect(parsed.displayName).toBe("FP4+ DDX 1+4");
    expect(parsed.reciprocityExpIndex).toBe(2);
    expect(parsed.reciprocityGIndex).toBe(1);
    expect(parsed.useReciprocity).toBe(1);
    expect(parsed.processLabel).toBe("DDX 1+4.00 @ 68.00F");
    expect(parsed.paperES).toBeCloseTo(1.05);
    expect(parsed.efsGPoints).toHaveLength(5);
    expect(parsed.devGPoints).toHaveLength(5);
    expect(formatRawXdfPaperEsDisplay(parsed.paperES)).toBe("1.05");
    expect(formatRawXdfReciprocityCode(parsed.reciprocityExpIndex, parsed.reciprocityGIndex)).toBe("R: C2");
    expect(formatRawXdfUseReciprocity(parsed.useReciprocity)).toBe("Yes");

    expectPointClose(parsed.efsGPoints[0], FP4_DDX_FIXTURE.efsGPoints[0]);
    expectPointClose(parsed.efsGPoints[4], FP4_DDX_FIXTURE.efsGPoints[4]);
    expectDevPointClose(parsed.devGPoints[0], FP4_DDX_FIXTURE.devGPoints[0]);
    expectDevPointClose(parsed.devGPoints[4], FP4_DDX_FIXTURE.devGPoints[4]);
  });

  it("rejects truncated bytes", () => {
    const bytes = buildXdfFixture(FP4_DDX_FIXTURE);
    expect(() => parseBtzsXdf(bytes.slice(0, bytes.length - 1))).toThrow();
  });

  it("rejects trailing bytes", () => {
    const bytes = buildXdfFixture(FP4_DDX_FIXTURE);
    const trailing = new Uint8Array(bytes.length + 1);
    trailing.set(bytes, 0);
    expect(() => parseBtzsXdf(trailing)).toThrow(/Trailing unread bytes/);
  });

  it("rejects zero EFS point counts", () => {
    const bytes = buildXdfFixture({
      ...FP4_DDX_FIXTURE,
      efsGPoints: [],
      devGPoints: FP4_DDX_FIXTURE.devGPoints,
    });

    expect(() => parseBtzsXdf(bytes)).toThrow(/efsGPoints count must be greater than zero/);
  });

  it("rejects zero development point counts", () => {
    const bytes = buildXdfFixture({
      ...FP4_DDX_FIXTURE,
      devGPoints: [],
    });

    expect(() => parseBtzsXdf(bytes)).toThrow(/devGPoints count must be greater than zero/);
  });

  it("rejects non-finite average gradients", () => {
    const bytes = buildXdfFixture({
      ...FP4_DDX_FIXTURE,
      efsGPoints: [
        { effectiveFilmSpeed: 42.2242531447325, averageGradient: Number.NaN },
        ...FP4_DDX_FIXTURE.efsGPoints.slice(1),
      ],
    });

    expect(() => parseBtzsXdf(bytes)).toThrow(/averageGradient must be finite/);
  });

  it("rejects non-positive development minutes", () => {
    const bytes = buildXdfFixture({
      ...FP4_DDX_FIXTURE,
      devGPoints: [
        { developmentMinutes: 0, averageGradient: 0.36505307074053617 },
        ...FP4_DDX_FIXTURE.devGPoints.slice(1),
      ],
    });

    expect(() => parseBtzsXdf(bytes)).toThrow(/developmentMinutes must be a finite positive number/);
  });
});
