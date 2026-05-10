import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  ApertureIncrement,
  Camera,
  Filter,
  FilterPreset,
  FilmHolder,
  FilmStock,
  FilmSpectralResponseKey,
  FilmStockType,
  Lens,
  Roll,
  FilmHolderWritePayload,
  RollFormat,
} from "../api/client";
import {
  FILM_STOCK_SPECTRAL_RESPONSE_OPTIONS,
  FILM_STOCK_TYPE_OPTIONS,
  type FilmStockPreset,
  formatFilmSpectralResponseLabel,
  formatFilmStockTypeLabel,
  normalizeFilmSpectralResponsePreset,
  supportsFilmSpectralResponse,
} from "../film-stocks";
import { getFilmSpectralResponsePreset } from "../filmSpectralResponse";
import { ROLL_FORMAT_OPTIONS, formatRollFormatLabel } from "../photoMedia";
import { COMMON_FRAME_FORMATS, SHEET_FRAME_FORMATS, getFrameFormatsForRollFormat, type FilmFrameFormat } from "../filmFormats";
import { formatDateTimeLocalInputValue } from "./photoFormUtils";
import {
  APERTURE_INCREMENT_OPTIONS,
  DEFAULT_APERTURE_MAX_F_STOP,
  DEFAULT_APERTURE_MIN_F_STOP,
  formatShutterSpeedValue,
  getStandardShutterChoiceOptions,
  isApertureIncrementAllowed,
  normalizeApertureIncrement,
  parseShutterSpeedInput,
  STANDARD_SHUTTER_SPEED_SECONDS,
} from "../optics";
import { getFilmStockTypeAvailabilityText } from "../film-stocks";
import { formatDateTimeDisplay } from "../dateTime";
import { FilterSimulationImage } from "../components/FilterSimulationImage";
import { PreviewResultLink } from "../components/PreviewResultLink";
import type { FilterSimulationSettings } from "../photoFilters";
import {
  getFilterSpectralCurve,
  getFilterSpectralCurveKey,
  type FilterSpectralCurve,
} from "../filterSpectralCurves";

export type CameraFilmChoice = "unspecified" | "sheet" | "roll";
export type LensType = "prime" | "zoom";

export type ShutterState = {
  hasShutter: boolean;
  minShutterSpeed: string;
  maxShutterSpeed: string;
  supportsBulb: boolean;
};

export type NamedItem = {
  id: string;
  name: string;
};

export type CameraDisplayNameSource = {
  name: string;
  maker?: string | null;
};

const isSafeNameBoundary = (character: string) => !/[\p{L}\p{N}]/u.test(character);

const hasSafePrefix = (value: string, prefix: string) => {
  const normalizedValue = value.toLowerCase();
  const normalizedPrefix = prefix.toLowerCase();
  if (!normalizedValue.startsWith(normalizedPrefix)) return false;
  if (normalizedValue.length === normalizedPrefix.length) return true;
  const nextCharacter = value.slice(prefix.length, prefix.length + 1);
  return nextCharacter === "" || isSafeNameBoundary(nextCharacter);
};

export const formatCameraDisplayName = ({ name, maker }: CameraDisplayNameSource) => {
  const trimmedName = name.trim();
  const trimmedMaker = maker?.trim() ?? "";
  if (!trimmedMaker) return trimmedName;
  if (!trimmedName) return trimmedMaker;
  if (hasSafePrefix(trimmedName, trimmedMaker)) return trimmedName;
  return `${trimmedMaker} ${trimmedName}`;
};

const SHUTTER_SPEED_FASTEST = formatShutterSpeedValue(STANDARD_SHUTTER_SPEED_SECONDS[0]);
const SHUTTER_SPEED_SLOWEST = formatShutterSpeedValue(
  STANDARD_SHUTTER_SPEED_SECONDS[STANDARD_SHUTTER_SPEED_SECONDS.length - 1],
);

const normalizeLensIds = (ids?: string[] | null) => ids ?? [];

const normalizeSelectedIds = (selectedIds: string[], items: NamedItem[]) => {
  if (items.length === 0 || selectedIds.length !== items.length) {
    return selectedIds;
  }

  const selected = new Set(selectedIds);
  return items.every((item) => selected.has(item.id)) ? [] : selectedIds;
};

const parseNumeric = (value: string) => {
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
};

const toNumericOrUndefined = (value: string) => {
  const n = parseNumeric(value);
  return n == null ? undefined : n;
};

const parsePositiveNumberInput = (value: string) => {
  const n = parseNumeric(value);
  if (n == null || n <= 0) return null;
  return n;
};

const formatText = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(Number.parseFloat(value.toFixed(3)));
};

export const createDisabledShutterState = (): ShutterState => ({
  hasShutter: false,
  minShutterSpeed: "",
  maxShutterSpeed: "",
  supportsBulb: false,
});

export const createEnabledShutterState = (
  minShutterSpeed?: number | null,
  maxShutterSpeed?: number | null,
  supportsBulb = false,
): ShutterState => ({
  hasShutter: true,
  minShutterSpeed: minShutterSpeed != null ? formatShutterSpeedValue(minShutterSpeed) : SHUTTER_SPEED_FASTEST,
  maxShutterSpeed: maxShutterSpeed != null ? formatShutterSpeedValue(maxShutterSpeed) : SHUTTER_SPEED_SLOWEST,
  supportsBulb,
});

export const getShutterStateFromCamera = (camera?: Camera | null): ShutterState => (
  camera?.has_shutter
    ? createEnabledShutterState(
      camera.min_shutter_speed_seconds,
      camera.max_shutter_speed_seconds,
      camera.supports_bulb,
    )
    : createDisabledShutterState()
);

export const getShutterStateFromLens = (lens?: Lens | null): ShutterState => (
  lens?.has_shutter
    ? createEnabledShutterState(
      lens.min_shutter_speed_seconds,
      lens.max_shutter_speed_seconds,
      lens.supports_bulb,
    )
    : createDisabledShutterState()
);

export const validateShutterRange = (state: ShutterState) => {
  if (!state.hasShutter) return null;
  const hasMin = state.minShutterSpeed.trim() !== "";
  const hasMax = state.maxShutterSpeed.trim() !== "";
  if (!hasMin || !hasMax) return "Provide both min and max shutter speeds.";
  const parsedMin = parseShutterSpeedInput(state.minShutterSpeed);
  const parsedMax = parseShutterSpeedInput(state.maxShutterSpeed);
  if (parsedMin == null) return "Invalid minimum shutter speed.";
  if (parsedMax == null) return "Invalid maximum shutter speed.";
  if (parsedMax < parsedMin) return "Max shutter speed must be greater than or equal to min shutter speed.";
  return null;
};

export const getShutterPayload = (state: ShutterState) => {
  if (!state.hasShutter) {
    return {
      has_shutter: false,
      min_shutter_speed_seconds: null,
      max_shutter_speed_seconds: null,
      supports_bulb: false,
    };
  }

  return {
    has_shutter: true,
    min_shutter_speed_seconds: parseShutterSpeedInput(state.minShutterSpeed),
    max_shutter_speed_seconds: parseShutterSpeedInput(state.maxShutterSpeed),
    supports_bulb: state.supportsBulb,
  };
};

export const formatCameraFilmType = (filmType: Camera["film_type"]) => {
  if (filmType === "sheet") return "Sheet film";
  if (filmType === "roll") return "Roll film";
  return "Film unspecified";
};

const getCameraPayloadFilmType = (value: CameraFilmChoice) => (value === "unspecified" ? null : value);

export const getCameraMetaText = (camera: Camera) => {
  const parts = [camera.maker];
  parts.push(formatCameraFilmType(camera.film_type));
  return parts.filter((value) => Boolean(value)).join(" · ");
};

export const getCameraCompatibilityText = (camera: Pick<Camera, "acceptable_lens_ids">) => {
  if (!Object.prototype.hasOwnProperty.call(camera, "acceptable_lens_ids")) {
    return null;
  }

  const ids = normalizeLensIds(camera.acceptable_lens_ids);
  if (ids.length === 0) {
    return "Compatible with all lenses";
  }

  return `Compatible with ${ids.length} lens${ids.length === 1 ? "" : "es"}`;
};

