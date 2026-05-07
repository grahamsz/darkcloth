import type { FilterSimulationSettings } from "./photoFilters";
import { getFilterSpectralCurve, type FilterSpectralCurve } from "./filterSpectralCurves";
import { getFilmSpectralResponsePreset, type FilmSpectralResponseKey } from "./filmSpectralResponse";

export type FilterSimulationRgb = {
  red: number;
  green: number;
  blue: number;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const LUMINANCE_WEIGHTS = {
  red: 0.2126,
  green: 0.7152,
  blue: 0.0722,
};

// Preview work favors responsiveness; deferred final renders use the default higher-resolution LUT.
const DEFAULT_FILTER_LUT_LEVELS = 64;
export const PREVIEW_FILTER_LUT_LEVELS = 32;
const FILTER_LUT_CACHE_LIMIT = 24;
const filterLuminanceLutCache = new Map<string, Uint8Array>();
const filmLuminanceLutCache = new Map<string, Uint8Array>();

const getSimulationWavelengths = (curve: FilterSpectralCurve) => {
  const wavelengths = curve.points
    .map(point => point.wavelengthNm)
    .filter(wavelengthNm => wavelengthNm >= 380 && wavelengthNm <= 700);
  return wavelengths.length > 0 ? wavelengths : [380, 400, 425, 450, 475, 500, 525, 550, 575, 600, 625, 650, 675, 700];
};

const gaussian = (wavelengthNm: number, centerNm: number, widthNm: number) => (
  Math.exp(-0.5 * ((wavelengthNm - centerNm) / widthNm) ** 2)
);

const srgbToLinear = (value: number) => (
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
);

const linearToSrgb = (value: number) => (
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
);

const getApproximateColorBasis = (wavelengthNm: number) => ({
  red: gaussian(wavelengthNm, 620, 48) + 0.18 * gaussian(wavelengthNm, 700, 70),
  green: gaussian(wavelengthNm, 540, 45),
  blue: gaussian(wavelengthNm, 455, 34) + 0.08 * gaussian(wavelengthNm, 400, 28),
});

const getPanchromaticResponse = (wavelengthNm: number) => (
  0.95 * gaussian(wavelengthNm, 455, 55)
  + 1.0 * gaussian(wavelengthNm, 545, 62)
  + 0.72 * gaussian(wavelengthNm, 635, 70)
);

const interpolateFilmResponse = (key: FilmSpectralResponseKey | null | undefined, wavelengthNm: number) => {
  const preset = getFilmSpectralResponsePreset(key);
  if (!preset) return getPanchromaticResponse(wavelengthNm);
  const points = preset.points;
  if (points.length === 0) return getPanchromaticResponse(wavelengthNm);
  if (wavelengthNm <= points[0].wavelengthNm) return points[0].sensitivity;
  const last = points[points.length - 1];
  if (wavelengthNm >= last.wavelengthNm) return last.sensitivity;

  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (wavelengthNm > right.wavelengthNm) continue;
    const left = points[index - 1];
    const span = right.wavelengthNm - left.wavelengthNm;
    const t = span === 0 ? 0 : (wavelengthNm - left.wavelengthNm) / span;
    return left.sensitivity + (right.sensitivity - left.sensitivity) * t;
  }

  return last.sensitivity;
};

const getRedDominanceAdjustment = (
  curve: FilterSpectralCurve,
  linearRed: number,
  linearGreen: number,
  linearBlue: number,
) => {
  if (curve.key !== "wratten_29" && curve.key !== "wratten_25") return 1;
  const strongestChannel = Math.max(linearRed, linearGreen, linearBlue, 0.0001);
  const redDominance = clamp(linearRed / strongestChannel, 0.02, 1);
  return redDominance ** (curve.key === "wratten_29" ? 0.7 : 0.35);
};

const getTransmission = (settings: Pick<FilterSimulationSettings, "color">) => {
  const rgb = parseHexRgb(settings.color);
  return {
    red: rgb.red ** 2,
    green: rgb.green ** 2,
    blue: rgb.blue ** 2,
  };
};

const getRgbColorMultipliers = (settings: Pick<FilterSimulationSettings, "color" | "strength">) => {
  const transmission = getTransmission(settings);
  const strength = clamp(settings.strength, 0, 3);
  return {
    red: transmission.red ** strength,
    green: transmission.green ** strength,
    blue: transmission.blue ** strength,
  };
};

