import type { ApertureIncrement } from "./api/client";

const APERTURE_EPSILON = 1e-9;
const FOCAL_RANGE_EPSILON = 1e-9;
const HALF_TOLERANCE = 0.02;
const APERTURE_NEAR_MIN_GENERATED_THRESHOLD = 0.015;

export const APERTURE_INCREMENT_OPTIONS = [
  { value: "full", label: "Full stop" },
  { value: "half", label: "Half stop" },
  { value: "third", label: "Third stop" },
] as const;

export type ApertureIncrementOption = (typeof APERTURE_INCREMENT_OPTIONS)[number]["value"];

const APERTURE_STEPS_PER_STOP: Record<ApertureIncrementOption, number> = {
  full: 1,
  half: 2,
  third: 3,
};
const APERTURE_EXPONENT_SCALE = 2;

const APERTURE_OFFSET_LABELS: Record<ApertureIncrementOption, string[]> = {
  full: [],
  half: ["1/2"],
  third: ["1/3", "2/3"],
};

const APERTURE_OFFSET_DISPLAY_LABELS: Record<ApertureIncrementOption, string[]> = {
  full: [],
  half: ["1/2"],
  third: ["⅓", "⅔"],
};

const APERTURE_FULL_STOPS = [
  1,
  1.4,
  2,
  2.8,
  4,
  5.6,
  8,
  11,
  16,
  22,
  32,
  45,
  64,
  90,
  128,
  181,
  256,
] as const;

const APERTURE_HALF_STOP_VALUES = [
  1,
  1.2,
  1.4,
  1.7,
  2,
  2.4,
  2.8,
  3.3,
  4,
  4.8,
  5.6,
  6.7,
  8,
  9.5,
  11,
  13,
  16,
  19,
  22,
  27,
  32,
  38,
  45,
  54,
  64,
  76,
  90,
  107,
  128,
  152,
  181,
  215,
  256,
] as const;

const APERTURE_THIRD_STOP_VALUES = [
  1,
  1.1,
  1.2,
  1.4,
  1.6,
  1.8,
  2,
  2.2,
  2.5,
  2.8,
  3.2,
  3.5,
  4,
  4.5,
  5,
  5.6,
  6.3,
  7.1,
  8,
  8.9,
  10,
  11,
  13,
  14,
  16,
  18,
  20,
  22,
  25,
  29,
  32,
  36,
  40,
  45,
  51,
  57,
  64,
  72,
  80,
  90,
  101,
  114,
  128,
  144,
  161,
  181,
  203,
  228,
  256,
] as const;
const SHUTTER_SPEED_COMMON_SECONDS = [
  1 / 8000,
  1 / 4000,
  1 / 2000,
  1 / 1000,
  1 / 500,
  1 / 250,
  1 / 125,
  1 / 60,
  1 / 30,
  1 / 15,
  1 / 8,
  1 / 4,
  1 / 2,
  1,
  2,
  4,
  8,
  15,
  30,
  60,
  120,
] as const;

export const STANDARD_SHUTTER_SPEED_SECONDS = [
  1 / 8000,
  1 / 4000,
  1 / 2000,
  1 / 1000,
  1 / 500,
  1 / 250,
  1 / 125,
  1 / 60,
  1 / 30,
  1 / 15,
  1 / 8,
  1 / 4,
  1 / 2,
  1,
] as const;

export const SHUTTER_BULB_VALUE = "bulb";
const SHUTTER_VALUE_EPSILON = 1e-6;

export const DEFAULT_APERTURE_MIN_F_STOP = 5.6;
export const DEFAULT_APERTURE_MAX_F_STOP = 32;

export interface ApertureChoice {
  value: string;
  label: string;
}

export function isApertureIncrementAllowed(value: string | null | undefined): value is ApertureIncrement {
  return value === "full" || value === "half" || value === "third";
}

export function normalizeApertureIncrement(value: string | null | undefined): ApertureIncrement {
  return isApertureIncrementAllowed(value) ? value : "full";
}

export function getApertureIncrementLabel(value: ApertureIncrement | string): string {
  const match = APERTURE_INCREMENT_OPTIONS.find(option => option.value === value);
  return match ? match.label : "Full stop";
}

