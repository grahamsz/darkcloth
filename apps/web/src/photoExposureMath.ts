// Pure exposure calculations shared by create/edit/view flows.
// This module has no React or API dependencies so it can be unit-tested directly.
import type { BTZSChartData, BTZSChartPoint, Filter } from "./api/client";
import {
  formatShutterSpeedValue,
  parseApertureValueInput,
  parseShutterSpeedInput,
} from "./optics";

export type ExposurePrecedence = "aperture" | "shutter";
export type BellowsCorrectionMode = "none" | "measurement" | "distance";

export type ExposureNumberInput = number | string | null | undefined;

export type FilterFactorLike = number | string | Pick<Filter, "filter_factor">;

export interface ZoneMeteringCalculationInput {
  meterEv: ExposureNumberInput;
  meterIso: ExposureNumberInput;
  workingIso: ExposureNumberInput;
  targetZone: ExposureNumberInput;
  compensationStops?: ExposureNumberInput;
  bellowsCorrectionStops?: ExposureNumberInput;
  filterFactors?: readonly FilterFactorLike[] | null;
  readingThroughSelectedFilters?: boolean | null;
  precedence?: ExposurePrecedence | null;
  aperture?: ExposureNumberInput;
  shutterSeconds?: ExposureNumberInput;
  lensMinFStop?: ExposureNumberInput;
  lensMaxFStop?: ExposureNumberInput;
  reciprocityPFactor?: ExposureNumberInput;
}

export interface ZoneMeteringCalculationResult {
  holdSide?: ExposurePrecedence;
  heldAperture?: number | null;
  heldShutterSeconds?: number | null;
  zoneAdjustedEV?: number;
  targetEV?: number;
  idealAperture?: number | null;
  idealShutterSeconds?: number | null;
  aperture?: number;
  rawShutterSeconds?: number;
  finalShutterSeconds?: number;
  reciprocityApplied?: boolean;
  warnings: string[];
  error?: string;
}

export type BtzsLookupAxis = "averageG" | "sbr";
export type BtzsLookupMetric = "developmentTime" | "effectiveFilmSpeed";

export interface BtzsSeriesRange {
  axis: BtzsLookupAxis;
  min: number;
  max: number;
}

export interface BtzsSeriesLookup {
  axis: BtzsLookupAxis;
  metric: BtzsLookupMetric;
  points: BtzsSeriesPoint[];
  supportedRange: BtzsSeriesRange;
}

export interface BtzsSeriesPoint {
  x: number;
  y: number;
}

export interface BtzsInterpolationResult {
  axis: BtzsLookupAxis;
  metric: BtzsLookupMetric;
  target: number;
  value?: number;
  supportedRange: BtzsSeriesRange | null;
  warning?: string;
}

export interface BtzsCalculationInput {
  lowEv: ExposureNumberInput;
  highEv: ExposureNumberInput;
  lowZone: ExposureNumberInput;
  highZone: ExposureNumberInput;
  paperEs: ExposureNumberInput;
  flareFactor?: ExposureNumberInput;
  meterIso: ExposureNumberInput;
  chartData?: readonly BTZSChartData[] | null;
  allowExtrapolation?: boolean | null;
  curveInterpolation?: boolean | null;
  extrapolationStops?: ExposureNumberInput;
  compensationStops?: ExposureNumberInput;
  bellowsCorrectionStops?: ExposureNumberInput;
  filterFactors?: readonly FilterFactorLike[] | null;
  readingThroughSelectedFilters?: boolean | null;
  precedence?: ExposurePrecedence | null;
  aperture?: ExposureNumberInput;
  shutterSeconds?: ExposureNumberInput;
  lensMinFStop?: ExposureNumberInput;
  lensMaxFStop?: ExposureNumberInput;
  reciprocityPFactor?: ExposureNumberInput;
}

export interface SimpleDevelopmentAdjustmentCurve {
  nMinusTwoPercent?: ExposureNumberInput;
  nMinusOnePercent?: ExposureNumberInput;
  nPlusOnePercent?: ExposureNumberInput;
  nPlusTwoPercent?: ExposureNumberInput;
}

export interface SimpleZoneSystemCalculationInput {
  lowEv: ExposureNumberInput;
  highEv: ExposureNumberInput;
  lowZone: ExposureNumberInput;
  highZone: ExposureNumberInput;
  paperEs?: ExposureNumberInput;
  flareFactor?: ExposureNumberInput;
  meterIso: ExposureNumberInput;
  workingIso: ExposureNumberInput;
  baseDevelopmentMinutes: ExposureNumberInput;
  adjustmentCurve?: SimpleDevelopmentAdjustmentCurve | null;
  compensationStops?: ExposureNumberInput;
  bellowsCorrectionStops?: ExposureNumberInput;
  filterFactors?: readonly FilterFactorLike[] | null;
  readingThroughSelectedFilters?: boolean | null;
  precedence?: ExposurePrecedence | null;
  aperture?: ExposureNumberInput;
  shutterSeconds?: ExposureNumberInput;
  lensMinFStop?: ExposureNumberInput;
  lensMaxFStop?: ExposureNumberInput;
  reciprocityPFactor?: ExposureNumberInput;
}

export interface BtzsCalculationResult {
  sbr?: number;
  requiredG?: number;
  developmentTimeMinutes?: number | null;
  effectiveFilmSpeed?: number | null;
  developmentTimeLookup?: BtzsInterpolationResult | null;
  effectiveFilmSpeedLookup?: BtzsInterpolationResult | null;
  supportedRange: {
    developmentTime: BtzsSeriesRange | null;
    effectiveFilmSpeed: BtzsSeriesRange | null;
  };
  exposure?: ZoneMeteringCalculationResult | null;
  warnings: string[];
  error?: string;
}

export interface SimpleZoneSystemCalculationResult {
  sbr?: number;
  requiredG?: number;
  developmentAdjustmentStops?: number;
  developmentPercent?: number;
  developmentTimeMinutes?: number;
  effectiveFilmSpeed?: number;
  exposure?: ZoneMeteringCalculationResult | null;
  warnings: string[];
  error?: string;
}

const SBR_DISPLAY_FORMAT = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});
const G_DISPLAY_FORMAT = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});
const SMALL_NUMBER_EPSILON = 1e-9;
const STOP_ERROR_EPSILON = 1e-6;
const BTZS_ZONE_MIN = 0;
const BTZS_ZONE_MAX = 10;
const BTZS_ZONE_STEP = 0.5;
const BTZS_SBR_TO_AVERAGE_G_FACTOR = 0.3;
const RECIPROCITY_THRESHOLD_SECONDS = 0.5;
const DEFAULT_N_MINUS_TWO_PERCENT = 65;
const DEFAULT_N_MINUS_ONE_PERCENT = 80;
const DEFAULT_N_PLUS_ONE_PERCENT = 125;
const DEFAULT_N_PLUS_TWO_PERCENT = 160;