const getFilterChannelWeights = (settings: Pick<FilterSimulationSettings, "color" | "strength">) => {
  const transmission = getTransmission(settings);
  const red = LUMINANCE_WEIGHTS.red * transmission.red;
  const green = LUMINANCE_WEIGHTS.green * transmission.green;
  const blue = LUMINANCE_WEIGHTS.blue * transmission.blue;
  const total = red + green + blue;
  if (total <= 0) return LUMINANCE_WEIGHTS;
  return {
    red: red / total,
    green: green / total,
    blue: blue / total,
  };
};

const interpolateTransmission = (curve: FilterSpectralCurve, wavelengthNm: number) => {
  const points = curve.points;
  if (points.length === 0) return 1;
  if (wavelengthNm <= points[0].wavelengthNm) return points[0].transmission;
  const last = points[points.length - 1];
  if (wavelengthNm >= last.wavelengthNm) return last.transmission;

  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (wavelengthNm > right.wavelengthNm) continue;
    const left = points[index - 1];
    const span = right.wavelengthNm - left.wavelengthNm;
    const t = span === 0 ? 0 : (wavelengthNm - left.wavelengthNm) / span;
    return left.transmission + (right.transmission - left.transmission) * t;
  }

  return last.transmission;
};

const getSpectralFilteredLuminance = (
  red: number,
  green: number,
  blue: number,
  settings: Pick<FilterSimulationSettings, "strength" | "spectralCurveKey"> & { filmSpectralResponseKey?: FilmSpectralResponseKey | null },
) => {
  const curve = getFilterSpectralCurve(settings.spectralCurveKey);
  if (!curve) return null;

  const strength = clamp(settings.strength, 0, 3);
  const linearRed = srgbToLinear(red);
  const linearGreen = srgbToLinear(green);
  const linearBlue = srgbToLinear(blue);
  let numerator = 0;
  let denominator = 0;
  const redDominanceAdjustment = getRedDominanceAdjustment(curve, linearRed, linearGreen, linearBlue);

  for (const wavelengthNm of getSimulationWavelengths(curve)) {
    const basis = getApproximateColorBasis(wavelengthNm);
    const filmResponse = interpolateFilmResponse(settings.filmSpectralResponseKey, wavelengthNm);
    const reflectance = linearRed * basis.red + linearGreen * basis.green + linearBlue * basis.blue;
    const transmission = interpolateTransmission(curve, wavelengthNm);
    numerator += reflectance * filmResponse * transmission ** strength;
    denominator += (basis.red + basis.green + basis.blue) * filmResponse;
  }

  if (denominator <= 0) return 0;
  return linearToSrgb(clamp((numerator / denominator) * redDominanceAdjustment));
};

const getSpectralColorMultipliers = (
  settings: Pick<FilterSimulationSettings, "strength" | "spectralCurveKey">,
) => {
  const curve = getFilterSpectralCurve(settings.spectralCurveKey);
  if (!curve) return null;

  const strength = clamp(settings.strength, 0, 3);
  // For color previews, model the filter as colored glass over a phone image.
  // Direct RGB-band transmission gives a visibly useful preview; broad basis
  // averaging makes strong filters look almost neutral after brightness matching.
  return {
    red: interpolateTransmission(curve, 620) ** strength,
    green: interpolateTransmission(curve, 540) ** strength,
    blue: interpolateTransmission(curve, 455) ** strength,
  };
};

const getColorFilterMultipliers = (
  settings: Pick<FilterSimulationSettings, "color" | "strength" | "spectralCurveKey">,
) => (
  getSpectralColorMultipliers(settings) ?? getRgbColorMultipliers(settings)
);

const getRgbFilteredLuminance = (
  red: number,
  green: number,
  blue: number,
  settings: Pick<FilterSimulationSettings, "color" | "strength">,
) => {
  const weights = getFilterChannelWeights(settings);
  const strength = clamp(settings.strength, 0, 3);
  const straight = LUMINANCE_WEIGHTS.red * red + LUMINANCE_WEIGHTS.green * green + LUMINANCE_WEIGHTS.blue * blue;
  const filtered = weights.red * red + weights.green * green + weights.blue * blue;
  return clamp(straight + (filtered - straight) * strength);
};