export const getCameraLensApplicabilityText = (
  camera: Pick<Camera, "acceptable_lens_ids">,
  lensNameById: ReadonlyMap<string, string>,
) => {
  if (!Object.prototype.hasOwnProperty.call(camera, "acceptable_lens_ids")) {
    return null;
  }

  const ids = normalizeLensIds(camera.acceptable_lens_ids);
  if (ids.length === 0) {
    return "Lenses: all";
  }

  const names = ids
    .map((id) => lensNameById.get(id))
    .filter((name): name is string => Boolean(name));
  const unavailableCount = ids.length - names.length;

  if (names.length === 0) {
    return `Lenses: ${ids.length} selected (unavailable)`;
  }

  if (unavailableCount === 0) {
    return `Lenses: ${names.join(", ")}`;
  }

  return `Lenses: ${names.join(", ")} (+ ${unavailableCount} unavailable)`;
};

const getApplicableLensesMetaText = (
  itemIds: string[] | undefined,
  nameById: Map<string, string>,
  labels: { all: string; prefix: string },
) => {
  const ids = normalizeLensIds(itemIds);
  const names = ids
    .map((id) => nameById.get(id))
    .filter((name): name is string => Boolean(name));
  if (ids.length === 0) return labels.all;
  if (names.length === 0) return `${labels.prefix} ${ids.length} selected item${ids.length === 1 ? "" : "s"}`;
  if (names.length === ids.length) return `${labels.prefix} ${names.join(", ")}`;
  return `${labels.prefix} ${names.join(", ")} (+ unavailable)`;
};

export const getLensCameraMetaText = (lens: Lens, cameraNameById: Map<string, string>) => {
  return getApplicableLensesMetaText(lens.applicable_camera_ids, cameraNameById, {
    all: "Applies to all cameras",
    prefix: "Applies to",
  });
};

export const getFilterLensMetaText = (filter: Filter, lensNameById: Map<string, string>) => {
  return getApplicableLensesMetaText(filter.applicable_lens_ids, lensNameById, {
    all: "All lenses",
    prefix: "Applies to",
  });
};

export const getShutterCapabilityText = (
  hasShutter: boolean,
  minShutterSpeedSeconds: number | null,
  maxShutterSpeedSeconds: number | null,
  supportsBulb: boolean,
) => {
  const min = minShutterSpeedSeconds != null ? formatShutterSpeedValue(minShutterSpeedSeconds) : "";
  const max = maxShutterSpeedSeconds != null ? formatShutterSpeedValue(maxShutterSpeedSeconds) : "";
  const values = [min, max].filter((value) => Boolean(value));
  const chunks: string[] = [];
  if (values.length === 2) {
    chunks.push(min === max ? `Shutter ${min}` : `Shutter ${min} – ${max}`);
  } else if (values.length === 1) {
    chunks.push(`Shutter ${values[0]}`);
  }
  if (supportsBulb) {
    chunks.push("Bulb");
  }
  if (!hasShutter && chunks.length === 0) {
    return "";
  }
  if (hasShutter && chunks.length === 0) {
    return "Shutter";
  }
  return chunks.join(" · ");
};

export const formatFilterFactor = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "";
  const normalized = Number.parseFloat(value.toFixed(12));
  return Number.isInteger(normalized) ? String(normalized) : String(normalized);
};

export const parseFilterFactorInput = (value: string) => {
  return parsePositiveNumberInput(value);
};

export const parseReciprocityPFactorInput = (value: string) => {
  return parsePositiveNumberInput(value);
};

export const getFilterPresetLabel = (preset: FilterPreset) => {
  const code = preset.code ? ` (${preset.code})` : "";
  return `${preset.name}${code} · ${formatFilterFactor(preset.filter_factor)}`;
};

export const getFilmStockPresetLabel = (preset: FilmStockPreset) => {
  const stockType = formatFilmStockTypeLabel(preset.stock_type);
  return `${preset.brand} ${preset.name} · ISO ${preset.iso} · ${stockType}`;
};

export const formatFocalLength = (value: number | null | undefined) => formatText(value);

export const validateFocalLengthRange = (localMin: string, localMax: string, type: LensType) => {
  const hasMin = localMin.trim() !== "";
  const hasMax = localMax.trim() !== "";
  if (!hasMin) return "Provide focal length.";
  const min = parseNumeric(localMin);
  if (min == null) return "Invalid focal length value.";
  if (min <= 0) return "Focal length values must be greater than zero.";
  if (type === "zoom") {
    if (!hasMax) return "Provide both min and max focal lengths.";
    const max = parseNumeric(localMax);
    if (max == null) return "Invalid focal length value.";
    if (max <= 0) return "Focal length values must be greater than zero.";
    if (max < min) return "Max focal length must be greater than or equal to min focal length.";
  }
  return null;
};

export const getFocalRangePayload = (type: LensType, localMin: string, localMax: string) => {
  const min = parseNumeric(localMin);
  if (min == null) return null;
  if (type === "prime") return { minFocalLength: min, maxFocalLength: min };
  const max = parseNumeric(localMax);
  if (max == null) return null;
  return { minFocalLength: min, maxFocalLength: max };
};

export const validateApertureRange = (localMin: string, localMax: string, localIncrement: string) => {
  const hasMin = localMin.trim() !== "";
  const hasMax = localMax.trim() !== "";
  if (!hasMin && !hasMax) return null;
  if (!hasMin || !hasMax) return "Provide both min and max aperture values.";
  const minVal = parseNumeric(localMin);
  const maxVal = parseNumeric(localMax);
  if (minVal == null || maxVal == null) return "Invalid aperture value.";
  if (minVal <= 0 || maxVal <= 0) return "Aperture values must be greater than zero.";
  if (maxVal < minVal) return "Max aperture must be greater than or equal to min aperture.";
  if (!isApertureIncrementAllowed(localIncrement)) return "Aperture increment must be full, half, or third stop.";
  return null;
};

export const formatApertureFStop = (value: number | null | undefined, fallback: number | null | undefined) => {
  const normalized = value == null ? fallback : value;
  return normalized == null ? "" : `f/${normalized}`;
};

export interface CameraFormDraft {
  name: string;
  maker: string;
  filmType: CameraFilmChoice;
  rollFormat: RollFormat | "";
  frameFormatKey: string;
  hasBellows: boolean;
  shutter: ShutterState;
}

export const createEmptyCameraDraft = (): CameraFormDraft => ({
  name: "",
  maker: "",
  filmType: "unspecified",
  rollFormat: "",
  frameFormatKey: "",
  hasBellows: false,
  shutter: createDisabledShutterState(),
});

const findFrameFormatByDimensions = (
  widthMm: number | null | undefined,
  heightMm: number | null | undefined,
) => COMMON_FRAME_FORMATS.find(format => format.widthMm === widthMm && format.heightMm === heightMm) ?? null;

const frameDraftFromFormat = (format: FilmFrameFormat | null) => ({
  frameFormatKey: format?.key ?? "",
});

export const cameraDraftFromCamera = (camera: Camera): CameraFormDraft => ({
  name: camera.name,
  maker: camera.maker ?? "",
  filmType: camera.film_type === "sheet" ? "sheet" : camera.film_type === "roll" ? "roll" : "unspecified",
  rollFormat: camera.roll_format ?? "",
  ...frameDraftFromFormat(findFrameFormatByDimensions(camera.frame_width_mm, camera.frame_height_mm) ?? (
    camera.frame_width_mm && camera.frame_height_mm
      ? {
          key: "custom",
          label: camera.frame_format ?? "Custom frame",
          widthMm: camera.frame_width_mm,
          heightMm: camera.frame_height_mm,
        }
      : null
  )),
  hasBellows: Boolean(camera.has_bellows),
  shutter: getShutterStateFromCamera(camera),
});