const AVERAGE_G_KEY_HINTS = ["averageg", "avg_g", "avgg", "average_gradient", "averagegradient"];
const SBR_KEY_HINTS = ["sbr", "sbrvalue", "subjectbrightnessrange"];
const DEVELOPMENT_TIME_KEY_HINTS = [
  "developmenttime",
  "developmenttimeminutes",
  "developmenttimehours",
  "development_minutes",
  "devtime",
  "time",
  "minutes",
];
const EFFECTIVE_FILM_SPEED_KEY_HINTS = [
  "effectivefilmspeed",
  "effective_film_speed",
  "effectivefilmspeedvalue",
  "efs",
  "filmspeed",
  "film_speed",
  "speed",
];

function normalizeNegativeZero(text: string) {
  return /^-0(?:\.0+)?$/u.test(text) ? text.replace(/^-0/u, "0") : text;
}

function formatFixed(value: number, digits: number) {
  return normalizeNegativeZero(value.toFixed(digits));
}

function formatRangeValue(axis: BtzsLookupAxis, value: number) {
  return axis === "averageG" ? formatExposureG(value) : formatExposureSbr(value);
}

function parseFiniteNumberInput(value: ExposureNumberInput): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parsePositiveNumberInput(value: ExposureNumberInput): number | null {
  const parsed = parseFiniteNumberInput(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function parseApertureNumberInput(value: ExposureNumberInput): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = parseApertureValueInput(value);
    if (parsed != null && parsed > 0) return parsed;
    const fallback = Number(value.trim());
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
  }
  return null;
}

function parseShutterNumberInput(value: ExposureNumberInput): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = parseShutterSpeedInput(value);
    if (parsed != null && parsed > 0) return parsed;
    const fallback = Number(value.trim());
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function findPointKey(points: BTZSChartPoint[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeKey);
  for (const candidate of normalizedCandidates) {
    for (const point of points) {
      for (const [key, value] of Object.entries(point)) {
        if (normalizeKey(key) === candidate && toNumericValue(value) != null) {
          return key;
        }
      }
    }
  }
  return null;
}

function inferChartAxis(chart: BTZSChartData, points: BTZSChartPoint[]): BtzsLookupAxis | null {
  const normalized = normalizeText([
    chart.title,
    chart.xAxisLabel,
    chart.yAxisLabel,
  ]
    .filter((value): value is string => Boolean(normalizeText(value)))
    .join(" "));

  if (normalized.includes("averageg") || findPointKey(points, AVERAGE_G_KEY_HINTS)) {
    return "averageG";
  }

  if (normalized.includes("sbr") || findPointKey(points, SBR_KEY_HINTS)) {
    return "sbr";
  }

  return null;
}

function inferChartMetric(chart: BTZSChartData, points: BTZSChartPoint[]): BtzsLookupMetric | null {
  const normalized = normalizeText([
    chart.title,
    chart.xAxisLabel,
    chart.yAxisLabel,
  ]
    .filter((value): value is string => Boolean(normalizeText(value)))
    .join(" "));

  if (normalized.includes("developmenttime") || normalized.includes("devtime") || findPointKey(points, DEVELOPMENT_TIME_KEY_HINTS)) {
    return "developmentTime";
  }

  if (normalized.includes("effectivefilmspeed") || normalized.includes("efs") || findPointKey(points, EFFECTIVE_FILM_SPEED_KEY_HINTS)) {
    return "effectiveFilmSpeed";
  }

  return null;
}

function inferChartSeries(chart: BTZSChartData): { axis: BtzsLookupAxis; metric: BtzsLookupMetric; points: BtzsSeriesPoint[] } | null {
  const points = Array.isArray(chart.points)
    ? chart.points.filter(isPlainObject).map((point) => point as BTZSChartPoint)
    : [];

  if (points.length === 0) return null;

  const axis = inferChartAxis(chart, points);
  const metric = inferChartMetric(chart, points);
  if (!axis || !metric) return null;

  const xKey = findPointKey(points, axis === "averageG" ? [...AVERAGE_G_KEY_HINTS, "x"] : [...SBR_KEY_HINTS, "x"]);
  const yKey = findPointKey(
    points,
    metric === "developmentTime"
      ? [...DEVELOPMENT_TIME_KEY_HINTS, "y"]
      : [...EFFECTIVE_FILM_SPEED_KEY_HINTS, "y"],
  );

  if (!xKey || !yKey) return null;

  const seriesPoints = points.flatMap((point) => {
    const x = toNumericValue(point[xKey]);
    const y = toNumericValue(point[yKey]);
    if (x == null || y == null) return [];
    return [{ x, y }];
  });

  if (seriesPoints.length === 0) return null;

  seriesPoints.sort((left, right) => left.x - right.x);
  return { axis, metric, points: seriesPoints };
}

function buildSeriesRange(axis: BtzsLookupAxis, points: BtzsSeriesPoint[]): BtzsSeriesRange {
  return {
    axis,
    min: points[0]!.x,
    max: points[points.length - 1]!.x,
  };
}

function mergeSeriesPoints(seriesList: Array<ReturnType<typeof inferChartSeries>>) {
  const points: BtzsSeriesPoint[] = [];
  for (const series of seriesList) {
    if (!series) continue;
    points.push(...series.points);
  }
  points.sort((left, right) => left.x - right.x);
  return points;
}

function findMatchingSeries(
  chartData: readonly BTZSChartData[] | null | undefined,
  metric: BtzsLookupMetric,
  preferredAxis: BtzsLookupAxis = "averageG",
): BtzsSeriesLookup | null {
  const inferred = (chartData ?? []).map((chart) => inferChartSeries(chart)).filter(Boolean) as Array<NonNullable<ReturnType<typeof inferChartSeries>>>;
  const preferred = inferred.filter((series) => series.metric === metric && series.axis === preferredAxis);
  const fallbackAxis: BtzsLookupAxis = preferredAxis === "averageG" ? "sbr" : "averageG";
  const fallback = inferred.filter((series) => series.metric === metric && series.axis === fallbackAxis);
  const selected = preferred.length > 0 ? preferred : fallback;

  if (selected.length === 0) return null;

  const points = mergeSeriesPoints(selected);
  if (points.length === 0) return null;

  const axis = selected[0]!.axis;
  return {
    axis,
    metric,
    points,
    supportedRange: buildSeriesRange(axis, points),
  };
}

function interpolateLinear(y1: number, y2: number, ratio: number) {
  return y1 + ((y2 - y1) * ratio);
}

function interpolateLog2(y1: number, y2: number, ratio: number) {
  return Math.pow(2, interpolateLinear(Math.log2(y1), Math.log2(y2), ratio));
}

function resolveNonNegativeInput(value: ExposureNumberInput, fallback = 0) {
  const parsed = parseFiniteNumberInput(value);
  return parsed != null && parsed >= 0 ? parsed : fallback;
}

function transformBtzsY(metric: BtzsLookupMetric, value: number) {
  return metric === "effectiveFilmSpeed" ? Math.log2(value) : value;
}

function untransformBtzsY(metric: BtzsLookupMetric, value: number) {
  return metric === "effectiveFilmSpeed" ? Math.pow(2, value) : value;
}