const getFilteredLuminance = (
  red: number,
  green: number,
  blue: number,
  settings: Pick<FilterSimulationSettings, "color" | "strength" | "spectralCurveKey"> & { filmSpectralResponseKey?: FilmSpectralResponseKey | null },
) => (
  getSpectralFilteredLuminance(red, green, blue, settings)
  ?? getRgbFilteredLuminance(red, green, blue, settings)
);

const getLutIndexFromByteChannels = (red: number, green: number, blue: number, levels: number) => {
  const channelSize = levels * levels;
  const channelShift = 8 - Math.log2(levels);
  return (
    (red >> channelShift) * channelSize
    + (green >> channelShift) * levels
    + (blue >> channelShift)
  );
};

const filterLutKey = (settings: Pick<FilterSimulationSettings, "color" | "strength" | "spectralCurveKey"> & { filmSpectralResponseKey?: FilmSpectralResponseKey | null }) => [
  settings.spectralCurveKey ?? "",
  settings.color,
  Number(settings.strength.toFixed(4)),
  "filmSpectralResponseKey" in settings ? settings.filmSpectralResponseKey ?? "" : "",
].join("|");

function getFilterLuminanceLut(
  settings: Pick<FilterSimulationSettings, "color" | "strength" | "spectralCurveKey"> & { filmSpectralResponseKey?: FilmSpectralResponseKey | null },
  levels = DEFAULT_FILTER_LUT_LEVELS,
) {
  const key = `${levels}|${filterLutKey(settings)}`;
  const cached = filterLuminanceLutCache.get(key);
  if (cached) return cached;

  const lut = new Uint8Array(levels * levels * levels);
  let index = 0;
  for (let redIndex = 0; redIndex < levels; redIndex += 1) {
    const red = redIndex / (levels - 1);
    for (let greenIndex = 0; greenIndex < levels; greenIndex += 1) {
      const green = greenIndex / (levels - 1);
      for (let blueIndex = 0; blueIndex < levels; blueIndex += 1) {
        const blue = blueIndex / (levels - 1);
        lut[index] = Math.round(clamp(getFilteredLuminance(red, green, blue, settings)) * 255);
        index += 1;
      }
    }
  }

  if (filterLuminanceLutCache.size >= FILTER_LUT_CACHE_LIMIT) {
    const firstKey = filterLuminanceLutCache.keys().next().value;
    if (firstKey) filterLuminanceLutCache.delete(firstKey);
  }
  filterLuminanceLutCache.set(key, lut);
  return lut;
}

const filmLutKey = (key: FilmSpectralResponseKey | null | undefined) => key ?? "";

const getFilmResponseLuminance = (
  red: number,
  green: number,
  blue: number,
  key: FilmSpectralResponseKey,
) => {
  const wavelengths = [380, 400, 425, 450, 475, 500, 525, 550, 575, 600, 625, 650, 675, 700];
  const linearRed = srgbToLinear(red);
  const linearGreen = srgbToLinear(green);
  const linearBlue = srgbToLinear(blue);
  let numerator = 0;
  let denominator = 0;

  for (const wavelengthNm of wavelengths) {
    const basis = getApproximateColorBasis(wavelengthNm);
    const filmResponse = interpolateFilmResponse(key, wavelengthNm);
    numerator += (linearRed * basis.red + linearGreen * basis.green + linearBlue * basis.blue) * filmResponse;
    denominator += (basis.red + basis.green + basis.blue) * filmResponse;
  }

  if (denominator <= 0) return 0;
  return linearToSrgb(clamp(numerator / denominator));
};

function getFilmLuminanceLut(key: FilmSpectralResponseKey, levels = DEFAULT_FILTER_LUT_LEVELS) {
  const cacheKey = `${levels}|${filmLutKey(key)}`;
  const cached = filmLuminanceLutCache.get(cacheKey);
  if (cached) return cached;

  const lut = new Uint8Array(levels * levels * levels);
  let index = 0;
  for (let redIndex = 0; redIndex < levels; redIndex += 1) {
    const red = redIndex / (levels - 1);
    for (let greenIndex = 0; greenIndex < levels; greenIndex += 1) {
      const green = greenIndex / (levels - 1);
      for (let blueIndex = 0; blueIndex < levels; blueIndex += 1) {
        const blue = blueIndex / (levels - 1);
        lut[index] = Math.round(clamp(getFilmResponseLuminance(red, green, blue, key)) * 255);
        index += 1;
      }
    }
  }

  if (filmLuminanceLutCache.size >= FILTER_LUT_CACHE_LIMIT) {
    const firstKey = filmLuminanceLutCache.keys().next().value;
    if (firstKey) filmLuminanceLutCache.delete(firstKey);
  }
  filmLuminanceLutCache.set(cacheKey, lut);
  return lut;
}