export const buildCameraPayload = (draft: CameraFormDraft) => {
  const resolvedRollFormat: RollFormat | "" = draft.filmType === "roll" ? draft.rollFormat || "35mm" : "";
  const payloadRollFormat: RollFormat | null = draft.filmType === "roll" ? (resolvedRollFormat || "35mm") : null;
  const frameFormat = draft.filmType === "roll"
    ? getFrameFormatsForRollFormat(resolvedRollFormat).find(format => format.key === draft.frameFormatKey) ?? getFrameFormatsForRollFormat(resolvedRollFormat)[0] ?? null
    : draft.filmType === "sheet"
      ? Object.values(SHEET_FRAME_FORMATS).find(format => format.key === draft.frameFormatKey) ?? SHEET_FRAME_FORMATS["4x5"] ?? null
    : null;
  return {
    name: draft.name.trim(),
    maker: draft.maker.trim() || undefined,
    film_type: getCameraPayloadFilmType(draft.filmType),
    roll_format: payloadRollFormat,
    frame_format: frameFormat?.label ?? null,
    frame_width_mm: frameFormat?.widthMm ?? null,
    frame_height_mm: frameFormat?.heightMm ?? null,
    has_bellows: draft.hasBellows,
    ...getShutterPayload(draft.shutter),
  };
};

export interface LensFormDraft {
  name: string;
  lensType: LensType;
  minFocalLength: string;
  maxFocalLength: string;
  minFStop: string;
  maxFStop: string;
  apertureIncrement: ApertureIncrement;
  flareFactor: string;
  applicableCameraIds: string[];
  shutter: ShutterState;
}

export const createEmptyLensDraft = (): LensFormDraft => ({
  name: "",
  lensType: "prime",
  minFocalLength: "",
  maxFocalLength: "",
  minFStop: String(DEFAULT_APERTURE_MIN_F_STOP),
  maxFStop: String(DEFAULT_APERTURE_MAX_F_STOP),
  apertureIncrement: "full",
  flareFactor: "0.02",
  applicableCameraIds: [],
  shutter: createDisabledShutterState(),
});

export const lensDraftFromLens = (lens: Lens): LensFormDraft => {
  const minFocal = lens.min_focal_length_mm ?? lens.focal_length_mm;
  const maxFocal = lens.max_focal_length_mm ?? lens.focal_length_mm;
  return {
    name: lens.name,
    lensType: minFocal != null && maxFocal != null && minFocal === maxFocal ? "prime" : "zoom",
    minFocalLength: formatFocalLength(minFocal),
    maxFocalLength: formatFocalLength(maxFocal),
    minFStop: lens.min_f_stop != null ? String(lens.min_f_stop) : String(DEFAULT_APERTURE_MIN_F_STOP),
    maxFStop: lens.max_f_stop != null ? String(lens.max_f_stop) : String(DEFAULT_APERTURE_MAX_F_STOP),
    apertureIncrement: normalizeApertureIncrement(lens.aperture_increment),
    flareFactor: lens.flare_factor != null ? String(lens.flare_factor) : "0.02",
    applicableCameraIds: normalizeLensIds(lens.applicable_camera_ids),
    shutter: getShutterStateFromLens(lens),
  };
};

export const buildLensPayload = (draft: LensFormDraft, cameras: NamedItem[]) => {
  const focalPayload = getFocalRangePayload(draft.lensType, draft.minFocalLength, draft.maxFocalLength);
  if (!focalPayload) {
    throw new Error("Invalid focal length values.");
  }

  return {
    name: draft.name.trim(),
    min_focal_length_mm: focalPayload.minFocalLength,
    max_focal_length_mm: focalPayload.maxFocalLength,
    min_f_stop: toNumericOrUndefined(draft.minFStop),
    max_f_stop: toNumericOrUndefined(draft.maxFStop),
    aperture_increment: draft.apertureIncrement,
    flare_factor: toNumericOrUndefined(draft.flareFactor) ?? 0.02,
    ...getShutterPayload(draft.shutter),
    applicable_camera_ids: normalizeSelectedIds(draft.applicableCameraIds, cameras),
  };
};

export interface FilterFormDraft {
  name: string;
  code: string;
  filterFactor: string;
  standardKey: string;
  notes: string;
  appliesToBw: boolean;
  appliesToColor: boolean;
  appliesToInfrared: boolean;
  applicableLensIds: string[];
}

export const createEmptyFilterDraft = (): FilterFormDraft => ({
  name: "",
  code: "",
  filterFactor: "",
  standardKey: "",
  notes: "",
  appliesToBw: true,
  appliesToColor: true,
  appliesToInfrared: true,
  applicableLensIds: [],
});

export const filterDraftFromFilter = (filter: Filter): FilterFormDraft => ({
  name: filter.name,
  code: filter.code ?? "",
  filterFactor: formatFilterFactor(filter.filter_factor),
  standardKey: filter.standard_key ?? "",
  notes: filter.notes ?? "",
  appliesToBw: filter.applies_to_bw !== false,
  appliesToColor: filter.applies_to_color !== false,
  appliesToInfrared: filter.applies_to_infrared !== false,
  applicableLensIds: normalizeLensIds(filter.applicable_lens_ids),
});

export const applyFilterPreset = (draft: FilterFormDraft, preset: FilterPreset | null | undefined): FilterFormDraft => {
  if (!preset) {
    return {
      ...draft,
      name: "",
      code: "",
      filterFactor: "",
    };
  }

  return {
    ...draft,
    name: preset.name,
    code: preset.code ?? "",
    filterFactor: formatFilterFactor(preset.filter_factor),
  };
};

export const buildFilterCreatePayload = (draft: FilterFormDraft, lenses: NamedItem[]) => ({
  name: draft.name.trim(),
  filter_factor: parseFilterFactorInput(draft.filterFactor) ?? undefined,
  code: draft.code.trim() || null,
  standard_key: draft.standardKey || null,
  notes: draft.notes.trim() || null,
  applies_to_bw: draft.appliesToBw,
  applies_to_color: draft.appliesToColor,
  applies_to_infrared: draft.appliesToInfrared,
  applicable_lens_ids: normalizeSelectedIds(draft.applicableLensIds, lenses),
});

export const buildFilterUpdatePayload = (draft: FilterFormDraft, lenses: NamedItem[]) => ({
  name: draft.name.trim(),
  filter_factor: parseFilterFactorInput(draft.filterFactor) ?? undefined,
  code: draft.code.trim() || null,
  notes: draft.notes.trim() || null,
  applies_to_bw: draft.appliesToBw,
  applies_to_color: draft.appliesToColor,
  applies_to_infrared: draft.appliesToInfrared,
  applicable_lens_ids: normalizeSelectedIds(draft.applicableLensIds, lenses),
});

export interface FilmStockFormDraft {
  presetKey: string;
  name: string;
  stockType: FilmStockType;
  iso: string;
  process: string;
  reciprocityPFactor: string;
  simulateSpectralResponse: boolean;
  spectralResponsePreset: FilmSpectralResponseKey;
}

export const createEmptyFilmStockDraft = (): FilmStockFormDraft => ({
  presetKey: "",
  name: "",
  stockType: "other",
  iso: "",
  process: "",
  reciprocityPFactor: "1",
  simulateSpectralResponse: false,
  spectralResponsePreset: "generic_panchromatic",
});

export const filmStockDraftFromFilmStock = (filmStock: FilmStock): FilmStockFormDraft => ({
  presetKey: "",
  name: filmStock.name,
  stockType: filmStock.stock_type,
  iso: filmStock.iso != null ? String(filmStock.iso) : "",
  process: filmStock.process ?? "",
  reciprocityPFactor: filmStock.reciprocity_p_factor == null ? "1" : String(filmStock.reciprocity_p_factor),
  simulateSpectralResponse: filmStock.simulate_spectral_response === true,
  spectralResponsePreset: normalizeFilmSpectralResponsePreset(filmStock.spectral_response_preset),
});

export const applyFilmStockPreset = (
  draft: FilmStockFormDraft,
  preset: FilmStockPreset | null | undefined,
): FilmStockFormDraft => {
  if (!preset) {
    return {
      ...draft,
      presetKey: "",
      name: "",
      stockType: "other",
      iso: "",
      process: "",
      reciprocityPFactor: "1",
      simulateSpectralResponse: false,
      spectralResponsePreset: "generic_panchromatic",
    };
  }

  return {
    ...draft,
    presetKey: preset.key,
    name: `${preset.brand} ${preset.name}`,
    stockType: preset.stock_type,
    iso: String(preset.iso),
    process: preset.process,
    reciprocityPFactor: formatFilterFactor(preset.reciprocity_p_factor),
    simulateSpectralResponse: preset.simulate_spectral_response,
    spectralResponsePreset: preset.spectral_response_preset,
  };
};

