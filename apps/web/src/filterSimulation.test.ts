import { describe, expect, it } from "vitest";
import {
  calculateBrightnessBoostForAverageMatch,
  calculateFilmResponseBrightnessBoostForAverageMatch,
  calculateColorBrightnessBoostForAverageMatch,
  parseHexRgb,
  simulateBlackAndWhiteFilmResponsePixels,
  simulateBlackAndWhiteFilterPixels,
  simulateColorFilterPixels,
  simulateStraightBlackAndWhitePixels,
} from "./filterSimulation";

describe("filter simulation", () => {
  it("parses hex RGB values into normalized channels", () => {
    expect(parseHexRgb("#ff8000")).toEqual({
      red: 1,
      green: 128 / 255,
      blue: 0,
    });
  });

  it("uses selected film spectral response for unfiltered B&W conversion", () => {
    const makeImageData = () => ({
      data: new Uint8ClampedArray([
        220, 20, 20, 255,
        20, 160, 50, 255,
      ]),
    } as ImageData);

    const orthoBoost = calculateFilmResponseBrightnessBoostForAverageMatch(makeImageData(), "orthochromatic");
    const ortho = simulateBlackAndWhiteFilmResponsePixels(makeImageData(), {
      filmSpectralResponseKey: "orthochromatic",
      brightnessBoost: orthoBoost,
    });
    const panchro = simulateBlackAndWhiteFilmResponsePixels(makeImageData(), {
      filmSpectralResponseKey: "modern_panchromatic",
      brightnessBoost: 1,
    });

    expect(ortho.data[0]).toBeLessThan(panchro.data[0]);
    expect(ortho.data[4]).toBeGreaterThan(ortho.data[0]);
  });

  it("writes grayscale pixels after applying the filter response", () => {
    const imageData = {
      data: new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
      ]),
    } as ImageData;

    const result = simulateBlackAndWhiteFilterPixels(imageData, {
      color: "#ff0000",
      strength: 1,
      brightnessBoost: 1,
    });

    expect(Array.from(result.data)).toEqual([
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);
  });

  it("writes a straight grayscale conversion for comparison", () => {
    const imageData = {
      data: new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
      ]),
    } as ImageData;

    const result = simulateStraightBlackAndWhitePixels(imageData);

    expect(Array.from(result.data)).toEqual([
      54, 54, 54, 255,
      182, 182, 182, 255,
    ]);
  });

  it("calculates the brightness boost needed to match average straight grayscale luminance", () => {
    const imageData = {
      data: new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
      ]),
    } as ImageData;

    expect(calculateBrightnessBoostForAverageMatch(imageData, {
      color: "#ff0000",
      strength: 1,
    })).toBeCloseTo(0.9278, 4);
    expect(calculateBrightnessBoostForAverageMatch(imageData, {
      color: "#ffffff",
      strength: 1,
    })).toBeCloseTo(1, 12);
  });

  it("uses strength above 1 to strongly suppress non-filter channels", () => {
    const imageData = {
      data: new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
      ]),
    } as ImageData;

    const result = simulateBlackAndWhiteFilterPixels(imageData, {
      color: "#e1261c",
      strength: 3,
      brightnessBoost: 1,
    });

    const redPatch = result.data[0];
    const greenPatch = result.data[4];
    expect(redPatch).toBeGreaterThan(235);
    expect(greenPatch).toBeLessThan(70);
  });

  it("amplifies tonal separation from straight black and white above strength 1", () => {
    const imageData = {
      data: new Uint8ClampedArray([
        79, 154, 38, 255,
        84, 156, 213, 255,
      ]),
    } as ImageData;

    const result = simulateBlackAndWhiteFilterPixels(imageData, {
      color: "#2f9a4a",
      strength: 3,
      brightnessBoost: 1,
    });

    expect(result.data[0]).toBeGreaterThan(185);
    expect(result.data[4]).toBeLessThan(180);
  });

  it("uses Kodak/Wratten spectral curves when a curve key is available", () => {
    const imageData = {
      data: new Uint8ClampedArray([
        200, 20, 20, 255,
        20, 180, 40, 255,
        40, 110, 220, 255,
      ]),
    } as ImageData;

    const boost = calculateBrightnessBoostForAverageMatch(imageData, {
      color: "#e1261c",
      strength: 1,
      spectralCurveKey: "wratten_25",
    });
    const result = simulateBlackAndWhiteFilterPixels(imageData, {
      color: "#e1261c",
      strength: 1,
      spectralCurveKey: "wratten_25",
      brightnessBoost: boost,
    });

    const redPatch = result.data[0];
    const greenPatch = result.data[4];
    const bluePatch = result.data[8];
    expect(redPatch).toBeGreaterThan(greenPatch);
    expect(redPatch).toBeGreaterThan(bluePatch);
    expect(bluePatch).toBeLessThan(80);
  });

  it("uses a stronger deep-red spectral curve for Wratten 25A presets", () => {
    const makeImageData = () => ({
      data: new Uint8ClampedArray([
        220, 40, 30, 255,
        35, 180, 70, 255,
        70, 125, 225, 255,
      ]),
    } as ImageData);
    const regularRed = simulateBlackAndWhiteFilterPixels(makeImageData(), {
      color: "#e1261c",
      strength: 3,
      spectralCurveKey: "wratten_25",
      brightnessBoost: 1,
    });
    const deepRed = simulateBlackAndWhiteFilterPixels(makeImageData(), {
      color: "#b90f17",
      strength: 3,
      spectralCurveKey: "wratten_29",
      brightnessBoost: 1,
    });

    expect(deepRed.data[4]).toBeLessThan(regularRed.data[4]);
    expect(deepRed.data[8]).toBeLessThan(regularRed.data[8]);
  });

  it("keeps deep red from leaking blue-sky RGB through the red channel", () => {
    const imageData = {
      data: new Uint8ClampedArray([
        135, 206, 235, 255,
        35, 145, 55, 255,
        200, 45, 35, 255,
      ]),
    } as ImageData;

    const result = simulateBlackAndWhiteFilterPixels(imageData, {
      color: "#b90f17",
      strength: 3,
      spectralCurveKey: "wratten_29",
      brightnessBoost: 1,
    });

    expect(result.data[0]).toBeLessThan(70);
    expect(result.data[4]).toBeLessThan(45);
    expect(result.data[8]).toBeGreaterThan(result.data[0]);
    expect(result.data[8]).toBeGreaterThan(result.data[4]);
  });

  it("allows low-transmission spectral filters to auto-match brightness", () => {
    const imageData = {
      data: new Uint8ClampedArray([
        120, 180, 230, 255,
        90, 120, 160, 255,
      ]),
    } as ImageData;

    const boost = calculateBrightnessBoostForAverageMatch(imageData, {
      color: "#2457d6",
      strength: 3,
      spectralCurveKey: "wratten_47",
    });

    expect(boost).toBeGreaterThan(3);
    expect(boost).toBeLessThanOrEqual(12);
  });

  it("can apply a spectral filter while preserving a color image", () => {
    const imageData = {
      data: new Uint8ClampedArray([
        220, 40, 30, 255,
        35, 180, 70, 255,
        70, 125, 225, 255,
      ]),
    } as ImageData;

    const boost = calculateColorBrightnessBoostForAverageMatch(imageData, {
      color: "#e1261c",
      strength: 1,
      spectralCurveKey: "wratten_25",
    });
    const result = simulateColorFilterPixels(imageData, {
      color: "#e1261c",
      strength: 1,
      spectralCurveKey: "wratten_25",
      brightnessBoost: boost,
    });

    expect(result.data[0]).toBeGreaterThan(result.data[1]);
    expect(result.data[0]).toBeGreaterThan(result.data[2]);
    expect(result.data[10]).toBeLessThan(170);
    expect(result.data[8]).not.toEqual(result.data[9]);
    expect(result.data[1]).toBeLessThan(40);
    expect(result.data[2]).toBeLessThan(30);
  });
});
