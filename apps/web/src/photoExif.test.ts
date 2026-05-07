import { describe, expect, it } from "vitest";
import {
  buildReferenceImageExifExposureEstimate,
  calculateEv100,
  formatExifShutter,
} from "./photoExif";

describe("photoExif", () => {
  it("calculates EV100 from aperture, shutter, and ISO", () => {
    expect(calculateEv100(2.8, 1 / 125, 100)).toBeCloseTo(9.94, 2);
  });

  it("normalizes higher ISO captures back to EV100", () => {
    expect(calculateEv100(2.8, 1 / 125, 400)).toBeCloseTo(7.94, 2);
  });

  it("builds an exposure estimate from common EXIF tags", () => {
    const estimate = buildReferenceImageExifExposureEstimate(
      { name: "phone.jpg" },
      "phone.jpg:100:1",
      {
        FNumber: 5.6,
        ExposureTime: "1/250",
        ISOSpeedRatings: [200],
        Make: "Fujifilm",
        Model: "X100V",
        FocalLength: { numerator: 23, denominator: 1 },
      },
    );

    expect(estimate).not.toBeNull();
    expect(estimate?.ev100).toBeCloseTo(11.94, 2);
    expect(estimate?.aperture).toBe(5.6);
    expect(estimate?.shutterSeconds).toBeCloseTo(1 / 250, 12);
    expect(estimate?.iso).toBe(200);
    expect(estimate?.cameraLabel).toBe("Fujifilm X100V");
    expect(estimate?.focalLengthMm).toBe(23);
  });

  it("returns null when exposure tags are incomplete", () => {
    const estimate = buildReferenceImageExifExposureEstimate(
      { name: "missing.jpg" },
      "missing.jpg:100:1",
      {
        FNumber: 5.6,
        ISO: 100,
      },
    );

    expect(estimate).toBeNull();
  });

  it("formats sub-second shutters as reciprocal values", () => {
    expect(formatExifShutter(1 / 125)).toBe("1/125");
    expect(formatExifShutter(2.25)).toBe("2.25s");
  });
});
