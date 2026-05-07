import type { BTZSDevelopmentProfile, RawXdfMetadata } from "../api/client";

const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

const PAPER_ES_SCALE = 100;

export interface XdfEfsGPoint {
  effectiveFilmSpeed: number;
  averageGradient: number;
}

export interface XdfDevGPoint {
  developmentMinutes: number;
  averageGradient: number;
}

export interface ParsedBtzsXdf {
  versionOrType: number;
  displayName: string;
  reciprocityExpIndex: number;
  reciprocityGIndex: number;
  useReciprocity: number;
  processLabel: string;
  paperES: number;
  efsGPoints: XdfEfsGPoint[];
  devGPoints: XdfDevGPoint[];
}

export interface RawXdfMetadataDisplay {
  paperEs: string;
  reciprocityCode: string;
  useReciprocity: string;
}

export interface InferredProcessParts {
  developerName: string;
  dilution?: string;
  temperatureText?: string;
}

class BinaryReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  private ensureAvailable(size: number, label: string): void {
    if (this.remaining < size) {
      throw new Error(`${label} exceeds remaining bytes at offset ${this.offset}`);
    }
  }

  readUint8(label: string): number {
    this.ensureAvailable(1, label);
    return this.bytes[this.offset++];
  }

  readUint32LE(label: string): number {
    this.ensureAvailable(4, label);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readInt32LE(label: string): number {
    this.ensureAvailable(4, label);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat64LE(label: string): number {
    this.ensureAvailable(8, label);
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readPrefixedText(label: string): string {
    const length = this.readUint8(`${label} length`);
    this.ensureAvailable(length, `${label} text`);

    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;

    try {
      return TEXT_DECODER.decode(slice);
    } catch {
      throw new Error(`${label} contains invalid UTF-8 bytes`);
    }
  }

  finish(): void {
    if (this.remaining !== 0) {
      throw new Error(`Trailing unread bytes remain at offset ${this.offset}`);
    }
  }
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeNegativeZero(text: string) {
  return /^-0(?:\.0+)?$/u.test(text) ? text.replace(/^-0/u, "0") : text;
}

function formatPaperEsDisplayValue(value: number): string {
  return normalizeNegativeZero(value.toFixed(2));
}

function formatPaperEsInputValue(value: number): string {
  const fixed = formatPaperEsDisplayValue(value);
  if (!fixed.includes(".")) {
    return `${fixed}.0`;
  }

  const trimmed = fixed.replace(/0+$/u, "").replace(/\.$/u, ".0");
  return trimmed.length > 0 ? trimmed : "0.0";
}

function resolveRawXdfPaperEsValue(rawXdf: RawXdfMetadata | null | undefined): number | null {
  if (!rawXdf) return null;

  const paperEs = parseNumericValue(rawXdf.paperES);
  if (paperEs != null) return paperEs;

  const legacyFilmIso = parseNumericValue(rawXdf.filmISO);
  if (legacyFilmIso != null) return legacyFilmIso / PAPER_ES_SCALE;

  return null;
}

function resolveRawXdfReciprocityTuple(rawXdf: RawXdfMetadata | null | undefined): {
  reciprocityExpIndex: number | null;
  reciprocityGIndex: number | null;
  useReciprocity: number | null;
} {
  if (!rawXdf) {
    return {
      reciprocityExpIndex: null,
      reciprocityGIndex: null,
      useReciprocity: null,
    };
  }

  if (
    rawXdf.reciprocityExpIndex != null
    || rawXdf.reciprocityGIndex != null
    || rawXdf.useReciprocity != null
  ) {
    return {
      reciprocityExpIndex: parseNumericValue(rawXdf.reciprocityExpIndex),
      reciprocityGIndex: parseNumericValue(rawXdf.reciprocityGIndex),
      useReciprocity: parseNumericValue(rawXdf.useReciprocity),
    };
  }

  const legacyFields = rawXdf.unknownOrReciprocityFields;
  if (!Array.isArray(legacyFields) || legacyFields.length !== 3) {
    return {
      reciprocityExpIndex: null,
      reciprocityGIndex: null,
      useReciprocity: null,
    };
  }

  return {
    reciprocityExpIndex: parseNumericValue(legacyFields[0]),
    reciprocityGIndex: parseNumericValue(legacyFields[1]),
    useReciprocity: parseNumericValue(legacyFields[2]),
  };
}

export function formatRawXdfPaperEsDisplay(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return "—";
  }

  return formatPaperEsDisplayValue(value);
}

export function formatRawXdfPaperEsInputValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return "";
  }

  return formatPaperEsInputValue(value);
}

export function formatRawXdfReciprocityExpCode(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return "";
  }

  const index = Math.trunc(value);
  return String.fromCharCode(65 + index);
}

export function formatRawXdfReciprocityCode(
  reciprocityExpIndex: number | null | undefined,
  reciprocityGIndex: number | null | undefined,
): string {
  const expCode = formatRawXdfReciprocityExpCode(reciprocityExpIndex);
  const gIndex = reciprocityGIndex != null && Number.isFinite(reciprocityGIndex)
    ? Math.trunc(reciprocityGIndex)
    : null;

  if (!expCode || gIndex == null || gIndex < 0) {
    return "—";
  }

  return `R: ${expCode}${gIndex + 1}`;
}