function resolveMonotoneEndpointSlope(width: number, adjacentWidth: number, slope: number, adjacentSlope: number) {
  let endpointSlope = (((2 * width) + adjacentWidth) * slope - (width * adjacentSlope)) / (width + adjacentWidth);
  if (Math.sign(endpointSlope) !== Math.sign(slope)) {
    endpointSlope = 0;
  } else if (Math.sign(slope) !== Math.sign(adjacentSlope) && Math.abs(endpointSlope) > Math.abs(3 * slope)) {
    endpointSlope = 3 * slope;
  }
  return endpointSlope;
}

function getMonotoneSlopes(points: BtzsSeriesPoint[], metric: BtzsLookupMetric) {
  const transformed = points.map((point) => ({
    x: point.x,
    y: transformBtzsY(metric, point.y),
  }));
  const slopes = transformed.map(() => 0);
  if (transformed.length < 2) return slopes;

  const segmentSlopes = transformed.slice(0, -1).map((point, index) => {
    const next = transformed[index + 1]!;
    return (next.y - point.y) / (next.x - point.x);
  });
  const segmentWidths = transformed.slice(0, -1).map((point, index) => {
    const next = transformed[index + 1]!;
    return next.x - point.x;
  });

  if (transformed.length === 2) {
    slopes[0] = segmentSlopes[0]!;
    slopes[1] = segmentSlopes[0]!;
    return slopes;
  }

  slopes[0] = resolveMonotoneEndpointSlope(segmentWidths[0]!, segmentWidths[1]!, segmentSlopes[0]!, segmentSlopes[1]!);
  slopes[slopes.length - 1] = resolveMonotoneEndpointSlope(
    segmentWidths[segmentWidths.length - 1]!,
    segmentWidths[segmentWidths.length - 2]!,
    segmentSlopes[segmentSlopes.length - 1]!,
    segmentSlopes[segmentSlopes.length - 2]!,
  );

  for (let index = 1; index < transformed.length - 1; index += 1) {
    const leftSlope = segmentSlopes[index - 1]!;
    const rightSlope = segmentSlopes[index]!;
    if (Math.abs(leftSlope) <= SMALL_NUMBER_EPSILON || Math.abs(rightSlope) <= SMALL_NUMBER_EPSILON || leftSlope * rightSlope <= 0) {
      slopes[index] = 0;
      continue;
    }

    const leftWidth = segmentWidths[index - 1]!;
    const rightWidth = segmentWidths[index]!;
    const weightLeft = (2 * rightWidth) + leftWidth;
    const weightRight = rightWidth + (2 * leftWidth);
    slopes[index] = (weightLeft + weightRight) / ((weightLeft / leftSlope) + (weightRight / rightSlope));
  }

  return slopes;
}

function evaluateCubicHermite(y0: number, y1: number, m0: number, m1: number, h: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = (2 * t3) - (3 * t2) + 1;
  const h10 = t3 - (2 * t2) + t;
  const h01 = (-2 * t3) + (3 * t2);
  const h11 = t3 - t2;
  return (h00 * y0) + (h10 * h * m0) + (h01 * y1) + (h11 * h * m1);
}

function evaluateCubicHermiteSecondDerivative(y0: number, y1: number, m0: number, m1: number, h: number, t: number) {
  return (
    ((12 * t - 6) * y0)
    + ((6 * t - 4) * h * m0)
    + ((-12 * t + 6) * y1)
    + ((6 * t - 2) * h * m1)
  ) / (h * h);
}

function extrapolateMonotoneSeries(
  points: BtzsSeriesPoint[],
  target: number,
  metric: BtzsLookupMetric,
  side: "left" | "right",
  extrapolationStops: number,
) {
  if (points.length < 3 || extrapolationStops <= 0) {
    return side === "left"
      ? extrapolateSeriesInStopSpace(points[0]!, points[1]!, target, metric)
      : extrapolateSeriesInStopSpace(points[points.length - 2]!, points[points.length - 1]!, target, metric);
  }

  const slopes = getMonotoneSlopes(points, metric);
  const segmentLeftIndex = side === "left" ? 0 : points.length - 2;
  const segmentRightIndex = segmentLeftIndex + 1;
  const segmentLeft = points[segmentLeftIndex]!;
  const segmentRight = points[segmentRightIndex]!;
  const boundaryIndex = side === "left" ? 0 : points.length - 1;
  const boundary = points[boundaryIndex]!;
  const segmentWidth = segmentRight.x - segmentLeft.x;

  if (segmentWidth <= SMALL_NUMBER_EPSILON) {
    return boundary.y;
  }

  const boundaryY = transformBtzsY(metric, boundary.y);
  const boundarySlope = slopes[boundaryIndex]!;
  const boundarySecondDerivative = evaluateCubicHermiteSecondDerivative(
    transformBtzsY(metric, segmentLeft.y),
    transformBtzsY(metric, segmentRight.y),
    slopes[segmentLeftIndex]!,
    slopes[segmentRightIndex]!,
    segmentWidth,
    side === "left" ? 0 : 1,
  );
  const stopMultiplier = Math.pow(2, extrapolationStops);
  const limit = boundary.x > 0
    ? side === "left" ? boundary.x / stopMultiplier : boundary.x * stopMultiplier
    : target;
  const expansionWidth = Math.abs(limit - boundary.x);

  if (expansionWidth <= SMALL_NUMBER_EPSILON) {
    return boundary.y;
  }

  const offset = target - boundary.x;
  const offsetDirection = Math.sign(offset) || (side === "left" ? -1 : 1);
  const absoluteOffset = Math.abs(offset);
  let decayDistance = Math.max(expansionWidth * 0.45, SMALL_NUMBER_EPSILON);
  if (
    Math.abs(boundarySlope) > SMALL_NUMBER_EPSILON
    && Math.abs(boundarySecondDerivative) > SMALL_NUMBER_EPSILON
    && boundarySlope * offsetDirection * boundarySecondDerivative < 0
  ) {
    decayDistance = Math.min(decayDistance, Math.abs(boundarySlope / boundarySecondDerivative) * 0.72);
  }

  const decay = 1 - Math.exp(-absoluteOffset / decayDistance);
  const curvatureContribution = offsetDirection
    * boundarySecondDerivative
    * decayDistance
    * (absoluteOffset - (decayDistance * decay));
  let transformedValue = boundaryY + (boundarySlope * offset) + curvatureContribution;
  const expectedDeltaSign = Math.sign(boundarySlope * offset);
  if (
    (expectedDeltaSign > 0 && transformedValue < boundaryY)
    || (expectedDeltaSign < 0 && transformedValue > boundaryY)
  ) {
    transformedValue = transformBtzsY(metric, side === "left"
      ? extrapolateSeriesInStopSpace(points[0]!, points[1]!, target, metric)
      : extrapolateSeriesInStopSpace(points[points.length - 2]!, points[points.length - 1]!, target, metric));
  }

  return untransformBtzsY(metric, transformedValue);
}

