// Photo API routes plus the film-holder and roll lifecycle side effects caused by logging photos.
// Keep cross-route record shapes in worker/src/types.ts and route-local persistence helpers here.
import { Context, Hono } from "hono";
import { ulid } from "ulid";
import { Env } from "../index";
import {
  ExposureEntryMode,
  Filter,
  FilmHolderLoadStatus,
  PhotographLifecycleSummary,
  Photograph,
  PhotographBtzsZoneMeteringDetails,
  PhotographExposureDetails,
  PhotographImage,
  PhotographShutterMode,
  PhotographZoneMeteringDetails,
  RollFormat,
} from "../types";
import {
  cameraRollFormatAllowsRoll,
  ensureFilmHolderApplicableToCamera,
  fetchOwnRoll,
} from "./media-compat";
import { authMiddleware, getUserId } from "./middleware";
import { rollStatusUpdateStatement } from "./rolls";

const photos = new Hono<{ Bindings: Env }>();

export type PhotoContext = Context<{ Bindings: Env }>;
type StoredPhotographImage = {
  id: string;
  photograph_id: string;
  r2_key: string;
  content_type: string;
  width: number | null;
  height: number | null;
  thumbnail_r2_key: string | null;
  thumbnail_content_type: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  original_r2_key: string | null;
  original_content_type: string | null;
  original_width: number | null;
  original_height: number | null;
  original_filename: string | null;
  created_at: string;
};
type StoredPhotographImageWithOwner = StoredPhotographImage & {
  user_id: string;
};
type StoredPhotograph = Omit<Photograph, "exposure_details"> & {
  exposure_details_json: string | null;
};
type StoredPhotographFilter = Filter & {
  photograph_id: string;
  position: number;
};
type ImageVariant = "display" | "thumbnail" | "original";
type PhotographWithRelations = Photograph & {
  images: PhotographImage[];
  filter_ids: string[];
  filters: Filter[];
  lifecycle_summary?: PhotographLifecycleSummary | null;
};

type PhotographLifecycleSummaryRow = {
  loaded_at: string | null;
  exposed_at: string | null;
  processed_at: string | null;
  developed_at?: string | null;
  development_profile_name: string | null;
};

function toPhotographResponse(photo: StoredPhotograph): Photograph {
  const { exposure_details_json, ...rest } = photo;
  const exposureDetails = exposure_details_json == null
    ? null
    : parseExposureDetailsResponseValue(JSON.parse(exposure_details_json));

  return {
    ...rest,
    exposure_details: exposureDetails,
  };
}

function toPhotographLifecycleSummary(row: PhotographLifecycleSummaryRow): PhotographLifecycleSummary {
  const processedAt = row.processed_at ?? row.developed_at ?? null;
  return {
    loaded_at: row.loaded_at,
    exposed_at: row.exposed_at,
    processed_at: processedAt,
    developed_at: processedAt,
    development_profile_name: row.development_profile_name,
  };
}

const IMAGE_URL_TTL_SECONDS = 60 * 60;
const SIGNED_IMAGE_PATH_RE = /^\/api\/photographs\/[^/]+\/images\/[^/]+\/file$/;
const IMAGE_CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  bmp: "image/bmp",
};
const IMAGE_EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/tiff": "tif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBodyValue(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key) ? body[key] : undefined;
}

function getRequiredBodyValue(body: Record<string, unknown>, key: string, field: string) {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    throw new Error(`${field} is required`);
  }
  return body[key];
}