export interface ApertureInput {
  min_f_stop?: number | null;
  max_f_stop?: number | null;
  aperture_increment?: ApertureIncrement | null;
}

const parseApertureInput = (input?: ApertureInput) => {
  const minFStop = input?.min_f_stop ?? null;
  const maxFStop = input?.max_f_stop ?? null;

  if (
    minFStop == null ||
    maxFStop == null ||
    !Number.isFinite(minFStop) ||
    !Number.isFinite(maxFStop) ||
    minFStop <= 0 ||
    maxFStop <= 0 ||
    maxFStop < minFStop
  ) {
    return {
      min_f_stop: DEFAULT_APERTURE_MIN_F_STOP,
      max_f_stop: DEFAULT_APERTURE_MAX_F_STOP,
      aperture_increment: "full" as const,
    };
  }

  return {
    min_f_stop: minFStop,
    max_f_stop: maxFStop,
    aperture_increment: normalizeApertureIncrement(input?.aperture_increment),
  };
};

function getNextPhotographicFullStop(minFStop: number): number {
  const exactIndex = APERTURE_FULL_STOPS.findIndex(stop => Math.abs(stop - minFStop) <= APERTURE_EPSILON);
  if (exactIndex >= 0) {
    const nextExact = APERTURE_FULL_STOPS[exactIndex + 1];
    if (nextExact != null) return nextExact;
  }

  for (const stop of APERTURE_FULL_STOPS) {
    if (stop > minFStop + APERTURE_EPSILON) return stop;
  }

  let next = APERTURE_FULL_STOPS[APERTURE_FULL_STOPS.length - 1];
  while (next <= minFStop + APERTURE_EPSILON) next *= 2;
  return next;
}

const isPositiveFinite = (value: number | null | undefined) => (
  value != null
  && Number.isFinite(value)
  && value > 0
);

export interface ShutterInput {
  has_shutter?: boolean | null;
  min_shutter_speed_seconds?: number | null;
  max_shutter_speed_seconds?: number | null;
  supports_bulb?: boolean | null;
}

export interface ShutterChoice {
  value: string;
  label: string;
}

function normalizeShutterNumber(value: string): string {
  return value.replace(/\.0+$/u, "").replace(/(\.\d*?[1-9])0+$/u, "$1");
}

export const parseShutterSpeedInput = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === SHUTTER_BULB_VALUE) return null;

  const fractionMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+(?:\.\d+)?)$/u);
  if (fractionMatch) {
    const numerator = Number.parseFloat(fractionMatch[1]);
    const denominator = Number.parseFloat(fractionMatch[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) return null;
    return numerator / denominator;
  }

  const seconds = Number.parseFloat(trimmed);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds;
};

export const formatShutterSpeedValue = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds >= 1) {
    const rounded = Number.parseFloat(seconds.toFixed(3));
    return normalizeShutterNumber(rounded.toString());
  }

  const reciprocal = 1 / seconds;
  const roundedReciprocal = Math.round(reciprocal);
  if (Math.abs(reciprocal - roundedReciprocal) <= 0.02 * reciprocal && roundedReciprocal > 0) {
    return `1/${roundedReciprocal}`;
  }

  const rounded = Number.parseFloat(seconds.toFixed(3));
  return normalizeShutterNumber(rounded.toString());
};

const mergeShutterRangeOptions = (min?: number | null, max?: number | null) => {
  const hasMin = isPositiveFinite(min);
  const hasMax = isPositiveFinite(max);
  return SHUTTER_SPEED_COMMON_SECONDS.filter((speed) => {
    if (hasMin && speed < (min as number) - SHUTTER_VALUE_EPSILON) return false;
    if (hasMax && speed > (max as number) + SHUTTER_VALUE_EPSILON) return false;
    return true;
  }).map(formatShutterSpeedValue);
};

export const getShutterChoiceOptions = (
  input?: ShutterInput | null,
  selectedShutterSpeed?: string,
): ShutterChoice[] => {
  const supportsBulb = !!input?.supports_bulb;
  const next = mergeShutterRangeOptions(input?.min_shutter_speed_seconds, input?.max_shutter_speed_seconds);
  const options = new Map<string, string>();

  next.forEach((speed) => options.set(speed, speed));
  if (supportsBulb) options.set(SHUTTER_BULB_VALUE, SHUTTER_BULB_VALUE.toUpperCase());

  if (selectedShutterSpeed) {
    const value = selectedShutterSpeed.trim();
    if (value) options.set(value, value);
  }

  return Array.from(options, ([value, label]) => ({ value, label }));
};