function interpolateMonotoneSeries(
  points: BtzsSeriesPoint[],
  target: number,
  metric: BtzsLookupMetric,
  left: BtzsSeriesPoint,
  right: BtzsSeriesPoint,
  extrapolationStops: number,
) {
  if (points.length < 3) {
    const ratio = (target - left.x) / (right.x - left.x);
    return metric === "effectiveFilmSpeed"
      ? interpolateLog2(left.y, right.y, ratio)
      : interpolateLinear(left.y, right.y, ratio);
  }

  if (target < points[0]!.x) {
    return extrapolateMonotoneSeries(points, target, metric, "left", extrapolationStops);
  }
  if (target > points[points.length - 1]!.x) {
    return extrapolateMonotoneSeries(points, target, metric, "right", extrapolationStops);
  }

  const leftIndex = Math.max(0, points.findIndex((point) => point === left));
  const rightIndex = Math.max(leftIndex + 1, points.findIndex((point) => point === right));
  const slopes = getMonotoneSlopes(points, metric);
  const x0 = left.x;
  const x1 = right.x;
  const h = x1 - x0;
  const y0 = transformBtzsY(metric, left.y);
  const y1 = transformBtzsY(metric, right.y);
  const m0 = slopes[leftIndex]!;
  const m1 = slopes[rightIndex]!;

  const t = (target - x0) / h;
  return untransformBtzsY(metric, evaluateCubicHermite(y0, y1, m0, m1, h, t));
}

function extrapolateSeriesInStopSpace(left: BtzsSeriesPoint, right: BtzsSeriesPoint, target: number, metric: BtzsLookupMetric) {
  if (left.x <= 0 || right.x <= 0 || target <= 0) {
    const ratio = (target - left.x) / (right.x - left.x);
    return metric === "effectiveFilmSpeed"
      ? interpolateLog2(left.y, right.y, ratio)
      : interpolateLinear(left.y, right.y, ratio);
  }

  const leftX = Math.log2(left.x);
  const rightX = Math.log2(right.x);
  if (Math.abs(rightX - leftX) <= SMALL_NUMBER_EPSILON) {
    return right.y;
  }

  const leftY = transformBtzsY(metric, left.y);
  const rightY = transformBtzsY(metric, right.y);
  const slope = (rightY - leftY) / (rightX - leftX);
  return untransformBtzsY(metric, rightY + ((Math.log2(target) - rightX) * slope));
}

function resolveDevelopmentPercent(value: ExposureNumberInput, fallback: number) {
  const parsed = parsePositiveNumberInput(value);
  return parsed ?? fallback;
}

export function interpolateSimpleDevelopmentPercent(
  adjustmentStops: ExposureNumberInput,
  curve: SimpleDevelopmentAdjustmentCurve | null | undefined = null,
) {
  const adjustment = parseFiniteNumberInput(adjustmentStops);
  if (adjustment == null) return null;

  const points = [
    { x: -2, y: resolveDevelopmentPercent(curve?.nMinusTwoPercent, DEFAULT_N_MINUS_TWO_PERCENT) },
    { x: -1, y: resolveDevelopmentPercent(curve?.nMinusOnePercent, DEFAULT_N_MINUS_ONE_PERCENT) },
    { x: 0, y: 100 },
    { x: 1, y: resolveDevelopmentPercent(curve?.nPlusOnePercent, DEFAULT_N_PLUS_ONE_PERCENT) },
    { x: 2, y: resolveDevelopmentPercent(curve?.nPlusTwoPercent, DEFAULT_N_PLUS_TWO_PERCENT) },
  ];

  const clamped = Math.max(points[0]!.x, Math.min(points[points.length - 1]!.x, adjustment));
  const exact = points.find((point) => Math.abs(point.x - clamped) <= SMALL_NUMBER_EPSILON);
  if (exact) return exact.y;

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index]!;
    const right = points[index + 1]!;
    if (clamped >= left.x - SMALL_NUMBER_EPSILON && clamped <= right.x + SMALL_NUMBER_EPSILON) {
      return interpolateLinear(left.y, right.y, (clamped - left.x) / (right.x - left.x));
    }
  }

  return 100;
}

function interpolateSeriesValue(
  series: BtzsSeriesLookup,
  target: number,
  options: { allowExtrapolation?: boolean | null; curveInterpolation?: boolean | null; extrapolationStops?: ExposureNumberInput } = {},
): BtzsInterpolationResult {
  const { axis, metric, points, supportedRange } = series;
  const warningParts: string[] = [];
  const extrapolationStops = resolveNonNegativeInput(options.extrapolationStops, 0);
  const allowExtrapolation = Boolean(options.allowExtrapolation) || extrapolationStops > 0;
  const curveInterpolation = Boolean(options.curveInterpolation);
  if (metric === "effectiveFilmSpeed" && curveInterpolation && points.some((point) => point.y <= 0)) {
    return {
      axis,
      metric,
      target,
      supportedRange,
      warning: "Effective film speed curve interpolation requires positive values.",
    };
  }

  if (!Number.isFinite(target) || target <= 0) {
    return {
      axis,
      metric,
      target,
      supportedRange,
      warning: `Invalid ${axis === "averageG" ? "Average G" : "SBR"} target.`,
    };
  }

  const axisLabel = axis === "averageG" ? "Average G" : "SBR";
  const targetText = formatRangeValue(axis, target);
  const rangeText = `${formatRangeValue(axis, supportedRange.min)}-${formatRangeValue(axis, supportedRange.max)}`;

  if (target < supportedRange.min - SMALL_NUMBER_EPSILON || target > supportedRange.max + SMALL_NUMBER_EPSILON) {
    if (!allowExtrapolation || points.length < 2) {
      return {
        axis,
        metric,
        target,
        supportedRange,
        warning: `${axisLabel} ${targetText} is outside the supported ${axisLabel} range ${rangeText}.`,
      };
    }

    if (extrapolationStops > 0) {
      const outsideStops = target < supportedRange.min
        ? Math.log2(supportedRange.min / target)
        : Math.log2(target / supportedRange.max);
      if (!Number.isFinite(outsideStops) || outsideStops > extrapolationStops + SMALL_NUMBER_EPSILON) {
        return {
          axis,
          metric,
          target,
          supportedRange,
          warning: `${axisLabel} ${targetText} is outside the experimental expanded ${axisLabel} range (${extrapolationStops} stops beyond ${rangeText}).`,
        };
      }
    }

    warningParts.push(`Extrapolated ${axisLabel} ${targetText} beyond the supported ${axisLabel} range ${rangeText}.`);
  }

  const exactPoint = points.find((point) => Math.abs(point.x - target) <= SMALL_NUMBER_EPSILON);
  if (exactPoint) {
    return {
      axis,
      metric,
      target,
      value: exactPoint.y,
      supportedRange,
      warning: warningParts.length > 0 ? warningParts.join(" ") : undefined,
    };
  }

  let left = points[0]!;
  let right = points[points.length - 1]!;
  if (target <= points[0]!.x) {
    left = points[0]!;
    right = points[1] ?? points[0]!;
  } else if (target >= points[points.length - 1]!.x) {
    left = points[points.length - 2] ?? points[points.length - 1]!;
    right = points[points.length - 1]!;
  } else {
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index]!;
      const next = points[index + 1]!;
      if (target >= current.x - SMALL_NUMBER_EPSILON && target <= next.x + SMALL_NUMBER_EPSILON) {
        left = current;
        right = next;
        break;
      }
    }
  }

  if (right.x - left.x <= SMALL_NUMBER_EPSILON) {
    return {
      axis,
      metric,
      target,
      value: left.y,
      supportedRange,
      warning: warningParts.length > 0 ? warningParts.join(" ") : undefined,
    };
  }

  if (metric === "effectiveFilmSpeed" && (left.y <= 0 || right.y <= 0)) {
    return {
      axis,
      metric,
      target,
      supportedRange,
      warning: `${axisLabel} interpolation requires positive values.`,
    };
  }

  const ratio = (target - left.x) / (right.x - left.x);
  const value = curveInterpolation
    ? interpolateMonotoneSeries(points, target, metric, left, right, extrapolationStops)
    : metric === "effectiveFilmSpeed"
      ? interpolateLog2(left.y, right.y, ratio)
      : interpolateLinear(left.y, right.y, ratio);

  return {
    axis,
    metric,
    target,
    value,
    supportedRange,
    warning: warningParts.length > 0 ? warningParts.join(" ") : undefined,
  };
}