function parseOptionalStringValue(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseOptionalBooleanValue(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function parsePositiveNullableNumber(key: string, value: unknown): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a number`);
  }
  if (value <= 0) {
    throw new Error(`${key} must be greater than 0`);
  }
  return value;
}

function toNumberFilterFactor(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("filter_factor must be a finite positive number");
  }
  return value;
}

function parseRequiredFiniteNumberField(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

function parseRequiredPositiveNumberField(value: unknown, field: string) {
  const parsed = parseRequiredFiniteNumberField(value, field);
  if (parsed <= 0) {
    throw new Error(`${field} must be greater than 0`);
  }
  return parsed;
}

function parseNullableNumberField(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  return parseRequiredFiniteNumberField(value, field);
}

function parseNullableStringField(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseStringArrayField(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(`${field}[${index}] must be a string`);
    }
    const trimmed = item.trim();
    if (!trimmed.length) {
      throw new Error(`${field}[${index}] must not be empty`);
    }
    return trimmed;
  });
}

function parseShutterMode(value: unknown): PhotographShutterMode | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error("shutter_mode must be a string");
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "fixed" || normalized === "bulb") return normalized;
  throw new Error("shutter_mode must be one of: fixed, bulb");
}

function parseExposureEntryMode(value: unknown): ExposureEntryMode | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("exposure_entry_mode must be a string");
  const normalized = value.trim().toLowerCase();
  if (normalized === "manual" || normalized === "zone-metering" || normalized === "btzs-zone-metering") return normalized;
  throw new Error("exposure_entry_mode must be one of: manual, zone-metering, btzs-zone-metering");
}

function isBulbShutterSpeed(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase() === "bulb";
}

type PhotographExposureState = {
  shutter_mode: PhotographShutterMode;
  bulb_duration_seconds: number | null;
  shutter_speed_seconds: number | null;
};

function resolvePhotographExposureFields(
  body: Record<string, unknown>,
  current: PhotographExposureState = {
    shutter_mode: "fixed",
    bulb_duration_seconds: null,
    shutter_speed_seconds: null,
  },
) {
  const hasShutterMode = Object.prototype.hasOwnProperty.call(body, "shutter_mode");
  const hasBulbDurationSeconds = Object.prototype.hasOwnProperty.call(body, "bulb_duration_seconds");
  const hasShutterSpeed = Object.prototype.hasOwnProperty.call(body, "shutter_speed");
  const hasShutterSpeedSeconds = Object.prototype.hasOwnProperty.call(body, "shutter_speed_seconds");

  const explicitMode = hasShutterMode ? parseShutterMode(getBodyValue(body, "shutter_mode")) : undefined;
  const shutterSpeed = getBodyValue(body, "shutter_speed");

  const resolvedMode: PhotographShutterMode =
    explicitMode
    ?? (hasBulbDurationSeconds && getBodyValue(body, "bulb_duration_seconds") !== null ? "bulb" : undefined)
    ?? (isBulbShutterSpeed(shutterSpeed) ? "bulb" : undefined)
    ?? ((hasShutterSpeed || hasShutterSpeedSeconds) ? "fixed" : undefined)
    ?? current.shutter_mode
    ?? "fixed";

  let resolvedBulbDurationSeconds = current.bulb_duration_seconds;
  if (resolvedMode === "bulb") {
    if (hasBulbDurationSeconds) {
      const parsed = parsePositiveNullableNumber("bulb_duration_seconds", getBodyValue(body, "bulb_duration_seconds"));
      if (parsed != null) resolvedBulbDurationSeconds = parsed;
    } else if (hasShutterSpeedSeconds) {
      const parsed = parsePositiveNullableNumber("shutter_speed_seconds", getBodyValue(body, "shutter_speed_seconds"));
      if (parsed != null) resolvedBulbDurationSeconds = parsed;
    }

    if (resolvedBulbDurationSeconds == null) {
      throw new Error("bulb_duration_seconds must be greater than 0 when shutter_mode is bulb");
    }

    body.shutter_mode = "bulb";
    body.bulb_duration_seconds = resolvedBulbDurationSeconds;
    body.shutter_speed_seconds = resolvedBulbDurationSeconds;
    if (!isBulbShutterSpeed(body.shutter_speed)) {
      body.shutter_speed = "bulb";
    }
  } else {
    body.shutter_mode = "fixed";
    body.bulb_duration_seconds = null;
  }

  return {
    shutter_mode: resolvedMode,
    bulb_duration_seconds: resolvedBulbDurationSeconds,
  };
}

function parsePhotographZoneMeteringCalculation(
  value: unknown,
  fieldName = "exposure_details.zoneMetering",
): PhotographZoneMeteringDetails["zoneMetering"] {
  if (!isPlainObject(value)) {
    throw new Error(`${fieldName} must be an object`);
  }

  return {
    ...value,
    meterEV: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "meterEV", `${fieldName}.meterEV`), `${fieldName}.meterEV`),
    meterISO: parseRequiredPositiveNumberField(getRequiredBodyValue(value, "meterISO", `${fieldName}.meterISO`), `${fieldName}.meterISO`),
    workingISO: parseRequiredPositiveNumberField(getRequiredBodyValue(value, "workingISO", `${fieldName}.workingISO`), `${fieldName}.workingISO`),
    targetZone: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "targetZone", `${fieldName}.targetZone`), `${fieldName}.targetZone`),
    zoneAdjustedEV: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "zoneAdjustedEV", `${fieldName}.zoneAdjustedEV`), `${fieldName}.zoneAdjustedEV`),
    targetEV: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "targetEV", `${fieldName}.targetEV`), `${fieldName}.targetEV`),
    totalCompensationStops: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "totalCompensationStops", `${fieldName}.totalCompensationStops`), `${fieldName}.totalCompensationStops`),
    aperture: parseNullableStringField(getRequiredBodyValue(value, "aperture", `${fieldName}.aperture`), `${fieldName}.aperture`),
    shutterSpeed: parseNullableStringField(getRequiredBodyValue(value, "shutterSpeed", `${fieldName}.shutterSpeed`), `${fieldName}.shutterSpeed`),
    rawShutterSpeedSeconds: parseNullableNumberField(getRequiredBodyValue(value, "rawShutterSpeedSeconds", `${fieldName}.rawShutterSpeedSeconds`), `${fieldName}.rawShutterSpeedSeconds`),
    finalShutterSpeedSeconds: parseNullableNumberField(getRequiredBodyValue(value, "finalShutterSpeedSeconds", `${fieldName}.finalShutterSpeedSeconds`), `${fieldName}.finalShutterSpeedSeconds`),
    shutterMode: parseShutterMode(getRequiredBodyValue(value, "shutterMode", `${fieldName}.shutterMode`)) ?? "fixed",
    bulbDurationSeconds: parseNullableNumberField(getRequiredBodyValue(value, "bulbDurationSeconds", `${fieldName}.bulbDurationSeconds`), `${fieldName}.bulbDurationSeconds`),
    reciprocityApplied: (() => {
      const fieldValue = getRequiredBodyValue(value, "reciprocityApplied", `${fieldName}.reciprocityApplied`);
      if (typeof fieldValue !== "boolean") {
        throw new Error(`${fieldName}.reciprocityApplied must be a boolean`);
      }
      return fieldValue;
    })(),
    warnings: parseStringArrayField(getRequiredBodyValue(value, "warnings", `${fieldName}.warnings`), `${fieldName}.warnings`),
  } as PhotographZoneMeteringDetails["zoneMetering"];
}

function parsePhotographBtzsZoneMeteringCalculation(
  value: unknown,
  fieldName = "exposure_details.btzsZoneMetering",
): PhotographBtzsZoneMeteringDetails["btzsZoneMetering"] {
  if (!isPlainObject(value)) {
    throw new Error(`${fieldName} must be an object`);
  }

  return {
    ...value,
    profileId: parseNullableStringField(getRequiredBodyValue(value, "profileId", `${fieldName}.profileId`), `${fieldName}.profileId`),
    profileName: parseNullableStringField(getRequiredBodyValue(value, "profileName", `${fieldName}.profileName`), `${fieldName}.profileName`),
    lowEV: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "lowEV", `${fieldName}.lowEV`), `${fieldName}.lowEV`),
    lowZone: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "lowZone", `${fieldName}.lowZone`), `${fieldName}.lowZone`),
    highEV: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "highEV", `${fieldName}.highEV`), `${fieldName}.highEV`),
    highZone: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "highZone", `${fieldName}.highZone`), `${fieldName}.highZone`),
    evRange: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "evRange", `${fieldName}.evRange`), `${fieldName}.evRange`),
    zoneRange: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "zoneRange", `${fieldName}.zoneRange`), `${fieldName}.zoneRange`),
    sbr: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "sbr", `${fieldName}.sbr`), `${fieldName}.sbr`),
    paperEs: parseRequiredPositiveNumberField(getRequiredBodyValue(value, "paperEs", `${fieldName}.paperEs`), `${fieldName}.paperEs`),
    requiredG: parseRequiredPositiveNumberField(getRequiredBodyValue(value, "requiredG", `${fieldName}.requiredG`), `${fieldName}.requiredG`),
    effectiveFilmSpeed: parseRequiredPositiveNumberField(getRequiredBodyValue(value, "effectiveFilmSpeed", `${fieldName}.effectiveFilmSpeed`), `${fieldName}.effectiveFilmSpeed`),
    developmentTimeMinutes: parseRequiredPositiveNumberField(getRequiredBodyValue(value, "developmentTimeMinutes", `${fieldName}.developmentTimeMinutes`), `${fieldName}.developmentTimeMinutes`),
    targetEVBeforeCompensation: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "targetEVBeforeCompensation", `${fieldName}.targetEVBeforeCompensation`), `${fieldName}.targetEVBeforeCompensation`),
    targetEVAfterCompensation: parseRequiredFiniteNumberField(getRequiredBodyValue(value, "targetEVAfterCompensation", `${fieldName}.targetEVAfterCompensation`), `${fieldName}.targetEVAfterCompensation`),
    aperture: parseNullableStringField(getRequiredBodyValue(value, "aperture", `${fieldName}.aperture`), `${fieldName}.aperture`),
    shutterSpeed: parseNullableStringField(getRequiredBodyValue(value, "shutterSpeed", `${fieldName}.shutterSpeed`), `${fieldName}.shutterSpeed`),
    rawShutterSpeedSeconds: parseNullableNumberField(getRequiredBodyValue(value, "rawShutterSpeedSeconds", `${fieldName}.rawShutterSpeedSeconds`), `${fieldName}.rawShutterSpeedSeconds`),
    finalShutterSpeedSeconds: parseNullableNumberField(getRequiredBodyValue(value, "finalShutterSpeedSeconds", `${fieldName}.finalShutterSpeedSeconds`), `${fieldName}.finalShutterSpeedSeconds`),
    shutterMode: parseShutterMode(getRequiredBodyValue(value, "shutterMode", `${fieldName}.shutterMode`)) ?? "fixed",
    bulbDurationSeconds: parseNullableNumberField(getRequiredBodyValue(value, "bulbDurationSeconds", `${fieldName}.bulbDurationSeconds`), `${fieldName}.bulbDurationSeconds`),
    reciprocityApplied: (() => {
      const fieldValue = getRequiredBodyValue(value, "reciprocityApplied", `${fieldName}.reciprocityApplied`);
      if (typeof fieldValue !== "boolean") {
        throw new Error(`${fieldName}.reciprocityApplied must be a boolean`);
      }
      return fieldValue;
    })(),
    warnings: parseStringArrayField(getRequiredBodyValue(value, "warnings", `${fieldName}.warnings`), `${fieldName}.warnings`),
  } as PhotographBtzsZoneMeteringDetails["btzsZoneMetering"];
}

function parseExposureDetailsResponseValue(value: unknown): PhotographExposureDetails | null {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    throw new Error("exposure_details must be an object or null");
  }

  const keys = Object.keys(value);
  if (keys.length === 0) return null;
  const hasZoneMetering = Object.prototype.hasOwnProperty.call(value, "zoneMetering");
  const hasBtzsZoneMetering = Object.prototype.hasOwnProperty.call(value, "btzsZoneMetering");
  if (hasZoneMetering === hasBtzsZoneMetering) {
    throw new Error("exposure_details must contain exactly one of zoneMetering or btzsZoneMetering");
  }

  if (hasZoneMetering) {
    return {
      zoneMetering: parsePhotographZoneMeteringCalculation(
        getBodyValue(value, "zoneMetering"),
      ),
    };
  }

  if (hasBtzsZoneMetering) {
    return {
      btzsZoneMetering: parsePhotographBtzsZoneMeteringCalculation(
        getBodyValue(value, "btzsZoneMetering"),
      ),
    };
  }

  throw new Error("exposure_details must contain zoneMetering or btzsZoneMetering");
}

function parseExposureDetailsWriteValue(value: unknown): {
  exposure_entry_mode: ExposureEntryMode;
  exposure_details_json: string | null;
} {
  const details = parseExposureDetailsResponseValue(value);
  if (details == null) {
    return {
      exposure_entry_mode: "manual",
      exposure_details_json: null,
    };
  }

  if (Object.prototype.hasOwnProperty.call(details, "zoneMetering")) {
    return {
      exposure_entry_mode: "zone-metering",
      exposure_details_json: JSON.stringify(details),
    };
  }

  return {
    exposure_entry_mode: "btzs-zone-metering",
    exposure_details_json: JSON.stringify(details),
  };
}

type CameraForFilmBehavior = {
  film_type: "sheet" | "roll" | null;
  roll_format: RollFormat | null;
};

async function getCameraFilmBehavior(c: PhotoContext, userId: string, cameraId: string) {
  return c.env.DB.prepare("SELECT film_type, roll_format FROM cameras WHERE id = ? AND user_id = ?")
    .bind(cameraId, userId)
    .first<CameraForFilmBehavior>();
}

async function ensureOwnPhotoFilmHolder(c: { env: Env }, userId: string, filmHolderId: string) {
  const holder = await c.env.DB.prepare("SELECT id FROM film_holders WHERE id = ? AND user_id = ?")
    .bind(filmHolderId, userId).first<{ id: string }>();
  if (!holder) throw new Error("film_holder_id must reference a film holder belonging to the current user");
}

type ActivePhotoFilmHolderLoad = {
  id: string;
  film_holder_id: string;
  film_id: string | null;
  status: "loaded" | "exposed";
};

type LatestPhotoFilmHolderLoad = {
  id: string;
  film_holder_id: string;
  film_id: string | null;
  status: FilmHolderLoadStatus;
};

const DEFAULT_FILM_HOLDER_DISCARD_REASON = "Discarded after holder was re-exposed";

async function fetchActivePhotoFilmHolderLoad(
  c: PhotoContext,
  userId: string,
  filmHolderId: string,
) {
  await ensureOwnPhotoFilmHolder(c, userId, filmHolderId);
  return c.env.DB.prepare(
    "SELECT id, film_holder_id, film_id, status FROM film_holder_loads WHERE user_id = ? AND film_holder_id = ? AND status IN ('loaded', 'exposed')"
  ).bind(userId, filmHolderId).first<ActivePhotoFilmHolderLoad>();
}

async function fetchLatestPhotoFilmHolderLoad(
  c: PhotoContext,
  userId: string,
  filmHolderId: string,
) {
  await ensureOwnPhotoFilmHolder(c, userId, filmHolderId);
  return c.env.DB.prepare(
    "SELECT id, film_holder_id, film_id, status FROM film_holder_loads WHERE user_id = ? AND film_holder_id = ? ORDER BY loaded_at DESC, created_at DESC LIMIT 1"
  ).bind(userId, filmHolderId).first<LatestPhotoFilmHolderLoad>();
}

async function resolvePhotoFilmHolderLoad(
  c: PhotoContext,
  userId: string,
  filmHolderId: string,
  requestedFilmId: string | null | undefined,
) {
  const load = await fetchActivePhotoFilmHolderLoad(c, userId, filmHolderId);
  if (!load) {
    throw new Error("film_holder_id requires a pre-loaded holder with an active film load");
  }
  if (!load.film_id) {
    throw new Error("active film holder load must reference a film stock");
  }
  if (requestedFilmId !== undefined && requestedFilmId !== null && requestedFilmId !== load.film_id) {
    throw new Error("film_id must match the active film holder load");
  }
  return load;
}

async function ensureOwnFilters(c: { env: Env }, userId: string, filterIds: string[]) {
  if (filterIds.length === 0) return;
  const placeholders = filterIds.map(() => "?").join(", ");
  const existingRows = await c.env.DB.prepare(`SELECT id FROM filters WHERE user_id = ? AND id IN (${placeholders})`)
    .bind(userId, ...filterIds).all<{ id: string }>();
  const existing = new Set(existingRows.results.map((row) => row.id));
  const missing = filterIds.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    throw new Error(`filter_ids contains unknown or inaccessible filter IDs: ${missing.join(", ")}`);
  }
}

type PhotoTransportState = {
  camera_id: string | null;
  roll_id: string | null;
  film_holder_id: string | null;
  frame_number: string | null;
};

type PhotoTransportInput = {
  hasCameraId: boolean;
  hasRollId: boolean;
  hasFilmHolderId: boolean;
  hasFrameNumber: boolean;
  cameraId: string | null;
  rollId: string | null;
  filmHolderId: string | null;
  frameNumber: string | null;
};

type PhotoTransportResolution = PhotoTransportState & {
  camera: CameraForFilmBehavior | null;
};

function resolvePhotoTransportInput(body: Record<string, unknown>, current: PhotoTransportState): PhotoTransportInput {
  const hasCameraId = Object.prototype.hasOwnProperty.call(body, "camera_id");
  const hasRollId = Object.prototype.hasOwnProperty.call(body, "roll_id");
  const hasFilmHolderId = Object.prototype.hasOwnProperty.call(body, "film_holder_id");
  const hasFrameNumber = Object.prototype.hasOwnProperty.call(body, "frame_number");
  return {
    hasCameraId,
    hasRollId,
    hasFilmHolderId,
    hasFrameNumber,
    cameraId: hasCameraId ? parseOptionalStringValue(getBodyValue(body, "camera_id"), "camera_id") ?? null : current.camera_id,
    rollId: hasRollId ? parseOptionalStringValue(getBodyValue(body, "roll_id"), "roll_id") ?? null : current.roll_id,
    filmHolderId: hasFilmHolderId
      ? parseOptionalStringValue(getBodyValue(body, "film_holder_id"), "film_holder_id") ?? null
      : current.film_holder_id,
    frameNumber: hasFrameNumber
      ? parseOptionalStringValue(getBodyValue(body, "frame_number"), "frame_number") ?? null
      : current.frame_number,
  };
}

function uniqueNonNullStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function parseFilterIds(body: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(body, "filter_ids")) return undefined;
  const raw = body.filter_ids;
  if (!Array.isArray(raw)) {
    throw new Error("filter_ids must be an array");
  }
  if (!raw.every((id): id is string => typeof id === "string")) {
    throw new Error("filter_ids must be an array of strings");
  }
  if (!raw.every((id) => id !== "")) {
    throw new Error("filter_ids must not contain empty strings");
  }

  const seen = new Set<string>();
  for (const id of raw) {
    if (seen.has(id)) {
      throw new Error("filter_ids must not contain duplicate filter IDs");
    }
    seen.add(id);
  }

  return raw;
}

async function resolvePhotoTransportByCamera(
  c: PhotoContext,
  userId: string,
  transport: PhotoTransportInput,
): Promise<PhotoTransportResolution> {
  if (!transport.cameraId) {
    return {
      camera: null,
      camera_id: null,
      roll_id: transport.rollId,
      film_holder_id: transport.filmHolderId,
      frame_number: transport.frameNumber,
    };
  }

  const camera = await getCameraFilmBehavior(c, userId, transport.cameraId);
  if (!camera) {
    throw new Error("camera_id not found");
  }

  if (camera.film_type === "sheet") {
    if (transport.hasRollId) {
      throw new Error("sheet cameras do not accept roll_id");
    }
    if (transport.hasFrameNumber) {
      throw new Error("sheet cameras do not accept frame_number");
    }
    return {
      camera,
      camera_id: transport.cameraId,
      roll_id: null,
      film_holder_id: transport.filmHolderId,
      frame_number: null,
    };
  }

  if (camera.film_type === "roll") {
    if (transport.hasFilmHolderId && transport.filmHolderId !== null) {
      throw new Error("roll cameras do not accept film_holder_id");
    }
    if (!transport.rollId) {
      throw new Error("roll cameras require roll_id");
    }
    if (!transport.frameNumber) {
      throw new Error("roll cameras require frame_number");
    }

    return {
      camera,
      camera_id: transport.cameraId,
      roll_id: transport.rollId,
      film_holder_id: null,
      frame_number: transport.frameNumber,
    };
  }

  return {
    camera,
    camera_id: transport.cameraId,
    roll_id: transport.rollId,
    film_holder_id: transport.filmHolderId,
    frame_number: transport.frameNumber,
  };
}

type PhotoFilmResolution = {
  film_id: string | null | undefined;
  active_film_holder_load: ActivePhotoFilmHolderLoad | null;
  reexposure_source_load: LatestPhotoFilmHolderLoad | null;
};

async function resolvePhotoFilmSelection(
  c: PhotoContext,
  userId: string,
  transport: PhotoTransportResolution,
  requestedFilmId: string | null | undefined,
  confirmReexposure = false,
): Promise<PhotoFilmResolution> {
  if (transport.roll_id !== null && transport.film_holder_id !== null) {
    throw new Error("roll_id and film_holder_id cannot both be set");
  }

  let filmId = requestedFilmId;
  let activeFilmHolderLoad: ActivePhotoFilmHolderLoad | null = null;
  let reexposureSourceLoad: LatestPhotoFilmHolderLoad | null = null;

  if (transport.roll_id !== null) {
    const roll = await fetchOwnRoll(c, userId, transport.roll_id);
    if (!roll) {
      throw new Error("roll_id must reference a roll belonging to the current user");
    }
    if (!roll.film_id) {
      throw new Error("selected roll must have a film stock");
    }
    if (transport.camera?.film_type === "roll" && !cameraRollFormatAllowsRoll(transport.camera.roll_format, roll.roll_format)) {
      throw new Error("selected roll is not compatible with this camera");
    }
    if (filmId !== undefined && filmId !== null && filmId !== roll.film_id) {
      throw new Error("film_id must match the selected roll film stock");
    }
    filmId = roll.film_id;
  }

  if (transport.film_holder_id !== null) {
    if (transport.camera_id !== null) {
      await ensureFilmHolderApplicableToCamera(c, userId, transport.film_holder_id, transport.camera_id);
    }
    const load = await fetchActivePhotoFilmHolderLoad(c, userId, transport.film_holder_id);
    if (load) {
      if (!load.film_id) {
        throw new Error("active film holder load must reference a film stock");
      }
      if (filmId !== undefined && filmId !== null && filmId !== load.film_id) {
        throw new Error("film_id must match the active film holder load");
      }
      activeFilmHolderLoad = load;
      filmId = load.film_id;
      if (load.status === "exposed") {
        if (!confirmReexposure) {
          throw new Error("film_holder_id requires confirmation to re-expose an exposed holder");
        }
        reexposureSourceLoad = load;
      }
    } else {
      if (!confirmReexposure) {
        throw new Error("film_holder_id requires a pre-loaded holder with an active film load");
      }
      const latestLoad = await fetchLatestPhotoFilmHolderLoad(c, userId, transport.film_holder_id);
      if (!latestLoad) {
        throw new Error("film_holder_id requires a pre-loaded holder with an active film load");
      }
      if (latestLoad.status === "processed") {
        throw new Error("film holder current load has already been processed");
      }
      if (latestLoad.status !== "discarded") {
        throw new Error("film_holder_id requires a discarded holder load before it can be re-exposed");
      }
      if (!latestLoad.film_id) {
        throw new Error("active film holder load must reference a film stock");
      }
      if (filmId !== undefined && filmId !== null && filmId !== latestLoad.film_id) {
        throw new Error("film_id must match the active film holder load");
      }
      filmId = latestLoad.film_id;
      reexposureSourceLoad = latestLoad;
    }
  }

  return {
    film_id: filmId,
    active_film_holder_load: activeFilmHolderLoad,
    reexposure_source_load: reexposureSourceLoad,
  };
}

photos.use("*", async (c, next) => {
  if (c.req.method === "GET" && SIGNED_IMAGE_PATH_RE.test(new URL(c.req.url).pathname)) {
    return next();
  }

  return authMiddleware(c, next);
});

function paginate(query: Record<string, string>) {
  const limit = Math.min(parseInt(query.limit ?? "50"), 200);
  const offset = parseInt(query.offset ?? "0");
  return { limit: isNaN(limit) ? 50 : limit, offset: isNaN(offset) ? 0 : offset };
}

const PHOTO_FIELDS = [
  "roll_id", "camera_id", "lens_id", "film_id", "frame_number",
  "exposure_entry_mode", "exposure_details_json",
  "taken_at", "aperture", "shutter_speed", "shutter_speed_seconds",
  "shutter_mode", "bulb_duration_seconds",
  "focal_length_mm", "latitude", "longitude", "altitude_m", "gps_accuracy_m", "notes", "title",
  "film_holder_id",
];
const DEFAULT_PHOTO_APERTURE = "f/5.6";
const MAX_ORIGINAL_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_DISPLAY_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_THUMBNAIL_IMAGE_BYTES = 5 * 1024 * 1024;

function maxImageUploadBytesForField(field: string) {
  if (field === "thumbnail") return MAX_THUMBNAIL_IMAGE_BYTES;
  if (field === "display") return MAX_DISPLAY_IMAGE_BYTES;
  return MAX_ORIGINAL_IMAGE_BYTES;
}

function extensionFromFilename(filename: string | undefined) {
  if (!filename) return null;
  const name = filename.split(/[\\/]/).pop() ?? "";
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match?.[1] ?? null;
}

function originalFilename(file: File) {
  const name = file.name.split(/[\\/]/).pop()?.trim();
  return name ? name.slice(0, 255) : null;
}

function inferContentType(file: File) {
  const fileType = file.type.toLowerCase().trim();
  if (IMAGE_EXT_BY_CONTENT_TYPE[fileType]) return fileType;

  const ext = extensionFromFilename(file.name);
  if (ext) return IMAGE_CONTENT_TYPE_BY_EXT[ext] ?? null;

  return null;
}

function sniffContentType(bytes: Uint8Array) {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= pngSignature.length && pngSignature.every((byte, index) => bytes[index] === byte)) {
    return "image/png";
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }

  return null;
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  return bytes[offset] * 256 + bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return bytes[offset] * 2 ** 24
    + bytes[offset + 1] * 2 ** 16
    + bytes[offset + 2] * 2 ** 8
    + bytes[offset + 3];
}

function readPngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return null;
  }
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;

  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 1 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    if (offset + 1 >= bytes.length) return null;
    const length = readUint16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;

    const isStartOfFrame =
      marker === 0xc0
      || marker === 0xc1
      || marker === 0xc2
      || marker === 0xc3
      || marker === 0xc5
      || marker === 0xc6
      || marker === 0xc7
      || marker === 0xc9
      || marker === 0xca
      || marker === 0xcb
      || marker === 0xcd
      || marker === 0xce
      || marker === 0xcf;
    if (isStartOfFrame) {
      if (length < 7) return null;
      const height = readUint16BE(bytes, offset + 3);
      const width = readUint16BE(bytes, offset + 5);
      if (width <= 0 || height <= 0) return null;
      return { width, height };
    }

    offset += length;
  }

  return null;
}

function readImageDimensions(bytes: Uint8Array) {
  return readPngDimensions(bytes) ?? readJpegDimensions(bytes);
}

function encodePlaceholderJpeg(width: number, height: number) {
  void width;
  void height;

  const base64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRQBAwQEBQQFCQUFCRQNCw0UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFP/AABEIAAEAAQMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AP1AoA//2Q==";
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function isLoggedOutImagesError(error: unknown) {
  return isImagesError(error) && error.code === 9523;
}

function extensionFor(file: File, contentType: string) {
  const ext = extensionFromFilename(file.name);
  if (ext && IMAGE_CONTENT_TYPE_BY_EXT[ext] === contentType) {
    return ext === "jpeg" ? "jpg" : ext;
  }

  return IMAGE_EXT_BY_CONTENT_TYPE[contentType] ?? "img";
}

type ParsedImageFile = {
  file: File;
  contentType: string | null;
};

type ParsedImageSource = ParsedImageFile & {
  originalFilename: string | null;
  sourceField: "original" | "display" | "file";
  originalFile?: ParsedImageFile | null;
};

type GeneratedImageVariant = {
  body: ArrayBuffer;
  contentType: string;
  width: number;
  height: number;
};

async function readMultipartImageFile(form: FormData, field: string): Promise<ParsedImageFile | null> {
  if (!form.has(field)) return null;
  const value = form.get(field);
  if (!(value instanceof File)) {
    throw new Error(`${field} must be a file`);
  }
  if (value.size === 0) {
    throw new Error(`${field} must not be empty`);
  }
  const maxBytes = maxImageUploadBytesForField(field);
  if (value.size > maxBytes) {
    throw new Error(`${field} must be ${Math.floor(maxBytes / (1024 * 1024))}MB or smaller`);
  }

  return {
    file: value,
    contentType: inferContentType(value),
  };
}

async function readSourceImageUpload(form: FormData): Promise<ParsedImageSource> {
  const original = await readMultipartImageFile(form, "original");
  const display = await readMultipartImageFile(form, "display");

  if (original && display) {
    return {
      ...display,
      originalFile: original,
      originalFilename: originalFilename(original.file),
      sourceField: "display",
    };
  }

  if (original) {
    return {
      ...original,
      originalFile: original,
      originalFilename: originalFilename(original.file),
      sourceField: "original",
    };
  }

  if (display) {
    return {
      ...display,
      originalFile: display,
      originalFilename: originalFilename(display.file),
      sourceField: "display",
    };
  }

  const legacy = await readMultipartImageFile(form, "file");
  if (legacy) {
    return {
      ...legacy,
      originalFile: legacy,
      originalFilename: originalFilename(legacy.file),
      sourceField: "file",
    };
  }

  throw new Error("original, display, or file image is required");
}

function isImagesError(error: unknown): error is ImagesError {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "number";
}

function imagesErrorResponse(c: PhotoContext, error: unknown, fallbackMessage: string, status = 502) {
  if (isImagesError(error)) {
    if (error.code === 9432) {
      return c.json({ error: "Image transformation is not available" }, 503);
    }

    if (error.code === 9401 || error.code === 9412) {
      return c.json({ error: error.message }, 400);
    }
  }

  return c.json({ error: fallbackMessage }, status);
}

function imageVariantOutputOptions(): ImageOutputOptions {
  return {
    format: "image/jpeg",
  };
}

function scaleDownDimensions(width: number, height: number, maxEdge: number) {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.min(maxEdge, Math.round(width * scale))),
    height: Math.max(1, Math.min(maxEdge, Math.round(height * scale))),
  };
}

async function generateImageVariant(
  c: PhotoContext,
  source: Blob,
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
): Promise<GeneratedImageVariant> {
  if (!c.env.IMAGES) {
    throw new Error("Image transformation is not configured");
  }

  const targetDimensions = scaleDownDimensions(sourceWidth, sourceHeight, maxEdge);
  try {
    const transformed = await c.env.IMAGES.input(source.stream())
      .transform({ width: targetDimensions.width, height: targetDimensions.height })
      .output(imageVariantOutputOptions());

    const response = transformed.response();
    if (!response.body) {
      throw new Error("Image transformation failed");
    }

    const body = await response.arrayBuffer();

    return {
      body,
      contentType: transformed.contentType(),
      width: targetDimensions.width,
      height: targetDimensions.height,
    };
  } catch (error) {
    if (!isLoggedOutImagesError(error)) {
      throw error;
    }

    return {
      body: encodePlaceholderJpeg(targetDimensions.width, targetDimensions.height),
      contentType: "image/jpeg",
      width: targetDimensions.width,
      height: targetDimensions.height,
    };
  }
}

async function compatibleLensIdsForCamera(c: PhotoContext, userId: string, cameraId: string) {
  const rows = await c.env.DB.prepare("SELECT lens_id FROM camera_lenses WHERE user_id = ? AND camera_id = ?")
    .bind(userId, cameraId).all<{ lens_id: string }>();
  return rows.results.map((row) => row.lens_id);
}

async function rejectIncompatibleLensForCamera(c: PhotoContext, userId: string, cameraId: string, lensId: string) {
  const compatibleLensIds = await compatibleLensIdsForCamera(c, userId, cameraId);
  if (compatibleLensIds.length > 0 && !compatibleLensIds.includes(lensId)) {
    return c.json({ error: "lens_id is not compatible with this camera" }, 400);
  }
  return null;
}

function imageSignaturePayload(userId: string, photographId: string, imageId: string, expires: number) {
  return ["GET", userId, photographId, imageId, String(expires)].join("\n");
}

function imageVariantSignaturePayload(
  variant: Exclude<ImageVariant, "display"> | "display",
  userId: string,
  photographId: string,
  imageId: string,
  expires: number,
) {
  return ["GET", variant, userId, photographId, imageId, String(expires)].join("\n");
}

function imageR2Key(
  userId: string,
  photographId: string,
  imageId: string,
  variant: ImageVariant,
  extension: string,
) {
  const suffix = variant === "display" ? "" : `.${variant}`;
  return `${userId}/${photographId}/${imageId}${suffix}.${extension}`;
}

function base64UrlEncode(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signImageUrl(secret: string, payload: string) {
  const data = new TextEncoder().encode(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64UrlEncode(await crypto.subtle.sign("HMAC", key, data));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function signedImageUrl(c: PhotoContext, userId: string, photographId: string, imageId: string) {
  const expires = Math.floor(Date.now() / 1000) + IMAGE_URL_TTL_SECONDS;
  const url = new URL(
    `/api/photographs/${encodeURIComponent(photographId)}/images/${encodeURIComponent(imageId)}/file`,
    c.req.url,
  );
  url.searchParams.set("expires", String(expires));
  url.searchParams.set(
    "signature",
    await signImageUrl(c.env.JWT_SECRET, imageSignaturePayload(userId, photographId, imageId, expires)),
  );
  return url.toString();
}

async function signedVariantImageUrl(
  c: PhotoContext,
  userId: string,
  photographId: string,
  imageId: string,
  variant: Exclude<ImageVariant, "display">,
) {
  const expires = Math.floor(Date.now() / 1000) + IMAGE_URL_TTL_SECONDS;
  const url = new URL(
    `/api/photographs/${encodeURIComponent(photographId)}/images/${encodeURIComponent(imageId)}/file`,
    c.req.url,
  );
  url.searchParams.set("variant", variant);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set(
    "signature",
    await signImageUrl(c.env.JWT_SECRET, imageVariantSignaturePayload(variant, userId, photographId, imageId, expires)),
  );
  return url.toString();
}

function imageVariantStorage(image: StoredPhotographImage, variant: ImageVariant) {
  switch (variant) {
    case "thumbnail":
      return {
        key: image.thumbnail_r2_key,
        contentType: image.thumbnail_content_type,
        width: image.thumbnail_width,
        height: image.thumbnail_height,
      };
    case "original":
      return {
        key: image.original_r2_key,
        contentType: image.original_content_type,
        width: image.original_width,
        height: image.original_height,
      };
    case "display":
      return {
        key: image.r2_key,
        contentType: image.content_type,
        width: image.width,
        height: image.height,
      };
  }
}

async function publicImage(c: PhotoContext, userId: string, image: StoredPhotographImage): Promise<PhotographImage> {
  const thumbnailUrl = image.thumbnail_r2_key
    ? await signedVariantImageUrl(c, userId, image.photograph_id, image.id, "thumbnail")
    : null;
  const originalUrl = image.original_r2_key
    ? await signedVariantImageUrl(c, userId, image.photograph_id, image.id, "original")
    : null;

  return {
    id: image.id,
    photograph_id: image.photograph_id,
    content_type: image.content_type,
    width: image.width,
    height: image.height,
    thumbnail_content_type: image.thumbnail_content_type,
    thumbnail_width: image.thumbnail_width,
    thumbnail_height: image.thumbnail_height,
    thumbnail_url: thumbnailUrl,
    original_content_type: image.original_content_type,
    original_width: image.original_width,
    original_height: image.original_height,
    original_filename: image.original_filename,
    original_url: originalUrl,
    url: await signedImageUrl(c, userId, image.photograph_id, image.id),
    created_at: image.created_at,
  };
}

function toFilterResponse(row: Filter, applicableLensIds: string[]): Filter {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    code: row.code,
    filter_factor: toNumberFilterFactor(row.filter_factor),
    source: row.source,
    standard_key: row.standard_key,
    notes: row.notes,
    can_simulate_bw: row.can_simulate_bw === true || row.can_simulate_bw === 1,
    simulation_rgb: row.simulation_rgb ?? "#f05a28",
    simulation_strength: row.simulation_strength ?? 0.42,
    simulation_brightness_boost: row.simulation_brightness_boost ?? 1,
    applies_to_bw: row.applies_to_bw === undefined || row.applies_to_bw === null ? true : row.applies_to_bw === true || row.applies_to_bw === 1,
    applies_to_color: row.applies_to_color === undefined || row.applies_to_color === null ? true : row.applies_to_color === true || row.applies_to_color === 1,
    applies_to_infrared: row.applies_to_infrared === undefined || row.applies_to_infrared === null ? true : row.applies_to_infrared === true || row.applies_to_infrared === 1,
    applicable_lens_ids: applicableLensIds,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function publicImagesForPhotographs(c: PhotoContext, userId: string, photographIds: string[]) {
  if (photographIds.length === 0) return new Map<string, PhotographImage[]>();

  const placeholders = photographIds.map(() => "?").join(", ");
  const rows = await c.env.DB.prepare(
    `SELECT pi.id, pi.photograph_id, pi.r2_key, pi.content_type, pi.width, pi.height,
            pi.thumbnail_r2_key, pi.thumbnail_content_type, pi.thumbnail_width, pi.thumbnail_height,
            pi.original_r2_key, pi.original_content_type, pi.original_width, pi.original_height,
            pi.original_filename, pi.created_at
     FROM photograph_images pi
     JOIN photographs p ON p.id = pi.photograph_id
     WHERE p.user_id = ? AND pi.photograph_id IN (${placeholders})
     ORDER BY pi.created_at ASC`
  ).bind(userId, ...photographIds).all<StoredPhotographImage>();

  const grouped = new Map<string, PhotographImage[]>();
  for (const photographId of photographIds) {
    grouped.set(photographId, []);
  }

  const publicImages = await Promise.all(rows.results.map(image => publicImage(c, userId, image)));
  for (const image of publicImages) {
    grouped.get(image.photograph_id)?.push(image);
  }

  return grouped;
}

export async function publicReferenceImagesForPhotographs(
  c: PhotoContext,
  userId: string,
  photographIds: string[],
) {
  if (photographIds.length === 0) return new Map<string, PhotographImage | null>();

  const placeholders = photographIds.map(() => "?").join(", ");
  const rows = await c.env.DB.prepare(
    `SELECT pi.id, pi.photograph_id, pi.r2_key, pi.content_type, pi.width, pi.height,
            pi.thumbnail_r2_key, pi.thumbnail_content_type, pi.thumbnail_width, pi.thumbnail_height,
            pi.original_r2_key, pi.original_content_type, pi.original_width, pi.original_height,
            pi.original_filename, pi.created_at
     FROM photograph_images pi
     JOIN photographs p ON p.id = pi.photograph_id
     WHERE p.user_id = ? AND pi.photograph_id IN (${placeholders})
     ORDER BY pi.photograph_id ASC, pi.created_at ASC`
  ).bind(userId, ...photographIds).all<StoredPhotographImage>();

  const firstImagesByPhotograph = new Map<string, StoredPhotographImage>();
  for (const row of rows.results) {
    if (!firstImagesByPhotograph.has(row.photograph_id)) {
      firstImagesByPhotograph.set(row.photograph_id, row);
    }
  }

  const grouped = new Map<string, PhotographImage | null>();
  for (const photographId of photographIds) {
    grouped.set(photographId, null);
  }

  const publicImages = await Promise.all(
    [...firstImagesByPhotograph.values()].map((image) => publicImage(c, userId, image)),
  );
  for (const image of publicImages) {
    grouped.set(image.photograph_id, image);
  }

  return grouped;
}

async function getFilterApplicableLensIds(env: Env, userId: string, filterIds: string[]) {
  const lensIdsByFilter = new Map<string, string[]>();
  for (const filterId of filterIds) {
    lensIdsByFilter.set(filterId, []);
  }
  if (filterIds.length === 0) return lensIdsByFilter;
  const placeholders = filterIds.map(() => "?").join(", ");
  const rows = await env.DB.prepare(
    `SELECT filter_id, lens_id FROM filter_lenses WHERE user_id = ? AND filter_id IN (${placeholders})`
  ).bind(userId, ...filterIds).all<{ filter_id: string; lens_id: string }>();
  for (const row of rows.results) {
    const existing = lensIdsByFilter.get(row.filter_id);
    if (existing) existing.push(row.lens_id);
  }
  return lensIdsByFilter;
}

async function getPhotographFilterIds(c: PhotoContext, userId: string, photographId: string) {
  const rows = await c.env.DB.prepare(
    "SELECT filter_id FROM photograph_filters WHERE user_id = ? AND photograph_id = ? ORDER BY position ASC"
  ).bind(userId, photographId).all<{ filter_id: string }>();
  return rows.results.map((row) => row.filter_id);
}

async function photographLifecycleSummaryForPhotograph(
  c: PhotoContext,
  userId: string,
  photo: Pick<StoredPhotograph, "id" | "film_holder_id" | "roll_id" | "film_id" | "taken_at" | "created_at">,
) {
  if (photo.film_holder_id) {
    const exactLoad = await c.env.DB.prepare(
      `SELECT l.loaded_at, l.exposed_at, l.processed_at, dp.name AS development_profile_name
       FROM film_holder_loads l
       LEFT JOIN development_profiles dp ON dp.id = l.development_profile_id AND dp.user_id = l.user_id
       WHERE l.user_id = ? AND l.exposed_photograph_id = ?
       ORDER BY l.loaded_at DESC, l.created_at DESC
       LIMIT 1`
    ).bind(userId, photo.id).first<PhotographLifecycleSummaryRow>();
    if (exactLoad) {
      return toPhotographLifecycleSummary(exactLoad);
    }

    const exposureTimestamp = photo.taken_at ?? photo.created_at;
    const fallbackLoad = await c.env.DB.prepare(
      `SELECT l.loaded_at, l.exposed_at, l.processed_at, dp.name AS development_profile_name
       FROM film_holder_loads l
       LEFT JOIN development_profiles dp ON dp.id = l.development_profile_id AND dp.user_id = l.user_id
       WHERE l.user_id = ? AND l.film_holder_id = ?
         AND (? IS NULL OR l.film_id = ?)
         AND l.loaded_at <= ?
         AND (l.processed_at IS NULL OR l.processed_at >= ?)
       ORDER BY l.loaded_at DESC, l.created_at DESC
       LIMIT 1`
    ).bind(
      userId,
      photo.film_holder_id,
      photo.film_id,
      photo.film_id,
      exposureTimestamp,
      exposureTimestamp,
    ).first<PhotographLifecycleSummaryRow>();
    if (fallbackLoad) {
      return toPhotographLifecycleSummary(fallbackLoad);
    }
  }

  if (photo.roll_id) {
    const roll = await c.env.DB.prepare(
      `SELECT r.loaded_at, r.processed_at, r.developed_at, dp.name AS development_profile_name
       FROM rolls r
       LEFT JOIN development_profiles dp ON dp.id = r.development_profile_id AND dp.user_id = r.user_id
       WHERE r.id = ? AND r.user_id = ?`
    ).bind(photo.roll_id, userId).first<PhotographLifecycleSummaryRow>();
    if (!roll) return null;

    return toPhotographLifecycleSummary({
      loaded_at: roll.loaded_at,
      exposed_at: photo.taken_at ?? photo.created_at,
      processed_at: roll.processed_at,
      developed_at: roll.developed_at,
      development_profile_name: roll.development_profile_name,
    });
  }

  return null;
}

async function ensurePhotographFilterSelection(
  c: PhotoContext,
  userId: string,
  filterIds: string[],
  lensId: string | null,
) {
  if (filterIds.length === 0) return;
  if (!lensId) {
    throw new Error("lens_id is required when filter_ids are provided");
  }

  await ensureOwnFilters(c, userId, filterIds);
  const lensIdsByFilter = await getFilterApplicableLensIds(c.env, userId, filterIds);
  const incompatibleFilterIds = filterIds.filter((filterId) => {
    const applicableLensIds = lensIdsByFilter.get(filterId) ?? [];
    return applicableLensIds.length > 0 && !applicableLensIds.includes(lensId);
  });
  if (incompatibleFilterIds.length > 0) {
    throw new Error(`filter_ids contains filters that are not compatible with lens_id: ${incompatibleFilterIds.join(", ")}`);
  }
}

async function photographFiltersForPhotographs(c: PhotoContext, userId: string, photographIds: string[]) {
  const selections = new Map<string, { filter_ids: string[]; filters: Filter[] }>();
  for (const photographId of photographIds) {
    selections.set(photographId, { filter_ids: [], filters: [] });
  }
  if (photographIds.length === 0) return selections;

  const placeholders = photographIds.map(() => "?").join(", ");
  const rows = await c.env.DB.prepare(
    `SELECT pf.photograph_id, pf.position, f.id, f.user_id, f.name, f.code, f.filter_factor, f.source, f.standard_key,
            f.notes, f.can_simulate_bw, f.simulation_rgb, f.simulation_strength, f.simulation_brightness_boost,
            f.applies_to_bw, f.applies_to_color, f.applies_to_infrared,
            f.created_at, f.updated_at
     FROM photograph_filters pf
     JOIN filters f ON f.id = pf.filter_id AND f.user_id = pf.user_id
     WHERE pf.user_id = ? AND pf.photograph_id IN (${placeholders})
     ORDER BY pf.photograph_id ASC, pf.position ASC`
  ).bind(userId, ...photographIds).all<StoredPhotographFilter>();

  const filterIds = [...new Set(rows.results.map((row) => row.id))];
  const lensIdsByFilter = await getFilterApplicableLensIds(c.env, userId, filterIds);
  for (const row of rows.results) {
    const selection = selections.get(row.photograph_id);
    if (!selection) continue;
    selection.filter_ids.push(row.id);
    selection.filters.push(toFilterResponse(row, lensIdsByFilter.get(row.id) ?? []));
  }

  return selections;
}

async function photographsWithRelations(c: PhotoContext, userId: string, photos: StoredPhotograph[]): Promise<PhotographWithRelations[]> {
  const photographIds = photos.map((photo) => photo.id);
  const [imagesByPhotograph, filterSelectionsByPhotograph] = await Promise.all([
    publicImagesForPhotographs(c, userId, photographIds),
    photographFiltersForPhotographs(c, userId, photographIds),
  ]);

  return photos.map((photo) => {
    const response = toPhotographResponse(photo);
    const filterSelection = filterSelectionsByPhotograph.get(photo.id) ?? { filter_ids: [], filters: [] };
    return {
      ...response,
      images: imagesByPhotograph.get(photo.id) ?? [],
      filter_ids: filterSelection.filter_ids,
      filters: filterSelection.filters,
    };
  });
}

async function photographWithRelations(c: PhotoContext, userId: string, photographId: string) {
  const photo = await c.env.DB.prepare("SELECT * FROM photographs WHERE id = ? AND user_id = ?")
    .bind(photographId, userId).first<StoredPhotograph>();
  if (!photo) return null;
  const [item, lifecycleSummary] = await Promise.all([
    photographsWithRelations(c, userId, [photo]),
    photographLifecycleSummaryForPhotograph(c, userId, photo),
  ]);
  const response = item[0];
  if (!response) return null;
  return {
    ...response,
    lifecycle_summary: lifecycleSummary,
  };
}

async function deleteR2Keys(c: PhotoContext, keys: string[]) {
  if (keys.length === 0) return true;
  if (!c.env.REFERENCE_IMAGES) return false;

  try {
    await Promise.all(keys.map(key => c.env.REFERENCE_IMAGES.delete(key)));
    return true;
  } catch {
    return false;
  }
}

function imageStorageKeys(image: Pick<StoredPhotographImage, "r2_key" | "thumbnail_r2_key" | "original_r2_key">) {
  return uniqueNonNullStrings([image.r2_key, image.thumbnail_r2_key, image.original_r2_key]);
}

function parseImageVariantQuery(value: string | null | undefined): ImageVariant {
  if (value === undefined || value === null || value === "" || value === "display") return "display";
  if (value === "thumbnail" || value === "original") return value;
  throw new Error("Unsupported image variant");
}

photos.get("/", async (c) => {
  const userId = getUserId(c);
  const query = c.req.query();
  const { limit, offset } = paginate(query);
  const FILTER_COLS = ["roll_id", "camera_id", "lens_id", "film_id", "film_holder_id"] as const;
  const filters = FILTER_COLS.filter(k => query[k]);
  const whereClauses = ["user_id = ?", ...filters.map(k => `${k} = ?`)];
  const filterBinds = [userId, ...filters.map(k => query[k])];
  const where = whereClauses.join(" AND ");
  const rollIdFilter = query.roll_id?.trim();
  const orderBy = rollIdFilter
    ? `
        ORDER BY
          CASE
            WHEN frame_number IS NULL OR TRIM(frame_number) = '' THEN 1
            ELSE 0
          END ASC,
          CASE
            WHEN frame_number IS NOT NULL AND frame_number NOT GLOB '*[^0-9]*' THEN 0
            ELSE 1
          END ASC,
          CASE
            WHEN frame_number IS NOT NULL AND frame_number NOT GLOB '*[^0-9]*' THEN CAST(frame_number AS INTEGER)
            ELSE NULL
          END ASC,
          frame_number COLLATE NOCASE ASC,
          COALESCE(taken_at, created_at) ASC,
          created_at ASC`
    : "ORDER BY created_at DESC";
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM photographs WHERE ${where} ${orderBy} LIMIT ? OFFSET ?`)
      .bind(...filterBinds, limit, offset).all<StoredPhotograph>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM photographs WHERE ${where}`)
      .bind(...filterBinds).first<{ total: number }>(),
  ]);
  const items = await photographsWithRelations(c, userId, rows.results);
  return c.json({ items, total: count?.total ?? 0 });
});

photos.post("/", async (c) => {
  const userId = getUserId(c);
  let body: Record<string, unknown>;
  try {
    const parsed = await c.req.json();
    if (!isPlainObject(parsed)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }
    body = parsed;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const currentTransport: PhotoTransportState = {
    camera_id: null,
    roll_id: null,
    film_holder_id: null,
    frame_number: null,
  };
  const transportInput = resolvePhotoTransportInput(body, currentTransport);
  const aperture = Object.prototype.hasOwnProperty.call(body, "aperture") && typeof body.aperture === "string"
    ? body.aperture.trim()
    : null;
  const createBody: Record<string, unknown> = {
    ...body,
    aperture: aperture || DEFAULT_PHOTO_APERTURE,
  };
  let filterIds: string[] | undefined;
  let activeFilmHolderLoad: ActivePhotoFilmHolderLoad | null = null;
  let reexposureSourceLoad: LatestPhotoFilmHolderLoad | null = null;
  let resolvedLensId: string | null = null;
  let resolvedFilmHolderId: string | null = null;
  let resolvedFilmId: string | null | undefined = undefined;

  try {
    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      createBody.title = parseOptionalStringValue(getBodyValue(body, "title"), "title");
    }
    if (Object.prototype.hasOwnProperty.call(body, "shutter_speed_seconds")) {
      createBody.shutter_speed_seconds = parsePositiveNullableNumber(
        "shutter_speed_seconds",
        getBodyValue(body, "shutter_speed_seconds"),
      );
    }
    const hasExposureEntryMode = Object.prototype.hasOwnProperty.call(body, "exposure_entry_mode");
    const hasExposureDetails = Object.prototype.hasOwnProperty.call(body, "exposure_details");
    const parsedExposureEntryMode = hasExposureEntryMode
      ? parseExposureEntryMode(getBodyValue(body, "exposure_entry_mode"))
      : undefined;
    if (hasExposureDetails) {
      const parsedExposureDetails = parseExposureDetailsWriteValue(getBodyValue(body, "exposure_details"));
      if (parsedExposureEntryMode != null && parsedExposureDetails.exposure_entry_mode !== parsedExposureEntryMode) {
        throw new Error("exposure_entry_mode must match exposure_details");
      }
      createBody.exposure_entry_mode = parsedExposureDetails.exposure_entry_mode;
      createBody.exposure_details_json = parsedExposureDetails.exposure_details_json;
    } else if (parsedExposureEntryMode != null) {
      if (parsedExposureEntryMode !== "manual") {
        throw new Error("exposure_details is required when exposure_entry_mode is zone-metering or btzs-zone-metering");
      }
      createBody.exposure_entry_mode = parsedExposureEntryMode;
      createBody.exposure_details_json = null;
    } else {
      createBody.exposure_entry_mode = "manual";
      createBody.exposure_details_json = null;
    }
    resolvePhotographExposureFields(createBody);
    const confirmReexposure = Object.prototype.hasOwnProperty.call(body, "confirm_reexposure")
      ? parseOptionalBooleanValue(getBodyValue(body, "confirm_reexposure"), "confirm_reexposure")
      : undefined;
    if (transportInput.hasCameraId) {
      createBody.camera_id = transportInput.cameraId;
    }
    if (transportInput.hasRollId) {
      createBody.roll_id = transportInput.rollId;
    }
    if (transportInput.hasFilmHolderId) {
      createBody.film_holder_id = transportInput.filmHolderId;
    }
    if (transportInput.hasFrameNumber) {
      createBody.frame_number = transportInput.frameNumber;
    }
    const resolvedTransport = await resolvePhotoTransportByCamera(c, userId, transportInput);
    const requestedFilmId = Object.prototype.hasOwnProperty.call(body, "film_id")
      ? parseOptionalStringValue(getBodyValue(body, "film_id"), "film_id")
      : undefined;
    const filmResolution = await resolvePhotoFilmSelection(
      c,
      userId,
      resolvedTransport,
      requestedFilmId,
      confirmReexposure === true,
    );
    activeFilmHolderLoad = filmResolution.active_film_holder_load;
    reexposureSourceLoad = filmResolution.reexposure_source_load;
    resolvedFilmHolderId = resolvedTransport.film_holder_id;
    resolvedFilmId = filmResolution.film_id;
    if (filmResolution.film_id !== undefined) {
      createBody.film_id = filmResolution.film_id;
    }
    createBody.camera_id = resolvedTransport.camera_id;
    createBody.roll_id = resolvedTransport.roll_id;
    createBody.film_holder_id = resolvedTransport.film_holder_id;
    createBody.frame_number = resolvedTransport.frame_number;
    resolvedLensId = Object.prototype.hasOwnProperty.call(body, "lens_id")
      ? parseOptionalStringValue(getBodyValue(body, "lens_id"), "lens_id") ?? null
      : null;
    if (Object.prototype.hasOwnProperty.call(body, "lens_id")) {
      createBody.lens_id = resolvedLensId;
    }
    filterIds = parseFilterIds(body);
    if (filterIds !== undefined) {
      await ensurePhotographFilterSelection(c, userId, filterIds, resolvedLensId);
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid photograph fields" }, 400);
  }

  const id = ulid();
  const now = new Date().toISOString();
  const cameraId = createBody.camera_id;
  const lensId = resolvedLensId;
  if (typeof cameraId === "string" && cameraId && typeof lensId === "string" && lensId) {
    const incompatible = await rejectIncompatibleLensForCamera(c, userId, cameraId, lensId);
    if (incompatible) return incompatible;
  }
  const fields = PHOTO_FIELDS.filter(f => createBody[f] !== undefined);
  const columns = ["id", "user_id", ...fields, "created_at", "updated_at"].join(", ");
  const placeholders = Array(fields.length + 4).fill("?").join(", ");
  const values = [id, userId, ...fields.map(f => createBody[f] ?? null), now, now];
  const filterStatements = filterIds?.map((filterId, position) =>
    c.env.DB.prepare(
      "INSERT INTO photograph_filters (user_id, photograph_id, filter_id, position, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(userId, id, filterId, position, now)
  ) ?? [];
  const rollIdsToRefresh = uniqueNonNullStrings([createBody.roll_id as string | null | undefined]);
  const photoLoad = activeFilmHolderLoad;
  const photoLoadStatements = photoLoad?.status === "loaded"
    ? [
        c.env.DB.prepare(
          `UPDATE film_holder_loads
           SET status = 'exposed', exposed_at = ?, exposed_photograph_id = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND status = 'loaded'`
        ).bind(now, id, now, photoLoad.id, userId),
      ]
    : reexposureSourceLoad?.status === "exposed"
      ? [
          c.env.DB.prepare(
            `UPDATE film_holder_loads
             SET status = 'discarded', discarded_at = ?, discarded_reason = ?, updated_at = ?
             WHERE id = ? AND user_id = ? AND status = 'exposed'`
          ).bind(now, DEFAULT_FILM_HOLDER_DISCARD_REASON, now, reexposureSourceLoad.id, userId),
          c.env.DB.prepare(
            `INSERT INTO film_holder_loads
             (id, user_id, film_holder_id, film_id, status, loaded_at, exposed_at, exposed_photograph_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'exposed', ?, ?, ?, ?, ?)`
          ).bind(
            ulid(),
            userId,
            resolvedFilmHolderId,
            resolvedFilmId ?? null,
            now,
            now,
            id,
            now,
            now,
          ),
        ]
      : reexposureSourceLoad?.status === "discarded"
        ? [
            c.env.DB.prepare(
              `INSERT INTO film_holder_loads
               (id, user_id, film_holder_id, film_id, status, loaded_at, exposed_at, exposed_photograph_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'exposed', ?, ?, ?, ?, ?)`
            ).bind(
              ulid(),
              userId,
              resolvedFilmHolderId,
              resolvedFilmId ?? null,
              now,
              now,
              id,
              now,
              now,
            ),
          ]
        : [];
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO photographs (${columns}) VALUES (${placeholders})`)
      .bind(...values),
    ...filterStatements,
    ...photoLoadStatements,
    ...rollIdsToRefresh.map((rollId) => rollStatusUpdateStatement(c, userId, rollId)),
  ]);
  const created = await photographWithRelations(c, userId, id);
  if (!created) return c.json({ error: "Not found" }, 404);
  return c.json(created, 201);
});