export const formatRollStatusLabel = (status: Roll["status"]) => {
  if (status === "exposing") return "Exposing";
  if (status === "finished") return "Finished";
  if (status === "processed" || status === "developed") return "Processed";
  return "Unexposed";
};

export const formatRollPushPullLabel = (stops: number) => {
  if (stops === 0) return "Normal";
  return stops > 0 ? `Push +${stops}` : `Pull ${Math.abs(stops)}`;
};

export const getRollStatusClassName = (status: Roll["status"]) => {
  if (status === "exposing") return "active";
  if (status === "finished") return "warn";
  if (status === "processed" || status === "developed") return "done";
  return "idle";
};

export const formatRollLifecycleText = (
  roll: Pick<Roll, "loaded_at" | "finished_at" | "processed_at" | "developed_at">,
  timeZone?: string | null,
) => {
  const parts: string[] = [];
  if (roll.loaded_at) {
    const loadedText = formatDateTimeDisplay(roll.loaded_at, timeZone);
    parts.push(loadedText ? `Loaded ${loadedText}` : "Loaded");
  } else if (!roll.finished_at && !roll.processed_at && !roll.developed_at) {
    parts.push("Not loaded");
  }
  if (roll.finished_at) {
    const finishedText = formatDateTimeDisplay(roll.finished_at, timeZone);
    parts.push(finishedText ? `Finished ${finishedText}` : "Finished");
  }
  const processedAt = roll.processed_at ?? roll.developed_at;
  if (processedAt) {
    const processedText = formatDateTimeDisplay(processedAt, timeZone);
    parts.push(processedText ? `Processed ${processedText}` : "Processed");
  }
  return parts.join(" · ");
};

export const formatRollSelectLabel = (roll: Pick<Roll, "name" | "status" | "push_pull_stops" | "roll_format">) => {
  const parts = [roll.name, formatRollStatusLabel(roll.status)];
  if (roll.push_pull_stops !== 0) {
    parts.push(formatRollPushPullLabel(roll.push_pull_stops));
  }
  parts.push(formatRollFormatLabel(roll.roll_format));
  return parts.join(" · ");
};

export const buildFilmStockPayload = (draft: FilmStockFormDraft) => ({
  name: draft.name.trim(),
  stock_type: draft.stockType,
  iso: draft.iso ? parseInt(draft.iso, 10) : undefined,
  process: draft.process.trim() || undefined,
  reciprocity_p_factor: parseReciprocityPFactorInput(draft.reciprocityPFactor) ?? undefined,
  simulate_spectral_response: supportsFilmSpectralResponse(draft.stockType) ? draft.simulateSpectralResponse : false,
  spectral_response_preset: supportsFilmSpectralResponse(draft.stockType) ? draft.spectralResponsePreset : null,
});

export interface RollFormDraft {
  name: string;
  filmId: string;
  loadedAt: string;
  finishedAt: string;
  processedAt: string;
  developmentProfileId: string;
  developmentNotes: string;
  pushPullStops: number;
}

export const createEmptyRollDraft = (): RollFormDraft => ({
  name: "",
  filmId: "",
  loadedAt: "",
  finishedAt: "",
  processedAt: "",
  developmentProfileId: "",
  developmentNotes: "",
  pushPullStops: 0,
});

export const rollDraftFromRoll = (roll: Roll): RollFormDraft => {
  const processedAt = roll.processed_at ?? roll.developed_at;

  return {
    name: roll.name,
    filmId: roll.film_id ?? "",
    loadedAt: roll.loaded_at ? formatDateTimeLocalInputValue(roll.loaded_at) : "",
    finishedAt: roll.finished_at ? formatDateTimeLocalInputValue(roll.finished_at) : "",
    processedAt: processedAt ? formatDateTimeLocalInputValue(processedAt) : "",
    developmentProfileId: roll.development_profile_id ?? "",
    developmentNotes: roll.development_notes ?? "",
    pushPullStops: roll.push_pull_stops ?? 0,
  };
};

export const buildRollPayload = (draft: RollFormDraft) => ({
  name: draft.name.trim(),
  film_id: draft.filmId || null,
  loaded_at: draft.loadedAt ? new Date(draft.loadedAt).toISOString() : null,
  finished_at: draft.finishedAt ? new Date(draft.finishedAt).toISOString() : null,
  processed_at: draft.processedAt ? new Date(draft.processedAt).toISOString() : null,
  developed_at: draft.processedAt ? new Date(draft.processedAt).toISOString() : null,
  development_profile_id: draft.developmentProfileId.trim() || null,
  development_notes: draft.developmentNotes.trim() || null,
  push_pull_stops: draft.pushPullStops,
});

export interface FilmHolderFormDraft {
  name: string;
  type: string;
  frameFormatKey: string;
  widthMm: string;
  heightMm: string;
}

export const createEmptyFilmHolderDraft = (): FilmHolderFormDraft => ({
  name: "",
  type: "",
  frameFormatKey: "",
  widthMm: "",
  heightMm: "",
});

export const filmHolderDraftFromFilmHolder = (filmHolder: FilmHolder): FilmHolderFormDraft => ({
  name: filmHolder.name,
  type: filmHolder.type ?? "",
  frameFormatKey: findFrameFormatByDimensions(filmHolder.width_mm, filmHolder.height_mm)?.key ?? "",
  widthMm: formatText(filmHolder.width_mm),
  heightMm: formatText(filmHolder.height_mm),
});

export const buildFilmHolderPayload = (draft: FilmHolderFormDraft): FilmHolderWritePayload & { name: string } => ({
  name: draft.name.trim(),
  type: draft.type.trim() || undefined,
  width_mm: parsePositiveNumberInput(draft.widthMm) ?? null,
  height_mm: parsePositiveNumberInput(draft.heightMm) ?? null,
});

export type ShutterFieldsProps = {
  label: string;
  prefix: string;
  state: ShutterState;
  secondaryToggle?: {
    id: string;
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
  };
  onToggle: (next: boolean) => void;
  onMinChange: (next: string) => void;
  onMaxChange: (next: string) => void;
  onSupportsBulbChange: (next: boolean) => void;
};

