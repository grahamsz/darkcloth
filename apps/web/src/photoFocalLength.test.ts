import { describe, expect, it } from "vitest";
import { getFocalLengthError, getPrimeLensFocalLengthValue } from "./photoFocalLength";
import type { LensFocalRange } from "./optics";

const createRange = (overrides: Partial<LensFocalRange> = {}): LensFocalRange => ({
  minFocalLengthMm: 50,
  maxFocalLengthMm: 50,
  isPrime: true,
  ...overrides,
});

describe("photo focal length helpers", () => {
  it("prefills prime lenses from their fixed focal length", () => {
    expect(getPrimeLensFocalLengthValue(createRange())).toBe("50");
    expect(getPrimeLensFocalLengthValue(createRange({
      minFocalLengthMm: 35.5,
      maxFocalLengthMm: 35.5,
    }))).toBe("35.5");
  });

  it("validates prime and zoom focal length input against the selected lens range", () => {
    expect(getFocalLengthError(null, "")).toBeNull();
    expect(getFocalLengthError(createRange(), "50")).toBeNull();
    expect(getFocalLengthError(createRange(), "52")).toBe("Focal length must be 50mm for this lens.");
    expect(getFocalLengthError(createRange({
      minFocalLengthMm: 24,
      maxFocalLengthMm: 70,
      isPrime: false,
    }), "80")).toBe("Focal length must be between 24mm and 70mm.");
    expect(getFocalLengthError(createRange({
      minFocalLengthMm: 24,
      maxFocalLengthMm: 70,
      isPrime: false,
    }), "not-a-number")).toBe("Focal length must be a valid number.");
  });
});