photos.get("/:id", async (c) => {
  const userId = getUserId(c);
  const item = await photographWithRelations(c, userId, c.req.param("id"));
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

photos.patch("/:id", async (c) => {
  const userId = getUserId(c);
  let body: Record<string, unknown>;
  try {
    const parsed = await c.req.json();
    if (!isPlainObject(parsed)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }
    body = parsed;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const photo = await c.env.DB.prepare(
    "SELECT camera_id, lens_id, film_id, roll_id, frame_number, film_holder_id, shutter_mode, bulb_duration_seconds, shutter_speed_seconds FROM photographs WHERE id = ? AND user_id = ?",
  ).bind(c.req.param("id"), userId).first<{
    camera_id: string | null;
    lens_id: string | null;
    roll_id: string | null;
    frame_number: string | null;
    film_holder_id: string | null;
    shutter_mode: PhotographShutterMode;
    bulb_duration_seconds: number | null;
    shutter_speed_seconds: number | null;
  }>();
  if (!photo) return c.json({ error: "Not found" }, 404);
  if (Object.prototype.hasOwnProperty.call(body, "shutter_speed_seconds")) {
    body.shutter_speed_seconds = parsePositiveNullableNumber(
      "shutter_speed_seconds",
      getBodyValue(body, "shutter_speed_seconds"),
    );
  }

  const hasCameraId = Object.prototype.hasOwnProperty.call(body, "camera_id");
  const hasLensId = Object.prototype.hasOwnProperty.call(body, "lens_id");
  const hasFilterIds = Object.prototype.hasOwnProperty.call(body, "filter_ids");
  const hasRollId = Object.prototype.hasOwnProperty.call(body, "roll_id");
  const hasFilmHolderId = Object.prototype.hasOwnProperty.call(body, "film_holder_id");
  const hasFrameNumber = Object.prototype.hasOwnProperty.call(body, "frame_number");
  const hasFilmId = Object.prototype.hasOwnProperty.call(body, "film_id");
  const hasTransportChange = hasCameraId || hasRollId || hasFilmHolderId || hasFrameNumber || hasFilmId;
  let filterIds: string[] | undefined;
  let activeFilmHolderLoad: ActivePhotoFilmHolderLoad | null = null;
  let reexposureSourceLoad: LatestPhotoFilmHolderLoad | null = null;
  let updatedCameraId: string | null = photo.camera_id;
  let resolvedRollId: string | null = photo.roll_id;
  let resolvedLensId: string | null = photo.lens_id;
  let resolvedFilmHolderId: string | null = photo.film_holder_id;
  let resolvedFilmId: string | null | undefined = undefined;
  try {
    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      body.title = parseOptionalStringValue(getBodyValue(body, "title"), "title");
    }
    if (hasCameraId) {
      updatedCameraId = parseOptionalStringValue(getBodyValue(body, "camera_id"), "camera_id") ?? null;
    }
    if (hasLensId) {
      body.lens_id = parseOptionalStringValue(getBodyValue(body, "lens_id"), "lens_id") ?? null;
    }
    if (hasFilterIds) {
      filterIds = parseFilterIds(body);
    }
    if (hasLensId) {
      resolvedLensId = parseOptionalStringValue(getBodyValue(body, "lens_id"), "lens_id") ?? null;
      body.lens_id = resolvedLensId;
    }
    if (hasTransportChange) {
      const transportInput = resolvePhotoTransportInput(body, {
        camera_id: photo.camera_id,
        roll_id: photo.roll_id,
        film_holder_id: photo.film_holder_id,
        frame_number: photo.frame_number,
      });
      if (Object.prototype.hasOwnProperty.call(body, "camera_id")) {
        body.camera_id = transportInput.cameraId;
      }
      if (Object.prototype.hasOwnProperty.call(body, "roll_id")) {
        body.roll_id = transportInput.rollId;
      }
      if (Object.prototype.hasOwnProperty.call(body, "film_holder_id")) {
        body.film_holder_id = transportInput.filmHolderId;
      }
      if (Object.prototype.hasOwnProperty.call(body, "frame_number")) {
        body.frame_number = transportInput.frameNumber;
      }

      const resolvedTransport = await resolvePhotoTransportByCamera(c, userId, transportInput);
      const requestedFilmId = hasFilmId
        ? parseOptionalStringValue(getBodyValue(body, "film_id"), "film_id")
        : undefined;
      const confirmReexposure = Object.prototype.hasOwnProperty.call(body, "confirm_reexposure")
        ? parseOptionalBooleanValue(getBodyValue(body, "confirm_reexposure"), "confirm_reexposure")
        : undefined;
      const filmResolution = await resolvePhotoFilmSelection(
        c,
        userId,
        resolvedTransport,
        requestedFilmId,
        confirmReexposure === true,
      );
      activeFilmHolderLoad = filmResolution.active_film_holder_load;
      reexposureSourceLoad = filmResolution.reexposure_source_load;
      resolvedFilmHolderId = resolvedTransport.film_holder_id;
      resolvedFilmId = filmResolution.film_id;
      if (filmResolution.film_id !== undefined) {
        body.film_id = filmResolution.film_id;
      }
      resolvedRollId = resolvedTransport.roll_id;
      photo.camera_id = resolvedTransport.camera_id;
      photo.roll_id = resolvedTransport.roll_id;
      photo.film_holder_id = resolvedTransport.film_holder_id;
      photo.frame_number = resolvedTransport.frame_number;
      body.camera_id = resolvedTransport.camera_id;
      body.roll_id = resolvedTransport.roll_id;
      body.film_holder_id = resolvedTransport.film_holder_id;
      body.frame_number = resolvedTransport.frame_number;
    }

    const selectedFilterIds = hasFilterIds ? filterIds ?? [] : await getPhotographFilterIds(c, userId, c.req.param("id"));
    await ensurePhotographFilterSelection(c, userId, selectedFilterIds, resolvedLensId);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid photograph fields" }, 400);
  }

  try {
    resolvePhotographExposureFields(body, {
      shutter_mode: photo.shutter_mode,
      bulb_duration_seconds: photo.bulb_duration_seconds,
      shutter_speed_seconds: photo.shutter_speed_seconds,
    });
    const hasExposureEntryMode = Object.prototype.hasOwnProperty.call(body, "exposure_entry_mode");
    const hasExposureDetails = Object.prototype.hasOwnProperty.call(body, "exposure_details");
    const parsedExposureEntryMode = hasExposureEntryMode
      ? parseExposureEntryMode(getBodyValue(body, "exposure_entry_mode"))
      : undefined;
    if (hasExposureDetails) {
      const parsedExposureDetails = parseExposureDetailsWriteValue(getBodyValue(body, "exposure_details"));
      if (parsedExposureEntryMode != null && parsedExposureDetails.exposure_entry_mode !== parsedExposureEntryMode) {
        throw new Error("exposure_entry_mode must match exposure_details");
      }
      body.exposure_entry_mode = parsedExposureDetails.exposure_entry_mode;
      body.exposure_details_json = parsedExposureDetails.exposure_details_json;
    } else if (parsedExposureEntryMode != null) {
      if (parsedExposureEntryMode !== "manual") {
        throw new Error("exposure_details is required when exposure_entry_mode is zone-metering or btzs-zone-metering");
      }
      body.exposure_entry_mode = parsedExposureEntryMode;
      body.exposure_details_json = null;
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid photograph fields" }, 400);
  }

  const fields = Object.entries(body).filter(([k]) => PHOTO_FIELDS.includes(k));
  if (fields.length === 0 && !hasFilterIds) return c.json({ error: "No valid fields to update" }, 400);
  const cameraId = updatedCameraId;
  const lensId = hasLensId ? body.lens_id : photo.lens_id;
  if (typeof cameraId === "string" && cameraId && typeof lensId === "string" && lensId) {
    const incompatible = await rejectIncompatibleLensForCamera(c, userId, cameraId, lensId);
    if (incompatible) return incompatible;
  }
  const now = new Date().toISOString();
  const set = [...fields.map(([k]) => `${k} = ?`), "updated_at = ?"].join(", ");
  const filterStatements = hasFilterIds
    ? [
        c.env.DB.prepare("DELETE FROM photograph_filters WHERE user_id = ? AND photograph_id = ?")
          .bind(userId, c.req.param("id")),
        ...(filterIds ?? []).map((filterId, position) =>
          c.env.DB.prepare(
            "INSERT INTO photograph_filters (user_id, photograph_id, filter_id, position, created_at) VALUES (?, ?, ?, ?, ?)"
          ).bind(userId, c.req.param("id"), filterId, position, now)
        ),
      ]
    : [];
  const rollIdsToRefresh = uniqueNonNullStrings([photo.roll_id, resolvedRollId]);
  const photoLoad = activeFilmHolderLoad;
  const photoLoadStatements = photoLoad?.status === "loaded"
    ? [
        c.env.DB.prepare(
          `UPDATE film_holder_loads
           SET status = 'exposed', exposed_at = ?, exposed_photograph_id = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND status = 'loaded'`
        ).bind(now, c.req.param("id"), now, photoLoad.id, userId),
      ]
    : reexposureSourceLoad?.status === "exposed"
      ? [
          c.env.DB.prepare(
            `UPDATE film_holder_loads
             SET status = 'discarded', discarded_at = ?, discarded_reason = ?, updated_at = ?
             WHERE id = ? AND user_id = ? AND status = 'exposed'`
          ).bind(now, DEFAULT_FILM_HOLDER_DISCARD_REASON, now, reexposureSourceLoad.id, userId),
          c.env.DB.prepare(
            `INSERT INTO film_holder_loads
             (id, user_id, film_holder_id, film_id, status, loaded_at, exposed_at, exposed_photograph_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'exposed', ?, ?, ?, ?, ?)`
          ).bind(
            ulid(),
            userId,
            resolvedFilmHolderId,
            resolvedFilmId ?? null,
            now,
            now,
            c.req.param("id"),
            now,
            now,
          ),
        ]
      : reexposureSourceLoad?.status === "discarded"
        ? [
            c.env.DB.prepare(
              `INSERT INTO film_holder_loads
               (id, user_id, film_holder_id, film_id, status, loaded_at, exposed_at, exposed_photograph_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'exposed', ?, ?, ?, ?, ?)`
            ).bind(
              ulid(),
              userId,
              resolvedFilmHolderId,
              resolvedFilmId ?? null,
              now,
              now,
              c.req.param("id"),
              now,
              now,
            ),
          ]
        : [];
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE photographs SET ${set} WHERE id = ? AND user_id = ?`
    ).bind(...fields.map(([, v]) => v), now, c.req.param("id"), userId),
    ...filterStatements,
    ...photoLoadStatements,
    ...rollIdsToRefresh.map((rollId) => rollStatusUpdateStatement(c, userId, rollId)),
  ]);
  const updated = await photographWithRelations(c, userId, c.req.param("id"));
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

photos.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const photographId = c.req.param("id");
  const photo = await c.env.DB.prepare("SELECT id, roll_id FROM photographs WHERE id = ? AND user_id = ?")
    .bind(photographId, userId).first<{ id: string; roll_id: string | null }>();
  if (!photo) return c.json({ error: "Not found" }, 404);

  const images = await c.env.DB.prepare(
    "SELECT r2_key, thumbnail_r2_key, original_r2_key FROM photograph_images WHERE photograph_id = ?"
  )
    .bind(photographId).all<Pick<StoredPhotographImage, "r2_key" | "thumbnail_r2_key" | "original_r2_key">>();
  await deleteR2Keys(c, images.results.flatMap(image => imageStorageKeys(image)));

  const rollIdsToRefresh = uniqueNonNullStrings([photo.roll_id]);
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE film_holder_loads
       SET status = 'loaded',
           exposed_at = NULL,
           exposed_photograph_id = NULL,
           updated_at = ?
       WHERE user_id = ? AND exposed_photograph_id = ? AND status = 'exposed'`
    ).bind(now, userId, photographId),
    c.env.DB.prepare(
      `UPDATE film_holder_loads
       SET exposed_photograph_id = NULL,
           updated_at = ?
       WHERE user_id = ? AND exposed_photograph_id = ? AND status <> 'exposed'`
    ).bind(now, userId, photographId),
    c.env.DB.prepare("DELETE FROM photograph_images WHERE photograph_id = ?")
      .bind(photographId),
    c.env.DB.prepare("DELETE FROM photograph_filters WHERE photograph_id = ?")
      .bind(photographId),
    c.env.DB.prepare("DELETE FROM photographs WHERE id = ? AND user_id = ?")
      .bind(photographId, userId),
    ...rollIdsToRefresh.map((rollId) => rollStatusUpdateStatement(c, userId, rollId)),
  ]);
  return new Response(null, { status: 204 });
});

