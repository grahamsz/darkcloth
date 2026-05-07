import type { BTZSChartData, BTZSChartPoint } from "../api/client";

export type BtzsChartSeriesKind = "developmentTime" | "effectiveFilmSpeed";

export interface BtzsChartRowDraft {
  id: string;
  averageG: string;
  value: string;
}

export interface BtzsChartSeriesDraft {
  kind: BtzsChartSeriesKind;
  sectionTitle: string;
  chartTitle: string;
  xAxisLabel: string;
  yAxisLabel: string;
  valueKey: BtzsChartSeriesKind;
  valueLabel: string;
  rows: BtzsChartRowDraft[];
}

export interface BtzsChartRowErrors {
  averageG: string | null;
  value: string | null;
}

export const BTZS_CHART_SERIES_ORDER: BtzsChartSeriesKind[] = [
  "developmentTime",
  "effectiveFilmSpeed",
];

export const BTZS_CHART_SERIES_META: Record<BtzsChartSeriesKind, Omit<BtzsChartSeriesDraft, "rows">> = {
  developmentTime: {
    kind: "developmentTime",
    sectionTitle: "Average G to Development Time",
    chartTitle: "Average G vs Development Time",
    xAxisLabel: "Average G",
    yAxisLabel: "Development Time",
    valueKey: "developmentTime",
    valueLabel: "Development Time",
  },
  effectiveFilmSpeed: {
    kind: "effectiveFilmSpeed",
    sectionTitle: "Average G to EFS",
    chartTitle: "Effective Film Speed vs Average G",
    xAxisLabel: "Average G",
    yAxisLabel: "Effective Film Speed",
    valueKey: "effectiveFilmSpeed",
    valueLabel: "Effective Film Speed",
  },
};

const AVERAGE_G_KEY_HINTS = ["averageg", "avg_g", "avgG", "average_gradient", "averagegradient"];
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
  "efs",
  "filmspeed",
  "film_speed",
  "speed",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function createRowId() {
  return globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createBtzsChartRowDraft(averageG = "", value = ""): BtzsChartRowDraft {
  return {
    id: createRowId(),
    averageG,
    value,
  };
}

function createChartSeriesDraft(kind: BtzsChartSeriesKind, rows: BtzsChartRowDraft[] = [createBtzsChartRowDraft()]): BtzsChartSeriesDraft {
  return {
    ...BTZS_CHART_SERIES_META[kind],
    rows,
  };
}

function getChartPointKeys(points: BTZSChartPoint[]) {
  const keys = new Set<string>();
  for (const point of points) {
    for (const [key, value] of Object.entries(point)) {
      if (toNumericValue(value) != null) {
        keys.add(key);
      }
    }
  }
  return [...keys];
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

function inferSupportedSeriesKind(chart: BTZSChartData) {
  const normalized = normalizeText([
    chart.title,
    chart.xAxisLabel,
    chart.yAxisLabel,
  ]
    .filter((value): value is string => Boolean(normalizeText(value)))
    .join(" "));

  const points = Array.isArray(chart.points)
    ? chart.points.filter(isPlainObject).map((point) => point as BTZSChartPoint)
    : [];

  const averageGKey = findPointKey(points, AVERAGE_G_KEY_HINTS);
  if (!averageGKey) return null;

  if (
    normalized.includes("averageg") &&
    (normalized.includes("developmenttime") || normalized.includes("devtime"))
  ) {
    const developmentTimeKey = findPointKey(points, DEVELOPMENT_TIME_KEY_HINTS);
    if (developmentTimeKey) return "developmentTime" as const;
  }

  if (
    normalized.includes("averageg") &&
    (normalized.includes("effectivefilmspeed") || normalized.includes("efs"))
  ) {
    const effectiveFilmSpeedKey = findPointKey(points, EFFECTIVE_FILM_SPEED_KEY_HINTS);
    if (effectiveFilmSpeedKey) return "effectiveFilmSpeed" as const;
  }

  if (findPointKey(points, DEVELOPMENT_TIME_KEY_HINTS)) {
    return "developmentTime" as const;
  }

  if (findPointKey(points, EFFECTIVE_FILM_SPEED_KEY_HINTS)) {
    return "effectiveFilmSpeed" as const;
  }

  return null;
}

function formatDraftValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value);
}

