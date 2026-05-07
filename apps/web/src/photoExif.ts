import * as exifr from "exifr";

export interface ReferenceImageExifExposureEstimate {
  fileSignature: string;
  fileName: string;
  ev100: number;
  aperture: number;
  shutterSeconds: number;
  iso: number;
  capturedAt?: string;
  cameraLabel?: string;
  focalLengthMm?: number;
}

type ExifRationalLike = {
  numerator?: number;
  denominator?: number;
};

export type ExifExposureTags = Record<string, unknown>;

const EXIF_EXPOSURE_TAGS = [
  "DateTimeOriginal",
  "CreateDate",
  "Make",
  "Model",
  "LensModel",
  "FocalLength",
  "FNumber",
  "ApertureValue",
  "ExposureTime",
  "ShutterSpeedValue",
  "ISOSpeedRatings",
  "PhotographicSensitivity",
  "ISO",
];

export function calculateEv100(aperture: number, shutterSeconds: number, iso: number): number {
  return Math.log2((aperture * aperture) / shutterSeconds) - Math.log2(iso / 100);
}

function finitePositive(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return finitePositive(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.includes("/")) {
      const [numeratorText, denominatorText] = trimmed.split("/", 2);
      const numerator = Number(numeratorText);
      const denominator = Number(denominatorText);
      return denominator !== 0 ? finitePositive(numerator / denominator) : null;
    }
    return finitePositive(Number(trimmed));
  }
  if (Array.isArray(value) && value.length > 0) return readNumber(value[0]);
  if (value && typeof value === "object") {
    const rational = value as ExifRationalLike;
    if (typeof rational.numerator === "number" && typeof rational.denominator === "number" && rational.denominator !== 0) {
      return finitePositive(rational.numerator / rational.denominator);
    }
  }
  return null;
}

function readShutterSeconds(tags: ExifExposureTags): number | null {
  const exposureTime = readNumber(tags.ExposureTime);
  if (exposureTime != null) return exposureTime;

  const shutterSpeedValue = readNumber(tags.ShutterSpeedValue);
  return shutterSpeedValue != null ? finitePositive(1 / Math.pow(2, shutterSpeedValue)) : null;
}

function readAperture(tags: ExifExposureTags): number | null {
  const fNumber = readNumber(tags.FNumber);
  if (fNumber != null) return fNumber;

  const apertureValue = readNumber(tags.ApertureValue);
  return apertureValue != null ? finitePositive(Math.pow(Math.SQRT2, apertureValue)) : null;
}

function readIso(tags: ExifExposureTags): number | null {
  return readNumber(tags.ISO)
    ?? readNumber(tags.ISOSpeedRatings)
    ?? readNumber(tags.PhotographicSensitivity);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildCameraLabel(tags: ExifExposureTags): string | undefined {
  const make = readString(tags.Make);
  const model = readString(tags.Model);
  return [make, model].filter(Boolean).join(" ") || undefined;
}

export function buildReferenceImageExifExposureEstimate(
  file: Pick<File, "name">,
  fileSignature: string,
  tags: ExifExposureTags,
): ReferenceImageExifExposureEstimate | null {
  const aperture = readAperture(tags);
  const shutterSeconds = readShutterSeconds(tags);
  const iso = readIso(tags);

  if (aperture == null || shutterSeconds == null || iso == null) return null;

  return {
    fileSignature,
    fileName: file.name,
    ev100: calculateEv100(aperture, shutterSeconds, iso),
    aperture,
    shutterSeconds,
    iso,
    capturedAt: readString(tags.DateTimeOriginal) ?? readString(tags.CreateDate) ?? undefined,
    cameraLabel: buildCameraLabel(tags),
    focalLengthMm: readNumber(tags.FocalLength) ?? undefined,
  };
}

export async function extractReferenceImageExifExposureEstimate(
  file: File,
  fileSignature: string,
): Promise<ReferenceImageExifExposureEstimate | null> {
  const tags = await exifr.parse(file, {
    pick: EXIF_EXPOSURE_TAGS,
    gps: false,
    translateValues: false,
  });
  if (!tags || typeof tags !== "object") return null;
  return buildReferenceImageExifExposureEstimate(file, fileSignature, tags as ExifExposureTags);
}

export function formatExifEv100(ev100: number): string {
  return `EV ${ev100.toFixed(1)}`;
}

export function formatExifShutter(shutterSeconds: number): string {
  if (!Number.isFinite(shutterSeconds) || shutterSeconds <= 0) return "";
  if (shutterSeconds < 1) {
    const denominator = Math.round(1 / shutterSeconds);
    return `1/${denominator}`;
  }
  return `${Number(shutterSeconds.toFixed(2))}s`;
}