export function formatRawXdfUseReciprocity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  return value > 0 ? "Yes" : "No";
}

export function describeRawXdfMetadata(rawXdf: RawXdfMetadata | null | undefined): RawXdfMetadataDisplay | null {
  if (!rawXdf) return null;

  const paperEsValue = resolveRawXdfPaperEsValue(rawXdf);
  const reciprocity = resolveRawXdfReciprocityTuple(rawXdf);

  if (
    paperEsValue == null
    && reciprocity.reciprocityExpIndex == null
    && reciprocity.reciprocityGIndex == null
    && reciprocity.useReciprocity == null
  ) {
    return null;
  }

  return {
    paperEs: formatRawXdfPaperEsDisplay(paperEsValue),
    reciprocityCode: formatRawXdfReciprocityCode(
      reciprocity.reciprocityExpIndex,
      reciprocity.reciprocityGIndex,
    ),
    useReciprocity: formatRawXdfUseReciprocity(reciprocity.useReciprocity),
  };
}

export function resolveBtzsProfilePaperEs(
  profile: {
    type: string;
    rawXdf?: RawXdfMetadata | null;
    paperEsText?: string | null;
  } | null | undefined,
): number | null {
  if (!profile) return null;

  const rawXdfPaperEs = resolveRawXdfPaperEsValue(profile.rawXdf);
  if (rawXdfPaperEs != null) return rawXdfPaperEs;

  const parsedPaperEsText = parseNumericValue(profile.paperEsText);
  if (parsedPaperEsText != null && parsedPaperEsText > 0) {
    return parsedPaperEsText;
  }

  return null;
}

function readPointCount(reader: BinaryReader, label: string): number {
  const count = reader.readUint32LE(`${label} count`);
  if (count === 0) {
    throw new Error(`${label} count must be greater than zero`);
  }

  const bytesRequired = count * 16;
  if (bytesRequired > reader.remaining) {
    throw new Error(`${label} count overruns the file`);
  }

  return count;
}

export function inferProcessParts(processLabel: string): InferredProcessParts {
  const trimmed = processLabel.trim();
  if (!trimmed) {
    return { developerName: "" };
  }

  const match = trimmed.match(/^(.+?)\s+(\S+)\s*@\s*(\S+)$/u);
  if (!match) {
    return { developerName: trimmed };
  }

  const developerName = match[1].trim();
  const dilution = match[2].trim();
  const temperatureText = match[3].trim();

  if (!developerName || !dilution || !temperatureText) {
    return { developerName: trimmed };
  }

  return {
    developerName,
    dilution,
    temperatureText,
  };
}

export function parseBtzsXdf(bytes: Uint8Array): ParsedBtzsXdf {
  const reader = new BinaryReader(bytes);

  const versionOrType = reader.readUint32LE("versionOrType");
  const displayName = reader.readPrefixedText("displayName");
  const reciprocityExpIndex = reader.readInt32LE("reciprocityExpIndex");
  const reciprocityGIndex = reader.readInt32LE("reciprocityGIndex");
  const useReciprocity = reader.readInt32LE("useReciprocity");
  const processLabel = reader.readPrefixedText("processLabel");
  const paperES = reader.readInt32LE("paperES");

  const efsCount = readPointCount(reader, "efsGPoints");
  const efsGPoints: XdfEfsGPoint[] = [];
  for (let index = 0; index < efsCount; index += 1) {
    // The binary stores the Y value first, then Average G as X.
    const effectiveFilmSpeed = reader.readFloat64LE(`efsGPoints[${index}].effectiveFilmSpeed`);
    const averageGradient = reader.readFloat64LE(`efsGPoints[${index}].averageGradient`);
    assertFinitePositive(effectiveFilmSpeed, `efsGPoints[${index}].effectiveFilmSpeed`);
    assertFinite(averageGradient, `efsGPoints[${index}].averageGradient`);
    efsGPoints.push({ effectiveFilmSpeed, averageGradient });
  }

  const devCount = readPointCount(reader, "devGPoints");
  const devGPoints: XdfDevGPoint[] = [];
  for (let index = 0; index < devCount; index += 1) {
    // The binary stores the Y value first, then Average G as X.
    const developmentMinutes = reader.readFloat64LE(`devGPoints[${index}].developmentMinutes`);
    const averageGradient = reader.readFloat64LE(`devGPoints[${index}].averageGradient`);
    assertFinitePositive(developmentMinutes, `devGPoints[${index}].developmentMinutes`);
    assertFinite(averageGradient, `devGPoints[${index}].averageGradient`);
    devGPoints.push({ developmentMinutes, averageGradient });
  }

  reader.finish();

  return {
    versionOrType,
    displayName,
    reciprocityExpIndex,
    reciprocityGIndex,
    useReciprocity,
    processLabel,
    paperES: paperES / PAPER_ES_SCALE,
    efsGPoints,
    devGPoints,
  };
}
