import type { LensFocalRange } from "./optics";

const FOCAL_LENGTH_EPSILON = 1e-6;

export function getPrimeLensFocalLengthValue(range: LensFocalRange | null | undefined) {
  if (!range?.isPrime) return null;
  return Number.isInteger(range.minFocalLengthMm)
    ? String(range.minFocalLengthMm)
    : String(Number.parseFloat(range.minFocalLengthMm.toFixed(3)));
}

export function getFocalLengthError(range: LensFocalRange | null | undefined, focalLength: string) {
  if (!range || !focalLength.trim()) return null;
  const value = Number.parseFloat(focalLength.trim());
  if (!Number.isFinite(value)) return "Focal length must be a valid number.";
  if (value <= 0) return "Focal length must be greater than zero.";
  if (range.isPrime) {
    if (Math.abs(value - range.minFocalLengthMm) > FOCAL_LENGTH_EPSILON) {
      return `Focal length must be ${range.minFocalLengthMm}mm for this lens.`;
    }
    return null;
  }
  if (value < range.minFocalLengthMm || value > range.maxFocalLengthMm) {
    return `Focal length must be between ${range.minFocalLengthMm}mm and ${range.maxFocalLengthMm}mm.`;
  }
  return null;
}