// Image endpoints

photos.get("/:id/images", async (c) => {
  const userId = getUserId(c);
  const photo = await c.env.DB.prepare("SELECT id FROM photographs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first();
  if (!photo) return c.json({ error: "Not found" }, 404);
  const rows = await c.env.DB.prepare(
    `SELECT id, photograph_id, r2_key, content_type, width, height,
            thumbnail_r2_key, thumbnail_content_type, thumbnail_width, thumbnail_height,
            original_r2_key, original_content_type, original_width, original_height,
            original_filename, created_at
       FROM photograph_images
      WHERE photograph_id = ? ORDER BY created_at ASC`
  ).bind(c.req.param("id")).all<StoredPhotographImage>();
  const items = await Promise.all(rows.results.map(img => publicImage(c, userId, img)));
  return c.json({ items, total: items.length });
});

photos.get("/:id/images/:image_id/file", async (c) => {
  let variant: ImageVariant;
  try {
    variant = parseImageVariantQuery(c.req.query("variant"));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unsupported image variant" }, 400);
  }

  const image = await c.env.DB.prepare(
    `SELECT pi.id, pi.photograph_id, pi.r2_key, pi.content_type, pi.width, pi.height,
            pi.thumbnail_r2_key, pi.thumbnail_content_type, pi.thumbnail_width, pi.thumbnail_height,
            pi.original_r2_key, pi.original_content_type, pi.original_width, pi.original_height,
            pi.original_filename, pi.created_at, p.user_id
     FROM photograph_images pi
     JOIN photographs p ON p.id = pi.photograph_id
     WHERE pi.id = ? AND pi.photograph_id = ?`
  ).bind(c.req.param("image_id"), c.req.param("id")).first<StoredPhotographImageWithOwner>();
  if (!image) return c.json({ error: "Not found" }, 404);
  if (!c.env.JWT_SECRET) return c.json({ error: "Image URL signing is not configured" }, 500);
  if (!c.env.REFERENCE_IMAGES) return c.json({ error: "Image storage is not configured" }, 503);

  const expires = Number.parseInt(c.req.query("expires") ?? "", 10);
  const signature = c.req.query("signature");
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000) || !signature) {
    return c.json({ error: "Image URL expired" }, 403);
  }

  const expectedSignatures = variant === "display"
    ? [
        await signImageUrl(c.env.JWT_SECRET, imageSignaturePayload(image.user_id, image.photograph_id, image.id, expires)),
        await signImageUrl(
          c.env.JWT_SECRET,
          imageVariantSignaturePayload("display", image.user_id, image.photograph_id, image.id, expires),
        ),
      ]
    : [
        await signImageUrl(
          c.env.JWT_SECRET,
          imageVariantSignaturePayload(variant, image.user_id, image.photograph_id, image.id, expires),
        ),
      ];
  if (!expectedSignatures.some((expected) => constantTimeEqual(signature, expected))) {
    return c.json({ error: "Image URL expired" }, 403);
  }

  const storage = imageVariantStorage(image, variant);
  if (!storage.key || !storage.contentType) return c.json({ error: "Not found" }, 404);

  const object = await c.env.REFERENCE_IMAGES.get(storage.key);
  if (!object) return c.json({ error: "Not found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", storage.contentType);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
});

