import type { BTZSChartData } from "../api/client";
import {
  interpolateBtzsSeriesValue,
  type BtzsLookupAxis,
  type BtzsLookupMetric,
  type BtzsSeriesLookup,
  type BtzsSeriesPoint,
} from "../photoExposureMath";

const DISPLAY_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const AVERAGE_G_KEY_HINTS = ["averageg", "avgg", "averagegradient"];
const SBR_KEY_HINTS = ["sbr", "subjectbrightnessrange"];
const DEVELOPMENT_TIME_KEY_HINTS = ["developmenttime", "developmentminutes", "devtime", "time", "minutes"];
const EFFECTIVE_FILM_SPEED_KEY_HINTS = ["effectivefilmspeed", "efs", "filmspeed", "speed"];
const SMALL_NUMBER_EPSILON = 1e-9;
const DISPLAY_CURVE_SAMPLE_COUNT = 96;

export interface BtzsChartExpandedRangePoint {
  label: string;
  x: number;
  y: number;
}

export interface BtzsChartExpandedRange {
  axis: BtzsLookupAxis;
  metric: BtzsLookupMetric;
  measuredMin: number;
  measuredMax: number;
  expandedMin: number;
  expandedMax: number;
  points: BtzsChartExpandedRangePoint[];
  curvePoints: BtzsSeriesPoint[];
  measuredCurvePoints: BtzsSeriesPoint[];
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeChartText(chart: BTZSChartData) {
  return normalizeKey(
    [
      typeof chart.title === "string" ? chart.title : "",
      typeof chart.xAxisLabel === "string" ? chart.xAxisLabel : "",
      typeof chart.yAxisLabel === "string" ? chart.yAxisLabel : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function hasAnyHint(value: string, hints: string[]) {
  return hints.some((hint) => value.includes(hint));
}

function inferChartAxis(chart: BTZSChartData, xKey: string | null | undefined): BtzsLookupAxis | null {
  const normalizedXKey = normalizeKey(xKey ?? "");
  const normalizedChart = normalizeChartText(chart);

  if (hasAnyHint(normalizedXKey, AVERAGE_G_KEY_HINTS) || normalizedChart.includes("averageg")) {
    return "averageG";
  }

  if (hasAnyHint(normalizedXKey, SBR_KEY_HINTS) || normalizedChart.includes("sbr")) {
    return "sbr";
  }

  return null;
}

function inferChartMetric(chart: BTZSChartData, yKey: string | null | undefined): BtzsLookupMetric | null {
  const normalizedYKey = normalizeKey(yKey ?? "");
  const normalizedChart = normalizeChartText(chart);

  if (hasAnyHint(normalizedYKey, DEVELOPMENT_TIME_KEY_HINTS) || normalizedChart.includes("developmenttime") || normalizedChart.includes("devtime")) {
    return "developmentTime";
  }

  if (hasAnyHint(normalizedYKey, EFFECTIVE_FILM_SPEED_KEY_HINTS) || normalizedChart.includes("effectivefilmspeed") || normalizedChart.includes("efs")) {
    return "effectiveFilmSpeed";
  }

  return null;
}

function parseNonNegativeNumber(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

function buildLookupSeries(
  chart: BTZSChartData,
  xKey: string | null | undefined,
  yKey: string | null | undefined,
  points: readonly BtzsSeriesPoint[],
): BtzsSeriesLookup | null {
  const sortedPoints = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x);
  if (sortedPoints.length < 2) return null;

  const axis = inferChartAxis(chart, xKey);
  const metric = inferChartMetric(chart, yKey);
  if (!axis || !metric) return null;

  const measuredMin = sortedPoints[0]!.x;
  const measuredMax = sortedPoints[sortedPoints.length - 1]!.x;
  if (measuredMin <= 0 || measuredMax <= 0 || measuredMax - measuredMin <= SMALL_NUMBER_EPSILON) {
    return null;
  }

  return {
    axis,
    metric,
    points: sortedPoints,
    supportedRange: {
      axis,
      min: measuredMin,
      max: measuredMax,
    },
  };
}

function buildSampleTargets(min: number, max: number, measuredPoints: readonly BtzsSeriesPoint[]) {
  const targets = [
    ...Array.from({ length: DISPLAY_CURVE_SAMPLE_COUNT + 1 }, (_, index) => min + ((max - min) * index / DISPLAY_CURVE_SAMPLE_COUNT)),
    ...measuredPoints.map((point) => point.x).filter((value) => value >= min - SMALL_NUMBER_EPSILON && value <= max + SMALL_NUMBER_EPSILON),
  ];

  targets.sort((left, right) => left - right);
  return targets.filter((target, index) => index === 0 || Math.abs(target - targets[index - 1]!) > SMALL_NUMBER_EPSILON);
}

function sampleBtzsSeriesCurve(
  series: BtzsSeriesLookup,
  min: number,
  max: number,
  options: { curveInterpolation?: boolean | null; extrapolationStops?: number | string | null },
) {
  return buildSampleTargets(min, max, series.points).flatMap((target) => {
    const result = interpolateBtzsSeriesValue(series, target, options);
    return typeof result.value === "number" && Number.isFinite(result.value)
      ? [{ x: target, y: result.value }]
      : [];
  });
}

export function buildBtzsChartExpandedRange({
  chart,
  xKey,
  yKey,
  points,
  curveInterpolationEnabled = false,
  extrapolationStops = 0,
}: {
  chart: BTZSChartData;
  xKey?: string | null;
  yKey?: string | null;
  points: readonly BtzsSeriesPoint[];
  curveInterpolationEnabled?: boolean | null;
  extrapolationStops?: number | string | null;
}): BtzsChartExpandedRange | null {
  const rangeExpansionStops = parseNonNegativeNumber(extrapolationStops);
  if (rangeExpansionStops <= 0) return null;

  const series = buildLookupSeries(chart, xKey, yKey, points);
  if (!series) return null;

  const stopMultiplier = Math.pow(2, rangeExpansionStops);
  const measuredMin = series.supportedRange.min;
  const measuredMax = series.supportedRange.max;
  const expandedMin = measuredMin / stopMultiplier;
  const expandedMax = measuredMax * stopMultiplier;
  const interpolationOptions = {
    curveInterpolation: curveInterpolationEnabled,
    extrapolationStops: rangeExpansionStops,
  };

  const lower = interpolateBtzsSeriesValue(series, expandedMin, interpolationOptions);
  const upper = interpolateBtzsSeriesValue(series, expandedMax, interpolationOptions);
  const curvePoints = sampleBtzsSeriesCurve(series, expandedMin, expandedMax, interpolationOptions);
  const measuredCurvePoints = sampleBtzsSeriesCurve(series, measuredMin, measuredMax, interpolationOptions);
  const expandedPoints = [
    { label: "Lower expanded limit", result: lower, x: expandedMin },
    { label: "Upper expanded limit", result: upper, x: expandedMax },
  ].flatMap((point) => (
    typeof point.result.value === "number" && Number.isFinite(point.result.value)
      ? [{ label: point.label, x: point.x, y: point.result.value }]
      : []
  ));

  if (expandedPoints.length === 0) return null;

  return {
    axis: series.axis,
    metric: series.metric,
    measuredMin,
    measuredMax,
    expandedMin,
    expandedMax,
    points: expandedPoints,
    curvePoints,
    measuredCurvePoints,
  };
}

function normalizeFormattedNumber(value: string) {
  return /^-0(?:\.0+)?$/.test(value) ? "0" : value;
}

export function formatBtzsDisplayNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return normalizeFormattedNumber(DISPLAY_NUMBER_FORMAT.format(value));
}

export function formatBtzsChartCell(value: unknown) {
  if (value == null || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return formatBtzsDisplayNumber(value);
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "—";
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return formatBtzsDisplayNumber(parsed);
    }

    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