export const parseHexRgb = (value: string): FilterSimulationRgb => {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value.slice(1) : "f05a28";
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16) / 255,
    green: Number.parseInt(normalized.slice(2, 4), 16) / 255,
    blue: Number.parseInt(normalized.slice(4, 6), 16) / 255,
  };
};

const isNeutralRgbFilter = (settings: Pick<FilterSimulationSettings, "color" | "spectralCurveKey">) => {
  if (settings.spectralCurveKey) return false;
  const rgb = parseHexRgb(settings.color);
  return rgb.red === 1 && rgb.green === 1 && rgb.blue === 1;
};

export function simulateBlackAndWhiteFilterPixels(
  imageData: ImageData,
  settings: Pick<FilterSimulationSettings, "color" | "strength" | "spectralCurveKey"> & { brightnessBoost?: number; lutLevels?: number; filmSpectralResponseKey?: FilmSpectralResponseKey | null },
) {
  const maxBrightness = settings.spectralCurveKey ? 12 : 3;
  const brightness = clamp(settings.brightnessBoost ?? 1, 0.01, maxBrightness);
  const lutLevels = settings.lutLevels ?? DEFAULT_FILTER_LUT_LEVELS;
  const lut = getFilterLuminanceLut(settings, lutLevels);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const filtered = lut[getLutIndexFromByteChannels(data[index], data[index + 1], data[index + 2], lutLevels)] / 255;
    const gray = Math.round(clamp(filtered * brightness) * 255);
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }

  return imageData;
}

export function simulateBlackAndWhiteFilterPixelsDetailed(
  imageData: ImageData,
  settings: Pick<FilterSimulationSettings, "color" | "strength" | "spectralCurveKey"> & { brightnessBoost?: number; filmSpectralResponseKey?: FilmSpectralResponseKey | null },
) {
  const maxBrightness = settings.spectralCurveKey ? 12 : 3;
  const brightness = clamp(settings.brightnessBoost ?? 1, 0.01, maxBrightness);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const filtered = getFilteredLuminance(data[index] / 255, data[index + 1] / 255, data[index + 2] / 255, settings);
    const gray = Math.round(clamp(filtered * brightness) * 255);
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }

  return imageData;
}

export function simulateColorFilterPixels(
  imageData: ImageData,
  settings: Pick<FilterSimulationSettings, "color" | "strength" | "spectralCurveKey"> & { brightnessBoost?: number },
) {
  const maxBrightness = settings.spectralCurveKey ? 12 : 3;
  const brightness = clamp(settings.brightnessBoost ?? 1, 0.01, maxBrightness);
  const multipliers = getColorFilterMultipliers(settings);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const red = srgbToLinear(data[index] / 255) * multipliers.red * brightness;
    const green = srgbToLinear(data[index + 1] / 255) * multipliers.green * brightness;
    const blue = srgbToLinear(data[index + 2] / 255) * multipliers.blue * brightness;
    data[index] = Math.round(clamp(linearToSrgb(clamp(red))) * 255);
    data[index + 1] = Math.round(clamp(linearToSrgb(clamp(green))) * 255);
    data[index + 2] = Math.round(clamp(linearToSrgb(clamp(blue))) * 255);
  }

  return imageData;
}

export function simulateStraightBlackAndWhitePixels(imageData: ImageData) {
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] / 255;
    const green = data[index + 1] / 255;
    const blue = data[index + 2] / 255;
    const gray = Math.round(clamp(LUMINANCE_WEIGHTS.red * red + LUMINANCE_WEIGHTS.green * green + LUMINANCE_WEIGHTS.blue * blue) * 255);
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }

  return imageData;
}