photos.post("/:id/images", async (c) => {
  const userId = getUserId(c);
  if (!c.env.REFERENCE_IMAGES) return c.json({ error: "Image storage is not configured" }, 503);
  if (!c.env.IMAGES) return c.json({ error: "Image transformation is not configured" }, 503);

  const photo = await c.env.DB.prepare("SELECT id FROM photographs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<{ id: string }>();
  if (!photo) return c.json({ error: "Not found" }, 404);

  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return c.json({ error: "Expected multipart form data" }, 400);
  }

  const id = ulid();
  const createdAt = new Date().toISOString();
  let sourceImage: ParsedImageSource;
  let thumbnailOverride: ParsedImageFile | null = null;
  try {
    sourceImage = await readSourceImageUpload(form);
    thumbnailOverride = await readMultipartImageFile(form, "thumbnail");
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid image upload" }, 400);
  }

  const originalImage = sourceImage.originalFile ?? sourceImage;
  let originalBody!: ArrayBuffer;
  let originalDimensions: { width: number; height: number } | null = null;
  let originalContentType = originalImage.contentType;
  let sourceDimensions: { width: number; height: number } | null = null;
  let thumbnailOverrideDimensions: { width: number; height: number } | null = null;
  let thumbnailOverrideBlob: Blob | null = null;
  let sourceBlob: Blob;
  let sourceContentType = sourceImage.contentType;
  try {
    originalBody = await originalImage.file.arrayBuffer();
    const originalBytes = new Uint8Array(originalBody);
    if (!originalContentType) {
      originalContentType = sniffContentType(originalBytes);
    }
    if (!originalContentType) {
      return c.json({ error: "original, display, or file image must be a supported image type" }, 400);
    }

    const originalBlob = new Blob([originalBody], { type: originalContentType });
    originalDimensions = readImageDimensions(originalBytes);
    if (!originalDimensions) {
      const originalInfo = await c.env.IMAGES.info(originalBlob.stream());
      if (typeof originalInfo !== "object" || originalInfo === null || !("width" in originalInfo) || !("height" in originalInfo)) {
        return c.json({ error: "original, display, or file image must be a supported image type" }, 400);
      }

      originalDimensions = {
        width: originalInfo.width,
        height: originalInfo.height,
      };
    }

    const sourceBody = sourceImage.file === originalImage.file
      ? originalBody
      : await sourceImage.file.arrayBuffer();
    const sourceBytes = new Uint8Array(sourceBody);
    if (!sourceContentType) {
      sourceContentType = sniffContentType(sourceBytes);
    }
    if (!sourceContentType) {
      return c.json({ error: "original, display, or file image must be a supported image type" }, 400);
    }

    sourceBlob = new Blob([sourceBody], { type: sourceContentType });
    sourceDimensions = readImageDimensions(sourceBytes);
    if (!sourceDimensions) {
      const sourceInfo = await c.env.IMAGES.info(sourceBlob.stream());
      if (typeof sourceInfo !== "object" || sourceInfo === null || !("width" in sourceInfo) || !("height" in sourceInfo)) {
        return c.json({ error: "original, display, or file image must be a supported image type" }, 400);
      }

      sourceDimensions = {
        width: sourceInfo.width,
        height: sourceInfo.height,
      };
    }

    if (thumbnailOverride) {
      const thumbnailBody = await thumbnailOverride.file.arrayBuffer();
      const thumbnailBytes = new Uint8Array(thumbnailBody);
      let thumbnailContentType = thumbnailOverride.contentType ?? sniffContentType(thumbnailBytes);
      if (!thumbnailContentType) {
        return c.json({ error: "thumbnail image must be a supported image type" }, 400);
      }
      thumbnailOverrideBlob = new Blob([thumbnailBody], { type: thumbnailContentType });
      thumbnailOverrideDimensions = readImageDimensions(thumbnailBytes);
      if (!thumbnailOverrideDimensions) {
        const thumbnailInfo = await c.env.IMAGES.info(thumbnailOverrideBlob.stream());
        if (typeof thumbnailInfo !== "object" || thumbnailInfo === null || !("width" in thumbnailInfo) || !("height" in thumbnailInfo)) {
          return c.json({ error: "thumbnail image must be a supported image type" }, 400);
        }
        thumbnailOverrideDimensions = {
          width: thumbnailInfo.width,
          height: thumbnailInfo.height,
        };
      }
    }
  } catch (error) {
    return imagesErrorResponse(c, error, "original, display, or file image must be a supported image type", 400);
  }
  if (!sourceDimensions) {
    return c.json({ error: "original, display, or file image must be a supported image type" }, 400);
  }
  if (!originalDimensions) {
    return c.json({ error: "original, display, or file image must be a supported image type" }, 400);
  }

  let displayImage: GeneratedImageVariant;
  let thumbnailImage: GeneratedImageVariant;
  try {
    displayImage = await generateImageVariant(c, sourceBlob, sourceDimensions.width, sourceDimensions.height, 2048);
    thumbnailImage = thumbnailOverrideBlob && thumbnailOverrideDimensions
      ? await generateImageVariant(c, thumbnailOverrideBlob, thumbnailOverrideDimensions.width, thumbnailOverrideDimensions.height, 256)
      : await generateImageVariant(c, sourceBlob, sourceDimensions.width, sourceDimensions.height, 256);
  } catch (error) {
    return imagesErrorResponse(c, error, "Image transformation failed");
  }

  const displayKey = imageR2Key(userId, photo.id, id, "display", "jpg");
  const thumbnailKey = imageR2Key(userId, photo.id, id, "thumbnail", "jpg");
  const originalKey = imageR2Key(
    userId,
    photo.id,
    id,
    "original",
    extensionFor(originalImage.file, originalContentType),
  );
  const filename = sourceImage.originalFilename;
  const uploads = [
    {
      variant: "original" as const,
      body: originalBody,
      contentType: originalContentType,
      key: originalKey,
      width: originalDimensions.width,
      height: originalDimensions.height,
    },
    {
      variant: "display" as const,
      body: displayImage.body,
      contentType: displayImage.contentType,
      key: displayKey,
      width: displayImage.width,
      height: displayImage.height,
    },
    {
      variant: "thumbnail" as const,
      body: thumbnailImage.body,
      contentType: thumbnailImage.contentType,
      key: thumbnailKey,
      width: thumbnailImage.width,
      height: thumbnailImage.height,
    },
  ];

  const storedKeys: string[] = [];
  try {
    for (const upload of uploads) {
      const body = await new Response(upload.body).arrayBuffer();
      await c.env.REFERENCE_IMAGES.put(upload.key, body, {
        httpMetadata: { contentType: upload.contentType },
        customMetadata: {
          user_id: userId,
          photograph_id: photo.id,
          image_id: id,
          variant: upload.variant,
          original_filename: filename ?? "",
        },
      });
      storedKeys.push(upload.key);
    }
  } catch {
    await deleteR2Keys(c, storedKeys).catch(() => undefined);
    return c.json({ error: "Image storage failed" }, 502);
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO photograph_images
       (id, photograph_id, r2_key, content_type, width, height,
        thumbnail_r2_key, thumbnail_content_type, thumbnail_width, thumbnail_height,
        original_r2_key, original_content_type, original_width, original_height,
        original_filename, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      photo.id,
      displayKey,
      displayImage.contentType,
      displayImage.width,
      displayImage.height,
      thumbnailKey,
      thumbnailImage.contentType,
      thumbnailImage.width,
      thumbnailImage.height,
      originalKey,
      originalContentType,
      originalDimensions.width,
      originalDimensions.height,
      filename,
      createdAt,
    ).run();
  } catch {
    await deleteR2Keys(c, storedKeys).catch(() => undefined);
    return c.json({ error: "Image metadata storage failed" }, 500);
  }

  const image = await c.env.DB.prepare(
    `SELECT id, photograph_id, r2_key, content_type, width, height,
            thumbnail_r2_key, thumbnail_content_type, thumbnail_width, thumbnail_height,
            original_r2_key, original_content_type, original_width, original_height,
            original_filename, created_at
       FROM photograph_images
      WHERE id = ? AND photograph_id = ?`
  ).bind(id, photo.id).first<StoredPhotographImage>();
  if (!image) return c.json({ error: "Image metadata storage failed" }, 500);

  return c.json(await publicImage(c, userId, image), 201);
});