function extractSeriesRows(chart: BTZSChartData, kind: BtzsChartSeriesKind) {
  const points = Array.isArray(chart.points)
    ? chart.points.filter(isPlainObject).map((point) => point as BTZSChartPoint)
    : [];

  const averageGKey = findPointKey(points, AVERAGE_G_KEY_HINTS);
  const valueKey = findPointKey(
    points,
    kind === "developmentTime" ? DEVELOPMENT_TIME_KEY_HINTS : EFFECTIVE_FILM_SPEED_KEY_HINTS,
  );

  if (!averageGKey || !valueKey) {
    return [createBtzsChartRowDraft()];
  }

  const rows = points.flatMap((point) => {
    const averageG = formatDraftValue(point[averageGKey]);
    const value = formatDraftValue(point[valueKey]);
    if (!averageG && !value) return [];
    return [createBtzsChartRowDraft(averageG, value)];
  });

  return rows.length > 0 ? rows : [createBtzsChartRowDraft()];
}

function parseChartNumber(value: string, label: string, rowLabel: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${rowLabel}: ${label} is required.`);
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${rowLabel}: ${label} must be a number.`);
  }

  return parsed;
}

function buildSeriesChartData(series: BtzsChartSeriesDraft) {
  const points = series.rows.flatMap((row, rowIndex) => {
    const averageGText = row.averageG.trim();
    const valueText = row.value.trim();

    if (!averageGText && !valueText) {
      return [];
    }

    const rowLabel = `${series.sectionTitle} row ${rowIndex + 1}`;
    const averageG = parseChartNumber(averageGText, "Average G", rowLabel);
    const value = parseChartNumber(valueText, series.valueLabel, rowLabel);

    return [
      {
        averageG,
        [series.valueKey]: value,
      } as BTZSChartPoint,
    ];
  });

  if (points.length === 0) {
    return null;
  }

  return {
    title: series.chartTitle,
    xAxisLabel: series.xAxisLabel,
    yAxisLabel: series.yAxisLabel,
    points,
  } satisfies BTZSChartData;
}

export function createBlankBtzsChartSeriesDrafts() {
  return BTZS_CHART_SERIES_ORDER.map((kind) => createChartSeriesDraft(kind));
}

export function splitBtzsChartData(chartData: BTZSChartData[] | null | undefined) {
  const supportedSeries = new Map<BtzsChartSeriesKind, BtzsChartSeriesDraft>();
  const otherChartData: BTZSChartData[] = [];

  for (const chart of chartData ?? []) {
    const kind = inferSupportedSeriesKind(chart);
    if (kind && !supportedSeries.has(kind)) {
      supportedSeries.set(kind, createChartSeriesDraft(kind, extractSeriesRows(chart, kind)));
      continue;
    }

    otherChartData.push(chart);
  }

  const series = BTZS_CHART_SERIES_ORDER.map(
    (kind) => supportedSeries.get(kind) ?? createChartSeriesDraft(kind),
  );

  return {
    series,
    otherChartData,
  };
}

export function getBtzsChartSeriesRowErrors(series: BtzsChartSeriesDraft): BtzsChartRowErrors[] {
  return series.rows.map((row) => {
    const averageG = row.averageG.trim();
    const value = row.value.trim();

    if (!averageG && !value) {
      return {
        averageG: null,
        value: null,
      };
    }

    return {
      averageG: averageG ? null : "Average G is required.",
      value: value ? null : `${series.valueLabel} is required.`,
    };
  });
}

export function buildBtzsChartDataFromSeries(
  series: BtzsChartSeriesDraft[],
  otherChartData: BTZSChartData[] | null | undefined = null,
) {
  const charts = series.flatMap((entry) => {
    const chart = buildSeriesChartData(entry);
    return chart ? [chart] : [];
  });

  const merged = [...charts, ...(otherChartData ?? [])];
  return merged.length > 0 ? merged : null;
}