export function simulateBlackAndWhiteFilmResponsePixels(
  imageData: ImageData,
  settings: { filmSpectralResponseKey: FilmSpectralResponseKey; brightnessBoost?: number; lutLevels?: number },
) {
  const brightness = clamp(settings.brightnessBoost ?? 1, 0.01, 12);
  const lutLevels = settings.lutLevels ?? DEFAULT_FILTER_LUT_LEVELS;
  const lut = getFilmLuminanceLut(settings.filmSpectralResponseKey, lutLevels);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const filtered = lut[getLutIndexFromByteChannels(data[index], data[index + 1], data[index + 2], lutLevels)] / 255;
    const gray = Math.round(clamp(filtered * brightness) * 255);
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }

  return imageData;
}

export function calculateFilmResponseBrightnessBoostForAverageMatch(
  imageData: ImageData,
  filmSpectralResponseKey: FilmSpectralResponseKey,
  lutLevels = DEFAULT_FILTER_LUT_LEVELS,
) {
  const data = imageData.data;
  const lut = getFilmLuminanceLut(filmSpectralResponseKey, lutLevels);
  let straightTotal = 0;
  let filteredTotal = 0;
  let count = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const red = data[index] / 255;
    const green = data[index + 1] / 255;
    const blue = data[index + 2] / 255;
    straightTotal += LUMINANCE_WEIGHTS.red * red + LUMINANCE_WEIGHTS.green * green + LUMINANCE_WEIGHTS.blue * blue;
    filteredTotal += lut[getLutIndexFromByteChannels(data[index], data[index + 1], data[index + 2], lutLevels)] / 255;
    count += 1;
  }

  if (count === 0 || filteredTotal <= 0) return 1;
  return clamp(straightTotal / filteredTotal, 0.01, 12);
}

export function calculateBrightnessBoostForAverageMatch(
  imageData: ImageData,
  settings: Pick<FilterSimulationSettings, "color" | "strength" | "spectralCurveKey"> & { filmSpectralResponseKey?: FilmSpectralResponseKey | null },
  method: "lut" | "detailed" = "lut",
  lutLevels = DEFAULT_FILTER_LUT_LEVELS,
) {
  if (isNeutralRgbFilter(settings)) return 1;

  const data = imageData.data;
  const lut = method === "lut" ? getFilterLuminanceLut(settings, lutLevels) : null;
  let straightTotal = 0;
  let filteredTotal = 0;
  let count = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const red = data[index] / 255;
    const green = data[index + 1] / 255;
    const blue = data[index + 2] / 255;
    const straight = LUMINANCE_WEIGHTS.red * red + LUMINANCE_WEIGHTS.green * green + LUMINANCE_WEIGHTS.blue * blue;
    straightTotal += straight;
    filteredTotal += lut
      ? lut[getLutIndexFromByteChannels(data[index], data[index + 1], data[index + 2], lutLevels)] / 255
      : getFilteredLuminance(red, green, blue, settings);
    count += 1;
  }

  if (count === 0 || filteredTotal <= 0) return 1;
  return clamp(straightTotal / filteredTotal, 0.01, settings.spectralCurveKey ? 12 : 3);
}

export function calculateColorBrightnessBoostForAverageMatch(
  imageData: ImageData,
  settings: Pick<FilterSimulationSettings, "color" | "strength" | "spectralCurveKey">,
) {
  if (isNeutralRgbFilter(settings)) return 1;

  const data = imageData.data;
  const multipliers = getColorFilterMultipliers(settings);
  let straightTotal = 0;
  let filteredTotal = 0;
  let count = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const red = data[index] / 255;
    const green = data[index + 1] / 255;
    const blue = data[index + 2] / 255;
    const filteredRed = linearToSrgb(srgbToLinear(red) * multipliers.red);
    const filteredGreen = linearToSrgb(srgbToLinear(green) * multipliers.green);
    const filteredBlue = linearToSrgb(srgbToLinear(blue) * multipliers.blue);
    straightTotal += LUMINANCE_WEIGHTS.red * red + LUMINANCE_WEIGHTS.green * green + LUMINANCE_WEIGHTS.blue * blue;
    filteredTotal += (
      LUMINANCE_WEIGHTS.red * filteredRed
      + LUMINANCE_WEIGHTS.green * filteredGreen
      + LUMINANCE_WEIGHTS.blue * filteredBlue
    );
    count += 1;
  }

  if (count === 0 || filteredTotal <= 0) return 1;
  return clamp(straightTotal / filteredTotal, 0.01, settings.spectralCurveKey ? 12 : 3);
}
