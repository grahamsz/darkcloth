import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { CollectionSwipeNavigator } from "../components/CollectionSwipeNavigator";
import { getCollectionNavigationState } from "../components/collectionNavigation";
import type { ImportedBtzsXdfPreview } from "../btzs/import";
import { buildImportedBtzsProfileCreate, buildImportedBtzsXdfPreview } from "../btzs/import";
import {
  FILM_STOCK_PRESETS,
  FILM_STOCK_BTZS_ONLY_REASON,
  formatFilmSpectralResponseLabel,
  formatFilmStockTypeLabel,
  getFilmStockTypeAvailabilityText,
} from "../film-stocks";
import {
  buildBtzsChartDataFromSeries,
  createBlankBtzsChartSeriesDrafts,
  splitBtzsChartData,
} from "../btzs/chart-data";
import { formatBtzsChartCell, formatBtzsDisplayNumber } from "../btzs/chart-display";
import { BtzsChartSeriesEditor } from "../btzs/chart-series-editor";
import { describeRawXdfMetadata, parseBtzsXdf } from "../btzs/xdf";
import type {
  BTZSChartData,
  BTZSChartPoint,
  BTZSSourceFile,
  DevelopmentProfile,
  DevelopmentProfileCreate,
  DevelopmentProfileType,
  DevelopmentProfileUpdate,
  FilmStock,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useConnectivity } from "../contexts/ConnectivityContext";
import { readCachedDevelopmentProfiles, readCachedFilmStock, readCachedFilmStocks } from "../offline/cache";
import {
  applyFilmStockPreset,
  buildFilmStockPayload,
  createEmptyFilmStockDraft,
  filmStockDraftFromFilmStock,
  FilmStockFormFields,
  parseReciprocityPFactorInput,
  type FilmStockFormDraft,
} from "./GearFormFields";

const FILM_STOCK_LIST_PATH = "/app/film/stocks";
const FILM_STOCK_DETAIL_PATH = (id: string) => `${FILM_STOCK_LIST_PATH}/${id}`;
const FILM_STOCK_IMPORT_PATH = (id: string) => `${FILM_STOCK_DETAIL_PATH(id)}?import=1`;
const FILM_STOCK_PROFILE_NEW_PATH = (id: string) => `${FILM_STOCK_DETAIL_PATH(id)}?profile=new`;

type ProfileDraft = {
  type: DevelopmentProfileType;
  name: string;
  developerName: string;
  dilution: string;
  temperatureText: string;
  agitation: string;
  notes: string;
  timeText: string;
  nMinusTwoPercent: string;
  nMinusOnePercent: string;
  nPlusOnePercent: string;
  nPlusTwoPercent: string;
  filmIso: string;
  testDate: string;
  curvesText: string;
  flareDensityText: string;
  paperEsText: string;
  methodText: string;
  keyValuesText: string;
  chartSeries: ReturnType<typeof createBlankBtzsChartSeriesDrafts>;
  otherChartData: BTZSChartData[];
  sourceFilesText: string;
};

type PlotPoint = {
  x: number;
  y: number;
  raw: BTZSChartPoint;
};

type DevelopmentProfileModalMode = "create" | "edit" | "import";

const CHART_POINT_KEY_HINTS = {
  sbr: ["sbr", "sbrvalue", "subjectbrightnessrange"],
  developmentTime: ["developmenttime", "developmenttimeminutes", "developmenttimehours", "devtime", "time", "minutes"],
  effectiveFilmSpeed: ["effectivefilmspeed", "effectivefilmspeedvalue", "efs", "filmspeed", "speed"],
  averageG: ["averageg", "avgg", "avg_g", "average_g", "g"],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : "";
}

function toNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatColumnLabel(key: string) {
  const normalized = normalizeKey(key);
  if (normalized === "sbr") return "SBR";
  if (normalized === "efs") return "EFS";
  if (normalized === "averageg") return "Average G";
  if (normalized === "developmenttime") return "Development Time";
  if (normalized === "effectivefilmspeed") return "Effective Film Speed";
  if (normalized === "paperes") return "Paper ES";
  if (normalized === "reciprocityexpindex") return "Reciprocity Exp Index";
  if (normalized === "reciprocitygindex") return "Reciprocity G Index";
  if (normalized === "usereciprocity") return "Use Reciprocity";
  if (normalized === "filmiso") return "Paper ES";
  if (normalized === "unknownorreciprocityfields") return "Legacy reciprocity fields";
  if (normalized === "x") return "X";
  if (normalized === "y") return "Y";

  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function emptyProfileDraft(type: DevelopmentProfileType = "simple"): ProfileDraft {
  return {
    type,
    name: "",
    developerName: "",
    dilution: "",
    temperatureText: "",
    agitation: "",
    notes: "",
    timeText: "",
    nMinusTwoPercent: "65",
    nMinusOnePercent: "80",
    nPlusOnePercent: "125",
    nPlusTwoPercent: "160",
    filmIso: "",
    testDate: "",
    curvesText: "",
    flareDensityText: "",
    paperEsText: "",
    methodText: "",
    keyValuesText: "",
    chartSeries: createBlankBtzsChartSeriesDrafts(),
    otherChartData: [],
    sourceFilesText: "",
  };
}

function draftFromProfile(profile: DevelopmentProfile): ProfileDraft {
  if (profile.type === "simple") {
    return {
      ...emptyProfileDraft("simple"),
      type: "simple",
      name: profile.name,
      developerName: profile.developerName,
      dilution: profile.dilution ?? "",
      temperatureText: profile.temperatureText,
      agitation: profile.agitation ?? "",
      notes: profile.notes ?? "",
      timeText: profile.timeText,
      nMinusTwoPercent: String(profile.nMinusTwoPercent),
      nMinusOnePercent: String(profile.nMinusOnePercent),
      nPlusOnePercent: String(profile.nPlusOnePercent),
      nPlusTwoPercent: String(profile.nPlusTwoPercent),
    };
  }

  const { series, otherChartData } = splitBtzsChartData(profile.chartData);

  return {
    ...emptyProfileDraft("btzs"),
    type: "btzs",
    name: profile.name,
    developerName: profile.developerName,
    dilution: profile.dilution ?? "",
    temperatureText: profile.temperatureText,
    agitation: profile.agitation ?? "",
    notes: profile.notes ?? "",
    filmIso: profile.filmIso ?? "",
    testDate: profile.testDate ?? "",
    curvesText: profile.curvesText ?? "",
    flareDensityText: profile.flareDensityText ?? "",
    paperEsText: profile.paperEsText ?? "",
    methodText: profile.methodText ?? "",
    keyValuesText: profile.keyValuesText ?? "",
    chartSeries: series,
    otherChartData,
    sourceFilesText: profile.sourceFiles ? JSON.stringify(profile.sourceFiles, null, 2) : "",
  };
}

function requireText(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalPositiveNumber(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
}

function parseOptionalJsonArray(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (parsed === null) return null;
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }
  if (!parsed.every(isPlainObject)) {
    throw new Error(`${label} must be a JSON array of objects.`);
  }

  return parsed as Record<string, unknown>[];
}

function buildCreatePayload(draft: ProfileDraft): DevelopmentProfileCreate {
  const common = {
    name: requireText(draft.name, "Name"),
    developerName: requireText(draft.developerName, "Developer name"),
    dilution: optionalText(draft.dilution),
    temperatureText: requireText(draft.temperatureText, "Temperature"),
    agitation: optionalText(draft.agitation),
    notes: optionalText(draft.notes),
  };

  if (draft.type === "simple") {
    return {
      type: "simple",
      ...common,
      timeText: requireText(draft.timeText, "Development time"),
      nMinusTwoPercent: optionalPositiveNumber(draft.nMinusTwoPercent, "N-2 percent"),
      nMinusOnePercent: optionalPositiveNumber(draft.nMinusOnePercent, "N-1 percent"),
      nPlusOnePercent: optionalPositiveNumber(draft.nPlusOnePercent, "N+1 percent"),
      nPlusTwoPercent: optionalPositiveNumber(draft.nPlusTwoPercent, "N+2 percent"),
    };
  }

  return {
    type: "btzs",
    ...common,
    filmIso: optionalText(draft.filmIso),
    testDate: optionalText(draft.testDate),
    curvesText: optionalText(draft.curvesText),
    flareDensityText: optionalText(draft.flareDensityText),
    paperEsText: optionalText(draft.paperEsText),
    methodText: optionalText(draft.methodText),
    keyValuesText: optionalText(draft.keyValuesText),
    chartData: buildBtzsChartDataFromSeries(draft.chartSeries, draft.otherChartData),
    sourceFiles: parseOptionalJsonArray(draft.sourceFilesText, "Source files") as BTZSSourceFile[] | null,
  };
}

function buildUpdatePayload(draft: ProfileDraft): DevelopmentProfileUpdate {
  const payload: DevelopmentProfileUpdate = {
    name: requireText(draft.name, "Name"),
    developerName: requireText(draft.developerName, "Developer name"),
    dilution: optionalText(draft.dilution),
    temperatureText: requireText(draft.temperatureText, "Temperature"),
    agitation: optionalText(draft.agitation),
    notes: optionalText(draft.notes),
  };

  if (draft.type === "simple") {
    payload.timeText = requireText(draft.timeText, "Development time");
    payload.nMinusTwoPercent = optionalPositiveNumber(draft.nMinusTwoPercent, "N-2 percent");
    payload.nMinusOnePercent = optionalPositiveNumber(draft.nMinusOnePercent, "N-1 percent");
    payload.nPlusOnePercent = optionalPositiveNumber(draft.nPlusOnePercent, "N+1 percent");
    payload.nPlusTwoPercent = optionalPositiveNumber(draft.nPlusTwoPercent, "N+2 percent");
    return payload;
  }

  payload.filmIso = optionalText(draft.filmIso);
  payload.testDate = optionalText(draft.testDate);
  payload.curvesText = optionalText(draft.curvesText);
  payload.flareDensityText = optionalText(draft.flareDensityText);
  payload.paperEsText = optionalText(draft.paperEsText);
  payload.methodText = optionalText(draft.methodText);
  payload.keyValuesText = optionalText(draft.keyValuesText);
  payload.chartData = buildBtzsChartDataFromSeries(draft.chartSeries, draft.otherChartData);
  payload.sourceFiles = parseOptionalJsonArray(draft.sourceFilesText, "Source files") as BTZSSourceFile[] | null;
  return payload;
}

function formatProfileSummary(profile: DevelopmentProfile) {
  if (profile.type === "simple") {
    return [
      profile.developerName,
      profile.dilution,
      profile.temperatureText,
      profile.timeText,
    ]
      .map(normalizeText)
      .filter(Boolean)
      .join(" · ");
  }

  return [
    profile.developerName,
    profile.dilution,
    profile.temperatureText,
    profile.filmIso ? `ISO ${profile.filmIso}` : null,
    profile.testDate ? `Tested ${profile.testDate}` : null,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" · ");
}

function formatChartTitle(chart: BTZSChartData) {
  const title = normalizeText(typeof chart.title === "string" ? chart.title : "");
  if (title) return title;

  const x = normalizeText(typeof chart.xAxisLabel === "string" ? chart.xAxisLabel : "");
  const y = normalizeText(typeof chart.yAxisLabel === "string" ? chart.yAxisLabel : "");
  if (x && y) return `${y} vs ${x}`;
  if (x) return x;
  if (y) return y;
  return "BTZS chart";
}

function getChartNormalizedText(chart: BTZSChartData) {
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

function getChartPointKeys(points: BTZSChartPoint[]) {
  const keys = new Set<string>();
  for (const point of points) {
    for (const key of Object.keys(point)) {
      if (toNumericValue(point[key]) != null) {
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

function inferAxisKeys(chart: BTZSChartData, points: BTZSChartPoint[]) {
  const normalized = getChartNormalizedText(chart);
  let xCandidates: string[] = [];
  let yCandidates: string[] = [];

  const isDevelopmentTime = normalized.includes("developmenttime") || normalized.includes("devtime");
  const isSbr = normalized.includes("sbr");
  const isEffectiveFilmSpeed = normalized.includes("effectivefilmspeed") || normalized.includes("efs");
  const isAverageG = normalized.includes("averageg") || normalized.includes("avgg");

  if (isDevelopmentTime && isSbr) {
    xCandidates = CHART_POINT_KEY_HINTS.sbr;
    yCandidates = CHART_POINT_KEY_HINTS.developmentTime;
  } else if (isEffectiveFilmSpeed && isSbr) {
    xCandidates = CHART_POINT_KEY_HINTS.sbr;
    yCandidates = CHART_POINT_KEY_HINTS.effectiveFilmSpeed;
  } else if (isAverageG && isDevelopmentTime) {
    xCandidates = CHART_POINT_KEY_HINTS.averageG;
    yCandidates = CHART_POINT_KEY_HINTS.developmentTime;
  } else if (isAverageG && isEffectiveFilmSpeed) {
    xCandidates = CHART_POINT_KEY_HINTS.averageG;
    yCandidates = CHART_POINT_KEY_HINTS.effectiveFilmSpeed;
  }

  let xKey = findPointKey(points, xCandidates);
  let yKey = findPointKey(points, yCandidates);

  if (!xKey || !yKey) {
    const fallbackKeys = getChartPointKeys(points);
    const preferredKeys = [
      "x",
      "y",
      "sbr",
      "developmenttime",
      "effectivefilmspeed",
      "averageg",
    ];
    const ordered = [...fallbackKeys].sort((a, b) => {
      const aIndex = preferredKeys.findIndex((candidate) => normalizeKey(candidate) === normalizeKey(a));
      const bIndex = preferredKeys.findIndex((candidate) => normalizeKey(candidate) === normalizeKey(b));
      const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      if (normalizedA !== normalizedB) return normalizedA - normalizedB;
      return a.localeCompare(b);
    });
    if (!xKey) {
      xKey = ordered[0] ?? null;
    }
    if (!yKey) {
      yKey = ordered.find((candidate) => !xKey || normalizeKey(candidate) !== normalizeKey(xKey)) ?? null;
    }
  }

  return { xKey, yKey };
}

function buildPlotSeries(chart: BTZSChartData) {
  const rawPoints = Array.isArray(chart.points)
    ? chart.points.filter(isPlainObject).map((point) => point as BTZSChartPoint)
    : [];
  const { xKey, yKey } = inferAxisKeys(chart, rawPoints);

  if (!xKey || !yKey) {
    return { rawPoints, xKey, yKey, plottedPoints: [] as PlotPoint[] };
  }

  const plottedPoints = rawPoints.flatMap((point) => {
    const x = toNumericValue(point[xKey]);
    const y = toNumericValue(point[yKey]);
    if (x == null || y == null) return [];
    return [{ x, y, raw: point }];
  });

  return { rawPoints, xKey, yKey, plottedPoints };
}

const SOURCE_FILE_HEADER_KEYS = new Set(["label", "name", "title", "filename", "source", "type"]);

function hasRenderableMetadataValue(value: unknown) {
  return value !== null && value !== undefined && !(typeof value === "string" && value.trim().length === 0);
}

function getSourceFileTitle(sourceFile: BTZSSourceFile, index: number) {
  const label = normalizeText(typeof sourceFile.label === "string" ? sourceFile.label : "");
  const title = normalizeText(typeof sourceFile.title === "string" ? sourceFile.title : "");
  const name = normalizeText(typeof sourceFile.name === "string" ? sourceFile.name : "");
  const filename = normalizeText(typeof sourceFile.filename === "string" ? sourceFile.filename : "");

  return label || title || name || filename || `Source file ${index + 1}`;
}

function getSourceFileSummary(sourceFile: BTZSSourceFile, title: string) {
  const summaryParts = new Set<string>();
  const filename = normalizeText(typeof sourceFile.filename === "string" ? sourceFile.filename : "");
  const source = normalizeText(typeof sourceFile.source === "string" ? sourceFile.source : "");
  const type = normalizeText(typeof sourceFile.type === "string" ? sourceFile.type : "");

  if (filename && filename !== title) summaryParts.add(filename);
  if (source && source !== title && source !== filename) summaryParts.add(source);
  if (type && type !== title && type !== filename) summaryParts.add(type);

  return summaryParts.size > 0 ? [...summaryParts].join(" · ") : null;
}

function getSourceFileFields(sourceFile: BTZSSourceFile) {
  return Object.entries(sourceFile)
    .filter(([key, value]) => !SOURCE_FILE_HEADER_KEYS.has(normalizeKey(key)) && hasRenderableMetadataValue(value))
    .map(([key, value]) => ({
      label: formatColumnLabel(key),
      value: formatBtzsChartCell(value),
    }));
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function validateFilmStockDraft(draft: FilmStockFormDraft) {
  if (!draft.name.trim()) {
    return "Name is required.";
  }
  if (parseReciprocityPFactorInput(draft.reciprocityPFactor) == null) {
    return "Reciprocity P factor must be a positive number.";
  }
  return null;
}

function DevelopmentProfileModal({
  mode,
  title,
  onClose,
  children,
}: {
  mode: DevelopmentProfileModalMode;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const eyebrow = mode === "import" ? "BTZS import" : mode === "create" ? "Development profile" : "Edit profile";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal film-stock-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="film-stock-profile-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="page-count">{eyebrow}</p>
            <h2 id="film-stock-profile-modal-title">{title}</h2>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="film-stock-profile-modal-body">{children}</div>
      </div>
    </div>
  );
}

function ProfileEditorForm({
  heading,
  draft,
  allowTypeChange,
  allowBtzs = true,
  availabilityNote = null,
  error,
  saving,
  submitLabel,
  onChange,
  onCancel,
  onSubmit,
}: {
  heading: string;
  draft: ProfileDraft;
  allowTypeChange: boolean;
  allowBtzs?: boolean;
  availabilityNote?: string | null;
  error: string | null;
  saving: boolean;
  submitLabel: string;
  onChange: (next: ProfileDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const profileType = allowBtzs ? draft.type : "simple";
  const setField = <K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) => {
    onChange({ ...draft, [field]: value });
  };

  return (
    <div className="profile-card profile-card--editor">
      <div className="profile-card-header">
        <div className="profile-card-heading">
          <span className={`profile-type-badge profile-type-badge--${profileType}`}>
            {allowTypeChange ? "New profile" : draft.type === "simple" ? "Simple profile" : "BTZS profile"}
          </span>
          <h3>{heading}</h3>
        </div>
      </div>

      <form className="profile-form" onSubmit={onSubmit}>
        {error && <p className="form-error">{error}</p>}

        <fieldset>
          <legend>Summary</legend>
          <div className="profile-form-grid">
            {allowTypeChange && (
              <label className="field" htmlFor="development-profile-type">
                <span>Profile type</span>
                <select
                  id="development-profile-type"
                  value={profileType}
                  onChange={(event) => setField("type", event.target.value as DevelopmentProfileType)}
                >
                  <option value="simple">Simple</option>
                  {allowBtzs && <option value="btzs">BTZS</option>}
                </select>
                {!allowBtzs && availabilityNote && <small className="film-stock-type-note">{availabilityNote}</small>}
              </label>
            )}
            <label className={`field ${allowTypeChange ? "" : "profile-field--full"}`} htmlFor="development-profile-name">
              <span>Name</span>
              <input
                id="development-profile-name"
                value={draft.name}
                onChange={(event) => setField("name", event.target.value)}
                required
              />
            </label>
            <label className="field" htmlFor="development-profile-developer-name">
              <span>Developer name</span>
              <input
                id="development-profile-developer-name"
                value={draft.developerName}
                onChange={(event) => setField("developerName", event.target.value)}
                required
              />
            </label>
            <label className="field" htmlFor="development-profile-dilution">
              <span>Dilution</span>
              <input
                id="development-profile-dilution"
                value={draft.dilution}
                onChange={(event) => setField("dilution", event.target.value)}
                placeholder="1+4"
              />
            </label>
            <label className="field" htmlFor="development-profile-temperature">
              <span>Temperature text</span>
              <input
                id="development-profile-temperature"
                value={draft.temperatureText}
                onChange={(event) => setField("temperatureText", event.target.value)}
                placeholder="20C"
                required
              />
            </label>
            <label className="field" htmlFor="development-profile-agitation">
              <span>Agitation</span>
              <input
                id="development-profile-agitation"
                value={draft.agitation}
                onChange={(event) => setField("agitation", event.target.value)}
                placeholder="5 sec every 30 sec"
              />
            </label>
            {profileType === "simple" ? (
              <label className="field" htmlFor="development-profile-time">
                <span>Development time</span>
                <input
                  id="development-profile-time"
                  value={draft.timeText}
                  onChange={(event) => setField("timeText", event.target.value)}
                  placeholder="7:30"
                  required
                />
              </label>
            ) : (
              <label className="field" htmlFor="development-profile-film-iso">
                <span>Film ISO</span>
                <input
                  id="development-profile-film-iso"
                  value={draft.filmIso}
                  onChange={(event) => setField("filmIso", event.target.value)}
                  placeholder="400"
                />
              </label>
            )}
            <label className="field profile-field--full" htmlFor="development-profile-notes">
              <span>Notes</span>
              <textarea
                id="development-profile-notes"
                rows={3}
                value={draft.notes}
                onChange={(event) => setField("notes", event.target.value)}
                placeholder="Fixture profile used for chart rendering."
              />
            </label>
          </div>
        </fieldset>

        {profileType === "simple" && (
          <fieldset>
            <legend>Zone adjustments</legend>
            <div className="profile-form-grid">
              <label className="field" htmlFor="development-profile-n-minus-two">
                <span>N-2 percent</span>
                <input
                  id="development-profile-n-minus-two"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={draft.nMinusTwoPercent}
                  onChange={(event) => setField("nMinusTwoPercent", event.target.value)}
                />
              </label>
              <label className="field" htmlFor="development-profile-n-minus-one">
                <span>N-1 percent</span>
                <input
                  id="development-profile-n-minus-one"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={draft.nMinusOnePercent}
                  onChange={(event) => setField("nMinusOnePercent", event.target.value)}
                />
              </label>
              <label className="field" htmlFor="development-profile-n-plus-one">
                <span>N+1 percent</span>
                <input
                  id="development-profile-n-plus-one"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={draft.nPlusOnePercent}
                  onChange={(event) => setField("nPlusOnePercent", event.target.value)}
                />
              </label>
              <label className="field" htmlFor="development-profile-n-plus-two">
                <span>N+2 percent</span>
                <input
                  id="development-profile-n-plus-two"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={draft.nPlusTwoPercent}
                  onChange={(event) => setField("nPlusTwoPercent", event.target.value)}
                />
              </label>
              <p className="field-note profile-field--full">
                Percentages are relative to normal development time. N is 100%; fractional N values are interpolated.
              </p>
            </div>
          </fieldset>
        )}

        {profileType === "btzs" && (
          <>
            <fieldset>
              <legend>BTZS details</legend>
              <div className="profile-form-grid">
                <label className="field" htmlFor="development-profile-test-date">
                  <span>Test date</span>
                  <input
                    id="development-profile-test-date"
                    type="date"
                    value={draft.testDate}
                    onChange={(event) => setField("testDate", event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="development-profile-flare-density">
                  <span>Flare density</span>
                  <input
                    id="development-profile-flare-density"
                    value={draft.flareDensityText}
                    onChange={(event) => setField("flareDensityText", event.target.value)}
                    placeholder="0.15"
                  />
                </label>
                <label className="field" htmlFor="development-profile-paper-es">
                  <span>Paper ES</span>
                  <input
                    id="development-profile-paper-es"
                    value={draft.paperEsText}
                    onChange={(event) => setField("paperEsText", event.target.value)}
                    placeholder="Grade 2"
                  />
                </label>
                <label className="field profile-field--full" htmlFor="development-profile-method">
                  <span>Method</span>
                  <input
                    id="development-profile-method"
                    value={draft.methodText}
                    onChange={(event) => setField("methodText", event.target.value)}
                    placeholder="BTZS Plotter"
                  />
                </label>
                <label className="field profile-field--full" htmlFor="development-profile-curves">
                  <span>Curves text</span>
                  <textarea
                    id="development-profile-curves"
                    rows={3}
                    value={draft.curvesText}
                    onChange={(event) => setField("curvesText", event.target.value)}
                    placeholder="Straight-line section only."
                  />
                </label>
                <label className="field profile-field--full" htmlFor="development-profile-key-values">
                  <span>Key values text</span>
                  <textarea
                    id="development-profile-key-values"
                    rows={3}
                    value={draft.keyValuesText}
                    onChange={(event) => setField("keyValuesText", event.target.value)}
                    placeholder="CI 0.56 / EFS 100-"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>BTZS charts</legend>
              <BtzsChartSeriesEditor series={draft.chartSeries} onChange={(next) => setField("chartSeries", next)} />
              {draft.otherChartData.length > 0 && (
                <p className="profile-empty-state profile-empty-state--compact">
                  Additional chart data is preserved when you save this profile.
                </p>
              )}
            </fieldset>

            <fieldset>
              <legend>Source files</legend>
              <div className="profile-form-grid">
                <label className="field profile-field--full" htmlFor="development-profile-source-files">
                  <span>Source file metadata</span>
                  <textarea
                    id="development-profile-source-files"
                    className="profile-json-textarea"
                    rows={8}
                    value={draft.sourceFilesText}
                    onChange={(event) => setField("sourceFilesText", event.target.value)}
                    placeholder='[{"label":"FP4+ / DDX fixture","filename":"fp4-ddx.pdf","notes":"Paste source metadata here"}]'
                  />
                </label>
              </div>
            </fieldset>
          </>
        )}

        <div className="profile-form-actions">
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : submitLabel}
          </button>
          <button className="btn-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function ImportPointTable({
  title,
  valueLabel,
  rows,
  valueKey,
}: {
  title: string;
  valueLabel: string;
  rows: Array<{ averageG: number; effectiveFilmSpeed?: number; developmentTime?: number }>;
  valueKey: "effectiveFilmSpeed" | "developmentTime";
}) {
  return (
    <section className="profile-section">
      <h4>{title}</h4>
      <div className="btzs-chart-table-wrap btzs-chart-table-wrap--compact">
        <table className="btzs-chart-table btzs-chart-table--compact">
          <thead>
            <tr>
              <th>Average G</th>
              <th>{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                <td>{formatBtzsChartCell(row.averageG)}</td>
                <td>{formatBtzsChartCell(row[valueKey])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function XdfImportPanel({
  preview,
  error,
  parsing,
  saving,
  onClose,
  onFileSelected,
  onSubmit,
}: {
  preview: ImportedBtzsXdfPreview | null;
  error: string | null;
  parsing: boolean;
  saving: boolean;
  onClose: () => void;
  onFileSelected: (file: File) => void | Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const resetDragState = () => {
    dragDepthRef.current = 0;
    setDragActive(false);
  };

  const handleFileSelected = (file: File | undefined) => {
    if (!file || parsing || saving) return;
    void onFileSelected(file);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    handleFileSelected(file);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (parsing || saving) return;
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (parsing || saving) return;
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (parsing || saving) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (parsing || saving) return;
    resetDragState();
    handleFileSelected(event.dataTransfer.files?.[0]);
  };

  return (
    <form className="profile-card profile-card--editor" onSubmit={onSubmit}>
      <div className="profile-card-header">
        <div className="profile-card-heading">
          <span className="profile-type-badge profile-type-badge--btzs">BTZS import</span>
          <h3>Import BTZS / XDF profile</h3>
          <p className="profile-card-summary">
            Choose a <code>.xdf</code> file or drop one here. Parsing happens locally before anything is saved.
          </p>
        </div>
        <div className="profile-card-actions">
          <button type="button" className="btn-secondary" onClick={handlePickFile} disabled={parsing || saving}>
            Choose file
          </button>
          <button type="button" className="btn-danger-ghost" onClick={onClose} disabled={parsing || saving}>
            Close
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".xdf" onChange={handleFileChange} hidden />

      <div
        className={`xdf-import-dropzone${dragActive ? " xdf-import-dropzone--active" : ""}${parsing || saving ? " xdf-import-dropzone--disabled" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="xdf-import-dropzone-copy">
          <strong>Drop a BTZS / ExpoDev XDF file</strong>
          <p>
            Use a file exported from BTZS / ExpoDev. The import preview shows the parsed metadata and chart
            tables before the profile is created.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={handlePickFile} disabled={parsing || saving}>
          {parsing ? "Parsing…" : "Browse files"}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {preview ? (
        <div className="xdf-import-preview">
          <div className="xdf-import-preview-grid">
            <section className="profile-section xdf-import-preview-section">
              <h4>Parsed metadata</h4>
              <dl className="detail-grid profile-detail-grid">
                <DetailRow label="Display name" value={preview.displayName} />
                <DetailRow label="Process label" value={preview.processLabel} />
                <DetailRow label="Developer name" value={preview.developerName} />
                <DetailRow label="Dilution" value={preview.dilution || null} />
                <DetailRow label="Temperature text" value={preview.temperatureText} />
                <DetailRow label="Paper ES" value={preview.paperEs} />
                <DetailRow label="R code" value={preview.reciprocityCode} />
                <DetailRow label="Use reciprocity" value={preview.useReciprocityText} />
                <DetailRow label="Version / type" value={String(preview.versionOrType)} />
                <DetailRow label="EFS/G point count" value={preview.efsPointCount} />
                <DetailRow label="Dev/G point count" value={preview.devPointCount} />
                <DetailRow label="Source file" value={preview.fileName} />
                <DetailRow label="File size" value={formatFileSize(preview.fileSize)} />
              </dl>
            </section>

            <section className="profile-section xdf-import-preview-section">
              <h4>Key values text</h4>
              <pre className="profile-json-block">{preview.keyValuesText}</pre>
            </section>
          </div>

          <div className="xdf-import-preview-grid xdf-import-preview-grid--tables">
            <ImportPointTable
              title="Average G to EFS"
              valueLabel="Effective Film Speed"
              rows={preview.efsRows}
              valueKey="effectiveFilmSpeed"
            />

            <ImportPointTable
              title="Average G to Development Time"
              valueLabel="Development Time"
              rows={preview.devRows}
              valueKey="developmentTime"
            />
          </div>
        </div>
      ) : (
        <p className="profile-empty-state profile-empty-state--compact">
          {parsing ? "Parsing file…" : "Drop a `.xdf` file or browse to preview the import details."}
        </p>
      )}

      <div className="profile-form-actions">
        <button className="btn-primary" type="submit" disabled={!preview || parsing || saving}>
          {saving ? "Importing…" : "Import profile"}
        </button>
      </div>
    </form>
  );
}

function ChartCard({ chart }: { chart: BTZSChartData }) {
  const title = formatChartTitle(chart);
  const xAxisLabel = normalizeText(typeof chart.xAxisLabel === "string" ? chart.xAxisLabel : "") || "X axis";
  const yAxisLabel = normalizeText(typeof chart.yAxisLabel === "string" ? chart.yAxisLabel : "") || "Y axis";
  const { rawPoints, plottedPoints, xKey, yKey } = buildPlotSeries(chart);
  const columns = (() => {
    const keys = new Set<string>();
    const preferred = [xKey, yKey, "label", "name", "series"].filter((value): value is string => Boolean(value));
    for (const key of preferred) {
      if (rawPoints.some((point) => Object.prototype.hasOwnProperty.call(point, key))) {
        keys.add(key);
      }
    }
    for (const point of rawPoints) {
      for (const key of Object.keys(point)) {
        keys.add(key);
      }
    }
    return [...keys];
  })();

  const summaryBits = [
    typeof chart.effectiveFilmSpeedLabel === "string" ? chart.effectiveFilmSpeedLabel : null,
    chart.effectiveFilmSpeed != null ? `EFS ${formatBtzsDisplayNumber(chart.effectiveFilmSpeed)}` : null,
  ].filter((value): value is string => Boolean(value));

  const width = 560;
  const height = 224;
  const margin = { top: 14, right: 18, bottom: 38, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const xValues = plottedPoints.map((point) => point.x);
  const yValues = plottedPoints.map((point) => point.y);
  const xMin = xValues.length > 0 ? Math.min(...xValues) : 0;
  const xMax = xValues.length > 0 ? Math.max(...xValues) : 1;
  const yMin = yValues.length > 0 ? Math.min(...yValues) : 0;
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;
  const yRange = yMax === yMin ? 1 : yMax - yMin;

  const toX = (value: number) => margin.left + ((value - xMin) / xRange) * plotWidth;
  const toY = (value: number) => margin.top + plotHeight - ((value - yMin) / yRange) * plotHeight;

  const linePath = plottedPoints
    .map((point, index) => {
      const x = toX(point.x);
      const y = toY(point.y);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const tickCount = 4;

  return (
    <article className="btzs-chart">
      <div className="btzs-chart-header">
        <div>
          <h4 className="btzs-chart-title">{title}</h4>
          <p className="btzs-chart-meta">
            {xAxisLabel} · {yAxisLabel}
            {summaryBits.length > 0 ? ` · ${summaryBits.join(" · ")}` : ""}
          </p>
        </div>
      </div>

      {plottedPoints.length > 0 ? (
        <div className="btzs-chart-figure">
          <svg
            className="btzs-chart-svg"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${title}. ${xAxisLabel} and ${yAxisLabel}.`}
          >
            <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} fill="none" stroke="var(--line)" />

            {Array.from({ length: tickCount + 1 }, (_, index) => {
              const fraction = index / tickCount;
              const xTickValue = xMin + xRange * fraction;
              const yTickValue = yMin + yRange * fraction;
              const x = margin.left + plotWidth * fraction;
              const y = margin.top + plotHeight * fraction;

              return (
                <g key={index}>
                  <line
                    x1={x}
                    y1={margin.top}
                    x2={x}
                    y2={margin.top + plotHeight}
                    stroke="rgba(215, 208, 197, 0.5)"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1={margin.left}
                    y1={y}
                    x2={margin.left + plotWidth}
                    y2={y}
                    stroke="rgba(215, 208, 197, 0.5)"
                    strokeDasharray="4 4"
                  />
                  <text x={x} y={height - 18} textAnchor="middle" fontSize="12" fill="var(--muted)">
                    {formatBtzsDisplayNumber(xTickValue)}
                  </text>
                  <text x={margin.left - 8} y={y + 4} textAnchor="end" fontSize="12" fill="var(--muted)">
                    {formatBtzsDisplayNumber(yMin + yRange * (1 - fraction))}
                  </text>
                </g>
              );
            })}

            <line
              x1={margin.left}
              y1={margin.top + plotHeight}
              x2={margin.left + plotWidth}
              y2={margin.top + plotHeight}
              stroke="var(--ink)"
              strokeWidth="1.2"
            />
            <line
              x1={margin.left}
              y1={margin.top}
              x2={margin.left}
              y2={margin.top + plotHeight}
              stroke="var(--ink)"
              strokeWidth="1.2"
            />

            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {plottedPoints.map((point, index) => (
              <circle
                key={`${point.x}-${point.y}-${index}`}
                cx={toX(point.x)}
                cy={toY(point.y)}
                r="4.2"
                fill="var(--accent-strong)"
                stroke="#fff"
                strokeWidth="1.4"
              />
            ))}

            <text x={margin.left + plotWidth / 2} y={height - 2} textAnchor="middle" fontSize="13" fill="var(--ink)">
              {xAxisLabel}
            </text>
            <text
              x={16}
              y={margin.top + plotHeight / 2}
              textAnchor="middle"
              fontSize="13"
              fill="var(--ink)"
              transform={`rotate(-90 16 ${margin.top + plotHeight / 2})`}
            >
              {yAxisLabel}
            </text>
          </svg>
        </div>
      ) : (
        <p className="btzs-chart-empty">No plottable points found for this chart.</p>
      )}

      {rawPoints.length > 0 && (
        <div className="btzs-chart-table-wrap btzs-chart-table-wrap--compact">
          <table className="btzs-chart-table btzs-chart-table--compact">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{formatColumnLabel(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rawPoints.map((point, index) => (
                <tr key={`${title}-${index}`}>
                  {columns.map((column) => (
                    <td key={column}>{formatBtzsChartCell(point[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function SourceFileCard({ sourceFile, index }: { sourceFile: BTZSSourceFile; index: number }) {
  const title = getSourceFileTitle(sourceFile, index);
  const summary = getSourceFileSummary(sourceFile, title);
  const fields = getSourceFileFields(sourceFile);

  return (
    <article className="profile-source-file">
      <div className="profile-source-file-header">
        <div className="profile-source-file-heading">
          <span className="profile-source-file-index">Source file {index + 1}</span>
          <h5>{title}</h5>
        </div>
        {summary && <p className="profile-source-file-subtitle">{summary}</p>}
      </div>

      {fields.length > 0 ? (
        <dl className="profile-source-file-fields">
          {fields.map((field, fieldIndex) => (
            <DetailRow key={`${index}-${field.label}-${fieldIndex}`} label={field.label} value={field.value} />
          ))}
        </dl>
      ) : (
        <p className="profile-empty-state profile-empty-state--compact">No additional metadata.</p>
      )}
    </article>
  );
}

function ProfileViewCard({
  profile,
  onEdit,
  onDelete,
  editDisabledReason = null,
  deleteDisabledReason = null,
}: {
  profile: DevelopmentProfile;
  onEdit: () => void;
  onDelete: () => void;
  editDisabledReason?: string | null;
  deleteDisabledReason?: string | null;
}) {
  const isSimple = profile.type === "simple";
  const rawXdfDisplay = !isSimple ? describeRawXdfMetadata(profile.rawXdf) : null;

  return (
    <article className="profile-card">
      <div className="profile-card-header">
        <div className="profile-card-heading">
          <span className={`profile-type-badge profile-type-badge--${profile.type}`}>
            {isSimple ? "Simple" : "BTZS"}
          </span>
          <h3>{profile.name}</h3>
          <p className="profile-card-summary">{formatProfileSummary(profile)}</p>
          {editDisabledReason && <p className="profile-card-note">{editDisabledReason}</p>}
          {deleteDisabledReason && <p className="profile-card-note">{deleteDisabledReason}</p>}
        </div>
        <div className="profile-card-actions">
          {!editDisabledReason && (
            <button type="button" className="link-btn" onClick={onEdit}>
              Edit
            </button>
          )}
          <button type="button" className="btn-danger-ghost" onClick={onDelete} disabled={Boolean(deleteDisabledReason)}>
            Delete
          </button>
        </div>
      </div>

      <dl className="detail-grid profile-detail-grid">
        <DetailRow label="Developer" value={profile.developerName} />
        <DetailRow label="Dilution" value={profile.dilution} />
        <DetailRow label="Temperature" value={profile.temperatureText} />
        <DetailRow label="Agitation" value={profile.agitation} />
        {isSimple ? (
          <>
            <DetailRow label="Development time" value={profile.timeText} />
            <DetailRow label="N-2" value={`${profile.nMinusTwoPercent}%`} />
            <DetailRow label="N-1" value={`${profile.nMinusOnePercent}%`} />
            <DetailRow label="N+1" value={`${profile.nPlusOnePercent}%`} />
            <DetailRow label="N+2" value={`${profile.nPlusTwoPercent}%`} />
          </>
        ) : (
          <>
            <DetailRow label="Film ISO" value={profile.filmIso} />
            <DetailRow label="Test date" value={profile.testDate} />
            <DetailRow label="Curves text" value={profile.curvesText} />
            <DetailRow label="Flare density" value={profile.flareDensityText} />
            <DetailRow label="Paper ES" value={profile.paperEsText} />
            <DetailRow label="Method" value={profile.methodText} />
          </>
        )}
      </dl>

      {profile.notes && (
        <section className="profile-section">
          <h4>Notes</h4>
          <p className="profile-notes">{profile.notes}</p>
        </section>
      )}

      {!isSimple && (
        <>
          {rawXdfDisplay && (
            <section className="profile-section">
              <h4>Imported XDF metadata</h4>
              <dl className="detail-grid profile-detail-grid">
                <DetailRow label="Version / type" value={String(profile.rawXdf?.versionOrType ?? "—")} />
                <DetailRow label="Display name" value={profile.rawXdf?.displayName ?? "—"} />
                <DetailRow label="Process label" value={profile.rawXdf?.processLabel ?? "—"} />
                <DetailRow label="Paper ES" value={rawXdfDisplay.paperEs} />
                <DetailRow label="R code" value={rawXdfDisplay.reciprocityCode} />
                <DetailRow label="Use reciprocity" value={rawXdfDisplay.useReciprocity} />
              </dl>
            </section>
          )}

          <section className="profile-section">
            <h4>Key values</h4>
            {profile.keyValuesText ? (
              <pre className="profile-json-block">{profile.keyValuesText}</pre>
            ) : (
              <p className="profile-empty-state">No key values text yet.</p>
            )}
          </section>

          <section className="profile-section">
            <h4>Chart data</h4>
            {profile.chartData && profile.chartData.length > 0 ? (
              <div className="btzs-chart-pair">
                {profile.chartData.map((chart, index) => (
                  <ChartCard key={`${profile.id}-chart-${index}`} chart={chart} />
                ))}
              </div>
            ) : (
              <p className="profile-empty-state">No chart data yet.</p>
            )}
          </section>

          <section className="profile-section">
            <h4>Source files</h4>
            {profile.sourceFiles && profile.sourceFiles.length > 0 ? (
              <div className="profile-source-files">
                {profile.sourceFiles.map((sourceFile, index) => (
                  <SourceFileCard key={`${profile.id}-source-${index}`} sourceFile={sourceFile} index={index} />
                ))}
              </div>
            ) : (
              <p className="profile-empty-state">No source file metadata yet.</p>
            )}
          </section>
        </>
      )}
    </article>
  );
}

export function FilmStockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const location = useLocation();
  const navigate = useNavigate();
  const [filmStock, setFilmStock] = useState<FilmStock | null>(null);
  const [stockDraft, setStockDraft] = useState<FilmStockFormDraft>(() => createEmptyFilmStockDraft());
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockSaving, setStockSaving] = useState(false);
  const [filmStockCollection, setFilmStockCollection] = useState<FilmStock[]>([]);
  const [profiles, setProfiles] = useState<DevelopmentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<ProfileDraft>(() => emptyProfileDraft());
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportedBtzsXdfPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ProfileDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const importRunIdRef = useRef(0);
  const isBlackAndWhite = filmStock?.stock_type === "bw";
  const isOffline = connectivityState.transportStatus === "offline";

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    setError(null);
    setStockError(null);
    setStockSaving(false);
    setCreateDraft(emptyProfileDraft());
    setCreateError(null);
    setCreateSaving(false);
    setShowCreateForm(false);
    setShowImportForm(false);
    setImportPreview(null);
    setImportError(null);
    setImportParsing(false);
    setImportSaving(false);
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);

    Promise.all([
      api.getFilmStock(id),
      api.listDevelopmentProfiles(id),
      api.listFilmStocks().catch(async () => ({ items: await readCachedFilmStocks(user), total: 0 })),
    ])
      .then(([film, profileResponse, filmList]) => {
        setFilmStock(film);
        setStockDraft(filmStockDraftFromFilmStock(film));
        setFilmStockCollection(filmList.items);
        setProfiles(profileResponse.items);
      })
      .catch(async (err) => {
        const [cachedFilm, cachedProfiles, cachedFilmStocks] = await Promise.all([
          readCachedFilmStock(user, id),
          readCachedDevelopmentProfiles(user, id),
          readCachedFilmStocks(user),
        ]);
        if (cachedFilm) {
          setFilmStock(cachedFilm);
          setStockDraft(filmStockDraftFromFilmStock(cachedFilm));
          setFilmStockCollection(cachedFilmStocks);
          setProfiles(cachedProfiles);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load film stock");
      })
      .finally(() => setLoading(false));
  }, [id, user]);

  useEffect(() => {
    if (!id || !filmStock) return;

    const searchParams = new URLSearchParams(location.search);
    const wantsImport = searchParams.get("import") === "1";
    const wantsCreate = searchParams.get("profile") === "new" || location.pathname.endsWith("/development-profiles/new");
    importRunIdRef.current += 1;

    if (!wantsImport || !isBlackAndWhite) {
      setShowImportForm(false);
      setImportPreview(null);
      setImportError(null);
      setImportParsing(false);
      setImportSaving(false);
      if (wantsImport && !isBlackAndWhite) {
        navigate(FILM_STOCK_DETAIL_PATH(id), { replace: true });
      }
      return;
    }

    setShowCreateForm(false);
    setCreateDraft(emptyProfileDraft(isBlackAndWhite ? "simple" : "simple"));
    setCreateError(null);
    setCreateSaving(false);
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
    setImportError(null);
    setImportPreview(null);
    setImportParsing(false);
    setImportSaving(false);
    setShowImportForm(true);
    if (wantsCreate) {
      setShowCreateForm(false);
    }
  }, [filmStock, id, isBlackAndWhite, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!id || !filmStock) return;

    const searchParams = new URLSearchParams(location.search);
    const wantsCreate = searchParams.get("profile") === "new" || location.pathname.endsWith("/development-profiles/new");
    if (!wantsCreate) {
      setShowCreateForm(false);
      setCreateError(null);
      setCreateSaving(false);
      return;
    }

    cancelImport();
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
    setCreateDraft(emptyProfileDraft());
    setCreateError(null);
    setCreateSaving(false);
    setShowCreateForm(true);
  }, [filmStock, id, location.pathname, location.search]);

  if (!id) {
    return <Navigate to={FILM_STOCK_LIST_PATH} replace />;
  }

  const cancelImport = () => {
    if (!id) return;

    importRunIdRef.current += 1;
    setShowImportForm(false);
    setImportPreview(null);
    setImportError(null);
    setImportParsing(false);
    setImportSaving(false);
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("import") === "1") {
      navigate(FILM_STOCK_DETAIL_PATH(id), { replace: true });
    }
  };

  const startCreate = () => {
    if (!id) return;
    cancelImport();
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
    setCreateDraft(emptyProfileDraft());
    setCreateError(null);
    setCreateSaving(false);
    setShowCreateForm(true);
    navigate(FILM_STOCK_PROFILE_NEW_PATH(id), { replace: true });
  };

  const cancelCreate = () => {
    setShowCreateForm(false);
    setCreateDraft(emptyProfileDraft());
    setCreateError(null);
    setCreateSaving(false);
    if (id && new URLSearchParams(location.search).get("profile") === "new") {
      navigate(FILM_STOCK_DETAIL_PATH(id), { replace: true });
    }
  };

  const handleStockPresetChange = (presetKey: string) => {
    const preset = FILM_STOCK_PRESETS.find((item) => item.key === presetKey);
    setStockDraft((current) => applyFilmStockPreset(current, preset));
  };

  const handleStockSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    const validationError = validateFilmStockDraft(stockDraft);
    if (validationError) {
      setStockError(validationError);
      return;
    }

    setStockError(null);
    setStockSaving(true);
    try {
      const updated = await api.updateFilmStock(id, buildFilmStockPayload(stockDraft));
      setFilmStock(updated);
      setStockDraft(filmStockDraftFromFilmStock(updated));
      setFilmStockCollection((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setStockError(errorMessage(err, "Failed to save film stock"));
    } finally {
      setStockSaving(false);
    }
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    setCreateError(null);
    setCreateSaving(true);
    try {
      const created = await api.createDevelopmentProfile(id, buildCreatePayload(createDraft));
      setProfiles((current) => [created, ...current]);
      cancelCreate();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setCreateSaving(false);
    }
  };

  const startEdit = (profile: DevelopmentProfile) => {
    cancelImport();
    cancelCreate();
    setEditingId(profile.id);
    setEditError(null);
    setEditDraft(draftFromProfile(profile));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  };

  const handleImportFileSelected = async (file: File) => {
    if (!id) return;

    setImportError(null);
    setImportPreview(null);

    if (!/\.xdf$/i.test(file.name)) {
      setImportError("Please choose a .xdf file.");
      return;
    }

    const runId = importRunIdRef.current + 1;
    importRunIdRef.current = runId;
    setImportParsing(true);
    try {
      const parsed = parseBtzsXdf(new Uint8Array(await file.arrayBuffer()));
      if (importRunIdRef.current !== runId) return;
      setImportPreview(buildImportedBtzsXdfPreview(file, parsed));
    } catch (err) {
      if (importRunIdRef.current !== runId) return;
      setImportError(err instanceof Error ? err.message : "Failed to parse XDF file");
    } finally {
      if (importRunIdRef.current === runId) {
        setImportParsing(false);
      }
    }
  };

  const handleImportSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !importPreview) return;

    setImportError(null);
    setImportSaving(true);
    try {
      const created = await api.createDevelopmentProfile(id, buildImportedBtzsProfileCreate(importPreview));
      setProfiles((current) => [created, ...current]);
      cancelImport();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import XDF profile");
    } finally {
      setImportSaving(false);
    }
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !editingId || !editDraft) return;

    setEditError(null);
    setSaving(true);
    try {
      const updated = await api.updateDevelopmentProfile(id, editingId, buildUpdatePayload(editDraft));
      setProfiles((current) => current.map((profile) => (profile.id === updated.id ? updated : profile)));
      setEditingId(null);
      setEditDraft(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (profile: DevelopmentProfile) => {
    if (isOffline) {
      alert("Delete actions are disabled while offline.");
      return;
    }
    if (!confirm(`Delete ${profile.name}?`)) return;
    try {
      await api.deleteDevelopmentProfile(id, profile.id);
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      if (editingId === profile.id) {
        cancelEdit();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete profile");
    }
  };

  if (loading) {
    return (
      <div className="page page-wide film-stock-detail-page">
        <p className="muted">Loading film stock…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page page-wide film-stock-detail-page">
        <p className="form-error">{error}</p>
        <Link className="btn-secondary" to={FILM_STOCK_LIST_PATH}>Back to film stocks</Link>
      </div>
    );
  }

  if (!filmStock) {
    return null;
  }

  const reciprocityPFactor = filmStock.reciprocity_p_factor ?? 1;
  const collectionNav = getCollectionNavigationState(filmStockCollection, filmStock.id);
  const collectionPositionLabel = collectionNav.currentIndex != null
    ? `${collectionNav.currentIndex + 1} of ${collectionNav.total}`
    : null;

  return (
    <CollectionSwipeNavigator
      collectionLabel="film stock"
      positionLabel={collectionPositionLabel}
      previous={collectionNav.previous ? {
        to: FILM_STOCK_DETAIL_PATH(collectionNav.previous.item.id),
        label: collectionNav.previous.item.name,
      } : null}
      next={collectionNav.next ? {
        to: FILM_STOCK_DETAIL_PATH(collectionNav.next.item.id),
        label: collectionNav.next.item.name,
      } : null}
    >
    <div className="page page-wide film-stock-detail-page">
      <div className="page-header">
        <div>
          <p className="page-count">Film stock</p>
          <h1>{filmStock.name}</h1>
          <p className="page-count">
            {profiles.length} development profile{profiles.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn-secondary" to={FILM_STOCK_LIST_PATH}>Back to film stocks</Link>
        </div>
      </div>

      {showImportForm && (
        <DevelopmentProfileModal mode="import" title="Import BTZS / XDF profile" onClose={cancelImport}>
          <XdfImportPanel
            preview={importPreview}
            error={importError}
            parsing={importParsing}
            saving={importSaving}
            onClose={cancelImport}
            onFileSelected={handleImportFileSelected}
            onSubmit={handleImportSubmit}
          />
        </DevelopmentProfileModal>
      )}

      {showCreateForm && (
        <DevelopmentProfileModal mode="create" title="Add development profile" onClose={cancelCreate}>
          <ProfileEditorForm
            heading="Add development profile"
            draft={createDraft}
            allowTypeChange
            allowBtzs={isBlackAndWhite}
            availabilityNote={getFilmStockTypeAvailabilityText(filmStock.stock_type)}
            error={createError}
            saving={createSaving}
            submitLabel="Create profile"
            onChange={setCreateDraft}
            onCancel={cancelCreate}
            onSubmit={handleCreateSubmit}
          />
        </DevelopmentProfileModal>
      )}

      {editingId && editDraft && (
        <DevelopmentProfileModal mode="edit" title={`Edit ${editDraft.name || "development profile"}`} onClose={cancelEdit}>
          <ProfileEditorForm
            heading={`Edit ${editDraft.name || "development profile"}`}
            draft={editDraft}
            allowTypeChange={false}
            error={editError}
            saving={saving}
            submitLabel="Save changes"
            onChange={(next) => setEditDraft(next)}
            onCancel={cancelEdit}
            onSubmit={handleEditSubmit}
          />
        </DevelopmentProfileModal>
      )}

      <section className="film-stock-editor-card">
        <div className="film-stock-editor-card-header">
          <div>
            <h2>Edit stock</h2>
            <p className="page-count">Film identity, reciprocity, and spectral response settings.</p>
          </div>
          <dl className="detail-grid film-stock-editor-summary">
            <DetailRow label="Created" value={new Date(filmStock.created_at).toLocaleString()} />
            <DetailRow label="Film stock ID" value={filmStock.id} />
            <DetailRow label="Current P factor" value={String(reciprocityPFactor)} />
            <DetailRow
              label="Current spectral simulation"
              value={filmStock.simulate_spectral_response
                ? formatFilmSpectralResponseLabel(filmStock.spectral_response_preset)
                : "Off"}
            />
          </dl>
        </div>
        <form className="resource-form resource-form--compact film-stock-inline-form" onSubmit={handleStockSubmit} noValidate>
          {stockError && <p className="form-error">{stockError}</p>}
          <FilmStockFormFields
            draft={stockDraft}
            onChange={setStockDraft}
            presets={FILM_STOCK_PRESETS}
            onPresetChange={handleStockPresetChange}
          />
          <div className="form-actions resource-form-actions">
            <button className="btn-primary" type="submit" disabled={stockSaving || isOffline}>
              {stockSaving ? "Saving…" : "Save stock"}
            </button>
            {isOffline && <p className="field-note form-action-note">Editing film stocks is disabled while offline.</p>}
          </div>
        </form>
      </section>

      <dl className="detail-grid film-stock-detail-summary">
        <DetailRow
          label="Stock type"
          value={
            <span className={`film-stock-type-badge film-stock-type-badge--${filmStock.stock_type}`}>
              {formatFilmStockTypeLabel(filmStock.stock_type)}
            </span>
          }
        />
        <DetailRow label="ISO" value={filmStock.iso != null ? `ISO ${filmStock.iso}` : null} />
        <DetailRow label="Process" value={filmStock.process} />
      </dl>

      <p className="muted">Development profiles and imported BTZS data stay attached to this stock.</p>

      <section className="profiles-section">
        <div className="profiles-section-header">
          <div>
            <h2>Development profiles</h2>
            <p className="page-count">
              Simple profiles keep a time value. BTZS profiles can carry chart data, source metadata, and imported
              XDF details.
            </p>
          </div>
          <div className="profiles-section-actions">
            <div className="page-header-actions">
              {showImportForm ? (
                <button className="btn-secondary" onClick={cancelImport}>
                  Close import
                </button>
              ) : isBlackAndWhite ? (
                <button className="btn-secondary" type="button" onClick={() => navigate(FILM_STOCK_IMPORT_PATH(filmStock.id), { replace: true })}>
                  Import BTZS / XDF profile
                </button>
              ) : (
                <button className="btn-secondary" type="button" disabled>
                  Import BTZS / XDF profile
                </button>
              )}
              <button className="btn-primary" type="button" onClick={startCreate}>
                Add profile
              </button>
            </div>
            {!isBlackAndWhite && !showImportForm && (
              <p className="film-stock-availability-note">
                {getFilmStockTypeAvailabilityText(filmStock.stock_type)}
              </p>
            )}
          </div>
        </div>

        {profiles.length === 0 && (
          <p className="muted">No development profiles yet. Import a BTZS / XDF profile or add a simple profile to get started.</p>
        )}

        <div className="profile-stack">
          {profiles.map((profile) => (
            <ProfileViewCard
              key={profile.id}
              profile={profile}
              editDisabledReason={!isBlackAndWhite && profile.type === "btzs" ? FILM_STOCK_BTZS_ONLY_REASON : null}
              deleteDisabledReason={isOffline ? "Delete actions are disabled while offline." : null}
              onEdit={() => startEdit(profile)}
              onDelete={() => handleDelete(profile)}
            />
          ))}
        </div>
      </section>
    </div>
    </CollectionSwipeNavigator>
  );
}

export function FilmStockDevelopmentProfileCreatePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filmStock, setFilmStock] = useState<FilmStock | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(() => emptyProfileDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const backTo = id ? FILM_STOCK_DETAIL_PATH(id) : FILM_STOCK_LIST_PATH;
  const isBlackAndWhite = filmStock?.stock_type === "bw";
  const availabilityNote = filmStock ? getFilmStockTypeAvailabilityText(filmStock.stock_type) : null;

  useEffect(() => {
    if (!id) return;

    let active = true;
    setLoading(true);
    setLoadError(null);

    api.getFilmStock(id)
      .then((response) => {
        if (!active) return;
        setFilmStock(response);
      })
      .catch(async (err) => {
        if (!active) return;
        const cachedFilm = await readCachedFilmStock(user, id);
        if (!active) return;
        if (cachedFilm) {
          setFilmStock(cachedFilm);
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Film stock not found.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id, user]);

  useEffect(() => {
    if (filmStock?.stock_type === "bw") return;
    setDraft((current) => (current.type === "btzs" ? { ...current, type: "simple" } : current));
  }, [filmStock]);

  if (!id) {
    return <Navigate to={FILM_STOCK_LIST_PATH} replace />;
  }

  if (loading) {
    return (
      <div className="page page-wide film-stock-detail-page">
        <p className="muted">Loading film stock…</p>
      </div>
    );
  }

  if (loadError || !filmStock) {
    return (
      <div className="page page-wide film-stock-detail-page">
        <p className="form-error">{loadError ?? "Film stock not found."}</p>
        <Link className="btn-secondary" to={backTo} replace>
          Back to stock
        </Link>
      </div>
    );
  }

  const handleCancel = () => {
    navigate(backTo, { replace: true });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError(null);
    setSaving(true);
    try {
      await api.createDevelopmentProfile(id, buildCreatePayload(draft));
      navigate(backTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page page-wide film-stock-detail-page">
      <div className="page-header">
        <div>
          <p className="page-count">Film stock</p>
          <h1>Add development profile</h1>
          <p className="page-count">
            {isBlackAndWhite
              ? "Create a simple or BTZS profile for this film stock."
              : "Create a simple profile for this film stock. BTZS profiles are only available for black and white stocks."}
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn-secondary" to={backTo} replace>
            Back to stock
          </Link>
        </div>
      </div>

      <ProfileEditorForm
        heading="Add development profile"
        draft={draft}
        allowTypeChange
        allowBtzs={isBlackAndWhite}
        availabilityNote={availabilityNote}
        error={error}
        saving={saving}
        submitLabel="Create profile"
        onChange={setDraft}
        onCancel={handleCancel}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