export function calculateExposureEv(aperture: ExposureNumberInput, shutterSeconds: ExposureNumberInput): number | null {
  const resolvedAperture = parseApertureNumberInput(aperture);
  const resolvedShutter = parseShutterNumberInput(shutterSeconds);
  if (resolvedAperture == null || resolvedShutter == null) return null;
  return Math.log2((resolvedAperture * resolvedAperture) / resolvedShutter);
}

export function calculateShutterSecondsFromEv(aperture: ExposureNumberInput, ev: ExposureNumberInput): number | null {
  const resolvedAperture = parseApertureNumberInput(aperture);
  const resolvedEv = parseFiniteNumberInput(ev);
  if (resolvedAperture == null || resolvedEv == null) return null;
  return (resolvedAperture * resolvedAperture) / Math.pow(2, resolvedEv);
}

export function calculateApertureFromEv(shutterSeconds: ExposureNumberInput, ev: ExposureNumberInput): number | null {
  const resolvedShutter = parseShutterNumberInput(shutterSeconds);
  const resolvedEv = parseFiniteNumberInput(ev);
  if (resolvedShutter == null || resolvedEv == null) return null;
  return Math.sqrt(resolvedShutter * Math.pow(2, resolvedEv));
}

export function adjustEvForIso(
  meterEv: ExposureNumberInput,
  meterIso: ExposureNumberInput,
  workingIso: ExposureNumberInput,
): number | null {
  const resolvedMeterEv = parseFiniteNumberInput(meterEv);
  const resolvedMeterIso = parsePositiveNumberInput(meterIso);
  const resolvedWorkingIso = parsePositiveNumberInput(workingIso);
  if (resolvedMeterEv == null || resolvedMeterIso == null || resolvedWorkingIso == null) return null;
  return resolvedMeterEv + Math.log2(resolvedWorkingIso / resolvedMeterIso);
}

export function getFilterStops(
  filterFactors: readonly FilterFactorLike[] | null | undefined,
  readingThroughSelectedFilters = false,
): number {
  if (readingThroughSelectedFilters) return 0;

  let stops = 0;
  for (const filterFactor of filterFactors ?? []) {
    const factor = typeof filterFactor === "number"
      ? filterFactor
      : typeof filterFactor === "string"
        ? Number(filterFactor.trim())
        : filterFactor.filter_factor;
    if (!Number.isFinite(factor) || factor <= 0) continue;
    stops += Math.log2(factor);
  }
  return stops;
}

export function adjustEvForFiltersAndCompensation(
  meterEv: ExposureNumberInput,
  filterFactors: readonly FilterFactorLike[] | null | undefined,
  readingThroughSelectedFilters = false,
  compensationStops: ExposureNumberInput = 0,
): number | null {
  const resolvedMeterEv = parseFiniteNumberInput(meterEv);
  const resolvedCompensation = parseFiniteNumberInput(compensationStops);
  if (resolvedMeterEv == null || resolvedCompensation == null) return null;
  const filterStops = getFilterStops(filterFactors, readingThroughSelectedFilters);
  return resolvedMeterEv - filterStops - resolvedCompensation;
}

export interface BellowsCorrectionResult {
  stops: number;
  error: string | null;
}

export function calculateBellowsCorrectionStops(
  mode: BellowsCorrectionMode | null | undefined,
  focalLengthMm: ExposureNumberInput,
  measurement: ExposureNumberInput,
): BellowsCorrectionResult {
  const resolvedMode = mode ?? "none";
  if (resolvedMode === "none") return { stops: 0, error: null };

  const focalLength = parsePositiveNumberInput(focalLengthMm);
  if (focalLength == null) {
    return { stops: 0, error: "Focal length is required for bellows correction." };
  }

  const resolvedMeasurement = parsePositiveNumberInput(measurement);
  if (resolvedMeasurement == null) {
    return {
      stops: 0,
      error: resolvedMode === "measurement"
        ? "Bellows extension must be a positive number."
        : "Subject distance must be a positive number.",
    };
  }

  if (resolvedMode === "measurement") {
    if (resolvedMeasurement < focalLength) {
      return { stops: 0, error: "Bellows extension must be at least the focal length." };
    }
    return { stops: 2 * Math.log2(resolvedMeasurement / focalLength), error: null };
  }

  const subjectDistanceMm = resolvedMeasurement * 1000;
  if (subjectDistanceMm <= focalLength) {
    return { stops: 0, error: "Subject distance must be greater than the focal length." };
  }
  return { stops: 2 * Math.log2(subjectDistanceMm / (subjectDistanceMm - focalLength)), error: null };
}

export function calculateZoneAdjustedEv(
  meterEv: ExposureNumberInput,
  meterIso: ExposureNumberInput,
  workingIso: ExposureNumberInput,
  targetZone: ExposureNumberInput,
): number | null {
  const adjusted = adjustEvForIso(meterEv, meterIso, workingIso);
  const resolvedTargetZone = parseFiniteNumberInput(targetZone);
  if (adjusted == null || resolvedTargetZone == null) return null;
  return adjusted + (5 - resolvedTargetZone);
}

export function calculateTargetEv(
  meterEv: ExposureNumberInput,
  meterIso: ExposureNumberInput,
  workingIso: ExposureNumberInput,
  targetZone: ExposureNumberInput,
  filterFactors: readonly FilterFactorLike[] | null | undefined = null,
  readingThroughSelectedFilters = false,
  compensationStops: ExposureNumberInput = 0,
): number | null {
  const zoneAdjustedEv = calculateZoneAdjustedEv(meterEv, meterIso, workingIso, targetZone);
  const resolvedCompensation = parseFiniteNumberInput(compensationStops);
  if (zoneAdjustedEv == null || resolvedCompensation == null) return null;
  return zoneAdjustedEv - getFilterStops(filterFactors, readingThroughSelectedFilters) - resolvedCompensation;
}

function isReciprocityCoefficientActive(coefficient: number | null | undefined) {
  return coefficient != null && Number.isFinite(coefficient) && coefficient > 0 && Math.abs(coefficient - 1) > STOP_ERROR_EPSILON;
}