photos.post("/:id/images/:image_id/display", async (c) => {
  const userId = getUserId(c);
  if (!c.env.REFERENCE_IMAGES) return c.json({ error: "Image storage is not configured" }, 503);
  if (!c.env.IMAGES) return c.json({ error: "Image transformation is not configured" }, 503);

  const image = await c.env.DB.prepare(
    `SELECT pi.id, pi.photograph_id, pi.r2_key, pi.content_type, pi.width, pi.height,
            pi.thumbnail_r2_key, pi.thumbnail_content_type, pi.thumbnail_width, pi.thumbnail_height,
            pi.original_r2_key, pi.original_content_type, pi.original_width, pi.original_height,
            pi.original_filename, pi.created_at
     FROM photograph_images pi
     JOIN photographs p ON p.id = pi.photograph_id
     WHERE pi.id = ? AND pi.photograph_id = ? AND p.user_id = ?`
  ).bind(c.req.param("image_id"), c.req.param("id"), userId).first<StoredPhotographImage>();
  if (!image) return c.json({ error: "Not found" }, 404);

  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return c.json({ error: "Expected multipart form data" }, 400);
  }

  let displayUpload: ParsedImageFile | null = null;
  try {
    displayUpload = await readMultipartImageFile(form, "display");
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid display image upload" }, 400);
  }
  if (!displayUpload) return c.json({ error: "display image is required" }, 400);

  let displayBlob: Blob;
  let displayDimensions: { width: number; height: number } | null = null;
  let displayContentType = displayUpload.contentType;
  try {
    const displayBody = await displayUpload.file.arrayBuffer();
    const displayBytes = new Uint8Array(displayBody);
    if (!displayContentType) {
      displayContentType = sniffContentType(displayBytes);
    }
    if (!displayContentType) {
      return c.json({ error: "display image must be a supported image type" }, 400);
    }
    displayBlob = new Blob([displayBody], { type: displayContentType });
    displayDimensions = readImageDimensions(displayBytes);
    if (!displayDimensions) {
      const displayInfo = await c.env.IMAGES.info(displayBlob.stream());
      if (typeof displayInfo !== "object" || displayInfo === null || !("width" in displayInfo) || !("height" in displayInfo)) {
        return c.json({ error: "display image must be a supported image type" }, 400);
      }
      displayDimensions = {
        width: displayInfo.width,
        height: displayInfo.height,
      };
    }
  } catch (error) {
    return imagesErrorResponse(c, error, "display image must be a supported image type", 400);
  }
  if (!displayDimensions) return c.json({ error: "display image must be a supported image type" }, 400);

  let displayImage: GeneratedImageVariant;
  try {
    displayImage = await generateImageVariant(c, displayBlob, displayDimensions.width, displayDimensions.height, 2048);
  } catch (error) {
    return imagesErrorResponse(c, error, "Image transformation failed");
  }

  const displayKey = imageR2Key(userId, image.photograph_id, image.id, "display", "jpg");
  try {
    const body = await new Response(displayImage.body).arrayBuffer();
    await c.env.REFERENCE_IMAGES.put(displayKey, body, {
      httpMetadata: { contentType: displayImage.contentType },
      customMetadata: {
        user_id: userId,
        photograph_id: image.photograph_id,
        image_id: image.id,
        variant: "display",
        original_filename: image.original_filename ?? "",
      },
    });
  } catch {
    return c.json({ error: "Image storage failed" }, 502);
  }

  await c.env.DB.prepare(
    `UPDATE photograph_images
        SET r2_key = ?, content_type = ?, width = ?, height = ?
      WHERE id = ? AND photograph_id = ?`
  ).bind(
    displayKey,
    displayImage.contentType,
    displayImage.width,
    displayImage.height,
    image.id,
    image.photograph_id,
  ).run();

  const updatedImage = await c.env.DB.prepare(
    `SELECT id, photograph_id, r2_key, content_type, width, height,
            thumbnail_r2_key, thumbnail_content_type, thumbnail_width, thumbnail_height,
            original_r2_key, original_content_type, original_width, original_height,
            original_filename, created_at
       FROM photograph_images
      WHERE id = ? AND photograph_id = ?`
  ).bind(image.id, image.photograph_id).first<StoredPhotographImage>();
  if (!updatedImage) return c.json({ error: "Image metadata storage failed" }, 500);

  return c.json(await publicImage(c, userId, updatedImage));
});

photos.delete("/:id/images/:image_id", async (c) => {
  const userId = getUserId(c);
  const image = await c.env.DB.prepare(
    `SELECT pi.id, pi.photograph_id, pi.r2_key, pi.content_type, pi.width, pi.height,
            pi.thumbnail_r2_key, pi.thumbnail_content_type, pi.thumbnail_width, pi.thumbnail_height,
            pi.original_r2_key, pi.original_content_type, pi.original_width, pi.original_height,
            pi.original_filename, pi.created_at
     FROM photograph_images pi
     JOIN photographs p ON p.id = pi.photograph_id
     WHERE pi.id = ? AND pi.photograph_id = ? AND p.user_id = ?`
  ).bind(c.req.param("image_id"), c.req.param("id"), userId).first<StoredPhotographImage>();
  if (!image) return c.json({ error: "Not found" }, 404);

  const deletedImage = await deleteR2Keys(c, imageStorageKeys(image));
  if (!deletedImage) return c.json({ error: "Image storage is not configured" }, 503);

  await c.env.DB.prepare("DELETE FROM photograph_images WHERE id = ?")
    .bind(image.id).run();
  return new Response(null, { status: 204 });
});

export default photos;
