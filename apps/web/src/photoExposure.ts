// Converts photo exposure form drafts and stored API details into payloads and summaries.
// Pure EV, BTZS, reciprocity, and bellows math lives in photoExposureMath.ts.
import type {
  ExposureEntryMode,
  DevelopmentProfile,
  BTZSDevelopmentProfile,
  Filter,
  FilmStock,
  Lens,
  Photograph,
  PhotographBtzsZoneMeteringCalculation,
  PhotographExposureDetails,
  PhotographWritePayload,
  PhotographZoneMeteringCalculation,
  PhotographShutterMode,
} from "./api/client";
import {
  SHUTTER_BULB_VALUE,
  formatApertureValueDisplay,
  formatShutterSpeedValue,
  parseApertureValueInput,
  parseShutterSpeedInput,
  snapApertureChoice,
  snapShutterChoice,
  type ShutterInput,
  type SnappedApertureChoice,
  type SnappedShutterChoice,
} from "./optics";
import {
  calculateBellowsCorrectionStops,
  calculateBtzsExposure,
  calculateSimpleZoneSystemExposure,
  calculateZoneMeteringExposure,
  findBtzsLookupSeries,
  getFilterStops,
  interpolateBtzsSeriesValue,
  type BellowsCorrectionMode,
  type ExposurePrecedence,
  type ZoneMeteringCalculationResult,
} from "./photoExposureMath";
export { calculateBellowsCorrectionStops, calculateSimpleZoneSystemExposure };
export type { BellowsCorrectionMode };
import { isBlackAndWhiteFilmStock } from "./film-stocks";
import { resolveBtzsProfilePaperEs } from "./btzs/xdf";
export { resolveBtzsProfilePaperEs };
import {
  formatDevelopmentTimeClock,
  formatExposureEfs,
  formatExposureEv,
  formatExposureG,
  formatExposureSbr,
  formatIdealApertureValue,
  formatIdealShutterSeconds,
} from "./photoExposureMath";

const BULB_DURATION_PRECISION = 3;
const BULB_TIMER_PRECOUNT_SECONDS = 3;
const RECIPROCITY_WARNING_THRESHOLD_SECONDS = 0.5;

export type BulbTimerPhase = "idle" | "precount" | "exposing" | "complete";

export interface PhotographExposureDraft {
  shutter_speed: string;
  bulb_duration_seconds: string;
}

export interface BulbTimerSnapshot {
  phase: BulbTimerPhase;
  durationSeconds: number | null;
  precountRemaining: number | null;
  exposureRemainingSeconds: number | null;
}

export interface BulbTimerStatus {
  title: string;
  detail: string;
}

export interface PhotographExposurePayloadResult {
  payload: PhotographWritePayload;
  error: string | null;
}

export interface PhotographZoneMeteringDraft {
  meter_ev: string;
  cell_camera_ev: string;
  cell_camera_correction_stops: string;
  meter_iso: string;
  working_iso: string;
  target_zone: string;
  compensation_stops: string;
  bellows_correction_mode: BellowsCorrectionMode;
  bellows_extension_mm: string;
  bellows_subject_distance_m: string;
  precedence: ExposurePrecedence;
  reading_through_selected_filters: boolean;
}

interface SingleSpotProfileDevelopmentResult {
  profile: DevelopmentProfile | null;
  sbr: number;
  requiredG: number;
  workingIso: number;
  developmentTimeMinutes: number | null;
  developmentTimeSource: string | null;
  developmentPercent: number | null;
  baseDevelopmentMinutes: number | null;
  warnings: string[];
  error: string | null;
}

export interface PhotographBtzsZoneMeteringDraft {
  profile_id: string;
  meter_ev: string;
  meter_iso: string;
  working_iso: string;
  low_ev: string;
  high_ev: string;
  low_zone: string;
  high_zone: string;
  paper_es: string;
  flare_factor: string;
  compensation_stops: string;
  bellows_correction_mode: BellowsCorrectionMode;
  bellows_extension_mm: string;
  bellows_subject_distance_m: string;
  precedence: ExposurePrecedence;
  reading_through_selected_filters: boolean;
}

export interface PhotographExposureModeDraft {
  exposure_entry_mode: ExposureEntryMode;
  zone_metering: PhotographZoneMeteringDraft;
  btzs_zone_metering: PhotographBtzsZoneMeteringDraft;
}

export interface PhotographExposureEditorState extends PhotographExposureDraft, PhotographExposureModeDraft {
  aperture: string;
  focal_length_mm?: string;
}

export interface BuildPhotographExposureWritePayloadInput {
  exposure_entry_mode: ExposureEntryMode;
  aperture: string;
  shutter_speed: string;
  bulb_duration_seconds: string;
  focal_length_mm?: string;
  filter_ids: string[];
  filters: Array<Pick<Filter, "filter_factor">>;
  film_stock: Pick<FilmStock, "stock_type" | "reciprocity_p_factor" | "iso"> | null;
  lens: Pick<Lens, "min_f_stop" | "max_f_stop" | "aperture_increment" | "flare_factor"> | null;
  shutter_source: ShutterInput | null;
  zone_metering: PhotographZoneMeteringDraft;
  btzs_zone_metering: PhotographBtzsZoneMeteringDraft;
  btzs_profiles: DevelopmentProfile[];
}

export interface BuildPhotographExposureWritePayloadSource {
  exposure_entry_mode: ExposureEntryMode;
  aperture: string;
  shutter_speed: string;
  bulb_duration_seconds: string;
  focal_length_mm: string;
  filter_ids: string[];
  zone_metering: PhotographZoneMeteringDraft;
  btzs_zone_metering: PhotographBtzsZoneMeteringDraft;
  shutter_source: ShutterInput | null;
}

export function createPhotographExposureWritePayloadInput(
  source: BuildPhotographExposureWritePayloadSource,
  options: Pick<BuildPhotographExposureWritePayloadInput, "filters" | "film_stock" | "lens" | "btzs_profiles">,
): BuildPhotographExposureWritePayloadInput {
  return {
    ...source,
    ...options,
  };
}

export interface BuildPhotographExposureWritePayloadResult {
  payload: Partial<Pick<
    PhotographWritePayload,
    | "aperture"
    | "shutter_speed"
    | "shutter_speed_seconds"
    | "shutter_mode"
    | "bulb_duration_seconds"
    | "exposure_entry_mode"
    | "exposure_details"
  >>;
  error: string | null;
  warnings: string[];
}

export interface PhotographExposureSummaryRow {
  label: string;
  value: string;
}

export interface PhotographExposureSummary {
  rows: PhotographExposureSummaryRow[];
  warnings: string[];
}

const BTZS_ZONE_SYSTEM_MAX = 10;
const BTZS_ZONE_SYSTEM_STEP = 0.5;
const BTZS_ZONE_ROMANS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
];

export interface BtzsZoneChoice {
  value: string;
  label: string;
  tone: number;
}

export interface BtzsProfileSelection {
  profiles: DevelopmentProfile[];
  selectedProfile: DevelopmentProfile | null;
  selectedProfileId: string;
  mode: "none" | "single" | "multiple";
}

export interface ExposureChoiceDisplay {
  idealAperture: string;
  idealShutter: string;
  rawShutterSeconds: number | null;
  finalShutterSeconds: number | null;
  reciprocityApplied: boolean;
  apertureChoice: SnappedApertureChoice | null;
  shutterChoice: SnappedShutterChoice | null;
  warnings: string[];
  finalFields: {
    aperture: string | null;
    shutter_speed: string | null;
    shutter_speed_seconds: number | null;
    shutter_mode: "fixed" | "bulb";
    bulb_duration_seconds: number | null;
  } | null;
}

export interface MeteredExposurePreviewCard {
  label: string;
  value: string;
  tone?: "accent";
}

export interface MeteredExposurePreview {
  cards: MeteredExposurePreviewCard[];
  warnings: string[];
}

type ReciprocityShutterComparisonSource = {
  rawShutterSeconds?: number | null;
  rawShutterSpeedSeconds?: number | null;
  finalShutterSeconds?: number | null;
  finalShutterSpeedSeconds?: number | null;
  reciprocityApplied?: boolean | null;
};

function formatZoneValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number.parseFloat(value.toFixed(1)));
}