export const getStandardShutterChoiceOptions = (selectedShutterSpeed?: string): ShutterChoice[] => {
  const options = new Map<string, string>();

  STANDARD_SHUTTER_SPEED_SECONDS.forEach((speed) => {
    const value = formatShutterSpeedValue(speed);
    options.set(value, value);
  });

  if (selectedShutterSpeed) {
    const value = selectedShutterSpeed.trim();
    if (value) options.set(value, value);
  }

  return Array.from(options, ([value, label]) => ({ value, label }));
};

export const getCameraShutterCapability = (input?: ShutterInput | null) => {
  if (!input) return false;
  if (typeof input.has_shutter === "boolean") return input.has_shutter;
  return Boolean(
    input.supports_bulb
      || isPositiveFinite(input.min_shutter_speed_seconds)
      || isPositiveFinite(input.max_shutter_speed_seconds),
  );
};

export function parseApertureValueInput(raw: string) {
  const trimmed = raw.trim().replace(/^f\/\s*/i, "");
  if (!trimmed) return null;

  const decimal = Number.parseFloat(trimmed);
  if (/^[0-9]+(?:\.[0-9]+)?$/u.test(trimmed) && Number.isFinite(decimal)) {
    return decimal;
  }

  const fractionMatch = trimmed.match(/^([0-9]+)\s+([0-9]+)\/([0-9]+)$/u);
  if (!fractionMatch) return null;

  const whole = Number.parseFloat(fractionMatch[1]);
  const numerator = Number.parseFloat(fractionMatch[2]);
  const denominator = Number.parseFloat(fractionMatch[3]);
  if (
    !Number.isFinite(whole) ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }

  return whole + (numerator / denominator);
}