export function applyReciprocity(rawSeconds: ExposureNumberInput, coefficient: ExposureNumberInput): number | null {
  const resolvedSeconds = parseShutterNumberInput(rawSeconds);
  const resolvedCoefficient = parsePositiveNumberInput(coefficient);
  if (resolvedSeconds == null || resolvedCoefficient == null) return null;
  if (resolvedSeconds <= RECIPROCITY_THRESHOLD_SECONDS || !isReciprocityCoefficientActive(resolvedCoefficient)) return resolvedSeconds;
  return Math.pow(resolvedSeconds + 1, resolvedCoefficient) - 1;
}

export function removeReciprocity(finalSeconds: ExposureNumberInput, coefficient: ExposureNumberInput): number | null {
  const resolvedSeconds = parseShutterNumberInput(finalSeconds);
  const resolvedCoefficient = parsePositiveNumberInput(coefficient);
  if (resolvedSeconds == null || resolvedCoefficient == null) return null;
  if (resolvedSeconds <= RECIPROCITY_THRESHOLD_SECONDS || !isReciprocityCoefficientActive(resolvedCoefficient)) return resolvedSeconds;
  return Math.pow(resolvedSeconds + 1, 1 / resolvedCoefficient) - 1;
}

export function formatExposureEv(value: ExposureNumberInput) {
  const resolved = parseFiniteNumberInput(value);
  return resolved == null ? "—" : formatFixed(resolved, 2);
}

export function formatExposureSbr(value: ExposureNumberInput) {
  const resolved = parseFiniteNumberInput(value);
  return resolved == null ? "—" : normalizeNegativeZero(SBR_DISPLAY_FORMAT.format(resolved));
}

export function formatExposureG(value: ExposureNumberInput) {
  const resolved = parseFiniteNumberInput(value);
  return resolved == null ? "—" : normalizeNegativeZero(G_DISPLAY_FORMAT.format(resolved));
}

function formatIdealNumber(value: number, digits: number) {
  return normalizeNegativeZero(Number.parseFloat(value.toFixed(digits)).toString());
}

export function formatIdealApertureValue(value: ExposureNumberInput) {
  const resolved = parseFiniteNumberInput(value);
  return resolved == null ? "—" : `f/${formatIdealNumber(resolved, 3)}`;
}

export function formatIdealShutterSeconds(value: ExposureNumberInput) {
  const resolved = parseFiniteNumberInput(value);
  if (resolved == null) return "—";
  if (resolved < 1) return formatShutterSpeedValue(resolved);
  return `${formatIdealNumber(resolved, 4)}s`;
}

export function formatExposureEfs(value: ExposureNumberInput) {
  const resolved = parseFiniteNumberInput(value);
  return resolved == null ? "—" : normalizeNegativeZero(Math.round(resolved).toString());
}

export function formatDevelopmentTimeMinutes(value: ExposureNumberInput) {
  const resolved = parseFiniteNumberInput(value);
  return resolved == null ? "—" : formatFixed(resolved, 1);
}