export function formatExposureStopError(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || Math.abs(value) <= 1e-6) {
    return null;
  }

  const abs = Math.abs(value);
  const precision = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
  const rounded = Number.parseFloat(abs.toFixed(precision));
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${rounded.toString()} stop${rounded === 1 ? "" : "s"}`;
}

export function buildMeteredExposurePreview(
  precedence: ExposurePrecedence,
  display: ExposureChoiceDisplay | null | undefined,
  heldValue: string,
): MeteredExposurePreview | null {
  if (!display) return null;

  const normalizedHeldValue = heldValue.trim() || "—";
  const reciprocityComparison = getReciprocityShutterComparison(display);
  if (precedence === "shutter") {
    const cards: MeteredExposurePreviewCard[] = [
      { label: "Held shutter", value: normalizedHeldValue },
      ...(reciprocityComparison
        ? [
            { label: "Metered shutter", value: reciprocityComparison.metered },
            { label: "With reciprocity", value: reciprocityComparison.corrected },
          ]
        : []),
      { label: "Ideal aperture", value: display.idealAperture, tone: "accent" as const },
      { label: "Closest supported aperture", value: display.apertureChoice?.label ?? "—" },
      { label: "Exposure error", value: formatExposureStopError(display.apertureChoice?.stopError ?? null) ?? "—" },
    ];

    return {
      cards,
      warnings: display.warnings,
    };
  }

  const cards: MeteredExposurePreviewCard[] = [
    { label: "Held aperture", value: normalizedHeldValue },
    ...(reciprocityComparison
      ? [
          { label: "Metered shutter", value: reciprocityComparison.metered },
          { label: "With reciprocity", value: reciprocityComparison.corrected, tone: "accent" as const },
        ]
      : [
          { label: "Ideal shutter", value: display.idealShutter, tone: "accent" as const },
        ]),
    { label: "Closest supported shutter", value: display.shutterChoice?.label ?? "—" },
    { label: "Exposure error", value: formatExposureStopError(display.shutterChoice?.stopError ?? null) ?? "—" },
  ];

  return {
    cards,
    warnings: display.warnings,
  };
}

export function getBtzsZoneChoiceOptions(selectedZone?: string | number | null): BtzsZoneChoice[] {
  const choices: BtzsZoneChoice[] = [];
  for (let step = 0; step <= BTZS_ZONE_SYSTEM_MAX * 2; step += 1) {
    const value = Number.parseFloat((step * BTZS_ZONE_SYSTEM_STEP).toFixed(1));
    choices.push({
      value: String(value),
      label: `Zone ${formatZoneValue(value)}`,
      tone: value / BTZS_ZONE_SYSTEM_MAX,
    });
  }

  const normalized = typeof selectedZone === "number"
    ? String(Number.parseFloat(selectedZone.toFixed(1)))
    : typeof selectedZone === "string"
      ? selectedZone.trim()
      : "";

  if (normalized && !choices.some((choice) => choice.value === normalized)) {
    const parsed = Number.parseFloat(normalized);
    choices.push({
      value: normalized,
      label: Number.isFinite(parsed) ? `Zone ${formatZoneValue(parsed)}` : `Zone ${normalized}`,
      tone: Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed / BTZS_ZONE_SYSTEM_MAX)) : 0.5,
    });
  }

  return choices;
}

export function resolveBtzsProfileSelection(
  profiles: readonly DevelopmentProfile[] | null | undefined,
  currentProfileId?: string | null,
): BtzsProfileSelection {
  const availableProfiles = [...(profiles ?? [])].sort((left, right) => {
    if (left.type !== right.type) return left.type === "btzs" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });

  if (availableProfiles.length === 0) {
    return {
      profiles: [],
      selectedProfile: null,
      selectedProfileId: "",
      mode: "none",
    };
  }

  if (availableProfiles.length === 1) {
    return {
      profiles: availableProfiles,
      selectedProfile: availableProfiles[0] ?? null,
      selectedProfileId: availableProfiles[0]?.id ?? "",
      mode: "single",
    };
  }

  const selectedProfile = availableProfiles.find((profile) => profile.id === currentProfileId) ?? null;
  return {
    profiles: availableProfiles,
    selectedProfile,
    selectedProfileId: selectedProfile?.id ?? "",
    mode: "multiple",
  };
}

export function resolveExposureChoiceDisplay(
  exposure: Pick<ZoneMeteringCalculationResult, "aperture" | "rawShutterSeconds" | "finalShutterSeconds" | "reciprocityApplied" | "warnings"> | null | undefined,
  lens: Pick<Lens, "min_f_stop" | "max_f_stop" | "aperture_increment"> | null | undefined,
  shutterSource: ShutterInput | null | undefined,
): ExposureChoiceDisplay | null {
  if (!exposure) return null;

  const apertureChoice = exposure.aperture != null
    ? snapApertureChoice(exposure.aperture, lens ?? undefined)
    : null;
  const shutterChoice = exposure.finalShutterSeconds != null
    ? snapShutterChoice(exposure.finalShutterSeconds, shutterSource ?? undefined)
    : null;

  const warnings = [
    ...(exposure.warnings ?? []),
    apertureChoice?.warning,
    shutterChoice?.warning,
  ].filter((warning): warning is string => typeof warning === "string" && warning.length > 0 && !warning.startsWith("Rounded "));

  const apertureSeconds = shutterChoice?.seconds;
  const finalShutterSeconds = shutterChoice?.value === SHUTTER_BULB_VALUE
    ? exposure.finalShutterSeconds ?? null
    : apertureSeconds ?? null;

  return {
    idealAperture: formatIdealApertureValue(exposure.aperture),
    idealShutter: formatIdealShutterSeconds(exposure.finalShutterSeconds),
    rawShutterSeconds: exposure.rawShutterSeconds ?? null,
    finalShutterSeconds: exposure.finalShutterSeconds ?? null,
    reciprocityApplied: Boolean(exposure.reciprocityApplied),
    apertureChoice,
    shutterChoice,
    warnings,
    finalFields: apertureChoice != null && shutterChoice != null
      ? {
          aperture: formatApertureValueDisplay(apertureChoice.aperture),
          shutter_speed: shutterChoice.value,
          shutter_speed_seconds: finalShutterSeconds,
          shutter_mode: shutterChoice.value === SHUTTER_BULB_VALUE ? "bulb" : "fixed",
          bulb_duration_seconds: shutterChoice.value === SHUTTER_BULB_VALUE ? (exposure.finalShutterSeconds ?? null) : null,
        }
      : null,
  };
}

const normalizeSecondsText = (seconds: number) => {
  const rounded = Number.parseFloat(seconds.toFixed(BULB_DURATION_PRECISION));
  return Number.isFinite(rounded) ? rounded.toString() : "";
};

const formatCountdownSeconds = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0";
  return Math.max(0, seconds).toFixed(BULB_DURATION_PRECISION);
};

export function createEmptyPhotographExposureDraft(): PhotographExposureDraft {
  return {
    shutter_speed: "",
    bulb_duration_seconds: "",
  };
}

const DEFAULT_METER_ISO = 100;
const DEFAULT_ZONE_TARGET = 5;
const DEFAULT_BTZS_LOW_ZONE = 3;
const DEFAULT_BTZS_HIGH_ZONE = 7;
const DEFAULT_BTZS_PAPER_ES = "1.0";
const DEFAULT_BTZS_FLARE_FACTOR = "0.02";
const DEFAULT_PRECEDENCE: ExposurePrecedence = "aperture";
const DEFAULT_BELLOWS_CORRECTION_MODE: BellowsCorrectionMode = "none";

function formatDraftNumber(value: number | string | null | undefined, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? trimmed : fallback;
}

function formatDraftText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function formatDraftBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function formatDraftPrecedence(value: unknown): ExposurePrecedence {
  return value === "shutter" ? "shutter" : DEFAULT_PRECEDENCE;
}

function formatDraftBellowsCorrectionMode(value: unknown): BellowsCorrectionMode {
  return value === "measurement" || value === "distance" ? value : DEFAULT_BELLOWS_CORRECTION_MODE;
}

function formatDraftScalar(value: unknown): string | number | null | undefined {
  return typeof value === "string" || typeof value === "number" || value == null ? value : undefined;
}

function resolveBellowsCorrectionDraftValue(
  draft: PhotographZoneMeteringDraft | PhotographBtzsZoneMeteringDraft,
): string {
  return draft.bellows_correction_mode === "measurement"
    ? draft.bellows_extension_mm
    : draft.bellows_subject_distance_m;
}

function resolveBellowsCorrectionForDraft(
  draft: PhotographZoneMeteringDraft | PhotographBtzsZoneMeteringDraft,
  focalLengthMm: string,
) {
  return calculateBellowsCorrectionStops(
    draft.bellows_correction_mode,
    focalLengthMm,
    resolveBellowsCorrectionDraftValue(draft),
  );
}

function parseStoredExposureDetailsRecord(
  photo: Pick<Photograph, "exposure_entry_mode" | "exposure_details">,
): Record<string, unknown> | null {
  if (photo.exposure_entry_mode === "manual" || photo.exposure_details == null) {
    return null;
  }

  if ("zoneMetering" in photo.exposure_details) {
    return photo.exposure_details.zoneMetering as Record<string, unknown>;
  }

  if ("btzsZoneMetering" in photo.exposure_details) {
    return photo.exposure_details.btzsZoneMetering as Record<string, unknown>;
  }

  return null;
}

export function createEmptyPhotographZoneMeteringDraft(): PhotographZoneMeteringDraft {
  return {
    meter_ev: "",
    cell_camera_ev: "",
    cell_camera_correction_stops: "0",
    meter_iso: String(DEFAULT_METER_ISO),
    working_iso: String(DEFAULT_METER_ISO),
    target_zone: String(DEFAULT_ZONE_TARGET),
    compensation_stops: "0",
    bellows_correction_mode: DEFAULT_BELLOWS_CORRECTION_MODE,
    bellows_extension_mm: "",
    bellows_subject_distance_m: "",
    precedence: DEFAULT_PRECEDENCE,
    reading_through_selected_filters: false,
  };
}

export function createEmptyPhotographBtzsZoneMeteringDraft(): PhotographBtzsZoneMeteringDraft {
  return {
    profile_id: "",
    meter_ev: "",
    meter_iso: String(DEFAULT_METER_ISO),
    working_iso: String(DEFAULT_METER_ISO),
    low_ev: "",
    high_ev: "",
    low_zone: String(DEFAULT_BTZS_LOW_ZONE),
    high_zone: String(DEFAULT_BTZS_HIGH_ZONE),
    paper_es: DEFAULT_BTZS_PAPER_ES,
    flare_factor: DEFAULT_BTZS_FLARE_FACTOR,
    compensation_stops: "0",
    bellows_correction_mode: DEFAULT_BELLOWS_CORRECTION_MODE,
    bellows_extension_mm: "",
    bellows_subject_distance_m: "",
    precedence: DEFAULT_PRECEDENCE,
    reading_through_selected_filters: false,
  };
}

export function createEmptyPhotographExposureModeDraft(): PhotographExposureModeDraft {
  return {
    exposure_entry_mode: "manual",
    zone_metering: createEmptyPhotographZoneMeteringDraft(),
    btzs_zone_metering: createEmptyPhotographBtzsZoneMeteringDraft(),
  };
}

export interface ExposureModeAvailabilityItem {
  enabled: boolean;
  message: string | null;
}

export interface ExposureModeAvailability {
  zoneMetering: ExposureModeAvailabilityItem;
  btzsZoneMetering: ExposureModeAvailabilityItem;
}

export interface PhotographExposureModeAvailability {
  zoneMeteringEnabled: boolean;
  zoneMeteringReason: string | null;
  btzsZoneMeteringEnabled: boolean;
  btzsZoneMeteringReason: string | null;
}

export function getExposureModeAvailability(
  filmStock: Pick<FilmStock, "stock_type"> | null | undefined,
  btzsProfileCount = 0,
): ExposureModeAvailability {
  const zoneMeteringEnabled = isBlackAndWhiteFilmStock(filmStock);
  const btzsZoneMeteringEnabled = zoneMeteringEnabled && btzsProfileCount > 0;

  return {
    zoneMetering: {
      enabled: zoneMeteringEnabled,
      message: zoneMeteringEnabled ? null : "Single Spot is available for B&W negative film.",
    },
    btzsZoneMetering: {
      enabled: btzsZoneMeteringEnabled,
      message: btzsZoneMeteringEnabled ? null : "Zone Metering requires a development profile for this film.",
    },
  };
}

export function getExposureWorkingIsoDefault(
  filmStock: Pick<FilmStock, "iso"> | null | undefined,
): string {
  return filmStock?.iso != null && filmStock.iso > 0
    ? String(filmStock.iso)
    : String(DEFAULT_METER_ISO);
}

export function getPhotographExposureModeAvailability(
  filmStock: Pick<FilmStock, "stock_type"> | null | undefined,
  btzsProfiles: readonly DevelopmentProfile[] | null | undefined,
): PhotographExposureModeAvailability {
  const availability = getExposureModeAvailability(
    filmStock,
    (btzsProfiles ?? []).length,
  );

  return {
    zoneMeteringEnabled: availability.zoneMetering.enabled,
    zoneMeteringReason: availability.zoneMetering.message,
    btzsZoneMeteringEnabled: availability.btzsZoneMetering.enabled,
    btzsZoneMeteringReason: availability.btzsZoneMetering.message,
  };
}

export function inferPhotographExposureFilmStock(
  films: readonly FilmStock[],
  source: {
    rollFilmId?: string | null;
    filmHolderFilmId?: string | null;
    filmId?: string | null;
  },
): FilmStock | null {
  const selectedFilmId = source.rollFilmId ?? source.filmHolderFilmId ?? source.filmId ?? null;
  if (!selectedFilmId) return null;
  return films.find((film) => film.id === selectedFilmId) ?? null;
}

export function getPhotographExposureModeDraft(
  photo: Pick<Photograph, "exposure_entry_mode" | "exposure_details">,
  filmStock?: Pick<FilmStock, "iso"> | null,
): PhotographExposureModeDraft {
  const draft = createEmptyPhotographExposureModeDraft();
  const details = parseStoredExposureDetailsRecord(photo);
  const workingIsoFallback = filmStock?.iso ?? DEFAULT_METER_ISO;

  if (photo.exposure_entry_mode === "zone-metering" && details && "meterEV" in details) {
    const zoneDetails = details as Partial<PhotographZoneMeteringCalculation> & {
      compensationStops?: number | string | null;
      readingThroughSelectedFilters?: boolean | null;
      precedence?: ExposurePrecedence | null;
      bellowsCorrection?: {
        mode?: unknown;
        extensionMm?: unknown;
        subjectDistanceM?: unknown;
      } | null;
    };
    return {
      exposure_entry_mode: "zone-metering",
      zone_metering: {
        meter_ev: formatDraftNumber(zoneDetails.meterEV),
        cell_camera_ev: formatDraftNumber(zoneDetails.cellCameraEV),
        cell_camera_correction_stops: formatDraftNumber(zoneDetails.cellCameraCorrectionStops, "0"),
        meter_iso: formatDraftNumber(zoneDetails.meterISO, String(DEFAULT_METER_ISO)),
        working_iso: formatDraftNumber(zoneDetails.workingISO, String(workingIsoFallback)),
        target_zone: formatDraftNumber(zoneDetails.targetZone, String(DEFAULT_ZONE_TARGET)),
        compensation_stops: formatDraftNumber(zoneDetails.compensationStops ?? zoneDetails.totalCompensationStops, "0"),
        bellows_correction_mode: formatDraftBellowsCorrectionMode(zoneDetails.bellowsCorrection?.mode),
        bellows_extension_mm: formatDraftNumber(formatDraftScalar(zoneDetails.bellowsCorrection?.extensionMm)),
        bellows_subject_distance_m: formatDraftNumber(formatDraftScalar(zoneDetails.bellowsCorrection?.subjectDistanceM)),
        precedence: formatDraftPrecedence(zoneDetails.precedence),
        reading_through_selected_filters: formatDraftBoolean(zoneDetails.readingThroughSelectedFilters),
      },
      btzs_zone_metering: draft.btzs_zone_metering,
    };
  }

  if (photo.exposure_entry_mode === "btzs-zone-metering" && details && "profileId" in details) {
    const btzsDetails = details as Partial<PhotographBtzsZoneMeteringCalculation> & {
      compensationStops?: number | string | null;
      readingThroughSelectedFilters?: boolean | null;
      precedence?: ExposurePrecedence | null;
      bellowsCorrection?: {
        mode?: unknown;
        extensionMm?: unknown;
        subjectDistanceM?: unknown;
      } | null;
    };
    return {
      exposure_entry_mode: "btzs-zone-metering",
      zone_metering: draft.zone_metering,
      btzs_zone_metering: {
        profile_id: formatDraftText(formatDraftScalar(btzsDetails.profileId)),
        meter_ev: formatDraftNumber(formatDraftScalar(btzsDetails.meterEV)),
        meter_iso: formatDraftNumber(formatDraftScalar(btzsDetails.meterISO), String(DEFAULT_METER_ISO)),
        working_iso: formatDraftNumber(formatDraftScalar(btzsDetails.workingISO), String(workingIsoFallback)),
        low_ev: formatDraftNumber(formatDraftScalar(btzsDetails.lowEV)),
        high_ev: formatDraftNumber(formatDraftScalar(btzsDetails.highEV)),
        low_zone: formatDraftNumber(formatDraftScalar(btzsDetails.lowZone), String(DEFAULT_BTZS_LOW_ZONE)),
        high_zone: formatDraftNumber(formatDraftScalar(btzsDetails.highZone), String(DEFAULT_BTZS_HIGH_ZONE)),
        paper_es: formatDraftNumber(formatDraftScalar(btzsDetails.paperEs), DEFAULT_BTZS_PAPER_ES),
        flare_factor: formatDraftNumber(formatDraftScalar(btzsDetails.flareFactor), DEFAULT_BTZS_FLARE_FACTOR),
        compensation_stops: formatDraftNumber(
          formatDraftScalar(btzsDetails.compensationStops ?? btzsDetails.totalCompensationStops),
          "0",
        ),
        bellows_correction_mode: formatDraftBellowsCorrectionMode(btzsDetails.bellowsCorrection?.mode),
        bellows_extension_mm: formatDraftNumber(formatDraftScalar(btzsDetails.bellowsCorrection?.extensionMm)),
        bellows_subject_distance_m: formatDraftNumber(formatDraftScalar(btzsDetails.bellowsCorrection?.subjectDistanceM)),
        precedence: formatDraftPrecedence(btzsDetails.precedence),
        reading_through_selected_filters: formatDraftBoolean(btzsDetails.readingThroughSelectedFilters),
      },
    };
  }

  return draft;
}

function getShutterModeFromSeconds(seconds: number | null | undefined): PhotographShutterMode {
  if (seconds != null && Number.isFinite(seconds) && seconds > 1) {
    return "bulb";
  }
  return "fixed";
}

function formatShutterSpeedPayloadValue(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return seconds > 1 ? SHUTTER_BULB_VALUE : formatShutterSpeedValue(seconds);
}

function createEmptyExposureWritePayload(): Pick<
  PhotographWritePayload,
  "aperture"
  | "shutter_speed"
  | "shutter_speed_seconds"
  | "shutter_mode"
  | "bulb_duration_seconds"
  | "exposure_entry_mode"
  | "exposure_details"
> {
  return {
    aperture: null,
    shutter_speed: null,
    shutter_speed_seconds: null,
    shutter_mode: "fixed",
    bulb_duration_seconds: null,
    exposure_entry_mode: "manual",
    exposure_details: null,
  };
}

function parseDraftNumericValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDevelopmentTimeTextMinutes(value: string | null | undefined): number | null {
  const text = value?.trim().toLowerCase() ?? "";
  if (!text) return null;

  const clockMatch = text.match(/^(\d+(?:\.\d+)?):([0-5]?\d)(?::([0-5]?\d))?$/u);
  if (clockMatch) {
    const first = Number(clockMatch[1]);
    const second = Number(clockMatch[2]);
    const third = clockMatch[3] != null ? Number(clockMatch[3]) : null;
    if (Number.isFinite(first) && Number.isFinite(second) && (third == null || Number.isFinite(third))) {
      return third == null
        ? first + (second / 60)
        : (first * 60) + second + (third / 60);
    }
  }

  let totalMinutes = 0;
  let matched = false;
  const tokenPattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m(?!s)|seconds?|secs?|s)\b/gu;
  for (const match of text.matchAll(tokenPattern)) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    const unit = match[2] ?? "";
    matched = true;
    if (unit.startsWith("h")) totalMinutes += amount * 60;
    else if (unit.startsWith("s")) totalMinutes += amount / 60;
    else totalMinutes += amount;
  }
  if (matched && totalMinutes > 0) return totalMinutes;

  const bare = Number(text);
  return Number.isFinite(bare) && bare > 0 ? bare : null;
}

const STANDARD_SINGLE_SPOT_SBR = 7;

function calculateRequiredGForSbr(sbr: number, paperEs: number, flareFactor: number) {
  return (paperEs / (0.3 * sbr)) + flareFactor;
}

export function resolveSingleSpotProfileDevelopment(
  profiles: readonly DevelopmentProfile[],
  profileId: string | null | undefined,
  filmStock: Pick<FilmStock, "iso"> | null | undefined,
  lens: Pick<Lens, "flare_factor"> | null | undefined,
): SingleSpotProfileDevelopmentResult {
  const selectedProfileId = profileId?.trim() ?? "";
  const profile = selectedProfileId
    ? profiles.find((candidate) => candidate.id === selectedProfileId) ?? null
    : null;
  const baseIso = filmStock?.iso != null && filmStock.iso > 0 ? filmStock.iso : DEFAULT_METER_ISO;
  const paperEs = profile?.type === "btzs" ? resolveBtzsProfilePaperEs(profile) ?? 1 : 1;
  const flareFactor = lens?.flare_factor ?? (profile?.type === "btzs" ? resolveBtzsProfileFlareFactor(profile) : 0.02);
  const requiredG = calculateRequiredGForSbr(STANDARD_SINGLE_SPOT_SBR, paperEs, flareFactor);
  const warnings = new Set<string>();

  if (!profile) {
    return {
      profile: null,
      sbr: STANDARD_SINGLE_SPOT_SBR,
      requiredG,
      workingIso: baseIso,
      developmentTimeMinutes: null,
      developmentTimeSource: null,
      developmentPercent: null,
      baseDevelopmentMinutes: null,
      warnings: [],
      error: null,
    };
  }

  if (profile.type === "simple") {
    const baseDevelopmentMinutes = parseDevelopmentTimeTextMinutes(profile.timeText);
    if (baseDevelopmentMinutes == null) {
      return {
        profile,
        sbr: STANDARD_SINGLE_SPOT_SBR,
        requiredG,
        workingIso: baseIso,
        developmentTimeMinutes: null,
        developmentTimeSource: "simple-profile-standard",
        developmentPercent: 100,
        baseDevelopmentMinutes: null,
        warnings: [],
        error: "Simple development profile time must be parseable as minutes or mm:ss for single spot metering.",
      };
    }

    return {
      profile,
      sbr: STANDARD_SINGLE_SPOT_SBR,
      requiredG,
      workingIso: baseIso,
      developmentTimeMinutes: baseDevelopmentMinutes,
      developmentTimeSource: "simple-profile-standard",
      developmentPercent: 100,
      baseDevelopmentMinutes,
      warnings: [],
      error: null,
    };
  }

  const developmentTimeSeries = findBtzsLookupSeries(profile.chartData, "developmentTime");
  const effectiveFilmSpeedSeries = findBtzsLookupSeries(profile.chartData, "effectiveFilmSpeed");
  if (!developmentTimeSeries) warnings.add("No development time BTZS chart series was found.");
  if (!effectiveFilmSpeedSeries) warnings.add("No effective film speed BTZS chart series was found.");

  const developmentTimeLookup = developmentTimeSeries
    ? interpolateBtzsSeriesValue(
        developmentTimeSeries,
        developmentTimeSeries.axis === "averageG" ? requiredG : STANDARD_SINGLE_SPOT_SBR,
      )
    : null;
  const effectiveFilmSpeedLookup = effectiveFilmSpeedSeries
    ? interpolateBtzsSeriesValue(
        effectiveFilmSpeedSeries,
        effectiveFilmSpeedSeries.axis === "averageG" ? requiredG : STANDARD_SINGLE_SPOT_SBR,
      )
    : null;

  if (developmentTimeLookup?.warning) warnings.add(developmentTimeLookup.warning);
  if (effectiveFilmSpeedLookup?.warning) warnings.add(effectiveFilmSpeedLookup.warning);

  return {
    profile,
    sbr: STANDARD_SINGLE_SPOT_SBR,
    requiredG,
    workingIso: effectiveFilmSpeedLookup?.value ?? baseIso,
    developmentTimeMinutes: developmentTimeLookup?.value ?? null,
    developmentTimeSource: "btzs-profile-standard-sbr",
    developmentPercent: null,
    baseDevelopmentMinutes: null,
    warnings: [...warnings],
    error: null,
  };
}

export function isBulbShutterValue(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === SHUTTER_BULB_VALUE;
}

export function parseBulbDurationInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function formatBulbDurationInputValue(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  return normalizeSecondsText(seconds);
}

export function formatBulbDurationLabel(seconds: number | null | undefined): string {
  const value = formatBulbDurationInputValue(seconds);
  return value ? `${value}s` : "";
}

export function formatPhotographShutterDisplay(
  photo: Pick<Photograph, "shutter_speed" | "shutter_speed_seconds" | "shutter_mode" | "bulb_duration_seconds">,
): string | null {
  const value = formatStoredShutterDisplay(photo);
  return value === "—" ? null : value;
}

type StoredShutterDisplayInput = {
  shutter_speed?: string | null;
  shutter_speed_seconds?: number | null;
  shutter_mode?: PhotographShutterMode | null;
  bulb_duration_seconds?: number | null;
};

function formatCompactNumber(value: number | string | null | undefined) {
  if (value == null) return "—";
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value.trim())
      : Number.NaN;
  if (!Number.isFinite(parsed)) return "—";
  const rounded = Number.parseFloat(parsed.toFixed(2));
  return Number.isFinite(rounded) ? rounded.toString() : "—";
}

function formatProfileReference(profileName: string | null | undefined) {
  const name = profileName?.trim() ?? "";
  return name || "Unknown profile";
}

function formatReciprocityStatus(applied: boolean | null | undefined) {
  if (applied == null) return "Unknown";
  return applied ? "Applied" : "Not applied";
}

function formatReciprocityShutterValue(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  return formatIdealShutterSeconds(seconds);
}

function getReciprocityShutterComparison(
  value: ReciprocityShutterComparisonSource,
): { metered: string; corrected: string } | null {
  if (!value.reciprocityApplied) return null;
  const rawSeconds = value.rawShutterSeconds ?? value.rawShutterSpeedSeconds;
  const finalSeconds = value.finalShutterSeconds ?? value.finalShutterSpeedSeconds;
  if (rawSeconds == null || finalSeconds == null) return null;
  if (!Number.isFinite(rawSeconds) || !Number.isFinite(finalSeconds)) return null;

  const metered = formatReciprocityShutterValue(rawSeconds);
  const corrected = formatReciprocityShutterValue(finalSeconds);
  if (metered === corrected) return null;

  return { metered, corrected };
}

function pushReciprocityShutterComparisonRows(
  rows: PhotographExposureSummaryRow[],
  value: ReciprocityShutterComparisonSource,
) {
  const comparison = getReciprocityShutterComparison(value);
  if (!comparison) return false;

  pushSummaryRow(rows, "Metered shutter", comparison.metered);
  pushSummaryRow(rows, "With reciprocity", comparison.corrected);
  return true;
}

function getStoredHoldSide(
  value: Partial<Pick<
    PhotographZoneMeteringCalculation,
    "holdSide" | "precedence" | "heldAperture" | "heldShutterSpeed"
  >>,
): ExposurePrecedence {
  if (value.holdSide === "aperture" || value.holdSide === "shutter") return value.holdSide;
  if (value.precedence === "aperture" || value.precedence === "shutter") return value.precedence;
  if (value.heldShutterSpeed?.trim()) return "shutter";
  if (value.heldAperture?.trim()) return "aperture";
  return "aperture";
}

function hasStoredHoldMetadata(
  value: Partial<Pick<
    PhotographZoneMeteringCalculation,
    "holdSide" | "precedence" | "heldAperture" | "heldShutterSpeed"
  >>,
) {
  return Boolean(
    value.holdSide ||
    value.precedence ||
    value.heldAperture?.trim() ||
    value.heldShutterSpeed?.trim(),
  );
}

function formatHeldExposureValue(
  holdSide: ExposurePrecedence,
  details: Partial<PhotographZoneMeteringCalculation>,
) {
  if (holdSide === "shutter") {
    return details.heldShutterSpeed?.trim()
      || formatStoredShutterDisplay({
        shutter_speed: details.shutterSpeed ?? null,
        shutter_speed_seconds: details.finalShutterSpeedSeconds ?? null,
        shutter_mode: details.shutterMode,
        bulb_duration_seconds: details.bulbDurationSeconds ?? null,
      });
  }

  return details.heldAperture?.trim()
    || details.aperture?.trim()
    || "—";
}

function formatCalculatedExposureValue(
  holdSide: ExposurePrecedence,
  details: Partial<PhotographZoneMeteringCalculation>,
) {
  if (holdSide === "shutter") {
    const calculatedAperture = details.idealAperture != null
      ? formatIdealApertureValue(details.idealAperture)
      : details.aperture?.trim() ?? "—";
    return [
      `Ideal ${calculatedAperture}`,
      `Closest ${details.apertureChoice?.label ?? details.aperture ?? "—"}`,
      formatExposureStopError(details.apertureChoice?.stopError ?? null),
    ].filter((value): value is string => Boolean(value)).join(" · ");
  }

  return [
    `Ideal ${formatIdealShutterSeconds(details.idealShutterSeconds ?? details.rawShutterSpeedSeconds ?? null)}`,
    `Closest ${details.shutterChoice?.label ?? formatStoredShutterDisplay({
      shutter_speed: details.shutterSpeed ?? null,
      shutter_speed_seconds: details.finalShutterSpeedSeconds ?? null,
      shutter_mode: details.shutterMode,
      bulb_duration_seconds: details.bulbDurationSeconds ?? null,
    })}`,
    formatExposureStopError(details.shutterChoice?.stopError ?? null),
  ].filter((value): value is string => Boolean(value)).join(" · ");
}

export function formatExposureEntryModeLabel(mode: ExposureEntryMode | null | undefined) {
  if (mode === "manual") return "Manual";
  if (mode === "cell-camera") return "Cell Camera";
  if (mode === "zone-metering") return "Single Spot";
  if (mode === "btzs-zone-metering") return "Zone Metering";
  return "Unknown";
}

export function formatPhotographExposureEntryModeLabel(
  photo: Pick<Photograph, "exposure_entry_mode" | "exposure_details">,
) {
  if (
    photo.exposure_entry_mode === "zone-metering"
    && photo.exposure_details
    && "zoneMetering" in photo.exposure_details
    && photo.exposure_details.zoneMetering.meteringSource === "cell-camera"
  ) {
    return "Cell Camera";
  }
  return formatExposureEntryModeLabel(photo.exposure_entry_mode);
}

function formatStoredZoneReadingLabel(ev: number | string | null | undefined, zone: number | string | null | undefined) {
  return `EV ${formatExposureEv(ev)} · Zone ${formatCompactNumber(zone)}`;
}

function formatSignedCompactNumber(value: number | string | null | undefined) {
  const formatted = formatCompactNumber(value);
  if (formatted === "—") return formatted;
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value.trim())
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return formatted;
  return `+${formatted}`;
}

function formatDevelopmentAdjustment(value: number | string | null | undefined) {
  const formatted = formatSignedCompactNumber(value);
  if (formatted === "—" || formatted === "0") return "N";
  return `N${formatted}`;
}

function formatStoredShutterValue(shutter: StoredShutterDisplayInput) {
  if (shutter.shutter_mode === "bulb") {
    const duration = formatBulbDurationLabel(shutter.bulb_duration_seconds ?? shutter.shutter_speed_seconds);
    return duration ? `Bulb · ${duration}` : "Bulb";
  }

  if (shutter.shutter_speed_seconds != null && Number.isFinite(shutter.shutter_speed_seconds)) {
    return formatShutterSpeedValue(shutter.shutter_speed_seconds);
  }

  const label = shutter.shutter_speed?.trim();
  return label ? label : "—";
}

export function formatStoredShutterDisplay(
  shutter: StoredShutterDisplayInput,
): string {
  return formatStoredShutterValue(shutter);
}

function formatStoredExposureWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) return [];
  return warnings
    .filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0)
    .map((warning) => warning.trim());
}

function pushSummaryRow(rows: PhotographExposureSummaryRow[], label: string, value: string | null | undefined) {
  rows.push({ label, value: value?.trim() ? value.trim() : "—" });
}

function buildZoneMeteringSummary(
  zoneMetering: Partial<PhotographZoneMeteringCalculation>,
): PhotographExposureSummary {
  const rows: PhotographExposureSummaryRow[] = [];
  if (zoneMetering.profileId || zoneMetering.profileName) {
    pushSummaryRow(rows, "Profile", formatProfileReference(zoneMetering.profileName));
  }
  if (zoneMetering.meteringSource === "cell-camera") {
    pushSummaryRow(rows, "Cell camera EV", `EV ${formatExposureEv(zoneMetering.cellCameraEV)}`);
    pushSummaryRow(rows, "Phone correction", `${formatSignedCompactNumber(zoneMetering.cellCameraCorrectionStops)} stops`);
    pushSummaryRow(rows, "Corrected EV / ISO", `EV ${formatExposureEv(zoneMetering.meterEV)} · ISO ${formatCompactNumber(zoneMetering.meterISO)}`);
  } else {
    pushSummaryRow(rows, "Meter EV / ISO", `EV ${formatExposureEv(zoneMetering.meterEV)} · ISO ${formatCompactNumber(zoneMetering.meterISO)}`);
  }
  pushSummaryRow(rows, "Target zone", `Zone ${formatCompactNumber(zoneMetering.targetZone)}`);
  pushSummaryRow(rows, "Working ISO / EI", `ISO/EI ${formatCompactNumber(zoneMetering.workingISO)}`);
  if (zoneMetering.sbr != null) pushSummaryRow(rows, "Assumed SBR", formatExposureSbr(zoneMetering.sbr));
  if (zoneMetering.requiredG != null) pushSummaryRow(rows, "Required G", formatExposureG(zoneMetering.requiredG));
  if (zoneMetering.developmentTimeMinutes != null) {
    pushSummaryRow(rows, "Development time", formatDevelopmentTimeClock(zoneMetering.developmentTimeMinutes));
  }
  pushSummaryRow(rows, "Target EV", formatExposureEv(zoneMetering.targetEV));
  pushSummaryRow(rows, "Total compensation", `${formatSignedCompactNumber(zoneMetering.totalCompensationStops)} stops`);
  const reciprocityComparisonShown = pushReciprocityShutterComparisonRows(rows, zoneMetering);
  if (!hasStoredHoldMetadata(zoneMetering)) {
    if (!reciprocityComparisonShown) {
      pushSummaryRow(rows, "Raw shutter", formatStoredShutterDisplay({
        shutter_speed: zoneMetering.shutterSpeed,
        shutter_speed_seconds: zoneMetering.rawShutterSpeedSeconds,
        shutter_mode: zoneMetering.shutterMode,
        bulb_duration_seconds: zoneMetering.bulbDurationSeconds,
      }));
      pushSummaryRow(rows, "Final shutter", formatStoredShutterDisplay({
        shutter_speed: zoneMetering.shutterSpeed,
        shutter_speed_seconds: zoneMetering.finalShutterSpeedSeconds,
        shutter_mode: zoneMetering.shutterMode,
        bulb_duration_seconds: zoneMetering.bulbDurationSeconds,
      }));
    }
    pushSummaryRow(rows, "Aperture", zoneMetering.aperture);
    pushSummaryRow(rows, "Reciprocity", formatReciprocityStatus(zoneMetering.reciprocityApplied));

    return {
      rows,
      warnings: formatStoredExposureWarnings(zoneMetering.warnings),
    };
  }

  const holdSide = getStoredHoldSide(zoneMetering);
  if (holdSide === "shutter") {
    pushSummaryRow(rows, "Held shutter", zoneMetering.heldShutterSpeed ?? formatStoredShutterDisplay({
      shutter_speed: zoneMetering.shutterSpeed,
      shutter_speed_seconds: zoneMetering.finalShutterSpeedSeconds,
      shutter_mode: zoneMetering.shutterMode,
      bulb_duration_seconds: zoneMetering.bulbDurationSeconds,
    }));
    pushSummaryRow(rows, "Ideal aperture", zoneMetering.idealAperture != null
      ? formatIdealApertureValue(zoneMetering.idealAperture)
      : zoneMetering.aperture?.trim());
    pushSummaryRow(rows, "Closest supported aperture", zoneMetering.apertureChoice?.label ?? zoneMetering.aperture);
    const apertureError = formatExposureStopError(zoneMetering.apertureChoice?.stopError ?? null);
    if (apertureError) pushSummaryRow(rows, "Exposure error", apertureError);
  } else {
    pushSummaryRow(rows, "Held aperture", zoneMetering.heldAperture ?? zoneMetering.aperture);
    pushSummaryRow(rows, "Ideal shutter", zoneMetering.idealShutterSeconds != null
      ? formatIdealShutterSeconds(zoneMetering.idealShutterSeconds)
      : formatStoredShutterDisplay({
          shutter_speed: zoneMetering.shutterSpeed,
          shutter_speed_seconds: zoneMetering.rawShutterSpeedSeconds,
          shutter_mode: zoneMetering.shutterMode,
          bulb_duration_seconds: zoneMetering.bulbDurationSeconds,
        }));
    pushSummaryRow(rows, "Closest supported shutter", zoneMetering.shutterChoice?.label ?? formatStoredShutterDisplay({
      shutter_speed: zoneMetering.shutterSpeed,
      shutter_speed_seconds: zoneMetering.finalShutterSpeedSeconds,
      shutter_mode: zoneMetering.shutterMode,
      bulb_duration_seconds: zoneMetering.bulbDurationSeconds,
    }));
    const shutterError = formatExposureStopError(zoneMetering.shutterChoice?.stopError ?? null);
    if (shutterError) pushSummaryRow(rows, "Exposure error", shutterError);
  }
  pushSummaryRow(rows, "Final aperture", zoneMetering.aperture);
  if (!reciprocityComparisonShown) {
    pushSummaryRow(rows, "Final shutter", formatStoredShutterDisplay({
      shutter_speed: zoneMetering.shutterSpeed,
      shutter_speed_seconds: zoneMetering.finalShutterSpeedSeconds,
      shutter_mode: zoneMetering.shutterMode,
      bulb_duration_seconds: zoneMetering.bulbDurationSeconds,
    }));
  }
  pushSummaryRow(rows, "Reciprocity", formatReciprocityStatus(zoneMetering.reciprocityApplied));

  return {
    rows,
    warnings: formatStoredExposureWarnings(zoneMetering.warnings),
  };
}

function buildBtzsZoneMeteringSummary(
  btzsZoneMetering: Partial<PhotographBtzsZoneMeteringCalculation>,
): PhotographExposureSummary {
  const rows: PhotographExposureSummaryRow[] = [];
  pushSummaryRow(rows, "Profile", formatProfileReference(btzsZoneMetering.profileName));
  pushSummaryRow(rows, "Low EV / Zone", formatStoredZoneReadingLabel(btzsZoneMetering.lowEV, btzsZoneMetering.lowZone));
  pushSummaryRow(rows, "High EV / Zone", formatStoredZoneReadingLabel(btzsZoneMetering.highEV, btzsZoneMetering.highZone));
  pushSummaryRow(rows, "EV range", formatExposureEv(btzsZoneMetering.evRange));
  pushSummaryRow(rows, "Zone range", formatCompactNumber(btzsZoneMetering.zoneRange));
  pushSummaryRow(rows, "SBR", formatExposureSbr(btzsZoneMetering.sbr));
  pushSummaryRow(rows, "Paper ES", formatCompactNumber(btzsZoneMetering.paperEs));
  if (btzsZoneMetering.flareFactor != null) {
    pushSummaryRow(rows, "Flare factor", formatCompactNumber(btzsZoneMetering.flareFactor));
  }
  pushSummaryRow(rows, "Required G", formatExposureG(btzsZoneMetering.requiredG));
  pushSummaryRow(rows, "EFS", formatExposureEfs(btzsZoneMetering.effectiveFilmSpeed));
  pushSummaryRow(rows, "Development time", formatDevelopmentTimeClock(btzsZoneMetering.developmentTimeMinutes));
  if (btzsZoneMetering.profileType === "simple" || btzsZoneMetering.developmentAdjustmentStops != null) {
    pushSummaryRow(rows, "Development adjustment", formatDevelopmentAdjustment(btzsZoneMetering.developmentAdjustmentStops));
  }
  if (btzsZoneMetering.simpleDevelopmentPercent != null) {
    pushSummaryRow(rows, "Simple profile percent", `${formatCompactNumber(btzsZoneMetering.simpleDevelopmentPercent)}%`);
  }
  pushSummaryRow(rows, "Target EV before compensation", formatExposureEv(btzsZoneMetering.targetEVBeforeCompensation));
  pushSummaryRow(rows, "Target EV after compensation", formatExposureEv(btzsZoneMetering.targetEVAfterCompensation));
  const reciprocityComparisonShown = pushReciprocityShutterComparisonRows(rows, btzsZoneMetering);
  if (!hasStoredHoldMetadata(btzsZoneMetering)) {
    if (!reciprocityComparisonShown) {
      pushSummaryRow(rows, "Raw shutter", formatStoredShutterDisplay({
        shutter_speed: btzsZoneMetering.shutterSpeed,
        shutter_speed_seconds: btzsZoneMetering.rawShutterSpeedSeconds,
        shutter_mode: btzsZoneMetering.shutterMode,
        bulb_duration_seconds: btzsZoneMetering.bulbDurationSeconds,
      }));
      pushSummaryRow(rows, "Final shutter", formatStoredShutterDisplay({
        shutter_speed: btzsZoneMetering.shutterSpeed,
        shutter_speed_seconds: btzsZoneMetering.finalShutterSpeedSeconds,
        shutter_mode: btzsZoneMetering.shutterMode,
        bulb_duration_seconds: btzsZoneMetering.bulbDurationSeconds,
      }));
    }
    pushSummaryRow(rows, "Aperture", btzsZoneMetering.aperture);
    pushSummaryRow(rows, "Reciprocity", formatReciprocityStatus(btzsZoneMetering.reciprocityApplied));

    return {
      rows,
      warnings: formatStoredExposureWarnings(btzsZoneMetering.warnings),
    };
  }

  const holdSide = getStoredHoldSide(btzsZoneMetering);
  if (holdSide === "shutter") {
    pushSummaryRow(rows, "Held shutter", btzsZoneMetering.heldShutterSpeed ?? formatStoredShutterDisplay({
      shutter_speed: btzsZoneMetering.shutterSpeed,
      shutter_speed_seconds: btzsZoneMetering.finalShutterSpeedSeconds,
      shutter_mode: btzsZoneMetering.shutterMode,
      bulb_duration_seconds: btzsZoneMetering.bulbDurationSeconds,
    }));
    pushSummaryRow(rows, "Ideal aperture", btzsZoneMetering.idealAperture != null
      ? formatIdealApertureValue(btzsZoneMetering.idealAperture)
      : btzsZoneMetering.aperture?.trim());
    pushSummaryRow(rows, "Closest supported aperture", btzsZoneMetering.apertureChoice?.label ?? btzsZoneMetering.aperture);
    const apertureError = formatExposureStopError(btzsZoneMetering.apertureChoice?.stopError ?? null);
    if (apertureError) pushSummaryRow(rows, "Exposure error", apertureError);
  } else {
    pushSummaryRow(rows, "Held aperture", btzsZoneMetering.heldAperture ?? btzsZoneMetering.aperture);
    pushSummaryRow(rows, "Ideal shutter", btzsZoneMetering.idealShutterSeconds != null
      ? formatIdealShutterSeconds(btzsZoneMetering.idealShutterSeconds)
      : formatStoredShutterDisplay({
          shutter_speed: btzsZoneMetering.shutterSpeed,
          shutter_speed_seconds: btzsZoneMetering.rawShutterSpeedSeconds,
          shutter_mode: btzsZoneMetering.shutterMode,
          bulb_duration_seconds: btzsZoneMetering.bulbDurationSeconds,
        }));
    pushSummaryRow(rows, "Closest supported shutter", btzsZoneMetering.shutterChoice?.label ?? formatStoredShutterDisplay({
      shutter_speed: btzsZoneMetering.shutterSpeed,
      shutter_speed_seconds: btzsZoneMetering.finalShutterSpeedSeconds,
      shutter_mode: btzsZoneMetering.shutterMode,
      bulb_duration_seconds: btzsZoneMetering.bulbDurationSeconds,
    }));
    const shutterError = formatExposureStopError(btzsZoneMetering.shutterChoice?.stopError ?? null);
    if (shutterError) pushSummaryRow(rows, "Exposure error", shutterError);
  }
  pushSummaryRow(rows, "Final aperture", btzsZoneMetering.aperture);
  if (!reciprocityComparisonShown) {
    pushSummaryRow(rows, "Final shutter", formatStoredShutterDisplay({
      shutter_speed: btzsZoneMetering.shutterSpeed,
      shutter_speed_seconds: btzsZoneMetering.finalShutterSpeedSeconds,
      shutter_mode: btzsZoneMetering.shutterMode,
      bulb_duration_seconds: btzsZoneMetering.bulbDurationSeconds,
    }));
  }
  pushSummaryRow(rows, "Reciprocity", formatReciprocityStatus(btzsZoneMetering.reciprocityApplied));

  return {
    rows,
    warnings: formatStoredExposureWarnings(btzsZoneMetering.warnings),
  };
}

export function buildPhotographExposureSummary(
  photo: Pick<Photograph, "exposure_entry_mode" | "exposure_details">,
): PhotographExposureSummary | null {
  if (photo.exposure_entry_mode === "manual" || photo.exposure_details == null) {
    return null;
  }

  if ("zoneMetering" in photo.exposure_details) {
    return buildZoneMeteringSummary(photo.exposure_details.zoneMetering);
  }

  if ("btzsZoneMetering" in photo.exposure_details) {
    return buildBtzsZoneMeteringSummary(photo.exposure_details.btzsZoneMetering);
  }

  return null;
}

export function getPhotographExposureDraft(
  photo: Pick<Photograph, "shutter_speed" | "shutter_speed_seconds" | "shutter_mode" | "bulb_duration_seconds">,
): PhotographExposureDraft {
  if (photo.shutter_mode === "bulb") {
    return {
      shutter_speed: SHUTTER_BULB_VALUE,
      bulb_duration_seconds: formatBulbDurationInputValue(
        photo.bulb_duration_seconds ?? photo.shutter_speed_seconds,
      ),
    };
  }

  return {
    shutter_speed: photo.shutter_speed_seconds != null
      ? formatShutterSpeedValue(photo.shutter_speed_seconds)
      : photo.shutter_speed?.trim() ?? "",
      bulb_duration_seconds: "",
  };
}

export function getManualReciprocityWarning(
  filmStock: Pick<FilmStock, "reciprocity_p_factor"> | null | undefined,
  exposure: PhotographExposureDraft,
): string | null {
  const factor = filmStock?.reciprocity_p_factor;
  if (!Number.isFinite(factor) || factor == null || Math.abs(factor - 1) <= 1e-6) {
    return null;
  }

  const manualSeconds = isBulbShutterValue(exposure.shutter_speed)
    ? parseBulbDurationInput(exposure.bulb_duration_seconds)
    : parseShutterSpeedInput(exposure.shutter_speed);
  if (manualSeconds == null || manualSeconds <= RECIPROCITY_WARNING_THRESHOLD_SECONDS) return null;

  return "Reciprocity correction may be required.";
}

function resolveFiniteNumber(raw: string, fieldName: string, defaultValue: number | null = null) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: defaultValue, error: null as string | null };
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: `${fieldName} must be a valid number.` };
  }

  return { value: parsed, error: null as string | null };
}

function resolvePositiveNumber(raw: string, fieldName: string, defaultValue: number | null = null) {
  const resolved = resolveFiniteNumber(raw, fieldName, defaultValue);
  if (resolved.error || resolved.value == null) return resolved;
  if (resolved.value <= 0) {
    return { value: null, error: `${fieldName} must be a positive number.` };
  }
  return resolved;
}

function resolveNonNegativeNumber(raw: string, fieldName: string, defaultValue: number | null = null) {
  const resolved = resolveFiniteNumber(raw, fieldName, defaultValue);
  if (resolved.error || resolved.value == null) return resolved;
  if (resolved.value < 0) {
    return { value: null, error: `${fieldName} must be zero or greater.` };
  }
  return resolved;
}

export function resolveBtzsProfileFlareFactor(
  profile: Pick<BTZSDevelopmentProfile, "flareDensityText"> | null | undefined,
): number {
  const text = profile?.flareDensityText?.trim();
  if (!text) return 0;

  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function buildZoneMeteringWritePayload(
  input: BuildPhotographExposureWritePayloadInput,
): BuildPhotographExposureWritePayloadResult {
  const availability = getPhotographExposureModeAvailability(input.film_stock, input.btzs_profiles);
  if (!availability.zoneMeteringEnabled) {
    return {
      payload: {},
      error: availability.zoneMeteringReason ?? "Single Spot is available for B&W negative film.",
      warnings: [],
    };
  }

  const isCellCameraMode = input.exposure_entry_mode === "cell-camera";
  const meterEv = isCellCameraMode
    ? resolveFiniteNumber(input.zone_metering.cell_camera_ev, "cell camera EV")
    : resolveFiniteNumber(input.zone_metering.meter_ev, "meter EV");
  if (meterEv.error) {
    return { payload: {}, error: meterEv.error, warnings: [] };
  }
  const cellCameraCorrection = isCellCameraMode
    ? resolveFiniteNumber(input.zone_metering.cell_camera_correction_stops, "cell camera correction", 0)
    : { value: 0, error: null as string | null };
  if (cellCameraCorrection.error) {
    return { payload: {}, error: cellCameraCorrection.error, warnings: [] };
  }
  const resolvedCellCameraEV = meterEv.value ?? 0;
  const resolvedCellCameraCorrectionStops = cellCameraCorrection.value ?? 0;
  const resolvedMeterEv = isCellCameraMode
    ? resolvedCellCameraEV - resolvedCellCameraCorrectionStops
    : resolvedCellCameraEV;

  const resolvedMeterIso = DEFAULT_METER_ISO;

  const workingIsoDefault = input.film_stock?.iso != null && input.film_stock.iso > 0 ? input.film_stock.iso : 100;
  const profileDevelopment = resolveSingleSpotProfileDevelopment(
    input.btzs_profiles,
    input.btzs_zone_metering.profile_id,
    input.film_stock,
    input.lens,
  );
  if (profileDevelopment.error) {
    return { payload: {}, error: profileDevelopment.error, warnings: profileDevelopment.warnings };
  }
  const resolvedWorkingIso = profileDevelopment.profile
    ? profileDevelopment.workingIso
    : workingIsoDefault;

  const targetZone = resolveFiniteNumber(input.zone_metering.target_zone, "target zone", 5);
  if (targetZone.error) {
    return { payload: {}, error: targetZone.error, warnings: [] };
  }
  const resolvedTargetZone = targetZone.value ?? DEFAULT_ZONE_TARGET;

  const bellowsCorrection = resolveBellowsCorrectionForDraft(input.zone_metering, input.focal_length_mm ?? "");
  if (bellowsCorrection.error) {
    return { payload: {}, error: bellowsCorrection.error, warnings: [] };
  }
  const manualCompensationStops = 0;
  const resolvedCompensationStops = bellowsCorrection.stops;

  const selectedFilters = input.filters ?? [];
  const filterStops = getFilterStops(selectedFilters, input.zone_metering.reading_through_selected_filters);
  const result = calculateZoneMeteringExposure({
    meterEv: resolvedMeterEv,
    meterIso: resolvedMeterIso,
    workingIso: resolvedWorkingIso,
    targetZone: resolvedTargetZone,
    compensationStops: resolvedCompensationStops,
    filterFactors: selectedFilters,
    readingThroughSelectedFilters: input.zone_metering.reading_through_selected_filters,
    precedence: input.zone_metering.precedence,
    aperture: input.aperture,
    shutterSeconds: input.shutter_speed,
    lensMinFStop: input.lens?.min_f_stop,
    lensMaxFStop: input.lens?.max_f_stop,
    reciprocityPFactor: input.film_stock?.reciprocity_p_factor,
  });

  if (result.error) {
    return {
      payload: {},
      error: result.error,
      warnings: result.warnings,
    };
  }

  const exposureChoices = resolveExposureChoiceDisplay(
    {
      aperture: result.aperture,
      finalShutterSeconds: result.finalShutterSeconds,
      warnings: result.warnings,
    },
    input.lens,
    input.shutter_source,
  );
  if (!exposureChoices?.finalFields) {
    return {
      payload: {},
      error: "Could not resolve the final zone metering exposure.",
      warnings: exposureChoices?.warnings ?? result.warnings,
    };
  }

  const warnings = [...new Set([...profileDevelopment.warnings, ...exposureChoices.warnings])];
  const holdSide = input.zone_metering.precedence;

  const payload = {
    ...exposureChoices.finalFields,
    exposure_entry_mode: "zone-metering",
    exposure_details: {
      zoneMetering: {
        holdSide,
        meteringSource: isCellCameraMode ? "cell-camera" : "spot-meter",
        cellCameraEV: isCellCameraMode ? resolvedCellCameraEV : null,
        cellCameraCorrectionStops: isCellCameraMode ? resolvedCellCameraCorrectionStops : null,
        meterEV: resolvedMeterEv,
        meterISO: resolvedMeterIso,
        workingISO: resolvedWorkingIso,
        profileId: profileDevelopment.profile?.id ?? null,
        profileName: profileDevelopment.profile?.name ?? null,
        profileType: profileDevelopment.profile?.type ?? null,
        sbr: profileDevelopment.sbr,
        requiredG: profileDevelopment.requiredG,
        effectiveFilmSpeed: resolvedWorkingIso,
        developmentTimeMinutes: profileDevelopment.developmentTimeMinutes,
        developmentTimeSource: profileDevelopment.developmentTimeSource,
        simpleDevelopmentBaseMinutes: profileDevelopment.baseDevelopmentMinutes,
        simpleDevelopmentPercent: profileDevelopment.developmentPercent,
        targetZone: resolvedTargetZone,
        zoneAdjustedEV: result.zoneAdjustedEV ?? 0,
        targetEV: result.targetEV ?? 0,
        totalCompensationStops: filterStops + resolvedCompensationStops,
        heldAperture: holdSide === "aperture" ? (input.aperture.trim() || null) : null,
        heldShutterSpeed: holdSide === "shutter" ? (input.shutter_speed.trim() || null) : null,
        calculatedAperture: result.idealAperture ?? null,
        calculatedShutterSeconds: result.idealShutterSeconds ?? null,
        apertureStopError: exposureChoices.apertureChoice?.stopError ?? null,
        shutterStopError: exposureChoices.shutterChoice?.stopError ?? null,
        idealAperture: result.idealAperture ?? null,
        idealShutterSeconds: result.idealShutterSeconds ?? null,
        aperture: exposureChoices.finalFields.aperture,
        shutterSpeed: exposureChoices.finalFields.shutter_speed,
        rawShutterSpeedSeconds: result.rawShutterSeconds ?? null,
        finalShutterSpeedSeconds: exposureChoices.finalFields.shutter_speed_seconds,
        apertureChoice: exposureChoices.apertureChoice,
        shutterChoice: exposureChoices.shutterChoice,
        shutterMode: exposureChoices.finalFields.shutter_mode,
        bulbDurationSeconds: exposureChoices.finalFields.bulb_duration_seconds,
        reciprocityApplied: Boolean(result.reciprocityApplied),
        warnings,
        precedence: holdSide,
        readingThroughSelectedFilters: input.zone_metering.reading_through_selected_filters,
        compensationStops: manualCompensationStops,
        bellowsCorrectionStops: bellowsCorrection.stops,
        bellowsCorrection: {
          mode: input.zone_metering.bellows_correction_mode,
          extensionMm: input.zone_metering.bellows_correction_mode === "measurement"
            ? parseDraftNumericValue(input.zone_metering.bellows_extension_mm)
            : null,
          subjectDistanceM: input.zone_metering.bellows_correction_mode === "distance"
            ? parseDraftNumericValue(input.zone_metering.bellows_subject_distance_m)
            : null,
          focalLengthMm: parseDraftNumericValue(input.focal_length_mm ?? ""),
          stops: bellowsCorrection.stops,
        },
        filterStops,
        filterIds: input.filter_ids,
        filterFactors: selectedFilters.map((filter) => filter.filter_factor),
      },
    },
  } as BuildPhotographExposureWritePayloadResult["payload"];

  return {
    payload,
    error: null,
    warnings,
  };
}

function buildBtzsZoneMeteringWritePayload(
  input: BuildPhotographExposureWritePayloadInput,
): BuildPhotographExposureWritePayloadResult {
  const availability = getPhotographExposureModeAvailability(input.film_stock, input.btzs_profiles);
  if (!availability.btzsZoneMeteringEnabled) {
    return {
      payload: {},
      error: availability.btzsZoneMeteringReason ?? "Zone Metering requires a development profile for this film.",
      warnings: [],
    };
  }

  const selectedProfileSelection = resolveBtzsProfileSelection(input.btzs_profiles, input.btzs_zone_metering.profile_id);
  const selectedProfile = selectedProfileSelection.selectedProfile;
  if (!selectedProfile) {
    return {
      payload: {},
      error: "Select a development profile for this film.",
      warnings: [],
    };
  }

  const selectedProfilePaperEs = selectedProfile.type === "btzs"
    ? resolveBtzsProfilePaperEs(selectedProfile) ?? 1
    : 1;
  const paperEsText = input.btzs_zone_metering.paper_es.trim();
  const paperEs = paperEsText.length > 0
    ? resolvePositiveNumber(paperEsText, "paper ES", null)
    : { value: selectedProfilePaperEs, error: null as string | null };
  if (paperEs.error || paperEs.value == null) {
    return { payload: {}, error: paperEs.error ?? "paper ES must be a positive number.", warnings: [] };
  }
  const resolvedPaperEs = paperEs.value;
  const defaultFlareFactor = input.lens?.flare_factor ?? (selectedProfile.type === "btzs" ? resolveBtzsProfileFlareFactor(selectedProfile) : 0.02);
  const flareFactor = resolveNonNegativeNumber(input.btzs_zone_metering.flare_factor, "flare factor", defaultFlareFactor);
  if (flareFactor.error || flareFactor.value == null) {
    return { payload: {}, error: flareFactor.error ?? "flare factor must be zero or greater.", warnings: [] };
  }
  const resolvedFlareFactor = flareFactor.value;

  const compensationStops = resolveFiniteNumber(input.btzs_zone_metering.compensation_stops, "compensation stops", 0);
  if (compensationStops.error) {
    return { payload: {}, error: compensationStops.error, warnings: [] };
  }
  const manualCompensationStops = compensationStops.value ?? 0;
  const bellowsCorrection = resolveBellowsCorrectionForDraft(input.btzs_zone_metering, input.focal_length_mm ?? "");
  if (bellowsCorrection.error) {
    return { payload: {}, error: bellowsCorrection.error, warnings: [] };
  }
  const resolvedCompensationStops = manualCompensationStops + bellowsCorrection.stops;

  const lowEv = resolveFiniteNumber(input.btzs_zone_metering.low_ev, "low EV");
  if (lowEv.error) return { payload: {}, error: lowEv.error, warnings: [] };
  const highEv = resolveFiniteNumber(input.btzs_zone_metering.high_ev, "high EV");
  if (highEv.error) return { payload: {}, error: highEv.error, warnings: [] };
  const lowZone = resolveFiniteNumber(input.btzs_zone_metering.low_zone, "low zone", 3);
  if (lowZone.error) return { payload: {}, error: lowZone.error, warnings: [] };
  const highZone = resolveFiniteNumber(input.btzs_zone_metering.high_zone, "high zone", 7);
  if (highZone.error) return { payload: {}, error: highZone.error, warnings: [] };
  const resolvedLowEv = lowEv.value ?? 0;
  const resolvedHighEv = highEv.value ?? 0;
  const resolvedLowZone = lowZone.value ?? DEFAULT_BTZS_LOW_ZONE;
  const resolvedHighZone = highZone.value ?? DEFAULT_BTZS_HIGH_ZONE;

  const selectedFilters = input.filters ?? [];
  const filterStops = getFilterStops(selectedFilters, input.btzs_zone_metering.reading_through_selected_filters);
  const result = selectedProfile.type === "simple"
    ? (() => {
        const baseDevelopmentMinutes = parseDevelopmentTimeTextMinutes(selectedProfile.timeText);
        if (baseDevelopmentMinutes == null) {
          return {
            warnings: [],
            error: "Simple development profile time must be parseable as minutes or mm:ss for zone-system development adjustment.",
          };
        }
        const workingIso = input.film_stock?.iso != null && input.film_stock.iso > 0 ? input.film_stock.iso : DEFAULT_METER_ISO;
        return calculateSimpleZoneSystemExposure({
          lowEv: resolvedLowEv,
          highEv: resolvedHighEv,
          lowZone: resolvedLowZone,
          highZone: resolvedHighZone,
          paperEs: resolvedPaperEs,
          flareFactor: resolvedFlareFactor,
          meterIso: DEFAULT_METER_ISO,
          workingIso,
          baseDevelopmentMinutes,
          adjustmentCurve: {
            nMinusTwoPercent: selectedProfile.nMinusTwoPercent,
            nMinusOnePercent: selectedProfile.nMinusOnePercent,
            nPlusOnePercent: selectedProfile.nPlusOnePercent,
            nPlusTwoPercent: selectedProfile.nPlusTwoPercent,
          },
          compensationStops: resolvedCompensationStops,
          filterFactors: selectedFilters,
          readingThroughSelectedFilters: input.btzs_zone_metering.reading_through_selected_filters,
          precedence: input.btzs_zone_metering.precedence,
          aperture: input.aperture,
          shutterSeconds: input.shutter_speed,
          lensMinFStop: input.lens?.min_f_stop,
          lensMaxFStop: input.lens?.max_f_stop,
          reciprocityPFactor: input.film_stock?.reciprocity_p_factor,
        });
      })()
    : calculateBtzsExposure({
        lowEv: resolvedLowEv,
        highEv: resolvedHighEv,
        lowZone: resolvedLowZone,
        highZone: resolvedHighZone,
        paperEs: resolvedPaperEs,
        flareFactor: resolvedFlareFactor,
        meterIso: DEFAULT_METER_ISO,
        chartData: selectedProfile.chartData,
        compensationStops: resolvedCompensationStops,
        filterFactors: selectedFilters,
        readingThroughSelectedFilters: input.btzs_zone_metering.reading_through_selected_filters,
        precedence: input.btzs_zone_metering.precedence,
        aperture: input.aperture,
        shutterSeconds: input.shutter_speed,
        lensMinFStop: input.lens?.min_f_stop,
        lensMaxFStop: input.lens?.max_f_stop,
        reciprocityPFactor: input.film_stock?.reciprocity_p_factor,
      });

  if (result.error) {
    return {
      payload: {},
      error: result.error,
      warnings: result.warnings,
    };
  }

  if (!result.exposure) {
    const warning = result.warnings.find((message) => message.includes("outside the supported"));
    return {
      payload: {},
      error: warning ?? "Zone Metering could not resolve a final exposure for the selected profile.",
      warnings: result.warnings,
    };
  }

  const exposureChoices = resolveExposureChoiceDisplay(
    {
      aperture: result.exposure.aperture,
      finalShutterSeconds: result.exposure.finalShutterSeconds,
      warnings: result.warnings,
    },
    input.lens,
    input.shutter_source,
  );
  if (!exposureChoices?.finalFields) {
    return {
      payload: {},
      error: "Could not resolve the final BTZS exposure.",
      warnings: exposureChoices?.warnings ?? result.warnings,
    };
  }

  const warnings = [...new Set([...result.warnings, ...exposureChoices.warnings])];
  const holdSide = input.btzs_zone_metering.precedence;

  const payload = {
    ...exposureChoices.finalFields,
    exposure_entry_mode: "btzs-zone-metering",
    exposure_details: {
      btzsZoneMetering: {
        holdSide,
        profileId: selectedProfile.id,
        profileName: selectedProfile.name,
        profileType: selectedProfile.type,
        meterEV: resolvedLowEv,
        meterISO: DEFAULT_METER_ISO,
        workingISO: result.effectiveFilmSpeed ?? 0,
        lowEV: resolvedLowEv,
        lowZone: resolvedLowZone,
        highEV: resolvedHighEv,
        highZone: resolvedHighZone,
        evRange: resolvedHighEv - resolvedLowEv,
        zoneRange: resolvedHighZone - resolvedLowZone,
        sbr: result.sbr ?? 0,
        paperEs: resolvedPaperEs,
        flareFactor: resolvedFlareFactor,
        requiredG: result.requiredG ?? 0,
        effectiveFilmSpeed: result.effectiveFilmSpeed ?? 0,
        developmentTimeMinutes: result.developmentTimeMinutes ?? 0,
        developmentAdjustmentStops: "developmentAdjustmentStops" in result ? result.developmentAdjustmentStops ?? null : null,
        developmentTimeSource: selectedProfile.type === "simple" ? "simple-profile-adjustment" : "btzs-profile-chart",
        simpleDevelopmentBaseMinutes: selectedProfile.type === "simple" ? parseDevelopmentTimeTextMinutes(selectedProfile.timeText) : null,
        simpleDevelopmentPercent: "developmentPercent" in result ? result.developmentPercent ?? null : null,
        targetEVBeforeCompensation: (result.exposure.targetEV ?? 0) + resolvedCompensationStops,
        targetEVAfterCompensation: result.exposure.targetEV ?? 0,
        heldAperture: holdSide === "aperture" ? (input.aperture.trim() || null) : null,
        heldShutterSpeed: holdSide === "shutter" ? (input.shutter_speed.trim() || null) : null,
        calculatedAperture: result.exposure.idealAperture ?? null,
        calculatedShutterSeconds: result.exposure.idealShutterSeconds ?? null,
        apertureStopError: exposureChoices.apertureChoice?.stopError ?? null,
        shutterStopError: exposureChoices.shutterChoice?.stopError ?? null,
        idealAperture: result.exposure.idealAperture ?? null,
        idealShutterSeconds: result.exposure.idealShutterSeconds ?? null,
        aperture: exposureChoices.finalFields.aperture,
        shutterSpeed: exposureChoices.finalFields.shutter_speed,
        rawShutterSpeedSeconds: result.exposure.rawShutterSeconds ?? null,
        finalShutterSpeedSeconds: exposureChoices.finalFields.shutter_speed_seconds,
        apertureChoice: exposureChoices.apertureChoice,
        shutterChoice: exposureChoices.shutterChoice,
        shutterMode: exposureChoices.finalFields.shutter_mode,
        bulbDurationSeconds: exposureChoices.finalFields.bulb_duration_seconds,
        reciprocityApplied: Boolean(result.exposure.reciprocityApplied),
        warnings,
        precedence: holdSide,
        readingThroughSelectedFilters: input.btzs_zone_metering.reading_through_selected_filters,
        compensationStops: manualCompensationStops,
        bellowsCorrectionStops: bellowsCorrection.stops,
        bellowsCorrection: {
          mode: input.btzs_zone_metering.bellows_correction_mode,
          extensionMm: input.btzs_zone_metering.bellows_correction_mode === "measurement"
            ? parseDraftNumericValue(input.btzs_zone_metering.bellows_extension_mm)
            : null,
          subjectDistanceM: input.btzs_zone_metering.bellows_correction_mode === "distance"
            ? parseDraftNumericValue(input.btzs_zone_metering.bellows_subject_distance_m)
            : null,
          focalLengthMm: parseDraftNumericValue(input.focal_length_mm ?? ""),
          stops: bellowsCorrection.stops,
        },
        filterStops,
        filterIds: input.filter_ids,
        filterFactors: selectedFilters.map((filter) => filter.filter_factor),
      },
    },
  } as BuildPhotographExposureWritePayloadResult["payload"];

  return {
    payload,
    error: null,
    warnings,
  };
}

export function buildPhotographExposureWritePayload(
  input: BuildPhotographExposureWritePayloadInput,
): BuildPhotographExposureWritePayloadResult {
  const warnings: string[] = [];

  if (input.exposure_entry_mode === "manual") {
    const manual = buildPhotographExposurePayload({
      shutter_speed: input.shutter_speed,
      bulb_duration_seconds: input.bulb_duration_seconds,
    });

    if (manual.error) {
      return {
        payload: {},
        error: manual.error,
        warnings,
      };
    }

    const manualWarning = getManualReciprocityWarning(input.film_stock, {
      shutter_speed: input.shutter_speed,
      bulb_duration_seconds: input.bulb_duration_seconds,
    });
    if (manualWarning) warnings.push(manualWarning);

    return {
      payload: {
        ...manual.payload,
        aperture: input.aperture.trim() ? input.aperture.trim() : null,
        exposure_entry_mode: "manual",
        exposure_details: null,
      },
      error: null,
      warnings,
    };
  }

  if (input.exposure_entry_mode === "zone-metering" || input.exposure_entry_mode === "cell-camera") {
    return buildZoneMeteringWritePayload(input);
  }

  return buildBtzsZoneMeteringWritePayload(input);
}

export function buildPhotographExposurePayload(form: PhotographExposureDraft): PhotographExposurePayloadResult {
  const shutterSpeed = form.shutter_speed.trim();

  if (isBulbShutterValue(shutterSpeed)) {
    const bulbDuration = parseBulbDurationInput(form.bulb_duration_seconds);
    if (bulbDuration == null) {
      return {
        payload: {},
        error: "Bulb duration must be a positive number of seconds.",
      };
    }

    return {
      payload: {
        shutter_speed: SHUTTER_BULB_VALUE,
        shutter_speed_seconds: bulbDuration,
        shutter_mode: "bulb",
        bulb_duration_seconds: bulbDuration,
      },
      error: null,
    };
  }

  if (!shutterSpeed) {
    return {
      payload: {
        shutter_speed: null,
        shutter_speed_seconds: null,
        shutter_mode: "fixed",
        bulb_duration_seconds: null,
      },
      error: null,
    };
  }

  const shutterSpeedSeconds = parseShutterSpeedInput(shutterSpeed);
  if (shutterSpeedSeconds == null) {
    return {
      payload: {},
      error: "Shutter speed must be a valid time or bulb.",
    };
  }

  return {
    payload: {
      shutter_speed: shutterSpeed,
      shutter_speed_seconds: shutterSpeedSeconds,
      shutter_mode: "fixed",
      bulb_duration_seconds: null,
    },
    error: null,
  };
}

export function formatBulbTimerStatus(snapshot: BulbTimerSnapshot): BulbTimerStatus {
  if (snapshot.phase === "precount") {
    const remaining = snapshot.precountRemaining ?? BULB_TIMER_PRECOUNT_SECONDS;
    return {
      title: `${remaining}s`,
      detail: `Starting in ${remaining} second${remaining === 1 ? "" : "s"}.`,
    };
  }

  if (snapshot.phase === "exposing") {
    const remaining = snapshot.exposureRemainingSeconds ?? 0;
    const remainingText = formatCountdownSeconds(remaining);
    return {
      title: `${remainingText}s`,
      detail: "Stop to cancel.",
    };
  }

  if (snapshot.phase === "complete") {
    return {
      title: "Exposure complete",
      detail: "",
    };
  }

  if (snapshot.durationSeconds == null) {
    return {
      title: "Add duration",
      detail: "Enter seconds to enable the timer.",
    };
  }

  const durationLabel = formatBulbDurationLabel(snapshot.durationSeconds);
  return {
    title: durationLabel || "Set duration",
    detail: "Start gives you a 3 second countdown before the exposure.",
  };
}

export { parseApertureValueInput, snapApertureChoice, snapShutterChoice } from "./optics";
export * from "./photoExposureMath";