function numericFormat(value: number): string {
  return Number.parseFloat(value.toFixed(3)).toFixed(1);
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function getApertureChoiceLabel(
  value: number,
  increment: ApertureIncrement,
  _index: number,
  _generatedPosition: number,
  _minFStop: number,
): string {
  const canonicalLabel = getCanonicalApertureLabel(value, increment);
  return canonicalLabel ?? `f/${formatApertureValue(value)}`;
}

function getCanonicalApertureLabel(value: number, increment: ApertureIncrement): string | null {
  const stepsPerStop = APERTURE_STEPS_PER_STOP[increment];
  const stepsPerExponent = stepsPerStop * APERTURE_EXPONENT_SCALE;
  const discreteIndex = Math.round(Math.log2(value) * stepsPerExponent);
  if (!Number.isFinite(discreteIndex)) return null;

  const offsetInStop = mod(discreteIndex, stepsPerStop);
  const anchorIndex = Math.floor(discreteIndex / stepsPerStop);
  const anchorValue = APERTURE_FULL_STOPS[anchorIndex] ?? Math.pow(2, anchorIndex / 2);
  if (!Number.isFinite(anchorValue) || anchorValue <= 0) return null;

  const candidate = offsetInStop === 0
    ? anchorValue
    : anchorValue * Math.pow(2, offsetInStop / stepsPerExponent);
  const tolerance = Math.max(APERTURE_EPSILON, value * 0.002);
  if (Math.abs(candidate - value) > tolerance) return null;

  if (offsetInStop === 0) {
    return `f/${formatApertureStepValue(anchorValue)}`;
  }

  const offsetLabel = APERTURE_OFFSET_LABELS[increment][offsetInStop - 1];
  if (!offsetLabel) return null;
  return `f/${formatApertureStepValue(anchorValue)} +${offsetLabel}`;
}

function formatApertureStepValue(value: number): string {
  const rounded = Number.parseFloat(value.toFixed(1));
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}` : `${rounded}`;
}

function formatStandardApertureNumber(value: number, increment: ApertureIncrement = "third"): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  const candidates = increment === "half"
    ? APERTURE_HALF_STOP_VALUES
    : increment === "third"
      ? APERTURE_THIRD_STOP_VALUES
      : APERTURE_FULL_STOPS;
  const best = candidates.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(2 * Math.log2(nearest / value));
    const candidateDistance = Math.abs(2 * Math.log2(candidate / value));
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, candidates[0]);
  const rounded = Number.parseFloat(String(best));
  return Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded);
}

function formatApertureLabel(value: number, increment: ApertureIncrement): string {
  return getCanonicalApertureLabel(value, increment) ?? `f/${formatApertureValue(value)}`;
}

function getGeneratedApertureOptions(input?: ApertureInput): ApertureChoice[] {
  const resolved = parseApertureInput(input);
  const stepsPerStop = APERTURE_STEPS_PER_STOP[resolved.aperture_increment];
  const stepsPerExponent = stepsPerStop * APERTURE_EXPONENT_SCALE;
  const entries: Array<{
    value: number;
    index: number | null;
    generated: boolean;
    generatedPosition?: number;
    label?: string;
  }> = [];

  const add = (value: number, index: number | null, generated: boolean, label?: string) => {
    const rounded = Number.parseFloat(value.toFixed(6));
    if (entries.some(entry => Math.abs(entry.value - rounded) <= APERTURE_EPSILON)) return;
    entries.push({ value: rounded, index, generated, label });
  };

  if (resolved.aperture_increment !== "full") {
    const steps = stepsPerStop;
    let segmentStart = resolved.min_f_stop;
    let nextFullStop = getNextPhotographicFullStop(segmentStart);
    let generatedIndex = 0;

    while (generatedIndex < 500) {
      const ratio = Math.pow(nextFullStop / segmentStart, 1 / steps);
      for (let i = 1; i <= steps; i++) {
        const value = segmentStart * Math.pow(ratio, i);
        if (value >= resolved.min_f_stop - APERTURE_EPSILON && value <= resolved.max_f_stop + APERTURE_EPSILON) {
          const offsetLabel = APERTURE_OFFSET_DISPLAY_LABELS[resolved.aperture_increment][i - 1];
          const label = i < steps && offsetLabel
            ? `f/${formatStandardApertureNumber(value, resolved.aperture_increment)} (f/${formatStandardApertureNumber(segmentStart, "full")} + ${offsetLabel})`
            : `f/${formatStandardApertureNumber(nextFullStop, "full")}`;
          add(value, generatedIndex, true, label);
        }
        generatedIndex++;
      }

      if (nextFullStop >= resolved.max_f_stop - APERTURE_EPSILON) break;
      segmentStart = nextFullStop;
      nextFullStop = getNextPhotographicFullStop(segmentStart);
      if (nextFullStop <= segmentStart) break;
    }
  } else {
    const startIndex = Math.floor(Math.log2(resolved.min_f_stop) * stepsPerExponent) - 2;
    const endIndex = Math.ceil(Math.log2(resolved.max_f_stop) * stepsPerExponent) + 2;
    const isNearMin = (value: number) => (
      value > resolved.min_f_stop
      && value - resolved.min_f_stop <= resolved.min_f_stop * APERTURE_NEAR_MIN_GENERATED_THRESHOLD
    );

    for (let index = startIndex; index <= endIndex; index++) {
      const stepValue = Math.pow(2, index / stepsPerExponent);
      if (stepValue >= resolved.min_f_stop - APERTURE_EPSILON && stepValue <= resolved.max_f_stop + APERTURE_EPSILON) {
        add(stepValue, index, true);
      }
    }
  }

  add(resolved.min_f_stop, null, false);
  add(resolved.max_f_stop, null, false);

  entries.sort((a, b) => a.value - b.value);

  let generatedPosition = 0;
  for (const entry of entries) {
    if (!entry.generated) continue;
    entry.generatedPosition = generatedPosition++;
  }

  return entries.map(entry => ({
    value: `f/${formatStandardApertureNumber(entry.value, resolved.aperture_increment)}`,
    label: entry.generated
      ? (entry.label ?? formatApertureLabel(entry.value, resolved.aperture_increment))
      : `f/${formatStandardApertureNumber(entry.value, resolved.aperture_increment)}`,
  }));
}

export function getApertureChoices(input?: ApertureInput): string[] {
  return getApertureChoiceOptions(input).map(({ value }) => value);
}

export function getApertureChoicesWithSelection(
  input: Parameters<typeof getApertureChoices>[0],
  selectedAperture: string,
): string[] {
  const choices = getApertureChoiceOptions(input);
  const values = choices.map(({ value }) => value);
  if (!selectedAperture) return values;
  if (values.includes(selectedAperture)) return values;

  return [...values, selectedAperture];
}

export function getApertureChoiceOptions(input: ApertureInput | undefined, selectedAperture?: string): ApertureChoice[] {
  const choices = getGeneratedApertureOptions(input);
  if (!selectedAperture) return choices;
  if (choices.some(choice => choice.value === selectedAperture)) return choices;

  const parsed = parseApertureValueInput(selectedAperture);
  const resolved = parseApertureInput(input);
  const label = parsed == null ? selectedAperture : formatApertureLabel(parsed, resolved.aperture_increment);
  return [...choices, { value: selectedAperture, label }];
}

const STOP_ERROR_EPSILON = 1e-6;

function formatStopError(stops: number) {
  const abs = Math.abs(stops);
  const precision = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
  const text = Number.parseFloat(abs.toFixed(precision)).toString();
  const sign = stops >= 0 ? "+" : "-";
  return `${sign}${text} stop${abs === 1 ? "" : "s"}`;
}

function parseChoiceSeconds(value: string) {
  if (value === SHUTTER_BULB_VALUE) return null;
  return parseShutterSpeedInput(value);
}

function formatApproximateShutterSeconds(seconds: number) {
  const rounded = Number.parseFloat(seconds.toFixed(3));
  return normalizeShutterNumber(rounded.toString());
}

export interface SnappedApertureChoice {
  value: string;
  label: string;
  aperture: number;
  stopError: number;
  warning: string | null;
}

export interface SnappedShutterChoice {
  value: string;
  label: string;
  seconds: number | null;
  stopError: number | null;
  warning: string | null;
}

export function snapApertureChoice(aperture: number, input?: ApertureInput | null): SnappedApertureChoice {
  const choices = getApertureChoiceOptions(input ?? undefined);
  const candidates = choices
    .map((choice) => ({
      choice,
      aperture: parseApertureValueInput(choice.value),
    }))
    .filter((entry): entry is { choice: ApertureChoice; aperture: number } => entry.aperture != null && entry.aperture > 0);

  if (candidates.length === 0 || !Number.isFinite(aperture) || aperture <= 0) {
    const fallback = choices[0] ?? { value: "", label: "" };
    const fallbackAperture = parseApertureValueInput(fallback.value) ?? aperture;
    return {
      value: fallback.value,
      label: fallback.label,
      aperture: fallbackAperture,
      stopError: 0,
      warning: "Aperture must be a finite positive number.",
    };
  }

  let best = candidates[0];
  let bestDistance = Math.abs(2 * Math.log2(best.aperture / aperture));
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const distance = Math.abs(2 * Math.log2(candidate.aperture / aperture));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  const stopError = 2 * Math.log2(aperture / best.aperture);
  const warning = Math.abs(stopError) <= STOP_ERROR_EPSILON
    ? null
    : `Rounded ${formatApertureLabel(aperture, normalizeApertureIncrement(input?.aperture_increment))} to ${best.choice.label} (${formatStopError(stopError)}).`;

  return {
    value: best.choice.value,
    label: best.choice.label,
    aperture: best.aperture,
    stopError,
    warning,
  };
}

export function snapShutterChoice(seconds: number, input?: ShutterInput | null): SnappedShutterChoice {
  const choices = getShutterChoiceOptions(input);
  const numericChoices = choices
    .map((choice) => ({
      choice,
      seconds: parseChoiceSeconds(choice.value),
    }))
    .filter((entry): entry is { choice: ShutterChoice; seconds: number } => entry.seconds != null && entry.seconds > 0);
  const bulbChoice = choices.find((choice) => choice.value === SHUTTER_BULB_VALUE) ?? null;
  const slowest = numericChoices[numericChoices.length - 1] ?? null;

  if (!Number.isFinite(seconds) || seconds <= 0) {
    const fallbackChoice = numericChoices[0]?.choice ?? bulbChoice ?? choices[0] ?? { value: "", label: "" };
    return {
      value: fallbackChoice.value,
      label: fallbackChoice.label,
      seconds: fallbackChoice.value === SHUTTER_BULB_VALUE ? null : parseChoiceSeconds(fallbackChoice.value),
      stopError: null,
      warning: "Shutter speed must be a finite positive number.",
    };
  }

  if (slowest && seconds > slowest.seconds + SHUTTER_VALUE_EPSILON) {
    const approximateSeconds = formatApproximateShutterSeconds(seconds);
    if (bulbChoice) {
      return {
        value: bulbChoice.value,
        label: bulbChoice.label,
        seconds: null,
        stopError: null,
        warning: null,
      };
    }

    return {
      value: slowest.choice.value,
      label: slowest.choice.label,
      seconds: slowest.seconds,
      stopError: Math.log2(slowest.seconds / seconds),
      warning: `Ideal shutter is about ${approximateSeconds}s, which is longer than this camera/lens supports.`,
    };
  }

  if (numericChoices.length === 0) {
    const fallback = bulbChoice ?? choices[0] ?? { value: "", label: "" };
    return {
      value: fallback.value,
      label: fallback.label,
      seconds: fallback.value === SHUTTER_BULB_VALUE ? null : parseChoiceSeconds(fallback.value),
      stopError: null,
      warning: "No numeric shutter choices are available.",
    };
  }

  let best = numericChoices[0];
  let bestDistance = Math.abs(Math.log2(best.seconds / seconds));
  for (let index = 1; index < numericChoices.length; index += 1) {
    const candidate = numericChoices[index];
    const distance = Math.abs(Math.log2(candidate.seconds / seconds));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  const stopError = Math.log2(best.seconds / seconds);
  const warning = Math.abs(stopError) <= STOP_ERROR_EPSILON
    ? null
    : `Rounded ${formatShutterSpeedValue(seconds)} to ${best.choice.label} (${formatStopError(stopError)}).`;

  return {
    value: best.choice.value,
    label: best.choice.label,
    seconds: best.seconds,
    stopError,
    warning,
  };
}

export interface LensFocalRange {
  minFocalLengthMm: number;
  maxFocalLengthMm: number;
  isPrime: boolean;
}

export interface LensFocalInput {
  focal_length_mm?: number | null;
  min_focal_length_mm?: number | null;
  max_focal_length_mm?: number | null;
}

export function getLensFocalRange(lens?: LensFocalInput | null): LensFocalRange | null {
  const min = lens?.min_focal_length_mm ?? lens?.focal_length_mm;
  const max = lens?.max_focal_length_mm ?? lens?.focal_length_mm;

  if (
    min == null ||
    max == null ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    return null;
  }

  return {
    minFocalLengthMm: min,
    maxFocalLengthMm: max,
    isPrime: Math.abs(min - max) <= FOCAL_RANGE_EPSILON,
  };
}

export function getLensFocalDisplay(lens?: LensFocalInput | null): string | null {
  const range = getLensFocalRange(lens);
  if (!range) return null;

  const min = formatFocalLength(range.minFocalLengthMm);
  if (range.isPrime) return `${min}mm`;
  return `${min}-${formatFocalLength(range.maxFocalLengthMm)}mm`;
}

function formatFocalLength(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number.parseFloat(value.toFixed(3)));
}

function near(value: number, target: number): boolean {
  return Math.abs(value - target) <= HALF_TOLERANCE;
}

function formatApertureValue(value: number): string {
  const rounded = Number.parseFloat(value.toFixed(4));
  const whole = Math.floor(rounded);
  const fractional = Number.parseFloat((rounded - whole).toFixed(4));

  if (Math.abs(fractional) <= 0.0005) return `${whole}`;
  if (near(fractional, 0.5)) return `${whole} 1/2`;
  if (near(fractional, 1 / 3)) return `${whole} 1/3`;
  if (near(fractional, 2 / 3)) return `${whole} 2/3`;

  const fallback = String(rounded);
  return fallback.replace(/\.0+$/, "").replace(/(\.\d*?[1-9])0+$/, "$1");
}

export function formatApertureValueDisplay(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return `f/${formatApertureValue(value)}`;
}