export function formatDevelopmentTimeClock(value: ExposureNumberInput) {
  const resolved = parseFiniteNumberInput(value);
  if (resolved == null) return "—";

  const totalSeconds = Math.max(0, Math.round(resolved * 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const formatDevelopmentTime = formatDevelopmentTimeMinutes;

export function calculateZoneMeteringExposure(input: ZoneMeteringCalculationInput): ZoneMeteringCalculationResult {
  const warnings: string[] = [];
  const meterEv = parseFiniteNumberInput(input.meterEv);
  const meterIso = parsePositiveNumberInput(input.meterIso);
  const workingIso = parsePositiveNumberInput(input.workingIso);
  const targetZone = parseFiniteNumberInput(input.targetZone);
  const compensationStops = parseFiniteNumberInput(input.compensationStops ?? 0);
  const bellowsCorrectionStops = parseFiniteNumberInput(input.bellowsCorrectionStops ?? 0);
  const precedence = input.precedence ?? (input.aperture != null ? "aperture" : "shutter");
  const reciprocityPFactor = parsePositiveNumberInput(input.reciprocityPFactor);

  if (meterEv == null) return { warnings, error: "meterEv must be a finite number." };
  if (meterIso == null) return { warnings, error: "meterIso must be a positive number." };
  if (workingIso == null) return { warnings, error: "workingIso must be a positive number." };
  if (targetZone == null) return { warnings, error: "targetZone must be a finite number." };
  if (compensationStops == null) return { warnings, error: "compensationStops must be a finite number." };
  if (bellowsCorrectionStops == null) return { warnings, error: "bellowsCorrectionStops must be a finite number." };
  if (precedence !== "aperture" && precedence !== "shutter") {
    return { warnings, error: "precedence must be aperture or shutter." };
  }

  const zoneAdjustedEV = meterEv + Math.log2(workingIso / meterIso) + (5 - targetZone);
  const targetEV = zoneAdjustedEV
    - getFilterStops(input.filterFactors, Boolean(input.readingThroughSelectedFilters))
    - compensationStops
    - bellowsCorrectionStops;

  const lensMinFStop = parsePositiveNumberInput(input.lensMinFStop);
  const lensMaxFStop = parsePositiveNumberInput(input.lensMaxFStop);
  const lensRangeValid = lensMinFStop != null && lensMaxFStop != null && lensMaxFStop >= lensMinFStop;

  if (precedence === "aperture") {
    const aperture = parseApertureNumberInput(input.aperture);
    if (aperture == null) return { warnings, error: "aperture must be a positive number." };
    if (lensRangeValid && (aperture < lensMinFStop! - SMALL_NUMBER_EPSILON || aperture > lensMaxFStop! + SMALL_NUMBER_EPSILON)) {
      warnings.push("Aperture is outside the lens range.");
    }

    const rawShutterSeconds = calculateShutterSecondsFromEv(aperture, targetEV);
    if (rawShutterSeconds == null) {
      return { warnings, error: "Could not resolve shutter speed from the provided exposure." };
    }

    const finalShutterSeconds = applyReciprocity(rawShutterSeconds, reciprocityPFactor);
    const resolvedFinalShutterSeconds = finalShutterSeconds ?? rawShutterSeconds;
    return {
      holdSide: precedence,
      heldAperture: aperture,
      heldShutterSeconds: null,
      zoneAdjustedEV,
      targetEV,
      idealAperture: null,
      idealShutterSeconds: rawShutterSeconds,
      aperture,
      rawShutterSeconds,
      finalShutterSeconds: resolvedFinalShutterSeconds,
      reciprocityApplied: Boolean(
        reciprocityPFactor != null
        && reciprocityPFactor > 0
        && Math.abs(reciprocityPFactor - 1) > STOP_ERROR_EPSILON
        && rawShutterSeconds > RECIPROCITY_THRESHOLD_SECONDS
        && Math.abs(resolvedFinalShutterSeconds - rawShutterSeconds) > SMALL_NUMBER_EPSILON
      ),
      warnings,
    };
  }

  const heldShutterSeconds = parseShutterNumberInput(input.shutterSeconds);
  if (heldShutterSeconds == null) return { warnings, error: "shutterSeconds must be a positive number." };

  const effectiveMeteredShutterSeconds = removeReciprocity(heldShutterSeconds, reciprocityPFactor) ?? heldShutterSeconds;
  const aperture = calculateApertureFromEv(effectiveMeteredShutterSeconds, targetEV);
  if (aperture == null) {
    return { warnings, error: "Could not resolve aperture from the provided exposure." };
  }

  if (lensRangeValid && (aperture < lensMinFStop! - SMALL_NUMBER_EPSILON || aperture > lensMaxFStop! + SMALL_NUMBER_EPSILON)) {
    warnings.push("Aperture is outside the lens range.");
  }

  return {
    holdSide: precedence,
    heldAperture: null,
    heldShutterSeconds,
    zoneAdjustedEV,
    targetEV,
    idealAperture: aperture,
    idealShutterSeconds: null,
    aperture,
    rawShutterSeconds: effectiveMeteredShutterSeconds,
    finalShutterSeconds: heldShutterSeconds,
    reciprocityApplied: Boolean(
      reciprocityPFactor != null
      && reciprocityPFactor > 0
      && Math.abs(reciprocityPFactor - 1) > STOP_ERROR_EPSILON
      && heldShutterSeconds > RECIPROCITY_THRESHOLD_SECONDS
      && Math.abs(heldShutterSeconds - effectiveMeteredShutterSeconds) > SMALL_NUMBER_EPSILON
    ),
    warnings,
  };
}

export function findBtzsLookupSeries(
  chartData: readonly BTZSChartData[] | null | undefined,
  metric: BtzsLookupMetric,
  preferredAxis: BtzsLookupAxis = "averageG",
): BtzsSeriesLookup | null {
  return findMatchingSeries(chartData, metric, preferredAxis);
}

export function interpolateBtzsSeriesValue(
  series: BtzsSeriesLookup,
  target: ExposureNumberInput,
  options?: { allowExtrapolation?: boolean | null; curveInterpolation?: boolean | null; extrapolationStops?: ExposureNumberInput },
): BtzsInterpolationResult {
  const resolvedTarget = parsePositiveNumberInput(target);
  return interpolateSeriesValue(series, resolvedTarget ?? Number.NaN, options);
}

export function calculateBtzsExposure(input: BtzsCalculationInput): BtzsCalculationResult {
  const warnings = new Set<string>();
  const lowEvInput = parseFiniteNumberInput(input.lowEv);
  const highEvInput = parseFiniteNumberInput(input.highEv);
  const lowZoneInput = parseFiniteNumberInput(input.lowZone);
  const highZoneInput = parseFiniteNumberInput(input.highZone);
  const paperEs = parsePositiveNumberInput(input.paperEs);
  const flareFactor = parseFiniteNumberInput(input.flareFactor ?? 0);
  const meterIso = parsePositiveNumberInput(input.meterIso);

  if (lowEvInput == null) return { supportedRange: { developmentTime: null, effectiveFilmSpeed: null }, warnings: [], error: "lowEv must be a finite number." };
  if (highEvInput == null) return { supportedRange: { developmentTime: null, effectiveFilmSpeed: null }, warnings: [], error: "highEv must be a finite number." };
  if (lowZoneInput == null) return { supportedRange: { developmentTime: null, effectiveFilmSpeed: null }, warnings: [], error: "lowZone must be a finite number." };
  if (highZoneInput == null) return { supportedRange: { developmentTime: null, effectiveFilmSpeed: null }, warnings: [], error: "highZone must be a finite number." };
  if (paperEs == null) return { supportedRange: { developmentTime: null, effectiveFilmSpeed: null }, warnings: [], error: "paperEs must be a positive number." };
  if (flareFactor == null || flareFactor < 0) return { supportedRange: { developmentTime: null, effectiveFilmSpeed: null }, warnings: [], error: "flareFactor must be zero or greater." };
  if (meterIso == null) return { supportedRange: { developmentTime: null, effectiveFilmSpeed: null }, warnings: [], error: "meterIso must be a positive number." };

  const isCommonZoneValue = (value: number) => {
    if (!Number.isFinite(value) || value < BTZS_ZONE_MIN || value > BTZS_ZONE_MAX) return false;
    const steps = Math.round((value - BTZS_ZONE_MIN) / BTZS_ZONE_STEP);
    return Math.abs((BTZS_ZONE_MIN + (steps * BTZS_ZONE_STEP)) - value) <= SMALL_NUMBER_EPSILON;
  };

  let lowEv = lowEvInput;
  let highEv = highEvInput;
  if (lowEv > highEv) {
    [lowEv, highEv] = [highEv, lowEv];
    warnings.add("Low and high EV readings were reversed and were swapped.");
  }

  let lowZone = lowZoneInput;
  let highZone = highZoneInput;
  if (lowZone > highZone) {
    [lowZone, highZone] = [highZone, lowZone];
    warnings.add("Low and high zone readings were reversed and were swapped.");
  }
  if (!isCommonZoneValue(lowZoneInput)) {
    warnings.add("Low zone uses an uncommon Zone System placement.");
  }
  if (!isCommonZoneValue(highZoneInput)) {
    warnings.add("High zone uses an uncommon Zone System placement.");
  }

  const evRange = highEv - lowEv;
  const zoneRange = highZone - lowZone;
  if (!Number.isFinite(zoneRange) || zoneRange <= 0) {
    return {
      supportedRange: { developmentTime: null, effectiveFilmSpeed: null },
      warnings: [...warnings],
      error: "Zone range must be greater than 0.",
    };
  }

  const sbr = (evRange * 7) / zoneRange;
  if (!Number.isFinite(sbr) || sbr <= 0) {
    return {
      sbr,
      supportedRange: { developmentTime: null, effectiveFilmSpeed: null },
      warnings: [...warnings],
      error: "SBR must be greater than 0.",
    };
  }

  const requiredG = (paperEs / (BTZS_SBR_TO_AVERAGE_G_FACTOR * sbr)) + flareFactor;
  if (!Number.isFinite(requiredG) || requiredG <= 0) {
    return {
      sbr,
      supportedRange: { developmentTime: null, effectiveFilmSpeed: null },
      warnings: [...warnings],
      error: "requiredG must be greater than 0.",
    };
  }

  const developmentTimeSeries = findBtzsLookupSeries(input.chartData, "developmentTime");
  const effectiveFilmSpeedSeries = findBtzsLookupSeries(input.chartData, "effectiveFilmSpeed");

  if (!developmentTimeSeries) warnings.add("No development time BTZS chart series was found.");
  if (!effectiveFilmSpeedSeries) warnings.add("No effective film speed BTZS chart series was found.");

  if (developmentTimeSeries && developmentTimeSeries.axis !== "averageG") {
    warnings.add("Average G development time data was unavailable; using SBR fallback.");
  }
  if (effectiveFilmSpeedSeries && effectiveFilmSpeedSeries.axis !== "averageG") {
    warnings.add("Average G effective film speed data was unavailable; using SBR fallback.");
  }

  const developmentTimeLookup = developmentTimeSeries
    ? interpolateBtzsSeriesValue(
      developmentTimeSeries,
      developmentTimeSeries.axis === "averageG" ? requiredG : sbr,
      {
        allowExtrapolation: input.allowExtrapolation,
        curveInterpolation: input.curveInterpolation,
        extrapolationStops: input.extrapolationStops,
      },
    )
    : null;
  const effectiveFilmSpeedLookup = effectiveFilmSpeedSeries
    ? interpolateBtzsSeriesValue(
      effectiveFilmSpeedSeries,
      effectiveFilmSpeedSeries.axis === "averageG" ? requiredG : sbr,
      {
        allowExtrapolation: input.allowExtrapolation,
        curveInterpolation: input.curveInterpolation,
        extrapolationStops: input.extrapolationStops,
      },
    )
    : null;

  if (developmentTimeLookup?.warning) warnings.add(developmentTimeLookup.warning);
  if (effectiveFilmSpeedLookup?.warning) warnings.add(effectiveFilmSpeedLookup.warning);

  const supportedRange = {
    developmentTime: developmentTimeSeries?.supportedRange ?? null,
    effectiveFilmSpeed: effectiveFilmSpeedSeries?.supportedRange ?? null,
  };

  let exposure: ZoneMeteringCalculationResult | null = null;
  if (effectiveFilmSpeedLookup?.value != null) {
    exposure = calculateZoneMeteringExposure({
      meterEv: lowEv,
      meterIso,
      workingIso: effectiveFilmSpeedLookup.value,
      targetZone: lowZone,
      compensationStops: input.compensationStops,
      bellowsCorrectionStops: input.bellowsCorrectionStops,
      filterFactors: input.filterFactors,
      readingThroughSelectedFilters: input.readingThroughSelectedFilters,
      precedence: input.precedence,
      aperture: input.aperture,
      shutterSeconds: input.shutterSeconds,
      lensMinFStop: input.lensMinFStop,
      lensMaxFStop: input.lensMaxFStop,
      reciprocityPFactor: input.reciprocityPFactor,
    });

    if (exposure.error) {
      warnings.add(`Exposure calculation skipped: ${exposure.error}`);
      exposure = null;
    } else {
      for (const warning of exposure.warnings) {
        warnings.add(warning);
      }
    }
  } else {
    warnings.add("Exposure calculation skipped because effective film speed could not be resolved.");
  }

  const result: BtzsCalculationResult = {
    sbr,
    requiredG,
    developmentTimeMinutes: developmentTimeLookup?.value ?? null,
    effectiveFilmSpeed: effectiveFilmSpeedLookup?.value ?? null,
    developmentTimeLookup,
    effectiveFilmSpeedLookup,
    supportedRange,
    exposure,
    warnings: [...warnings],
  };

  return result;
}

export function calculateSimpleZoneSystemExposure(
  input: SimpleZoneSystemCalculationInput,
): SimpleZoneSystemCalculationResult {
  const warnings = new Set<string>();
  const lowEvInput = parseFiniteNumberInput(input.lowEv);
  const highEvInput = parseFiniteNumberInput(input.highEv);
  const lowZoneInput = parseFiniteNumberInput(input.lowZone);
  const highZoneInput = parseFiniteNumberInput(input.highZone);
  const meterIso = parsePositiveNumberInput(input.meterIso);
  const workingIso = parsePositiveNumberInput(input.workingIso);
  const baseDevelopmentMinutes = parsePositiveNumberInput(input.baseDevelopmentMinutes);
  const paperEs = parsePositiveNumberInput(input.paperEs ?? 1) ?? 1;
  const flareFactor = parseFiniteNumberInput(input.flareFactor ?? 0);

  if (lowEvInput == null) return { warnings: [], error: "lowEv must be a finite number." };
  if (highEvInput == null) return { warnings: [], error: "highEv must be a finite number." };
  if (lowZoneInput == null) return { warnings: [], error: "lowZone must be a finite number." };
  if (highZoneInput == null) return { warnings: [], error: "highZone must be a finite number." };
  if (meterIso == null) return { warnings: [], error: "meterIso must be a positive number." };
  if (workingIso == null) return { warnings: [], error: "workingIso must be a positive number." };
  if (baseDevelopmentMinutes == null) return { warnings: [], error: "baseDevelopmentMinutes must be a positive number." };
  if (flareFactor == null || flareFactor < 0) return { warnings: [], error: "flareFactor must be zero or greater." };

  let lowEv = lowEvInput;
  let highEv = highEvInput;
  if (lowEv > highEv) {
    [lowEv, highEv] = [highEv, lowEv];
    warnings.add("Low and high EV readings were reversed and were swapped.");
  }

  let lowZone = lowZoneInput;
  let highZone = highZoneInput;
  if (lowZone > highZone) {
    [lowZone, highZone] = [highZone, lowZone];
    warnings.add("Low and high zone readings were reversed and were swapped.");
  }

  const evRange = highEv - lowEv;
  const zoneRange = highZone - lowZone;
  if (!Number.isFinite(zoneRange) || zoneRange <= 0) {
    return { warnings: [...warnings], error: "Zone range must be greater than 0." };
  }

  const sbr = (evRange * 7) / zoneRange;
  if (!Number.isFinite(sbr) || sbr <= 0) {
    return { sbr, warnings: [...warnings], error: "SBR must be greater than 0." };
  }

  const requiredG = (paperEs / (BTZS_SBR_TO_AVERAGE_G_FACTOR * sbr)) + flareFactor;
  const developmentAdjustmentStops = zoneRange - evRange;
  if (developmentAdjustmentStops < -2 || developmentAdjustmentStops > 2) {
    warnings.add("Development adjustment is outside the simple profile N-2 to N+2 range; using the nearest configured percentage.");
  }

  const developmentPercent = interpolateSimpleDevelopmentPercent(
    developmentAdjustmentStops,
    input.adjustmentCurve,
  );
  if (developmentPercent == null) {
    return { sbr, requiredG, developmentAdjustmentStops, warnings: [...warnings], error: "Could not resolve simple development percentage." };
  }
  const developmentTimeMinutes = baseDevelopmentMinutes * (developmentPercent / 100);

  const exposure = calculateZoneMeteringExposure({
    meterEv: lowEv,
    meterIso,
    workingIso,
    targetZone: lowZone,
    compensationStops: input.compensationStops,
    bellowsCorrectionStops: input.bellowsCorrectionStops,
    filterFactors: input.filterFactors,
    readingThroughSelectedFilters: input.readingThroughSelectedFilters,
    precedence: input.precedence,
    aperture: input.aperture,
    shutterSeconds: input.shutterSeconds,
    lensMinFStop: input.lensMinFStop,
    lensMaxFStop: input.lensMaxFStop,
    reciprocityPFactor: input.reciprocityPFactor,
  });

  if (exposure.error) {
    warnings.add(`Exposure calculation skipped: ${exposure.error}`);
    return {
      sbr,
      requiredG,
      developmentAdjustmentStops,
      developmentPercent,
      developmentTimeMinutes,
      effectiveFilmSpeed: workingIso,
      exposure: null,
      warnings: [...warnings],
      error: exposure.error,
    };
  }

  for (const warning of exposure.warnings) warnings.add(warning);

  return {
    sbr,
    requiredG,
    developmentAdjustmentStops,
    developmentPercent,
    developmentTimeMinutes,
    effectiveFilmSpeed: workingIso,
    exposure,
    warnings: [...warnings],
  };
}