export function ShutterFields({
  label,
  prefix,
  state,
  secondaryToggle,
  onToggle,
  onMinChange,
  onMaxChange,
  onSupportsBulbChange,
}: ShutterFieldsProps) {
  const minChoices = useMemo(() => getStandardShutterChoiceOptions(state.minShutterSpeed), [state.minShutterSpeed]);
  const maxChoices = useMemo(() => getStandardShutterChoiceOptions(state.maxShutterSpeed), [state.maxShutterSpeed]);

  return (
    <div className="gear-shutter-group">
      <label className="gear-shutter-toggle" htmlFor={`${prefix}-has-shutter`}>
        <span>{label}</span>
        <input
          id={`${prefix}-has-shutter`}
          type="checkbox"
          checked={state.hasShutter}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </label>
      {secondaryToggle && (
        <label className="gear-shutter-toggle" htmlFor={secondaryToggle.id}>
          <span>{secondaryToggle.label}</span>
          <input
            id={secondaryToggle.id}
            type="checkbox"
            checked={secondaryToggle.checked}
            onChange={(e) => secondaryToggle.onChange(e.target.checked)}
          />
        </label>
      )}
      <fieldset className="gear-shutter-fieldset" disabled={!state.hasShutter}>
        <legend>Shutter</legend>
        <div className="lens-form-grid gear-shutter-grid">
          <label className="field" htmlFor={`${prefix}-min-shutter-speed`}>
            <span>Min shutter</span>
            <select
              id={`${prefix}-min-shutter-speed`}
              value={state.minShutterSpeed}
              onChange={(e) => onMinChange(e.target.value)}
            >
              <option value="">Select speed</option>
              {minChoices.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor={`${prefix}-max-shutter-speed`}>
            <span>Max shutter</span>
            <select
              id={`${prefix}-max-shutter-speed`}
              value={state.maxShutterSpeed}
              onChange={(e) => onMaxChange(e.target.value)}
            >
              <option value="">Select speed</option>
              {maxChoices.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="gear-shutter-option lens-form-field--stretch" htmlFor={`${prefix}-supports-bulb`}>
            <input
              id={`${prefix}-supports-bulb`}
              type="checkbox"
              checked={state.supportsBulb}
              onChange={(e) => onSupportsBulbChange(e.target.checked)}
            />
            <span>Supports bulb</span>
          </label>
        </div>
      </fieldset>
    </div>
  );
}

export type LensApplicabilityListProps = {
  allLabelText: string;
  allLabelId: string;
  labelText: string;
  selectedIds: string[];
  items: NamedItem[];
  onChange: (next: string[]) => void;
};

export function LensApplicabilityList({
  allLabelText,
  allLabelId,
  labelText,
  selectedIds,
  items,
  onChange,
}: LensApplicabilityListProps) {
  const acceptsAllLenses = selectedIds.length === 0;

  const handleAllToggle = (checked: boolean) => {
    onChange(checked ? [] : items.map((item) => item.id));
  };

  const handleLensToggle = (lensId: string, enabled: boolean) => {
    if (enabled) {
      onChange([...(selectedIds.includes(lensId) ? selectedIds : [...selectedIds, lensId])]);
    } else {
      const next = selectedIds.filter(id => id !== lensId);
      onChange(next);
    }
  };

  return (
    <div className="field lens-checklist-wrap">
      <span className="lens-checklist-label">{labelText}</span>
      <div className="lens-checklist" role="group" aria-labelledby={allLabelId}>
        <label className="lens-checklist-item">
          <input
            type="checkbox"
            id={allLabelId}
            checked={acceptsAllLenses}
            onChange={(event) => handleAllToggle(event.target.checked)}
          />
          <span>{allLabelText}</span>
        </label>
        {items.map(item => {
          const checked = selectedIds.includes(item.id);
          return (
            <label key={item.id} className="lens-checklist-item">
              <input
                type="checkbox"
                checked={checked}
                disabled={acceptsAllLenses}
                onChange={e => handleLensToggle(item.id, e.target.checked)}
              />
              <span>{formatCameraDisplayName(item)}</span>
            </label>
          );
        })}
        {items.length === 0 && <span className="muted">No items configured.</span>}
      </div>
    </div>
  );
}

export type CameraFormFieldsProps = {
  draft: CameraFormDraft;
  onChange: (next: CameraFormDraft) => void;
};

const HOLDER_FRAME_FORMATS = Object.values(SHEET_FRAME_FORMATS);
const CAMERA_SHEET_FRAME_FORMATS = Object.values(SHEET_FRAME_FORMATS);

function ensureCameraRollFrame(draft: CameraFormDraft, rollFormat: RollFormat | ""): CameraFormDraft {
  const frameFormats = getFrameFormatsForRollFormat(rollFormat);
  const currentFrameIsValid = frameFormats.some(format => format.key === draft.frameFormatKey);
  return {
    ...draft,
    rollFormat,
    frameFormatKey: currentFrameIsValid ? draft.frameFormatKey : frameFormats[0]?.key ?? "",
  };
}

function ensureCameraSheetFrame(draft: CameraFormDraft): CameraFormDraft {
  const currentFrameIsValid = CAMERA_SHEET_FRAME_FORMATS.some(format => format.key === draft.frameFormatKey);
  return {
    ...draft,
    rollFormat: "",
    frameFormatKey: currentFrameIsValid ? draft.frameFormatKey : SHEET_FRAME_FORMATS["4x5"]?.key ?? CAMERA_SHEET_FRAME_FORMATS[0]?.key ?? "",
  };
}

function applyFilmHolderFrameFormat(draft: FilmHolderFormDraft, formatKey: string): FilmHolderFormDraft {
  const format = HOLDER_FRAME_FORMATS.find(item => item.key === formatKey) ?? null;
  return {
    ...draft,
    frameFormatKey: format?.key ?? "",
    type: format?.key ?? draft.type,
    widthMm: format ? formatText(format.widthMm) : draft.widthMm,
    heightMm: format ? formatText(format.heightMm) : draft.heightMm,
  };
}

export function CameraFormFields({ draft, onChange }: CameraFormFieldsProps) {
  return (
    <>
      <input
        id="camera-name"
        placeholder="Name"
        value={draft.name}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
        required
      />
      <input
        id="camera-maker"
        placeholder="Maker (optional)"
        value={draft.maker}
        onChange={(event) => onChange({ ...draft, maker: event.target.value })}
      />
      <select
        id="camera-film-type"
        value={draft.filmType}
        onChange={(event) => {
          const next = event.target.value as CameraFilmChoice;
          const nextDraft = next === "roll"
            ? ensureCameraRollFrame(draft, draft.rollFormat || "35mm")
            : next === "sheet"
              ? ensureCameraSheetFrame(draft)
              : { ...draft, rollFormat: "" as const, frameFormatKey: "" };
          onChange({
            ...nextDraft,
            filmType: next,
            shutter: next === "roll"
              ? (draft.shutter.hasShutter ? draft.shutter : createEnabledShutterState())
              : createDisabledShutterState(),
          });
        }}
      >
        <option value="unspecified">Unspecified film</option>
        <option value="sheet">Sheet film</option>
        <option value="roll">Roll film</option>
      </select>
      {draft.filmType === "roll" && (
        <div className="lens-form-group">
          <span className="lens-form-group-title">Roll / frame size</span>
          <div className="lens-form-grid">
            <label className="field" htmlFor="camera-roll-format">
              <span>Roll film size</span>
              <select
                id="camera-roll-format"
                value={draft.rollFormat || "35mm"}
                onChange={(event) => onChange(ensureCameraRollFrame(draft, event.target.value as RollFormat | ""))}
              >
                {ROLL_FORMAT_OPTIONS.map((format) => (
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="camera-frame-format">
              <span>Frame</span>
              <select
                id="camera-frame-format"
                value={draft.frameFormatKey || (getFrameFormatsForRollFormat(draft.rollFormat || "35mm")[0]?.key ?? "")}
                onChange={(event) => onChange({ ...draft, frameFormatKey: event.target.value })}
              >
                {getFrameFormatsForRollFormat(draft.rollFormat || "35mm").map((format) => (
                  <option key={format.key} value={format.key}>
                    {format.label} ({formatText(format.widthMm)} x {formatText(format.heightMm)}mm)
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
      {draft.filmType === "sheet" && (
        <div className="lens-form-group">
          <span className="lens-form-group-title">Sheet size</span>
          <div className="lens-form-grid">
            <label className="field" htmlFor="camera-sheet-frame-format">
              <span>Film size</span>
              <select
                id="camera-sheet-frame-format"
                value={draft.frameFormatKey || (SHEET_FRAME_FORMATS["4x5"]?.key ?? "")}
                onChange={(event) => onChange({ ...draft, frameFormatKey: event.target.value, rollFormat: "" })}
              >
                {CAMERA_SHEET_FRAME_FORMATS.map((format) => (
                  <option key={format.key} value={format.key}>
                    {format.label} ({formatText(format.widthMm)} x {formatText(format.heightMm)}mm)
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
      <ShutterFields
        label="Camera has shutter"
        prefix="camera"
        state={draft.shutter}
        secondaryToggle={{
          id: "camera-has-bellows",
          label: "Has bellows",
          checked: draft.hasBellows,
          onChange: (next) => onChange({ ...draft, hasBellows: next }),
        }}
        onToggle={(next) => onChange({ ...draft, shutter: next ? createEnabledShutterState() : createDisabledShutterState() })}
        onMinChange={(next) => onChange({ ...draft, shutter: { ...draft.shutter, minShutterSpeed: next } })}
        onMaxChange={(next) => onChange({ ...draft, shutter: { ...draft.shutter, maxShutterSpeed: next } })}
        onSupportsBulbChange={(next) => onChange({ ...draft, shutter: { ...draft.shutter, supportsBulb: next } })}
      />
    </>
  );
}

export type LensFormFieldsProps = {
  draft: LensFormDraft;
  onChange: (next: LensFormDraft) => void;
  cameras: NamedItem[];
};

export function LensFormFields({ draft, onChange, cameras }: LensFormFieldsProps) {
  return (
    <>
      <div className="lens-form-group">
        <span className="lens-form-group-title">Lens</span>
        <div className="lens-form-grid">
          <label className="field lens-form-field--wide" htmlFor="lens-name">
            <span>Name</span>
            <input
              id="lens-name"
              placeholder="Name"
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              required
            />
          </label>
          <label className="field lens-form-field--wide" htmlFor="lens-type">
            <span>Lens type</span>
            <select
              id="lens-type"
              value={draft.lensType}
              onChange={(event) => {
                const nextType = event.target.value as LensType;
                onChange({
                  ...draft,
                  lensType: nextType,
                  maxFocalLength:
                    nextType === "prime"
                      ? draft.minFocalLength
                      : draft.maxFocalLength || draft.minFocalLength,
                });
              }}
            >
              <option value="prime">Prime</option>
              <option value="zoom">Zoom</option>
            </select>
          </label>
        </div>
      </div>

      <div className="lens-form-group">
        <span className="lens-form-group-title">Focal range</span>
        <div className="lens-form-grid">
          <label className="field" htmlFor="lens-min-focal-length-mm">
            <span>{draft.lensType === "prime" ? "Focal length" : "Min focal length"}</span>
            <input
              id="lens-min-focal-length-mm"
              placeholder="Focal length mm"
              type="number"
              value={draft.minFocalLength}
              onChange={(event) => {
                const value = event.target.value;
                onChange({
                  ...draft,
                  minFocalLength: value,
                  maxFocalLength: draft.lensType === "prime" ? value : draft.maxFocalLength,
                });
              }}
            />
          </label>
          {draft.lensType === "zoom" && (
            <label className="field" htmlFor="lens-max-focal-length-mm">
              <span>Max focal length</span>
              <input
                id="lens-max-focal-length-mm"
                placeholder="Max focal length mm"
                type="number"
                value={draft.maxFocalLength}
                onChange={(event) => onChange({ ...draft, maxFocalLength: event.target.value })}
              />
            </label>
          )}
        </div>
      </div>

      <div className="lens-form-group">
        <span className="lens-form-group-title">Aperture</span>
        <div className="lens-form-grid">
          <label className="field" htmlFor="lens-min-f-stop">
            <span>Min f-stop</span>
            <input
              id="lens-min-f-stop"
              placeholder="Min f-stop"
              type="number"
              step="any"
              value={draft.minFStop}
              onChange={(event) => onChange({ ...draft, minFStop: event.target.value })}
            />
          </label>
          <label className="field" htmlFor="lens-max-f-stop">
            <span>Max f-stop</span>
            <input
              id="lens-max-f-stop"
              placeholder="Max f-stop"
              type="number"
              step="any"
              value={draft.maxFStop}
              onChange={(event) => onChange({ ...draft, maxFStop: event.target.value })}
            />
          </label>
          <label className="field lens-form-field--stretch" htmlFor="lens-aperture-increment">
            <span>Aperture increment</span>
            <select
              id="lens-aperture-increment"
              value={draft.apertureIncrement}
              onChange={(event) => onChange({ ...draft, apertureIncrement: event.target.value as ApertureIncrement })}
            >
              {APERTURE_INCREMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="lens-flare-factor">
            <span>Flare factor</span>
            <input
              id="lens-flare-factor"
              placeholder="0.02"
              type="number"
              min="0"
              step="any"
              value={draft.flareFactor}
              onChange={(event) => onChange({ ...draft, flareFactor: event.target.value })}
            />
          </label>
        </div>
      </div>

      <ShutterFields
        label="Lens has shutter"
        prefix="lens"
        state={draft.shutter}
        onToggle={(next) => onChange({ ...draft, shutter: next ? createEnabledShutterState() : createDisabledShutterState() })}
        onMinChange={(next) => onChange({ ...draft, shutter: { ...draft.shutter, minShutterSpeed: next } })}
        onMaxChange={(next) => onChange({ ...draft, shutter: { ...draft.shutter, maxShutterSpeed: next } })}
        onSupportsBulbChange={(next) => onChange({ ...draft, shutter: { ...draft.shutter, supportsBulb: next } })}
      />

      <LensApplicabilityList
        allLabelText="Applies to all cameras"
        allLabelId="lens-applicable-cameras-all"
        labelText="Applicable cameras (optional)"
        selectedIds={draft.applicableCameraIds}
        items={cameras}
        onChange={(next) => onChange({ ...draft, applicableCameraIds: next })}
      />
    </>
  );
}

export type FilterFormFieldsProps = {
  draft: FilterFormDraft;
  onChange: (next: FilterFormDraft) => void;
  lenses: NamedItem[];
  presets?: FilterPreset[];
  onPresetChange?: (next: string) => void;
  actions?: ReactNode;
};

function FilterSimulationPreview({
  draft,
}: {
  draft: FilterFormDraft;
}) {
  const spectralCurveKey = getFilterSpectralCurveKey(draft.standardKey, draft.code);
  const simulationSettings: FilterSimulationSettings | null = spectralCurveKey
    ? {
        id: "filter-form-preview",
        label: draft.name || "Filter preview",
        color: "#f05a28",
        strength: 1,
        spectralCurveKey,
      }
    : null;

  return (
    <PreviewResultLink
      title="Preview filter result"
      description="Choose a local test image to compare the straight B&W conversion against this filter simulation."
      disabled={!simulationSettings}
      renderPreview={(previewUrl) => (
        <FilterSimulationImage
          src={previewUrl}
          alt="Local filter simulation preview"
          settings={simulationSettings}
          afterLabel="Filtered"
        />
      )}
    />
  );
}

function FilmSpectralResponsePreview({
  presetKey,
}: {
  presetKey: FilmSpectralResponseKey;
}) {
  return (
    <PreviewResultLink
      title="Preview film response"
      description="Choose a local test image to compare the quick B&W conversion against this film spectral response."
      renderPreview={(previewUrl) => (
        <FilterSimulationImage
          src={previewUrl}
          alt="Local film spectral response preview"
          settings={null}
          filmSpectralResponseKey={presetKey}
          beforeLabel="Quick B&W"
          afterLabel="Film response"
        />
      )}
    />
  );
}

function FilterSpectralCurvePreview({ curve }: { curve: FilterSpectralCurve }) {
  const width = 360;
  const height = 118;
  const padding = { top: 12, right: 12, bottom: 24, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const minWavelength = 350;
  const maxWavelength = 750;
  const toX = (wavelengthNm: number) => padding.left + ((wavelengthNm - minWavelength) / (maxWavelength - minWavelength)) * plotWidth;
  const toY = (transmission: number) => padding.top + (1 - Math.max(0, Math.min(1, transmission))) * plotHeight;
  const path = curve.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.wavelengthNm).toFixed(2)} ${toY(point.transmission).toFixed(2)}`)
    .join(" ");
  const tickWavelengths = [400, 500, 600, 700];

  return (
    <div className="filter-spectral-curve" aria-label={`${curve.label} imported transmission curve`}>
      <div className="filter-spectral-curve-header">
        <span>Imported curve</span>
        <a href={curve.sourceUrl} target="_blank" rel="noreferrer">Kodak PDF</a>
      </div>
      <svg className="filter-spectral-curve-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Transmission by wavelength">
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} />
        <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} />
        {[0, 0.5, 1].map((transmission) => (
          <g key={transmission}>
            <line
              className="filter-spectral-curve-grid"
              x1={padding.left}
              y1={toY(transmission)}
              x2={padding.left + plotWidth}
              y2={toY(transmission)}
            />
            <text x={padding.left - 8} y={toY(transmission) + 4} textAnchor="end">
              {transmission === 1 ? "100" : transmission === 0.5 ? "50" : "0"}
            </text>
          </g>
        ))}
        {tickWavelengths.map((wavelengthNm) => (
          <g key={wavelengthNm}>
            <line
              className="filter-spectral-curve-grid"
              x1={toX(wavelengthNm)}
              y1={padding.top}
              x2={toX(wavelengthNm)}
              y2={padding.top + plotHeight}
            />
            <text x={toX(wavelengthNm)} y={height - 6} textAnchor="middle">
              {wavelengthNm}
            </text>
          </g>
        ))}
        <path className="filter-spectral-curve-path" d={path} />
      </svg>
      <span className="field-note">Transmission by wavelength, sampled from Kodak curve data.</span>
    </div>
  );
}

export function FilterFormFields({
  draft,
  onChange,
  lenses,
  presets,
  onPresetChange,
  actions,
}: FilterFormFieldsProps) {
  const spectralCurveKey = getFilterSpectralCurveKey(draft.standardKey, draft.code);
  const spectralCurve = getFilterSpectralCurve(spectralCurveKey);
  const appliesToAllFilmTypes = draft.appliesToBw && draft.appliesToColor && draft.appliesToInfrared;

  const handleAllFilmTypesChange = (checked: boolean) => {
    if (checked) {
      onChange({
        ...draft,
        appliesToBw: true,
        appliesToColor: true,
        appliesToInfrared: true,
      });
      return;
    }

    onChange({
      ...draft,
      appliesToBw: true,
      appliesToColor: false,
      appliesToInfrared: false,
    });
  };

  const handleFilmTypeApplicabilityChange = (
    key: "appliesToBw" | "appliesToColor" | "appliesToInfrared",
    checked: boolean,
  ) => {
    const next = { ...draft, [key]: checked };
    if (!next.appliesToBw && !next.appliesToColor && !next.appliesToInfrared) return;
    onChange(next);
  };

  return (
    <>
      {presets && presets.length > 0 && onPresetChange && (
        <label className="field" htmlFor="filter-standard-key">
          <span>Preset (optional)</span>
          <select
            id="filter-standard-key"
            value={draft.standardKey}
            onChange={(event) => onPresetChange(event.target.value)}
          >
            <option value="">Custom</option>
            {presets.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {getFilterPresetLabel(preset)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field" htmlFor="filter-name">
        <span>Name</span>
        <input
          id="filter-name"
          placeholder="Name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          required
        />
      </label>
      <label className="field" htmlFor="filter-code">
        <span>Code (optional)</span>
        <input
          id="filter-code"
          placeholder="Code (Wratten 25)"
          value={draft.code}
          onChange={(event) => onChange({ ...draft, code: event.target.value })}
        />
      </label>
      <label className="field" htmlFor="filter-factor">
        <span>Filter factor</span>
        <input
          id="filter-factor"
          placeholder="Filter factor (8, 1.5-2)"
          type="number"
          step="any"
          min="0.000001"
          value={draft.filterFactor}
          onChange={(event) => onChange({ ...draft, filterFactor: event.target.value })}
          required
        />
      </label>
      <div className="lens-form-group filter-form-group filter-form-field--stretch">
        <span className="lens-form-group-title">Filter details</span>
        <label className="field" htmlFor="filter-notes">
          <span>Notes (optional)</span>
          <textarea
            id="filter-notes"
            rows={3}
            placeholder="Notes"
            value={draft.notes}
            onChange={(event) => onChange({ ...draft, notes: event.target.value })}
          />
        </label>
      </div>
      <div className="field lens-checklist-wrap filter-form-field--stretch">
        <span className="lens-checklist-label">Applicable film types</span>
        <div className="lens-checklist" role="group" aria-labelledby="filter-applies-all-film-types">
          <label className="lens-checklist-item">
            <input
              id="filter-applies-all-film-types"
              type="checkbox"
              checked={appliesToAllFilmTypes}
              onChange={(event) => handleAllFilmTypesChange(event.target.checked)}
            />
            <span>All film types</span>
          </label>
          <label className="lens-checklist-item">
            <input
              type="checkbox"
              checked={draft.appliesToBw}
              disabled={appliesToAllFilmTypes}
              onChange={(event) => handleFilmTypeApplicabilityChange("appliesToBw", event.target.checked)}
            />
            <span>Black and white</span>
          </label>
          <label className="lens-checklist-item">
            <input
              type="checkbox"
              checked={draft.appliesToColor}
              disabled={appliesToAllFilmTypes}
              onChange={(event) => handleFilmTypeApplicabilityChange("appliesToColor", event.target.checked)}
            />
            <span>Color</span>
          </label>
          <label className="lens-checklist-item">
            <input
              type="checkbox"
              checked={draft.appliesToInfrared}
              disabled={appliesToAllFilmTypes}
              onChange={(event) => handleFilmTypeApplicabilityChange("appliesToInfrared", event.target.checked)}
            />
            <span>Infrared</span>
          </label>
        </div>
      </div>
      <LensApplicabilityList
        allLabelText="All lenses"
        allLabelId="filter-applicable-lens-ids-all"
        labelText="Applicable lenses (optional)"
        selectedIds={draft.applicableLensIds}
        items={lenses}
        onChange={(next) => onChange({ ...draft, applicableLensIds: next })}
      />
      {actions}
      {spectralCurve && (
        <fieldset className="gear-shutter-fieldset filter-simulation-fieldset filter-form-field--stretch">
          <legend>Spectral simulation</legend>
          <div className="field-row field-grid filter-simulation-grid">
            <FilterSpectralCurvePreview curve={spectralCurve} />
          </div>
          <FilterSimulationPreview draft={draft} />
        </fieldset>
      )}
    </>
  );
}

export type FilmStockFormFieldsProps = {
  draft: FilmStockFormDraft;
  onChange: (next: FilmStockFormDraft) => void;
  presets?: FilmStockPreset[];
  onPresetChange?: (next: string) => void;
  showSpectralResponse?: boolean;
};

export interface FilmStockFormDraft {
  presetKey: string;
  name: string;
  stockType: FilmStockType;
  iso: string;
  process: string;
  reciprocityPFactor: string;
  simulateSpectralResponse: boolean;
  spectralResponsePreset: FilmSpectralResponseKey;
}

function FilmSpectralResponseCurvePreview({ preset }: { preset: NonNullable<ReturnType<typeof getFilmSpectralResponsePreset>> }) {
  const width = 360;
  const height = 118;
  const padding = { top: 12, right: 12, bottom: 24, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const minWavelength = 350;
  const maxWavelength = 760;
  const toX = (wavelengthNm: number) => padding.left + ((wavelengthNm - minWavelength) / (maxWavelength - minWavelength)) * plotWidth;
  const toY = (sensitivity: number) => padding.top + (1 - Math.max(0, Math.min(1, sensitivity))) * plotHeight;
  const path = preset.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.wavelengthNm).toFixed(2)} ${toY(point.sensitivity).toFixed(2)}`)
    .join(" ");
  const tickWavelengths = [400, 500, 600, 700];

  return (
    <div className="filter-spectral-curve" aria-label={`${preset.label} relative spectral sensitivity curve`}>
      <div className="filter-spectral-curve-header">
        <span>{preset.label}</span>
        <span>{preset.sourceExamples}</span>
      </div>
      <svg className="filter-spectral-curve-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Relative sensitivity by wavelength">
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} />
        <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} />
        {[0, 0.5, 1].map((sensitivity) => (
          <g key={sensitivity}>
            <line
              className="filter-spectral-curve-grid"
              x1={padding.left}
              y1={toY(sensitivity)}
              x2={padding.left + plotWidth}
              y2={toY(sensitivity)}
            />
            <text x={padding.left - 8} y={toY(sensitivity) + 4} textAnchor="end">
              {sensitivity === 1 ? "100" : sensitivity === 0.5 ? "50" : "0"}
            </text>
          </g>
        ))}
        {tickWavelengths.map((wavelengthNm) => (
          <g key={wavelengthNm}>
            <line
              className="filter-spectral-curve-grid"
              x1={toX(wavelengthNm)}
              y1={padding.top}
              x2={toX(wavelengthNm)}
              y2={padding.top + plotHeight}
            />
            <text x={toX(wavelengthNm)} y={height - 6} textAnchor="middle">
              {wavelengthNm}
            </text>
          </g>
        ))}
        <path className="filter-spectral-curve-path" d={path} />
      </svg>
      <span className="field-note">Relative sensitivity by wavelength. These are practical response-family curves, not exact coating scans.</span>
    </div>
  );
}

export function FilmStockSpectralResponseFields({
  draft,
  onChange,
}: Pick<FilmStockFormFieldsProps, "draft" | "onChange">) {
  const supportsSpectralResponse = supportsFilmSpectralResponse(draft.stockType);
  const spectralResponsePreset = getFilmSpectralResponsePreset(draft.spectralResponsePreset);

  return (
    <fieldset className="gear-shutter-fieldset resource-form-field--full">
      <legend>Film spectral response</legend>
      {!supportsSpectralResponse && (
        <p className="field-note">Spectral response simulation is available for monochrome film stocks.</p>
      )}
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={supportsSpectralResponse && draft.simulateSpectralResponse}
          disabled={!supportsSpectralResponse}
          onChange={(event) => onChange({ ...draft, simulateSpectralResponse: event.target.checked })}
        />
        <span>Use film spectral response when simulating B&W reference images</span>
      </label>
      {supportsSpectralResponse && !draft.simulateSpectralResponse && (
        <p className="field-note">Enable spectral response simulation to choose a response preset and preview its curve.</p>
      )}
      {supportsSpectralResponse && draft.simulateSpectralResponse && (
        <>
          <label className="field resource-form-field--full" htmlFor="film-stock-spectral-response">
            <span>Response preset</span>
            <select
              id="film-stock-spectral-response"
              value={draft.spectralResponsePreset}
              onChange={(event) => onChange({ ...draft, spectralResponsePreset: event.target.value as FilmSpectralResponseKey })}
            >
              {FILM_STOCK_SPECTRAL_RESPONSE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <small className="film-stock-type-note">
              {formatFilmSpectralResponseLabel(draft.spectralResponsePreset)}
            </small>
          </label>
          {spectralResponsePreset && (
            <>
              <FilmSpectralResponseCurvePreview preset={spectralResponsePreset} />
              <FilmSpectralResponsePreview presetKey={draft.spectralResponsePreset} />
            </>
          )}
        </>
      )}
    </fieldset>
  );
}

export function FilmStockFormFields({
  draft,
  onChange,
  presets,
  onPresetChange,
  showSpectralResponse = true,
}: FilmStockFormFieldsProps) {
  return (
    <>
      {presets && presets.length > 0 && onPresetChange && (
        <label className="field resource-form-field--full" htmlFor="film-stock-preset">
          <span>Preset (optional)</span>
          <select
            id="film-stock-preset"
            value={draft.presetKey}
            onChange={(event) => onPresetChange(event.target.value)}
          >
            <option value="">Custom</option>
            {presets.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {getFilmStockPresetLabel(preset)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field resource-form-field--full" htmlFor="film-stock-name">
        <span>Name</span>
        <input
          id="film-stock-name"
          placeholder="Name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          required
        />
      </label>
      <label className="field resource-form-field--full film-stock-type-field" htmlFor="film-stock-type">
        <div className="film-stock-type-field-header">
          <span>Stock type</span>
          <span className={`film-stock-type-badge film-stock-type-badge--${draft.stockType}`}>
            {formatFilmStockTypeLabel(draft.stockType)}
          </span>
        </div>
        <select
          id="film-stock-type"
          value={draft.stockType}
          onChange={(event) => onChange({ ...draft, stockType: event.target.value as FilmStockType })}
          required
        >
          {FILM_STOCK_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <small className="film-stock-type-note">{getFilmStockTypeAvailabilityText(draft.stockType)}</small>
      </label>
      <label className="field field-sm" htmlFor="film-stock-iso">
        <span>ISO</span>
        <input
          id="film-stock-iso"
          placeholder="ISO"
          type="number"
          value={draft.iso}
          onChange={(event) => onChange({ ...draft, iso: event.target.value })}
        />
      </label>
      <label className="field field-sm" htmlFor="film-stock-reciprocity-p-factor">
        <span>Reciprocity P factor</span>
        <input
          id="film-stock-reciprocity-p-factor"
          placeholder="1"
          type="number"
          step="any"
          value={draft.reciprocityPFactor}
          onChange={(event) => onChange({ ...draft, reciprocityPFactor: event.target.value })}
        />
      </label>
      <label className="field resource-form-field--full" htmlFor="film-stock-process">
        <span>Process</span>
        <input
          id="film-stock-process"
          placeholder="C-41, E-6"
          value={draft.process}
          onChange={(event) => onChange({ ...draft, process: event.target.value })}
        />
      </label>
      {showSpectralResponse && <FilmStockSpectralResponseFields draft={draft} onChange={onChange} />}
    </>
  );
}

export type RollFormFieldsProps = {
  draft: RollFormDraft;
  onChange: (next: RollFormDraft) => void;
  films: NamedItem[];
  showProcessedAt?: boolean;
};

const PUSH_PULL_STOP_OPTIONS = [-3, -2, -1, 0, 1, 2, 3] as const;

export function RollFormFields({ draft, onChange, films, showProcessedAt = false }: RollFormFieldsProps) {
  return (
    <>
      <label className="field resource-form-field--full" htmlFor="roll-name">
        <span>Name</span>
        <input
          id="roll-name"
          placeholder="Roll name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          required
        />
      </label>
      <label className="field resource-form-field--full" htmlFor="roll-film">
        <span>Film stock</span>
        <select
          id="roll-film"
          value={draft.filmId}
          onChange={(event) => onChange({ ...draft, filmId: event.target.value })}
        >
          <option value="">No film</option>
          {films.map((film) => (
            <option key={film.id} value={film.id}>
              {film.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field roll-form-field roll-form-field--push-pull" htmlFor="roll-push-pull-stops">
        <span>Push/pull</span>
        <select
          id="roll-push-pull-stops"
          value={String(draft.pushPullStops)}
          onChange={(event) => onChange({ ...draft, pushPullStops: Number(event.target.value) })}
        >
          {PUSH_PULL_STOP_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {formatRollPushPullLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="field roll-form-field roll-form-field--datetime" htmlFor="roll-loaded-at">
        <span>Loaded at</span>
        <input
          id="roll-loaded-at"
          type="datetime-local"
          value={draft.loadedAt}
          onChange={(event) => onChange({ ...draft, loadedAt: event.target.value })}
        />
      </label>
      {showProcessedAt && (
        <label className="field roll-form-field roll-form-field--datetime" htmlFor="roll-processed-at">
          <span>Processed at</span>
          <input
            id="roll-processed-at"
            type="datetime-local"
            value={draft.processedAt}
            onChange={(event) => onChange({ ...draft, processedAt: event.target.value })}
          />
        </label>
      )}
    </>
  );
}

export type FilmHolderFormFieldsProps = {
  draft: FilmHolderFormDraft;
  onChange: (next: FilmHolderFormDraft) => void;
};

export function FilmHolderFormFields({ draft, onChange }: FilmHolderFormFieldsProps) {
  return (
    <>
      <label className="field resource-form-field--full" htmlFor="film-holder-name">
        <span>Name</span>
        <input
          id="film-holder-name"
          placeholder="Name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          required
        />
      </label>
      <label className="field resource-form-field--full" htmlFor="film-holder-frame-format">
        <span>Film holder size</span>
        <select
          id="film-holder-frame-format"
          value={draft.frameFormatKey}
          onChange={(event) => onChange(applyFilmHolderFrameFormat(draft, event.target.value))}
        >
          <option value="">Custom / not set</option>
          {HOLDER_FRAME_FORMATS.map((format) => (
            <option key={format.key} value={format.key}>
              {format.label} ({formatText(format.widthMm)} x {formatText(format.heightMm)}mm)
            </option>
          ))}
        </select>
      </label>
      <label className="field resource-form-field--full" htmlFor="film-holder-type">
        <span>Format label</span>
        <input
          id="film-holder-type"
          placeholder="4x5, 8x10..."
          value={draft.type}
          onChange={(event) => onChange({ ...draft, frameFormatKey: "", type: event.target.value })}
        />
      </label>
      <div className="lens-form-grid resource-form-field--full">
        <label className="field" htmlFor="film-holder-width-mm">
          <span>Width (mm)</span>
          <input
            id="film-holder-width-mm"
            type="number"
            min="0"
            step="any"
            value={draft.widthMm}
            onChange={(event) => onChange({ ...draft, frameFormatKey: "", widthMm: event.target.value })}
          />
        </label>
        <label className="field" htmlFor="film-holder-height-mm">
          <span>Height (mm)</span>
          <input
            id="film-holder-height-mm"
            type="number"
            min="0"
            step="any"
            value={draft.heightMm}
            onChange={(event) => onChange({ ...draft, frameFormatKey: "", heightMm: event.target.value })}
          />
        </label>
      </div>
    </>
  );
}
