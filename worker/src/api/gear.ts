import { Hono } from "hono";
import { ulid } from "ulid";
import { Env } from "../index";
import { Camera, Filter, FilmHolder, FilmStock, Lens } from "../types";
import {
  isPlainObject,
  parseFilmStockType,
  parseReciprocityPFactor,
  resolveFilmStockType,
  resolveReciprocityPFactor,
  toFilmStockResponse,
} from "./film-stock";
import { parseRollFormatValue } from "./media-compat";
import { authMiddleware, getUserId } from "./middleware";

const gear = new Hono<{ Bindings: Env }>();

gear.use("*", authMiddleware);

function paginate(query: Record<string, string>) {
  const limit = Math.min(parseInt(query.limit ?? "50"), 200);
  const offset = parseInt(query.offset ?? "0");
  return { limit: isNaN(limit) ? 50 : limit, offset: isNaN(offset) ? 0 : offset };
}

const LENS_APERTURE_INCREMENTS = ["full", "half", "third"] as const;
const DEFAULT_LENS_MIN_F_STOP = 5.6;
const DEFAULT_LENS_MAX_F_STOP = 32;
const DEFAULT_LENS_APERTURE_INCREMENT = "full";
const DEFAULT_LENS_FLARE_FACTOR = 0.02;

const FILTER_PRESET_SOURCE = "Filter factor from the common filter factors table (approximate and film-response dependent).";
type FilterPreset = {
  key: string;
  name: string;
  code: string;
  filter_factor: number;
  category: string;
  notes?: string;
};
const FILTER_PRESETS = [
  { key: "wratten_2a", name: "Pale yellow / UV", code: "Wratten 2A", filter_factor: 1, category: "Basic color" },
  { key: "wratten_2b", name: "Pale yellow / UV", code: "Wratten 2B", filter_factor: 1, category: "Basic color" },
  { key: "wratten_2e", name: "Pale yellow / UV", code: "Wratten 2E", filter_factor: 1, category: "Basic color" },
  { key: "wratten_3", name: "Light yellow", code: "Wratten 3", filter_factor: 1.5, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_8", name: "Yellow", code: "Wratten 8", filter_factor: 2, category: "Basic color" },
  { key: "wratten_9", name: "Deep yellow", code: "Wratten 9", filter_factor: 2, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_12", name: "Deep yellow", code: "Wratten 12", filter_factor: 1.75, category: "Basic color", notes: "Range reported by source material (1.5-2)." },
  { key: "wratten_15", name: "Deep yellow", code: "Wratten 15", filter_factor: 1.5, category: "Basic color" },
  { key: "wratten_16", name: "Yellow-orange", code: "Wratten 16", filter_factor: 2.5, category: "Basic color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_21", name: "Orange", code: "Wratten 21", filter_factor: 4, category: "Special dye color" },
  { key: "wratten_22", name: "Deep orange", code: "Wratten 22", filter_factor: 5, category: "Basic color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_24", name: "Red", code: "Wratten 24", filter_factor: 6, category: "Basic color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_25", name: "Red", code: "Wratten 25", filter_factor: 8, category: "Basic color" },
  { key: "wratten_25a", name: "Deep red", code: "Wratten 29", filter_factor: 20, category: "Basic color", notes: "Uses the Kodak Wratten 29 deep red spectral curve." },
  { key: "wratten_26", name: "Red", code: "Wratten 26", filter_factor: 10, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_29", name: "Deep red", code: "Wratten 29", filter_factor: 20, category: "Basic color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_32", name: "Magenta", code: "Wratten 32", filter_factor: 2, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_34a", name: "Violet", code: "Wratten 34A", filter_factor: 2, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_38a", name: "Blue", code: "Wratten 38A", filter_factor: 4, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_44", name: "Light blue-green", code: "Wratten 44", filter_factor: 2, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_44a", name: "Light blue-green", code: "Wratten 44A", filter_factor: 2, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_47", name: "Blue", code: "Wratten 47", filter_factor: 5, category: "Basic color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_47a", name: "Light blue", code: "Wratten 47A", filter_factor: 3, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_47b", name: "Blue", code: "Wratten 47B", filter_factor: 6, category: "Color balance", notes: "Uses the Kodak Wratten 47 spectral curve." },
  { key: "wratten_47b+", name: "Blue", code: "Wratten 47B+", filter_factor: 2, category: "Color balance", notes: "Uses the Kodak Wratten 47 spectral curve." },
  { key: "wratten_58", name: "Green", code: "Wratten 58", filter_factor: 2.25, category: "Basic color", notes: "Range reported by source material (1.5-3)." },
  { key: "wratten_61", name: "Deep green", code: "Wratten 61", filter_factor: 3, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_70", name: "Dark red", code: "Wratten 70", filter_factor: 8, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_87", name: "Infrared", code: "Wratten 87", filter_factor: 16, category: "Infrared", notes: "Approximate factor; depends strongly on film and meter response." },
  { key: "wratten_87a", name: "Infrared", code: "Wratten 87A", filter_factor: 16, category: "Infrared", notes: "Approximate factor; depends strongly on film and meter response." },
  { key: "wratten_87b", name: "Infrared", code: "Wratten 87B", filter_factor: 16, category: "Infrared", notes: "Approximate factor; depends strongly on film and meter response." },
  { key: "wratten_87c", name: "Infrared", code: "Wratten 87C", filter_factor: 16, category: "Infrared", notes: "Approximate factor; depends strongly on film and meter response." },
  { key: "wratten_89b", name: "Infrared", code: "Wratten 89B", filter_factor: 16, category: "Infrared", notes: "Approximate factor; depends strongly on film and meter response." },
  { key: "wratten_90", name: "Dark amber", code: "Wratten 90", filter_factor: 2, category: "Basic color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_92", name: "Red", code: "Wratten 92", filter_factor: 8, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_98", name: "Blue", code: "Wratten 98", filter_factor: 6, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_99", name: "Green", code: "Wratten 99", filter_factor: 3, category: "Basic color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_102", name: "Yellow-green", code: "Wratten 102", filter_factor: 2, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "wratten_106", name: "Amber", code: "Wratten 106", filter_factor: 2, category: "Special dye color", notes: "Approximate factor; film response dependent." },
  { key: "uv", name: "UV", code: "UV/Haze", filter_factor: 1, category: "UV protection" },
  { key: "nd_0_3", name: "ND 0.3", code: "ND", filter_factor: 2, category: "Neutral density" },
  { key: "nd_0_6", name: "ND 0.6", code: "ND", filter_factor: 4, category: "Neutral density" },
  { key: "nd_0_9", name: "ND 0.9", code: "ND", filter_factor: 8, category: "Neutral density" },
  { key: "nd_1_2", name: "ND 1.2", code: "ND", filter_factor: 16, category: "Neutral density" },
] as FilterPreset[];
const FILTER_PRESET_INDEX = new Map<string, FilterPreset>(FILTER_PRESETS.map((preset) => [preset.key, preset]));
const FILTER_REMOVED_FIELDS = [
  "maker",
  "category",
  "size",
  "thread_size",
  "size_system",
  "can_simulate_bw",
  "simulation_rgb",
  "simulation_strength",
  "simulation_brightness_boost",
] as const;

function toLensResponse(row: Lens, applicableCameraIds: string[] = []): Lens {
  return {
    ...row,
    ...normalizeShutterResponse(row),
    min_f_stop: row.min_f_stop ?? DEFAULT_LENS_MIN_F_STOP,
    max_f_stop: row.max_f_stop ?? DEFAULT_LENS_MAX_F_STOP,
    aperture_increment: row.aperture_increment ?? DEFAULT_LENS_APERTURE_INCREMENT,
    flare_factor: row.flare_factor ?? DEFAULT_LENS_FLARE_FACTOR,
    applicable_camera_ids: applicableCameraIds,
  };
}

function getBodyValue(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key) ? body[key] : undefined;
}

function rejectRemovedFilterFields(body: Record<string, unknown>) {
  const removedFields = FILTER_REMOVED_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (removedFields.length > 0) {
    throw new Error(`Removed filter fields are no longer accepted: ${removedFields.join(", ")}`);
  }
}

function parseNullableNumber(key: string, value: unknown): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a number`);
  }
  return value;
}

function parsePositiveNullableNumber(key: string, value: unknown): number | null | undefined {
  const parsed = parseNullableNumber(key, value);
  if (parsed === undefined || parsed === null) return parsed;
  if (parsed <= 0) {
    throw new Error(`${key} must be greater than 0`);
  }
  return parsed;
}

function parseNonNegativeNullableNumber(key: string, value: unknown): number | null | undefined {
  const parsed = parseNullableNumber(key, value);
  if (parsed === undefined || parsed === null) return parsed;
  if (parsed < 0) {
    throw new Error(`${key} must be zero or greater`);
  }
  return parsed;
}

function parseFilmType(value: unknown): Camera["film_type"] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || (value !== "sheet" && value !== "roll")) {
    throw new Error("film_type must be one of: sheet, roll, null");
  }
  return value;
}

function parseShutterBulbCompatibility(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isInteger(value) && (value === 0 || value === 1)) return value;
  if (typeof value === "string" && (value === "0" || value === "1")) return Number(value);
  throw new Error("supports_bulb must be a boolean-compatible value");
}

function parseBooleanFlag(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isInteger(value) && (value === 0 || value === 1)) return value;
  if (typeof value === "string" && (value === "0" || value === "1")) return Number(value);
  throw new Error(`${field} must be a boolean-compatible value`);
}

function parseHasShutter(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const parsed = parseShutterBulbCompatibility(value);
  if (parsed === undefined) throw new Error("has_shutter must be a boolean-compatible value");
  return parsed;
}

function toShutterBulb(value: unknown): boolean {
  return value === 1 || value === true;
}

function toBooleanFlag(value: unknown): boolean {
  return value === 1 || value === true;
}

function normalizeShutterResponse(row: {
  has_shutter: unknown;
  min_shutter_speed_seconds: number | null;
  max_shutter_speed_seconds: number | null;
  supports_bulb: unknown;
}) {
  const hasShutter = toShutterBulb(row.has_shutter);
  return {
    has_shutter: hasShutter,
    min_shutter_speed_seconds: hasShutter ? row.min_shutter_speed_seconds : null,
    max_shutter_speed_seconds: hasShutter ? row.max_shutter_speed_seconds : null,
    supports_bulb: hasShutter ? toShutterBulb(row.supports_bulb) : false,
  };
}

function resolveDefaultHasShutter(params: {
  filmType: Camera["film_type"];
  currentHasShutter: 0 | 1;
  minShutterSpeedSeconds: number | null;
  maxShutterSpeedSeconds: number | null;
  supportsBulb: number;
}) {
  if (params.filmType === "roll") return 1;
  if (params.filmType === "sheet") return 0;
  if (
    params.minShutterSpeedSeconds !== null
    || params.maxShutterSpeedSeconds !== null
    || params.supportsBulb === 1
  ) {
    return 1;
  }
  return params.currentHasShutter;
}

function normalizeShutterValues(params: {
  requestedHasShutter: number | undefined;
  defaultHasShutter: 0 | 1;
  minShutterSpeedSeconds: number | null;
  maxShutterSpeedSeconds: number | null;
  supportsBulb: number;
}) {
  const hasShutter = params.requestedHasShutter ?? params.defaultHasShutter;
  const resolvedSupportsBulb = hasShutter === 0 ? 0 : params.supportsBulb;
  return {
    hasShutter,
    supportsBulb: resolvedSupportsBulb,
    minShutterSpeedSeconds: hasShutter === 0 ? null : params.minShutterSpeedSeconds,
    maxShutterSpeedSeconds: hasShutter === 0 ? null : params.maxShutterSpeedSeconds,
  };
}

function parseApertureIncrement(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string" || !LENS_APERTURE_INCREMENTS.includes(value as (typeof LENS_APERTURE_INCREMENTS)[number])) {
    throw new Error("aperture_increment must be one of: full, half, third");
  }
  return value;
}

// Legacy camera-side compatibility alias retained for existing callers.
// The authoritative compatibility write surface is Lens.applicable_camera_ids.
function parseLegacyAcceptableLensIds(body: Record<string, unknown>): string[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, "acceptable_lens_ids")) return undefined;
  const raw = body.acceptable_lens_ids;
  if (!Array.isArray(raw)) {
    throw new Error("acceptable_lens_ids must be an array");
  }
  if (!raw.every((id): id is string => typeof id === "string")) {
    throw new Error("acceptable_lens_ids must be an array of strings");
  }
  if (!raw.every((id) => id !== "")) {
    throw new Error("acceptable_lens_ids must not contain empty strings");
  }
  return [...new Set(raw)];
}

function parseApplicableLensIds(body: Record<string, unknown>): string[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, "applicable_lens_ids")) return undefined;
  const raw = body.applicable_lens_ids;
  if (!Array.isArray(raw)) {
    throw new Error("applicable_lens_ids must be an array");
  }
  if (!raw.every((id): id is string => typeof id === "string")) {
    throw new Error("applicable_lens_ids must be an array of strings");
  }
  if (!raw.every((id) => id !== "")) {
    throw new Error("applicable_lens_ids must not contain empty strings");
  }
  return [...new Set(raw)];
}

function parseApplicableCameraIds(body: Record<string, unknown>): string[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, "applicable_camera_ids")) return undefined;
  const raw = body.applicable_camera_ids;
  if (!Array.isArray(raw)) {
    throw new Error("applicable_camera_ids must be an array");
  }
  if (!raw.every((id): id is string => typeof id === "string")) {
    throw new Error("applicable_camera_ids must be an array of strings");
  }
  if (!raw.every((id) => id !== "")) {
    throw new Error("applicable_camera_ids must not contain empty strings");
  }
  return [...new Set(raw)];
}

async function ensureOwnLenses(c: { env: Env }, userId: string, lensIds: string[]) {
  if (lensIds.length === 0) return;
  const placeholders = lensIds.map(() => "?").join(", ");
  const existingRows = await c.env.DB.prepare(`SELECT id FROM lenses WHERE user_id = ? AND id IN (${placeholders})`)
    .bind(userId, ...lensIds).all<{ id: string }>();
  const existing = new Set(existingRows.results.map((row) => row.id));
  const missing = lensIds.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    throw new Error(`acceptable_lens_ids contains unknown or inaccessible lens IDs: ${missing.join(", ")}`);
  }
}

async function ensureOwnCameras(c: { env: Env }, userId: string, cameraIds: string[]) {
  if (cameraIds.length === 0) return;
  const placeholders = cameraIds.map(() => "?").join(", ");
  const existingRows = await c.env.DB.prepare(`SELECT id FROM cameras WHERE user_id = ? AND id IN (${placeholders})`)
    .bind(userId, ...cameraIds).all<{ id: string }>();
  const existing = new Set(existingRows.results.map((row) => row.id));
  const missing = cameraIds.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    throw new Error(`applicable_camera_ids contains unknown or inaccessible camera IDs: ${missing.join(", ")}`);
  }
}

async function ensureOwnApplicableLenses(c: { env: Env }, userId: string, lensIds: string[]) {
  if (lensIds.length === 0) return;
  const placeholders = lensIds.map(() => "?").join(", ");
  const existingRows = await c.env.DB.prepare(`SELECT id FROM lenses WHERE user_id = ? AND id IN (${placeholders})`)
    .bind(userId, ...lensIds).all<{ id: string }>();
  const existing = new Set(existingRows.results.map((row) => row.id));
  const missing = lensIds.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    throw new Error(`applicable_lens_ids contains unknown or inaccessible lens IDs: ${missing.join(", ")}`);
  }
}

async function getCameraAcceptableLensIds(env: Env, userId: string, cameraIds: string[]) {
  // Read-only compatibility summary for camera responses.
  const lensIdsByCamera = new Map<string, string[]>();
  for (const cameraId of cameraIds) {
    lensIdsByCamera.set(cameraId, []);
  }
  if (cameraIds.length === 0) return lensIdsByCamera;
  const placeholders = cameraIds.map(() => "?").join(", ");
  const rows = await env.DB.prepare(
    `SELECT camera_id, lens_id FROM camera_lenses WHERE user_id = ? AND camera_id IN (${placeholders})`
  ).bind(userId, ...cameraIds).all<{ camera_id: string; lens_id: string }>();
  for (const row of rows.results) {
    const existing = lensIdsByCamera.get(row.camera_id);
    if (existing) existing.push(row.lens_id);
  }
  return lensIdsByCamera;
}

async function toCameraWithCompatibleLensIds(env: Env, userId: string, camera: Camera) {
  // Camera responses keep this compatibility summary for read-only/legacy callers.
  const lensIdsByCamera = await getCameraAcceptableLensIds(env, userId, [camera.id]);
  return {
    ...camera,
    has_bellows: toBooleanFlag(camera.has_bellows),
    ...normalizeShutterResponse(camera),
    acceptable_lens_ids: lensIdsByCamera.get(camera.id) ?? [],
  };
}

async function toCamerasWithCompatibleLensIds(env: Env, userId: string, cameras: Camera[]) {
  const cameraIds = cameras.map((camera) => camera.id);
  const lensIdsByCamera = await getCameraAcceptableLensIds(env, userId, cameraIds);
  return cameras.map((camera) => ({
    ...camera,
    has_bellows: toBooleanFlag(camera.has_bellows),
    ...normalizeShutterResponse(camera),
    acceptable_lens_ids: lensIdsByCamera.get(camera.id) ?? [],
  }));
}

async function replaceCameraCompatibleLenses(env: Env, userId: string, cameraId: string, lensIds: string[]) {
  // Legacy write alias for existing camera-side callers.
  await env.DB.prepare("DELETE FROM camera_lenses WHERE user_id = ? AND camera_id = ?")
    .bind(userId, cameraId).run();
  if (lensIds.length === 0) return;
  const inserts = lensIds.map((lensId) =>
    env.DB.prepare(
      "INSERT INTO camera_lenses (camera_id, lens_id, user_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(cameraId, lensId, userId),
  );
  await env.DB.batch(inserts);
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

async function getLensApplicableCameraIds(env: Env, userId: string, lensIds: string[]) {
  const cameraIdsByLens = new Map<string, string[]>();
  for (const lensId of lensIds) {
    cameraIdsByLens.set(lensId, []);
  }
  if (lensIds.length === 0) return cameraIdsByLens;
  const placeholders = lensIds.map(() => "?").join(", ");
  const rows = await env.DB.prepare(
    `SELECT lens_id, camera_id FROM camera_lenses WHERE user_id = ? AND lens_id IN (${placeholders})`
  ).bind(userId, ...lensIds).all<{ lens_id: string; camera_id: string }>();
  for (const row of rows.results) {
    const existing = cameraIdsByLens.get(row.lens_id);
    if (existing) existing.push(row.camera_id);
  }
  return cameraIdsByLens;
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
    can_simulate_bw: toBooleanFlag(row.can_simulate_bw),
    simulation_rgb: row.simulation_rgb ?? "#f05a28",
    simulation_strength: row.simulation_strength ?? 0.42,
    simulation_brightness_boost: row.simulation_brightness_boost ?? 1,
    applies_to_bw: toBooleanFlag(row.applies_to_bw ?? true),
    applies_to_color: toBooleanFlag(row.applies_to_color ?? true),
    applies_to_infrared: toBooleanFlag(row.applies_to_infrared ?? true),
    applicable_lens_ids: applicableLensIds,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseFilterApplicabilityFlag(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isInteger(value) && (value === 0 || value === 1)) return value;
  if (typeof value === "string" && (value === "0" || value === "1")) return Number(value);
  throw new Error(`${field} must be a boolean-compatible value`);
}

function hasAtLeastOneApplicableFilmType(appliesToBw: number, appliesToColor: number, appliesToInfrared: number) {
  return appliesToBw === 1 || appliesToColor === 1 || appliesToInfrared === 1;
}

async function toFiltersWithApplicableLensIds(env: Env, userId: string, filters: Filter[]) {
  const filterIds = filters.map((filter) => filter.id);
  const lensIdsByFilter = await getFilterApplicableLensIds(env, userId, filterIds);
  return filters.map((filter) => toFilterResponse(filter, lensIdsByFilter.get(filter.id) ?? []));
}

async function replaceFilterApplicableLenses(env: Env, userId: string, filterId: string, lensIds: string[]) {
  await env.DB.prepare("DELETE FROM filter_lenses WHERE user_id = ? AND filter_id = ?")
    .bind(userId, filterId).run();
  if (lensIds.length === 0) return;
  const inserts = lensIds.map((lensId) =>
    env.DB.prepare(
      "INSERT INTO filter_lenses (filter_id, lens_id, user_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(filterId, lensId, userId),
  );
  await env.DB.batch(inserts);
}

async function toLensesWithApplicableCameraIds(env: Env, userId: string, lenses: Lens[]) {
  const lensIds = lenses.map((lens) => lens.id);
  const cameraIdsByLens = await getLensApplicableCameraIds(env, userId, lensIds);
  return lenses.map((lens) => toLensResponse(lens, cameraIdsByLens.get(lens.id) ?? []));
}

async function replaceLensApplicableCameras(env: Env, userId: string, lensId: string, cameraIds: string[]) {
  await env.DB.prepare("DELETE FROM camera_lenses WHERE user_id = ? AND lens_id = ?")
    .bind(userId, lensId).run();
  if (cameraIds.length === 0) return;
  const inserts = cameraIds.map((cameraId) =>
    env.DB.prepare(
      "INSERT INTO camera_lenses (camera_id, lens_id, user_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(cameraId, lensId, userId),
  );
  await env.DB.batch(inserts);
}

function resolvePreset(key: unknown) {
  if (key === undefined) return undefined;
  if (key === null) return null;
  if (typeof key !== "string" || key.trim() === "") {
    throw new Error("standard_key must be a non-empty string");
  }
  const preset = FILTER_PRESET_INDEX.get(key);
  if (!preset) {
    throw new Error("standard_key must reference a supported preset");
  }
  return preset;
}

function parseFilterFactor(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new Error("filter_factor must be a number");
  }
  if (!Number.isFinite(value)) {
    throw new Error("filter_factor must be finite");
  }
  if (value <= 0) {
    throw new Error("filter_factor must be greater than 0");
  }
  return value;
}

function toNumberFilterFactor(value: unknown) {
  const parsed = parseFilterFactor(value);
  if (parsed === undefined) {
    throw new Error("filter_factor must be a finite positive number");
  }
  return parsed;
}

function parseOptionalStringValue(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseRequiredStringValue(value: unknown, field: string): string {
  if (value === undefined || value === null) {
    throw new Error(`${field} is required`);
  }
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${field} must be a non-empty string`);
  return trimmed;
}

// ─── Cameras ──────────────────────────────────────────────────────────────────

gear.get("/cameras", async (c) => {
  const userId = getUserId(c);
  const { limit, offset } = paginate(c.req.query());
  const [rows, count] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM cameras WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(userId, limit, offset).all<Camera>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM cameras WHERE user_id = ?")
      .bind(userId).first<{ total: number }>(),
  ]);
  const items = await toCamerasWithCompatibleLensIds(c.env, userId, rows.results);
  return c.json({ items, total: count?.total ?? 0 });
});

gear.post("/cameras", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const { name, maker } = body as {
    name?: string;
    maker?: string;
  };
  let legacyAcceptableLensIds: string[] | undefined;
  let minShutterSpeedSeconds: number | null;
  let maxShutterSpeedSeconds: number | null;
  let supportsBulb: number;
  let hasShutter: number | undefined;
  let filmType: Camera["film_type"] = null;
  let rollFormat: Camera["roll_format"] | undefined;
  let frameFormat: string | null | undefined;
  let frameWidthMm: number | null | undefined;
  let frameHeightMm: number | null | undefined;
  let hasBellows = 0;
  try {
    // Keep the legacy camera-side write path working for existing clients.
    // New callers should edit compatibility on Lens.applicable_camera_ids.
    legacyAcceptableLensIds = parseLegacyAcceptableLensIds(body);
    if (legacyAcceptableLensIds !== undefined && legacyAcceptableLensIds.length > 0) {
      await ensureOwnLenses(c, userId, legacyAcceptableLensIds);
    }
    filmType = parseFilmType(getBodyValue(body, "film_type")) ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "roll_format")) {
      rollFormat = parseRollFormatValue(getBodyValue(body, "roll_format"), "roll_format");
    }
    frameFormat = parseOptionalStringValue(getBodyValue(body, "frame_format"), "frame_format") ?? null;
    frameWidthMm = parsePositiveNullableNumber("frame_width_mm", getBodyValue(body, "frame_width_mm")) ?? null;
    frameHeightMm = parsePositiveNullableNumber("frame_height_mm", getBodyValue(body, "frame_height_mm")) ?? null;
    hasBellows = parseBooleanFlag(getBodyValue(body, "has_bellows"), "has_bellows") ?? 0;
    minShutterSpeedSeconds = parsePositiveNullableNumber(
      "min_shutter_speed_seconds",
      getBodyValue(body, "min_shutter_speed_seconds")
    ) ?? null;
    maxShutterSpeedSeconds = parsePositiveNullableNumber(
      "max_shutter_speed_seconds",
      getBodyValue(body, "max_shutter_speed_seconds")
    ) ?? null;
    supportsBulb = parseShutterBulbCompatibility(getBodyValue(body, "supports_bulb")) ?? 0;
    hasShutter = parseHasShutter(getBodyValue(body, "has_shutter"));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid camera compatibility list" }, 400);
  }
  if (!name) return c.json({ error: "name is required" }, 400);
  if (filmType !== "roll" && rollFormat !== undefined && rollFormat !== null) {
    return c.json({ error: "roll_format is only allowed when film_type is roll" }, 400);
  }
  const normalizedRollFormat = filmType === "roll" ? (rollFormat ?? null) : null;
  if ((frameWidthMm == null) !== (frameHeightMm == null)) {
    return c.json({ error: "frame_width_mm and frame_height_mm must be provided together" }, 400);
  }
  const inferredHasShutter = resolveDefaultHasShutter({
    filmType,
    currentHasShutter: 0,
    minShutterSpeedSeconds,
    maxShutterSpeedSeconds,
    supportsBulb,
  });
  const normalizedShutter = normalizeShutterValues({
    requestedHasShutter: hasShutter,
    defaultHasShutter: inferredHasShutter,
    minShutterSpeedSeconds,
    maxShutterSpeedSeconds,
    supportsBulb,
  });
  const { hasShutter: resolvedHasShutter, supportsBulb: resolvedSupportsBulb, minShutterSpeedSeconds: resolvedMinShutterSpeedSeconds, maxShutterSpeedSeconds: resolvedMaxShutterSpeedSeconds } = normalizedShutter;
  if (resolvedHasShutter === 1 && resolvedMinShutterSpeedSeconds !== null && resolvedMaxShutterSpeedSeconds !== null
    && resolvedMaxShutterSpeedSeconds < resolvedMinShutterSpeedSeconds) {
    return c.json({ error: "min_shutter_speed_seconds cannot be greater than max_shutter_speed_seconds" }, 400);
  }
  const id = ulid();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO cameras (id, user_id, name, maker, film_type, roll_format, frame_format, frame_width_mm, frame_height_mm, has_bellows, has_shutter, min_shutter_speed_seconds, max_shutter_speed_seconds, supports_bulb, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    userId,
    name,
    maker ?? null,
    filmType ?? null,
    normalizedRollFormat,
    frameFormat ?? null,
    frameWidthMm ?? null,
    frameHeightMm ?? null,
    hasBellows,
    resolvedHasShutter,
    resolvedMinShutterSpeedSeconds,
    resolvedMaxShutterSpeedSeconds,
    resolvedSupportsBulb,
    now
  ).run();
  if (legacyAcceptableLensIds !== undefined) {
    await replaceCameraCompatibleLenses(c.env, userId, id, legacyAcceptableLensIds);
  }
  const camera: Camera = {
    id,
    user_id: userId,
    name,
    maker: maker ?? null,
    film_type: filmType ?? null,
    roll_format: normalizedRollFormat,
    frame_format: frameFormat ?? null,
    frame_width_mm: frameWidthMm ?? null,
    frame_height_mm: frameHeightMm ?? null,
    has_bellows: hasBellows === 1,
    has_shutter: resolvedHasShutter === 1,
    min_shutter_speed_seconds: resolvedMinShutterSpeedSeconds,
    max_shutter_speed_seconds: resolvedMaxShutterSpeedSeconds,
    supports_bulb: resolvedSupportsBulb === 1,
    acceptable_lens_ids: legacyAcceptableLensIds ?? [],
    created_at: now,
  };
  return c.json(camera, 201);
});

gear.get("/cameras/:id", async (c) => {
  const userId = getUserId(c);
  const row = await c.env.DB.prepare("SELECT * FROM cameras WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<Camera>();
  const camera = row ? await toCameraWithCompatibleLensIds(c.env, userId, row) : null;
  if (!camera) return c.json({ error: "Not found" }, 404);
  return c.json(camera);
});

gear.patch("/cameras/:id", async (c) => {
  const userId = getUserId(c);
  const cameraId = c.req.param("id");
  const body = await c.req.json();
  const hasLegacyAcceptableLensIds = Object.prototype.hasOwnProperty.call(body, "acceptable_lens_ids");
  const hasMinShutterSpeed = Object.prototype.hasOwnProperty.call(body, "min_shutter_speed_seconds");
  const hasMaxShutterSpeed = Object.prototype.hasOwnProperty.call(body, "max_shutter_speed_seconds");
  const hasSupportsBulb = Object.prototype.hasOwnProperty.call(body, "supports_bulb");
  const hasShutterField = Object.prototype.hasOwnProperty.call(body, "has_shutter");
  const hasFilmType = Object.prototype.hasOwnProperty.call(body, "film_type");
  const hasRollFormat = Object.prototype.hasOwnProperty.call(body, "roll_format");
  const hasFrameFormat = Object.prototype.hasOwnProperty.call(body, "frame_format");
  const hasFrameWidth = Object.prototype.hasOwnProperty.call(body, "frame_width_mm");
  const hasFrameHeight = Object.prototype.hasOwnProperty.call(body, "frame_height_mm");
  const hasBellowsField = Object.prototype.hasOwnProperty.call(body, "has_bellows");
  const cameraFields = Object.entries(body).filter(([k]) => [
    "name",
    "maker",
    "film_type",
    "roll_format",
    "frame_format",
    "frame_width_mm",
    "frame_height_mm",
    "has_bellows",
    "min_shutter_speed_seconds",
    "max_shutter_speed_seconds",
    "supports_bulb",
    "has_shutter",
  ].includes(k));
  let legacyAcceptableLensIds: string[] | undefined;
  let minShutterSpeedSeconds: number | null | undefined;
  let maxShutterSpeedSeconds: number | null | undefined;
  let supportsBulb: number | undefined;
  let hasShutter: number | undefined;
  let filmType: Camera["film_type"] = null;
  let rollFormat: Camera["roll_format"] | undefined;
  let frameFormat: string | null | undefined;
  let frameWidthMm: number | null | undefined;
  let frameHeightMm: number | null | undefined;
  let hasBellows: number | undefined;
  try {
    // Keep the legacy camera-side write path working for existing clients.
    // New callers should edit compatibility on Lens.applicable_camera_ids.
    legacyAcceptableLensIds = parseLegacyAcceptableLensIds(body);
    if (hasLegacyAcceptableLensIds && legacyAcceptableLensIds !== undefined && legacyAcceptableLensIds.length > 0) {
      await ensureOwnLenses(c, userId, legacyAcceptableLensIds);
    }
    if (hasFilmType) {
      filmType = parseFilmType(getBodyValue(body, "film_type")) ?? null;
    }
    if (hasRollFormat) {
      rollFormat = parseRollFormatValue(getBodyValue(body, "roll_format"), "roll_format");
    }
    if (hasFrameFormat) {
      frameFormat = parseOptionalStringValue(getBodyValue(body, "frame_format"), "frame_format");
    }
    if (hasFrameWidth) {
      frameWidthMm = parsePositiveNullableNumber("frame_width_mm", getBodyValue(body, "frame_width_mm"));
    }
    if (hasFrameHeight) {
      frameHeightMm = parsePositiveNullableNumber("frame_height_mm", getBodyValue(body, "frame_height_mm"));
    }
    if (hasBellowsField) {
      hasBellows = parseBooleanFlag(getBodyValue(body, "has_bellows"), "has_bellows");
    }
    if (hasMinShutterSpeed) {
      minShutterSpeedSeconds = parsePositiveNullableNumber("min_shutter_speed_seconds", getBodyValue(body, "min_shutter_speed_seconds"));
    }
    if (hasMaxShutterSpeed) {
      maxShutterSpeedSeconds = parsePositiveNullableNumber("max_shutter_speed_seconds", getBodyValue(body, "max_shutter_speed_seconds"));
    }
    if (hasSupportsBulb) {
      supportsBulb = parseShutterBulbCompatibility(getBodyValue(body, "supports_bulb"));
      if (supportsBulb === undefined) return c.json({ error: "supports_bulb must be a boolean-compatible value" }, 400);
    }
    if (hasShutterField) {
      hasShutter = parseHasShutter(getBodyValue(body, "has_shutter"));
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid camera fields" }, 400);
  }
  if (cameraFields.length > 0) {
    const currentCamera = await c.env.DB.prepare(
      "SELECT film_type, roll_format, frame_width_mm, frame_height_mm, has_shutter, min_shutter_speed_seconds, max_shutter_speed_seconds, supports_bulb FROM cameras WHERE id = ? AND user_id = ?"
    )
      .bind(cameraId, userId).first<{
        film_type: Camera["film_type"];
        roll_format: Camera["roll_format"];
        frame_width_mm: number | null;
        frame_height_mm: number | null;
        has_shutter: number;
        min_shutter_speed_seconds: number | null;
        max_shutter_speed_seconds: number | null;
        supports_bulb: number;
      }>();
    if (!currentCamera) return c.json({ error: "Not found" }, 404);
    const resolvedFilmType = hasFilmType ? filmType : currentCamera.film_type;
    const resolvedMin = hasMinShutterSpeed ? minShutterSpeedSeconds : currentCamera.min_shutter_speed_seconds;
    const resolvedMax = hasMaxShutterSpeed ? maxShutterSpeedSeconds : currentCamera.max_shutter_speed_seconds;
    const resolvedSupportsBulb = hasSupportsBulb ? (supportsBulb ?? 0) : currentCamera.supports_bulb;
    const resolvedFrameWidth = hasFrameWidth ? frameWidthMm : currentCamera.frame_width_mm;
    const resolvedFrameHeight = hasFrameHeight ? frameHeightMm : currentCamera.frame_height_mm;
    if ((resolvedFrameWidth == null) !== (resolvedFrameHeight == null)) {
      return c.json({ error: "frame_width_mm and frame_height_mm must be provided together" }, 400);
    }
    if (resolvedFilmType !== "roll" && hasRollFormat && rollFormat !== null) {
      return c.json({ error: "roll_format is only allowed when film_type is roll" }, 400);
    }
    const defaultHasShutter = resolveDefaultHasShutter({
      filmType: resolvedFilmType,
      currentHasShutter: currentCamera.has_shutter ? 1 : 0,
      minShutterSpeedSeconds: resolvedMin ?? null,
      maxShutterSpeedSeconds: resolvedMax ?? null,
      supportsBulb: resolvedSupportsBulb,
    });
    const normalized = normalizeShutterValues({
      requestedHasShutter: hasShutter,
      defaultHasShutter,
      minShutterSpeedSeconds: resolvedMin ?? null,
      maxShutterSpeedSeconds: resolvedMax ?? null,
      supportsBulb: resolvedSupportsBulb,
    });
    if (normalized.hasShutter === 1 && normalized.minShutterSpeedSeconds !== null
      && normalized.maxShutterSpeedSeconds !== null && normalized.maxShutterSpeedSeconds < normalized.minShutterSpeedSeconds) {
      return c.json({ error: "min_shutter_speed_seconds cannot be greater than max_shutter_speed_seconds" }, 400);
    }
  }
  if (cameraFields.length === 0 && !hasLegacyAcceptableLensIds) return c.json({ error: "No valid fields to update" }, 400);
  const adjustedFields = cameraFields
    .map(([k, v]) => {
      if (k === "min_shutter_speed_seconds") return [k, hasMinShutterSpeed ? minShutterSpeedSeconds : undefined];
      if (k === "max_shutter_speed_seconds") return [k, hasMaxShutterSpeed ? maxShutterSpeedSeconds : undefined];
      if (k === "supports_bulb") return [k, hasSupportsBulb ? (supportsBulb ?? 0) : undefined];
      if (k === "has_shutter") return [k, hasShutter];
      if (k === "film_type") return [k, filmType];
      if (k === "roll_format") return [k, hasRollFormat ? (rollFormat ?? null) : undefined];
      if (k === "frame_format") return [k, hasFrameFormat ? (frameFormat ?? null) : undefined];
      if (k === "frame_width_mm") return [k, hasFrameWidth ? (frameWidthMm ?? null) : undefined];
      if (k === "frame_height_mm") return [k, hasFrameHeight ? (frameHeightMm ?? null) : undefined];
      if (k === "has_bellows") return [k, hasBellows ?? 0];
      return [k, v];
    })
    .filter(([, v]) => v !== undefined);
  if (adjustedFields.length > 0) {
    const currentCamera = await c.env.DB.prepare(
      "SELECT film_type, roll_format, frame_width_mm, frame_height_mm, has_shutter, min_shutter_speed_seconds, max_shutter_speed_seconds, supports_bulb FROM cameras WHERE id = ? AND user_id = ?"
    )
      .bind(cameraId, userId).first<{
        film_type: Camera["film_type"];
        roll_format: Camera["roll_format"];
        frame_width_mm: number | null;
        frame_height_mm: number | null;
        has_shutter: number;
        min_shutter_speed_seconds: number | null;
        max_shutter_speed_seconds: number | null;
        supports_bulb: number;
      }>();
    if (!currentCamera) return c.json({ error: "Not found" }, 404);
    const resolvedFilmType = hasFilmType ? filmType : currentCamera.film_type;
    const resolvedRollFormat = hasRollFormat ? rollFormat : currentCamera.roll_format;
    const resolvedMin = hasMinShutterSpeed ? minShutterSpeedSeconds : currentCamera.min_shutter_speed_seconds;
    const resolvedMax = hasMaxShutterSpeed ? maxShutterSpeedSeconds : currentCamera.max_shutter_speed_seconds;
    const resolvedSupportsBulb = hasSupportsBulb ? (supportsBulb ?? 0) : currentCamera.supports_bulb;
    const resolvedFrameWidth = hasFrameWidth ? frameWidthMm : currentCamera.frame_width_mm;
    const resolvedFrameHeight = hasFrameHeight ? frameHeightMm : currentCamera.frame_height_mm;
    if ((resolvedFrameWidth == null) !== (resolvedFrameHeight == null)) {
      return c.json({ error: "frame_width_mm and frame_height_mm must be provided together" }, 400);
    }
    if (resolvedFilmType !== "roll" && hasRollFormat && rollFormat !== null) {
      return c.json({ error: "roll_format is only allowed when film_type is roll" }, 400);
    }
    const defaultHasShutter = resolveDefaultHasShutter({
      filmType: resolvedFilmType,
      currentHasShutter: currentCamera.has_shutter ? 1 : 0,
      minShutterSpeedSeconds: resolvedMin ?? null,
      maxShutterSpeedSeconds: resolvedMax ?? null,
      supportsBulb: resolvedSupportsBulb,
    });
    const normalized = normalizeShutterValues({
      requestedHasShutter: hasShutter,
      defaultHasShutter,
      minShutterSpeedSeconds: resolvedMin ?? null,
      maxShutterSpeedSeconds: resolvedMax ?? null,
      supportsBulb: resolvedSupportsBulb,
    });
    const normalizedHasShutter = normalized.hasShutter;
    const normalizedHasShutterSupportsBulb = normalized.supportsBulb;
    const normalizedMinShutter = normalized.minShutterSpeedSeconds;
    const normalizedMaxShutter = normalized.maxShutterSpeedSeconds;
    const normalizedRollFormat = resolvedFilmType === "roll" ? (resolvedRollFormat ?? null) : null;
    if (!hasShutterField && normalizedHasShutter !== currentCamera.has_shutter) {
      adjustedFields.push(["has_shutter", normalizedHasShutter]);
    }
    if (!hasRollFormat && normalizedRollFormat !== currentCamera.roll_format) {
      adjustedFields.push(["roll_format", normalizedRollFormat]);
    }
    for (const field of adjustedFields) {
      if (field[0] === "min_shutter_speed_seconds") {
        field[1] = normalizedMinShutter;
      }
      if (field[0] === "max_shutter_speed_seconds") {
        field[1] = normalizedMaxShutter;
      }
      if (field[0] === "supports_bulb") {
        field[1] = normalizedHasShutterSupportsBulb;
      }
      if (field[0] === "roll_format") {
        field[1] = normalizedRollFormat;
      }
    }
  }
  if (adjustedFields.length > 0) {
    const set = adjustedFields.map(([k]) => `${k} = ?`).join(", ");
    const result = await c.env.DB.prepare(
      `UPDATE cameras SET ${set} WHERE id = ? AND user_id = ?`
    ).bind(...adjustedFields.map(([, v]) => v), cameraId, userId).run();
    if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  } else {
    const camera = await c.env.DB.prepare("SELECT id FROM cameras WHERE id = ? AND user_id = ?").bind(cameraId, userId).first<{ id: string }>();
    if (!camera) return c.json({ error: "Not found" }, 404);
  }
  if (hasLegacyAcceptableLensIds) {
    await replaceCameraCompatibleLenses(c.env, userId, cameraId, legacyAcceptableLensIds ?? []);
  }
  const camera = await c.env.DB.prepare("SELECT * FROM cameras WHERE id = ? AND user_id = ?")
    .bind(cameraId, userId).first<Camera>();
  if (!camera) return c.json({ error: "Not found" }, 404);
  return c.json(await toCameraWithCompatibleLensIds(c.env, userId, camera));
});

gear.delete("/cameras/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM cameras WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

// ─── Film Holders ─────────────────────────────────────────────────────────

// List film holders
gear.get("/film_holders", async (c) => {
  const userId = getUserId(c);
  const { limit, offset } = paginate(c.req.query());
  const [rows, count] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM film_holders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(userId, limit, offset).all<FilmHolder>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM film_holders WHERE user_id = ?")
      .bind(userId).first<{ total: number }>(),
  ]);
  return c.json({ items: rows.results, total: count?.total ?? 0 });
});

// Create film holder
gear.post("/film_holders", async (c) => {
  const userId = getUserId(c);
  const { name, type, width_mm, height_mm, brand, capacity } = await c.req.json();
  if (!name) return c.json({ error: "name is required" }, 400);
  const id = ulid();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO film_holders (id, user_id, name, type, width_mm, height_mm, brand, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, userId, name, type ?? null, width_mm ?? null, height_mm ?? null, brand ?? null, capacity ?? null, now).run();
  const holder: FilmHolder = { id, user_id: userId, name, type: type ?? null, width_mm: width_mm ?? null, height_mm: height_mm ?? null, brand: brand ?? null, capacity: capacity ?? null, created_at: now };
  return c.json(holder, 201);
});

// Get film holder
gear.get("/film_holders/:id", async (c) => {
  const userId = getUserId(c);
  const holder = await c.env.DB.prepare("SELECT * FROM film_holders WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<FilmHolder>();
  if (!holder) return c.json({ error: "Not found" }, 404);
  return c.json(holder);
});

// Update film holder
gear.patch("/film_holders/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const fields = Object.entries(body).filter(([k]) => ["name", "type", "width_mm", "height_mm", "brand", "capacity"].includes(k));
  if (fields.length === 0) return c.json({ error: "No valid fields to update" }, 400);
  const set = fields.map(([k]) => `${k} = ?`).join(", ");
  const result = await c.env.DB.prepare(
    `UPDATE film_holders SET ${set} WHERE id = ? AND user_id = ?`
  ).bind(...fields.map(([, v]) => v), c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return c.json(await c.env.DB.prepare("SELECT * FROM film_holders WHERE id = ? AND user_id = ?").bind(c.req.param("id"), userId).first<FilmHolder>());
});

// Delete film holder
gear.delete("/film_holders/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM film_holders WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

// ─── Lenses ───────────────────────────────────────────────────────────────────

gear.get("/lenses", async (c) => {
  const userId = getUserId(c);
  const { limit, offset } = paginate(c.req.query());
  const [rows, count] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM lenses WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(userId, limit, offset).all<Lens>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM lenses WHERE user_id = ?")
      .bind(userId).first<{ total: number }>(),
  ]);
  return c.json({
    items: await toLensesWithApplicableCameraIds(c.env, userId, rows.results),
    total: count?.total ?? 0,
  });
});

gear.post("/lenses", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const {
    name,
    focal_length_mm,
    max_aperture,
  } = body as {
    name?: string;
    focal_length_mm?: number;
    max_aperture?: string;
  };
  const hasApplicableCameraIds = Object.prototype.hasOwnProperty.call(body, "applicable_camera_ids");
  if (!name) return c.json({ error: "name is required" }, 400);
  let applicableCameraIds: string[] | undefined;
  let minFStop: number | null;
  let maxFStop: number | null;
  let apertureIncrement: string | null;
  let flareFactor: number;
  let minFocalLength: number | null;
  let maxFocalLength: number | null;
  const hasMinShutterSpeed = Object.prototype.hasOwnProperty.call(body, "min_shutter_speed_seconds");
  const hasMaxShutterSpeed = Object.prototype.hasOwnProperty.call(body, "max_shutter_speed_seconds");
  const hasSupportsBulb = Object.prototype.hasOwnProperty.call(body, "supports_bulb");
  let minShutterSpeedSeconds: number | null;
  let maxShutterSpeedSeconds: number | null;
  let supportsBulb: number;
  const hasHasShutter = Object.prototype.hasOwnProperty.call(body, "has_shutter");
  let hasShutter: number | undefined;
  try {
    if (hasApplicableCameraIds) {
      applicableCameraIds = parseApplicableCameraIds(body);
      if (applicableCameraIds !== undefined && applicableCameraIds.length > 0) {
        await ensureOwnCameras(c, userId, applicableCameraIds);
      }
    }
    const parsedMinFStop = parseNullableNumber("min_f_stop", getBodyValue(body, "min_f_stop"));
    const parsedMaxFStop = parseNullableNumber("max_f_stop", getBodyValue(body, "max_f_stop"));
    const parsedIncrement = parseApertureIncrement(getBodyValue(body, "aperture_increment"));
    const parsedFlareFactor = parseNonNegativeNullableNumber("flare_factor", getBodyValue(body, "flare_factor"));
    minShutterSpeedSeconds = parsePositiveNullableNumber(
      "min_shutter_speed_seconds",
      getBodyValue(body, "min_shutter_speed_seconds")
    ) ?? null;
    maxShutterSpeedSeconds = parsePositiveNullableNumber(
      "max_shutter_speed_seconds",
      getBodyValue(body, "max_shutter_speed_seconds")
    ) ?? null;
    supportsBulb = parseShutterBulbCompatibility(getBodyValue(body, "supports_bulb")) ?? 0;
    if (hasHasShutter) {
      hasShutter = parseHasShutter(getBodyValue(body, "has_shutter"));
    }
    const hasMinFocalLength = Object.prototype.hasOwnProperty.call(body, "min_focal_length_mm");
    const hasMaxFocalLength = Object.prototype.hasOwnProperty.call(body, "max_focal_length_mm");
    const hasLegacyFocalLength = Object.prototype.hasOwnProperty.call(body, "focal_length_mm");
    const parsedFocalLength = hasLegacyFocalLength
      ? parsePositiveNullableNumber("focal_length_mm", getBodyValue(body, "focal_length_mm"))
      : undefined;
    if (hasMinFocalLength) {
      minFocalLength = parsePositiveNullableNumber("min_focal_length_mm", getBodyValue(body, "min_focal_length_mm"));
    }
    if (hasMaxFocalLength) {
      maxFocalLength = parsePositiveNullableNumber("max_focal_length_mm", getBodyValue(body, "max_focal_length_mm"));
    }
    if (!hasMinFocalLength && !hasMaxFocalLength) {
      if (hasLegacyFocalLength) {
        minFocalLength = parsedFocalLength ?? null;
        maxFocalLength = parsedFocalLength ?? null;
      } else {
        minFocalLength = null;
        maxFocalLength = null;
      }
    } else {
      if (hasMinFocalLength && !hasMaxFocalLength) maxFocalLength = minFocalLength!;
      if (!hasMinFocalLength && hasMaxFocalLength) minFocalLength = maxFocalLength!;
    }
    minFStop = parsedMinFStop ?? DEFAULT_LENS_MIN_F_STOP;
    maxFStop = parsedMaxFStop ?? DEFAULT_LENS_MAX_F_STOP;
    apertureIncrement = parsedIncrement ?? DEFAULT_LENS_APERTURE_INCREMENT;
    flareFactor = parsedFlareFactor ?? DEFAULT_LENS_FLARE_FACTOR;
    if (minFocalLength != null && maxFocalLength != null && maxFocalLength < minFocalLength) {
      return c.json({ error: "min_focal_length_mm cannot be greater than max_focal_length_mm" }, 400);
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid lens fields" }, 400);
  }
  if (minFStop > maxFStop) return c.json({ error: "min_f_stop cannot be greater than max_f_stop" }, 400);
  const resolvedHasShutter = hasShutter ?? resolveDefaultHasShutter({
    filmType: null,
    currentHasShutter: 0,
    minShutterSpeedSeconds,
    maxShutterSpeedSeconds,
    supportsBulb,
  });
  if (resolvedHasShutter === 1
    && hasMinShutterSpeed && hasMaxShutterSpeed
    && minShutterSpeedSeconds !== null && maxShutterSpeedSeconds !== null
    && maxShutterSpeedSeconds < minShutterSpeedSeconds) {
    return c.json({ error: "min_shutter_speed_seconds cannot be greater than max_shutter_speed_seconds" }, 400);
  }
  if (resolvedHasShutter === 0) {
    minShutterSpeedSeconds = null;
    maxShutterSpeedSeconds = null;
    supportsBulb = 0;
  }
  const id = ulid();
  const now = new Date().toISOString();
  const focalLengthForDb = (Object.prototype.hasOwnProperty.call(body, "min_focal_length_mm") ||
    Object.prototype.hasOwnProperty.call(body, "max_focal_length_mm"))
    ? (minFocalLength === maxFocalLength ? minFocalLength : null)
    : (focal_length_mm ?? null);
  await c.env.DB.prepare(
    "INSERT INTO lenses (id, user_id, name, focal_length_mm, min_focal_length_mm, max_focal_length_mm, max_aperture, min_f_stop, max_f_stop, aperture_increment, flare_factor, min_shutter_speed_seconds, max_shutter_speed_seconds, supports_bulb, has_shutter, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    userId,
    name,
    focalLengthForDb,
    minFocalLength,
    maxFocalLength,
    max_aperture ?? null,
    minFStop,
    maxFStop,
    apertureIncrement,
    flareFactor,
    minShutterSpeedSeconds,
    maxShutterSpeedSeconds,
    supportsBulb,
    resolvedHasShutter,
    now
  ).run();
  if (hasApplicableCameraIds) {
    await replaceLensApplicableCameras(c.env, userId, id, applicableCameraIds ?? []);
  }
  const lens: Lens = {
    id,
    user_id: userId,
    name,
    focal_length_mm: focalLengthForDb,
    min_focal_length_mm: minFocalLength,
    max_focal_length_mm: maxFocalLength,
    max_aperture: max_aperture ?? null,
    min_f_stop: minFStop,
    max_f_stop: maxFStop,
    aperture_increment: apertureIncrement,
    flare_factor: flareFactor,
    min_shutter_speed_seconds: minShutterSpeedSeconds,
    max_shutter_speed_seconds: maxShutterSpeedSeconds,
    has_shutter: resolvedHasShutter === 1,
    supports_bulb: supportsBulb === 1,
    created_at: now,
  };
  return c.json(toLensResponse(lens, applicableCameraIds ?? []), 201);
});

gear.get("/lenses/:id", async (c) => {
  const userId = getUserId(c);
  const lens = await c.env.DB.prepare("SELECT * FROM lenses WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<Lens>();
  if (!lens) return c.json({ error: "Not found" }, 404);
  const cameraIdsByLens = await getLensApplicableCameraIds(c.env, userId, [lens.id]);
  return c.json(toLensResponse(lens, cameraIdsByLens.get(lens.id) ?? []));
});

gear.patch("/lenses/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const lensId = c.req.param("id");
  const currentLens = await c.env.DB.prepare("SELECT * FROM lenses WHERE id = ? AND user_id = ?")
    .bind(lensId, userId).first<Lens>();
  if (!currentLens) return c.json({ error: "Not found" }, 404);

  const hasMinFStop = Object.prototype.hasOwnProperty.call(body, "min_f_stop");
  const hasMaxFStop = Object.prototype.hasOwnProperty.call(body, "max_f_stop");
  const hasIncrement = Object.prototype.hasOwnProperty.call(body, "aperture_increment");
  const hasFlareFactor = Object.prototype.hasOwnProperty.call(body, "flare_factor");
  const hasApplicableCameraIds = Object.prototype.hasOwnProperty.call(body, "applicable_camera_ids");
  const hasMinFocalLength = Object.prototype.hasOwnProperty.call(body, "min_focal_length_mm");
  const hasMaxFocalLength = Object.prototype.hasOwnProperty.call(body, "max_focal_length_mm");
  const hasLegacyFocalLength = Object.prototype.hasOwnProperty.call(body, "focal_length_mm");
  const hasMinShutterSpeed = Object.prototype.hasOwnProperty.call(body, "min_shutter_speed_seconds");
  const hasMaxShutterSpeed = Object.prototype.hasOwnProperty.call(body, "max_shutter_speed_seconds");
  const hasSupportsBulb = Object.prototype.hasOwnProperty.call(body, "supports_bulb");
  const hasHasShutter = Object.prototype.hasOwnProperty.call(body, "has_shutter");
  let minFStop: number | null | undefined;
  let maxFStop: number | null | undefined;
  let apertureIncrement: string | null | undefined;
  let flareFactor: number | null | undefined;
  let minFocalLength: number | null | undefined;
  let maxFocalLength: number | null | undefined;
  let minShutterSpeedSeconds: number | null | undefined;
  let maxShutterSpeedSeconds: number | null | undefined;
  let supportsBulb: number | undefined;
  let hasShutter: number | undefined;
  let applicableCameraIds: string[] | undefined;
  try {
    if (hasApplicableCameraIds) {
      applicableCameraIds = parseApplicableCameraIds(body);
      if (applicableCameraIds !== undefined && applicableCameraIds.length > 0) {
        await ensureOwnCameras(c, userId, applicableCameraIds);
      }
    }
    if (hasMinFStop) minFStop = parseNullableNumber("min_f_stop", getBodyValue(body, "min_f_stop"));
    if (hasMaxFStop) maxFStop = parseNullableNumber("max_f_stop", getBodyValue(body, "max_f_stop"));
    if (hasIncrement) apertureIncrement = parseApertureIncrement(getBodyValue(body, "aperture_increment"));
    if (hasFlareFactor) flareFactor = parseNonNegativeNullableNumber("flare_factor", getBodyValue(body, "flare_factor"));
    if (hasMinShutterSpeed) minShutterSpeedSeconds = parsePositiveNullableNumber("min_shutter_speed_seconds", getBodyValue(body, "min_shutter_speed_seconds"));
    if (hasMaxShutterSpeed) maxShutterSpeedSeconds = parsePositiveNullableNumber("max_shutter_speed_seconds", getBodyValue(body, "max_shutter_speed_seconds"));
    if (hasSupportsBulb) supportsBulb = parseShutterBulbCompatibility(getBodyValue(body, "supports_bulb"));
    if (hasHasShutter) hasShutter = parseHasShutter(getBodyValue(body, "has_shutter"));
    if (hasMinFocalLength) minFocalLength = parsePositiveNullableNumber("min_focal_length_mm", getBodyValue(body, "min_focal_length_mm"));
    if (hasMaxFocalLength) maxFocalLength = parsePositiveNullableNumber("max_focal_length_mm", getBodyValue(body, "max_focal_length_mm"));
    const parsedLegacyFocalLength = hasLegacyFocalLength
      ? parsePositiveNullableNumber("focal_length_mm", getBodyValue(body, "focal_length_mm"))
      : undefined;
    if (hasMinFocalLength || hasMaxFocalLength) {
      if (hasMinFocalLength) minFocalLength = minFocalLength ?? null;
      if (hasMaxFocalLength) maxFocalLength = maxFocalLength ?? null;
      if (!hasMinFocalLength) minFocalLength = currentLens.min_focal_length_mm;
      if (!hasMaxFocalLength) maxFocalLength = currentLens.max_focal_length_mm;
    } else if (hasLegacyFocalLength) {
      minFocalLength = parsedLegacyFocalLength ?? null;
      maxFocalLength = parsedLegacyFocalLength ?? null;
    } else {
      minFocalLength = currentLens.min_focal_length_mm;
      maxFocalLength = currentLens.max_focal_length_mm;
    }
    if (minFocalLength != null && maxFocalLength != null && maxFocalLength < minFocalLength) {
      return c.json({ error: "min_focal_length_mm cannot be greater than max_focal_length_mm" }, 400);
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid lens fields" }, 400);
  }

  const resolvedMinFStop = hasMinFStop
    ? (minFStop ?? DEFAULT_LENS_MIN_F_STOP)
    : (currentLens.min_f_stop ?? DEFAULT_LENS_MIN_F_STOP);
  const resolvedMaxFStop = hasMaxFStop
    ? (maxFStop ?? DEFAULT_LENS_MAX_F_STOP)
    : (currentLens.max_f_stop ?? DEFAULT_LENS_MAX_F_STOP);
  if (resolvedMinFStop > resolvedMaxFStop) return c.json({ error: "min_f_stop cannot be greater than max_f_stop" }, 400);
  const resolvedMinShutter = hasMinShutterSpeed ? (minShutterSpeedSeconds ?? null) : currentLens.min_shutter_speed_seconds;
  const resolvedMaxShutter = hasMaxShutterSpeed ? (maxShutterSpeedSeconds ?? null) : currentLens.max_shutter_speed_seconds;
  const resolvedSupportsBulb = hasSupportsBulb ? (supportsBulb ?? 0) : currentLens.supports_bulb;
  const resolvedHasShutter = hasShutter ?? resolveDefaultHasShutter({
    filmType: null,
    currentHasShutter: currentLens.has_shutter ? 1 : 0,
    minShutterSpeedSeconds: resolvedMinShutter ?? null,
    maxShutterSpeedSeconds: resolvedMaxShutter ?? null,
    supportsBulb: resolvedSupportsBulb,
  });
  const normalizedHasShutter = resolvedHasShutter;
  const normalizedSupportsBulb = normalizedHasShutter === 0 ? 0 : resolvedSupportsBulb;
  const normalizedMinShutter = normalizedHasShutter === 0 ? null : resolvedMinShutter;
  const normalizedMaxShutter = normalizedHasShutter === 0 ? null : resolvedMaxShutter;
  if (normalizedHasShutter === 1
    && resolvedMinShutter != null && resolvedMaxShutter != null
    && resolvedMaxShutter < resolvedMinShutter) {
    return c.json({ error: "min_shutter_speed_seconds cannot be greater than max_shutter_speed_seconds" }, 400);
  }

  const fields = Object.entries(body).filter(([k]) => [
    "name",
    "focal_length_mm",
    "min_focal_length_mm",
    "max_focal_length_mm",
    "max_aperture",
    "min_f_stop",
    "max_f_stop",
    "aperture_increment",
    "flare_factor",
    "min_shutter_speed_seconds",
    "max_shutter_speed_seconds",
    "supports_bulb",
    "has_shutter",
  ].includes(k));
  if (fields.length === 0 && !hasApplicableCameraIds) return c.json({ error: "No valid fields to update" }, 400);

  const adjustedFields = fields
    .map(([k, v]) => {
      if (k === "min_f_stop") return [k, resolvedMinFStop];
      if (k === "max_f_stop") return [k, resolvedMaxFStop];
      if (k === "aperture_increment") return [k, apertureIncrement ?? DEFAULT_LENS_APERTURE_INCREMENT];
      if (k === "flare_factor") return [k, flareFactor ?? DEFAULT_LENS_FLARE_FACTOR];
      if (k === "focal_length_mm") return [k, getBodyValue(body, "focal_length_mm")];
      if (k === "min_focal_length_mm") return [k, minFocalLength];
      if (k === "max_focal_length_mm") return [k, maxFocalLength];
      if (k === "min_shutter_speed_seconds") return [k, normalizedMinShutter];
      if (k === "max_shutter_speed_seconds") return [k, normalizedMaxShutter];
      if (k === "supports_bulb") return [k, normalizedSupportsBulb];
      if (k === "has_shutter") return [k, normalizedHasShutter];
      return [k, v];
    })
    .filter(([, v]) => v !== undefined);
  if (!hasHasShutter && normalizedHasShutter !== (currentLens.has_shutter ? 1 : 0)) {
    adjustedFields.push(["has_shutter", normalizedHasShutter]);
  }

  if (hasLegacyFocalLength && !hasMinFocalLength && !hasMaxFocalLength) {
    adjustedFields.push(["min_focal_length_mm", minFocalLength]);
    adjustedFields.push(["max_focal_length_mm", maxFocalLength]);
  }
  if (adjustedFields.length > 0) {
    const set = adjustedFields.map(([k]) => `${k} = ?`).join(", ");
    const result = await c.env.DB.prepare(
      `UPDATE lenses SET ${set} WHERE id = ? AND user_id = ?`
    ).bind(...adjustedFields.map(([, v]) => v), lensId, userId).run();
    if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  }

  const updatedLens = await c.env.DB.prepare("SELECT * FROM lenses WHERE id = ? AND user_id = ?")
    .bind(lensId, userId).first<Lens>();
  if (!updatedLens) return c.json({ error: "Not found" }, 404);
  if (hasApplicableCameraIds) {
    await replaceLensApplicableCameras(c.env, userId, lensId, applicableCameraIds ?? []);
  }
  const cameraIdsByLens = await getLensApplicableCameraIds(c.env, userId, [updatedLens.id]);
  return c.json(toLensResponse(updatedLens, cameraIdsByLens.get(updatedLens.id) ?? []));
});

gear.delete("/lenses/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM lenses WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

// ─── Filter Presets & Filters ──────────────────────────────────────────────

gear.get("/filter_presets", async (c) => {
  return c.json({ items: FILTER_PRESETS });
});

gear.get("/filters", async (c) => {
  const userId = getUserId(c);
  const { limit, offset } = paginate(c.req.query());
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, user_id, name, code, filter_factor, source, standard_key, notes, can_simulate_bw, simulation_rgb, simulation_strength, simulation_brightness_boost, applies_to_bw, applies_to_color, applies_to_infrared, created_at, updated_at FROM filters WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
      .bind(userId, limit, offset).all<Filter>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM filters WHERE user_id = ?")
      .bind(userId).first<{ total: number }>(),
  ]);
  const items = await toFiltersWithApplicableLensIds(c.env, userId, rows.results);
  return c.json({ items, total: count?.total ?? 0 });
});

gear.post("/filters", async (c) => {
  const userId = getUserId(c);
  try {
    const body = await c.req.json();
    if (!isPlainObject(body)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }
    rejectRemovedFilterFields(body);

    const hasApplicableLensIds = Object.prototype.hasOwnProperty.call(body, "applicable_lens_ids");
    const hasName = Object.prototype.hasOwnProperty.call(body, "name");
    const hasFactor = Object.prototype.hasOwnProperty.call(body, "filter_factor");
    const hasStandard = Object.prototype.hasOwnProperty.call(body, "standard_key");
    const hasCode = Object.prototype.hasOwnProperty.call(body, "code");
    const hasNotes = Object.prototype.hasOwnProperty.call(body, "notes");
    const hasAppliesToBw = Object.prototype.hasOwnProperty.call(body, "applies_to_bw");
    const hasAppliesToColor = Object.prototype.hasOwnProperty.call(body, "applies_to_color");
    const hasAppliesToInfrared = Object.prototype.hasOwnProperty.call(body, "applies_to_infrared");
    let preset: (typeof FILTER_PRESETS)[number] | undefined;
    let applicableLensIds: string[] | undefined;
    let name: string;
    let filterFactor: number;
    let standardKey: string | null = null;
    let code: string | null;
    let notes: string | null = null;
    let canSimulateBw = 0;
    let simulationRgb = "#f05a28";
    let simulationStrength = 0.42;
    let simulationBrightnessBoost = 1;
    let appliesToBw = 1;
    let appliesToColor = 1;
    let appliesToInfrared = 1;

    if (hasApplicableLensIds) {
      applicableLensIds = parseApplicableLensIds(body);
      if (applicableLensIds !== undefined && applicableLensIds.length > 0) {
        await ensureOwnApplicableLenses(c, userId, applicableLensIds);
      }
    }
    if (hasStandard) {
      const resolvedStandardKey = parseOptionalStringValue(getBodyValue(body, "standard_key"), "standard_key");
      if (resolvedStandardKey !== null) {
        preset = resolvePreset(resolvedStandardKey);
        standardKey = resolvedStandardKey;
      } else {
        standardKey = null;
      }
    }
    if (hasName) {
      name = parseRequiredStringValue(getBodyValue(body, "name"), "name");
    } else if (preset) {
      name = preset.name;
    } else {
      return c.json({ error: "name is required" }, 400);
    }
    if (hasFactor) {
      const parsed = parseFilterFactor(getBodyValue(body, "filter_factor"));
      if (parsed === undefined) return c.json({ error: "filter_factor is required" }, 400);
      filterFactor = parsed;
    } else if (preset) {
      filterFactor = preset.filter_factor;
    } else {
      return c.json({ error: "filter_factor is required" }, 400);
    }
    if (hasCode) {
      code = parseOptionalStringValue(getBodyValue(body, "code"), "code") ?? null;
    } else {
      code = preset?.code ?? null;
    }
    if (hasNotes) {
      notes = parseOptionalStringValue(getBodyValue(body, "notes"), "notes") ?? null;
    }
    if (preset && preset.key.startsWith("wratten_") && !preset.key.startsWith("wratten_96_")) {
      canSimulateBw = 1;
    }
    if (hasAppliesToBw) {
      appliesToBw = parseFilterApplicabilityFlag(getBodyValue(body, "applies_to_bw"), "applies_to_bw") ?? appliesToBw;
    }
    if (hasAppliesToColor) {
      appliesToColor = parseFilterApplicabilityFlag(getBodyValue(body, "applies_to_color"), "applies_to_color") ?? appliesToColor;
    }
    if (hasAppliesToInfrared) {
      appliesToInfrared = parseFilterApplicabilityFlag(getBodyValue(body, "applies_to_infrared"), "applies_to_infrared") ?? appliesToInfrared;
    }
    if (!hasAtLeastOneApplicableFilmType(appliesToBw, appliesToColor, appliesToInfrared)) {
      return c.json({ error: "Filter must apply to at least one film type" }, 400);
    }
    const id = ulid();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      "INSERT INTO filters (id, user_id, name, code, filter_factor, source, standard_key, notes, can_simulate_bw, simulation_rgb, simulation_strength, simulation_brightness_boost, applies_to_bw, applies_to_color, applies_to_infrared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      id,
      userId,
      name,
      code,
      filterFactor,
      preset ? FILTER_PRESET_SOURCE : null,
      standardKey,
      notes,
      canSimulateBw,
      simulationRgb,
      simulationStrength,
      simulationBrightnessBoost,
      appliesToBw,
      appliesToColor,
      appliesToInfrared,
      now,
      now
    ).run();

    if (applicableLensIds !== undefined) {
      await replaceFilterApplicableLenses(c.env, userId, id, applicableLensIds);
    }
    const filter: Filter = {
      id,
      user_id: userId,
      name,
      code,
      filter_factor: filterFactor,
      source: preset ? FILTER_PRESET_SOURCE : null,
      standard_key: standardKey,
      notes,
      can_simulate_bw: canSimulateBw === 1,
      simulation_rgb: simulationRgb,
      simulation_strength: simulationStrength,
      simulation_brightness_boost: simulationBrightnessBoost,
      applies_to_bw: appliesToBw === 1,
      applies_to_color: appliesToColor === 1,
      applies_to_infrared: appliesToInfrared === 1,
      created_at: now,
      updated_at: now,
    };
    return c.json(toFilterResponse(filter, applicableLensIds ?? []), 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid filter payload" }, 400);
  }
});

gear.get("/filters/:id", async (c) => {
  const userId = getUserId(c);
  const filter = await c.env.DB.prepare(
    "SELECT id, user_id, name, code, filter_factor, source, standard_key, notes, can_simulate_bw, simulation_rgb, simulation_strength, simulation_brightness_boost, applies_to_bw, applies_to_color, applies_to_infrared, created_at, updated_at FROM filters WHERE id = ? AND user_id = ?"
  )
    .bind(c.req.param("id"), userId).first<Filter>();
  if (!filter) return c.json({ error: "Not found" }, 404);
  const lensIdsByFilter = await getFilterApplicableLensIds(c.env, userId, [filter.id]);
  return c.json(toFilterResponse(filter, lensIdsByFilter.get(filter.id) ?? []));
});

gear.patch("/filters/:id", async (c) => {
  const userId = getUserId(c);
  const filterId = c.req.param("id");
  let applicableLensIds: string[] | undefined;
  let hasApplicableLensIds = false;
  let preset: (typeof FILTER_PRESETS)[number] | null | undefined;
  let current: Filter | null = null;
  const updates: Array<[string, unknown]> = [];
  try {
    const body = await c.req.json();
    if (!isPlainObject(body)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }
    rejectRemovedFilterFields(body);

    current = await c.env.DB.prepare(
      "SELECT id, user_id, name, code, filter_factor, source, standard_key, notes, can_simulate_bw, simulation_rgb, simulation_strength, simulation_brightness_boost, applies_to_bw, applies_to_color, applies_to_infrared, created_at, updated_at FROM filters WHERE id = ? AND user_id = ?"
    )
      .bind(filterId, userId).first<Filter>();
    if (!current) return c.json({ error: "Not found" }, 404);

    hasApplicableLensIds = Object.prototype.hasOwnProperty.call(body, "applicable_lens_ids");
    const hasName = Object.prototype.hasOwnProperty.call(body, "name");
    const hasFactor = Object.prototype.hasOwnProperty.call(body, "filter_factor");
    const hasStandard = Object.prototype.hasOwnProperty.call(body, "standard_key");
    const hasCode = Object.prototype.hasOwnProperty.call(body, "code");
    const hasNotes = Object.prototype.hasOwnProperty.call(body, "notes");
    const hasAppliesToBw = Object.prototype.hasOwnProperty.call(body, "applies_to_bw");
    const hasAppliesToColor = Object.prototype.hasOwnProperty.call(body, "applies_to_color");
    const hasAppliesToInfrared = Object.prototype.hasOwnProperty.call(body, "applies_to_infrared");

    if (hasApplicableLensIds) {
      applicableLensIds = parseApplicableLensIds(body);
      if (applicableLensIds !== undefined && applicableLensIds.length > 0) {
        await ensureOwnApplicableLenses(c, userId, applicableLensIds);
      }
    }
    if (hasName) {
      updates.push(["name", parseRequiredStringValue(getBodyValue(body, "name"), "name")]);
    }
    if (hasFactor) {
      const parsedFactor = parseFilterFactor(getBodyValue(body, "filter_factor"));
      if (parsedFactor === undefined) return c.json({ error: "filter_factor is required" }, 400);
      updates.push(["filter_factor", parsedFactor]);
    }
    if (hasCode) {
      updates.push(["code", parseOptionalStringValue(getBodyValue(body, "code"), "code")]);
    }
    if (hasNotes) {
      updates.push(["notes", parseOptionalStringValue(getBodyValue(body, "notes"), "notes")]);
    }
    if (hasAppliesToBw) {
      updates.push(["applies_to_bw", parseFilterApplicabilityFlag(getBodyValue(body, "applies_to_bw"), "applies_to_bw")]);
    }
    if (hasAppliesToColor) {
      updates.push(["applies_to_color", parseFilterApplicabilityFlag(getBodyValue(body, "applies_to_color"), "applies_to_color")]);
    }
    if (hasAppliesToInfrared) {
      updates.push(["applies_to_infrared", parseFilterApplicabilityFlag(getBodyValue(body, "applies_to_infrared"), "applies_to_infrared")]);
    }
    if (hasStandard) {
      const value = parseOptionalStringValue(getBodyValue(body, "standard_key"), "standard_key");
      if (value === null) {
        updates.push(["standard_key", null]);
        updates.push(["source", null]);
      } else {
        preset = resolvePreset(value);
        updates.push(["standard_key", preset.key]);
        updates.push(["source", FILTER_PRESET_SOURCE]);
        if (preset.key.startsWith("wratten_") && !preset.key.startsWith("wratten_96_")) {
          updates.push(["can_simulate_bw", 1]);
        }
      }
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid filter payload" }, 400);
  }

  if (updates.length === 0 && !hasApplicableLensIds) return c.json({ error: "No valid fields to update" }, 400);
  if (!current) return c.json({ error: "Not found" }, 404);

  if (updates.length > 0) {
    const nextAppliesToBw = Number(updates.find(([key]) => key === "applies_to_bw")?.[1] ?? current.applies_to_bw ?? 1);
    const nextAppliesToColor = Number(updates.find(([key]) => key === "applies_to_color")?.[1] ?? current.applies_to_color ?? 1);
    const nextAppliesToInfrared = Number(updates.find(([key]) => key === "applies_to_infrared")?.[1] ?? current.applies_to_infrared ?? 1);
    if (!hasAtLeastOneApplicableFilmType(nextAppliesToBw, nextAppliesToColor, nextAppliesToInfrared)) {
      return c.json({ error: "Filter must apply to at least one film type" }, 400);
    }
    const set = updates.map(([k]) => `${k} = ?`).join(", ");
    const result = await c.env.DB.prepare(
      `UPDATE filters SET ${set} WHERE id = ? AND user_id = ?`
    ).bind(...updates.map(([, v]) => v), filterId, userId).run();
    if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  }
  if (hasApplicableLensIds) {
    await replaceFilterApplicableLenses(c.env, userId, filterId, applicableLensIds ?? []);
  }
  const filter = await c.env.DB.prepare(
    "SELECT id, user_id, name, code, filter_factor, source, standard_key, notes, can_simulate_bw, simulation_rgb, simulation_strength, simulation_brightness_boost, applies_to_bw, applies_to_color, applies_to_infrared, created_at, updated_at FROM filters WHERE id = ? AND user_id = ?"
  )
    .bind(filterId, userId).first<Filter>();
  if (!filter) return c.json({ error: "Not found" }, 404);
  const lensIdsByFilter = await getFilterApplicableLensIds(c.env, userId, [filter.id]);
  return c.json(toFilterResponse(filter, lensIdsByFilter.get(filter.id) ?? []));
});

gear.delete("/filters/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM filters WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

// ─── Films ────────────────────────────────────────────────────────────────────

gear.get("/films", async (c) => {
  const userId = getUserId(c);
  const { limit, offset } = paginate(c.req.query());
  const [rows, count] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM films WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(userId, limit, offset).all<FilmStock>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM films WHERE user_id = ?")
      .bind(userId).first<{ total: number }>(),
  ]);
  return c.json({ items: rows.results.map(toFilmStockResponse), total: count?.total ?? 0 });
});

gear.post("/films", async (c) => {
  const userId = getUserId(c);
  try {
    const body = await c.req.json();
    if (!isPlainObject(body)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }

    const { name, iso, process, stock_type, reciprocity_p_factor } = body;
    if (!name) return c.json({ error: "name is required" }, 400);

    const stockType = resolveFilmStockType(stock_type);
    const reciprocityPFactor = resolveReciprocityPFactor(reciprocity_p_factor);
    const id = ulid();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      "INSERT INTO films (id, user_id, name, iso, process, stock_type, reciprocity_p_factor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, userId, name, iso ?? null, process ?? null, stockType, reciprocityPFactor, now).run();

    const film: FilmStock = {
      id,
      user_id: userId,
      name: name as string,
      iso: (iso ?? null) as number | null,
      process: (process ?? null) as string | null,
      stock_type: stockType,
      reciprocity_p_factor: reciprocityPFactor,
      created_at: now,
    };
    return c.json(toFilmStockResponse(film), 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid film stock fields" }, 400);
  }
});

gear.get("/films/:id", async (c) => {
  const userId = getUserId(c);
  const film = await c.env.DB.prepare("SELECT * FROM films WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<FilmStock>();
  if (!film) return c.json({ error: "Not found" }, 404);
  return c.json(toFilmStockResponse(film));
});

gear.patch("/films/:id", async (c) => {
  const userId = getUserId(c);
  try {
    const body = await c.req.json();
    if (!isPlainObject(body)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }

    const fields = Object.entries(body).filter(([k]) => ["name", "iso", "process", "stock_type", "reciprocity_p_factor"].includes(k));
    if (fields.length === 0) return c.json({ error: "No valid fields to update" }, 400);

    const updates = fields.map(([key, value]) => {
      if (key === "stock_type") {
        return [key, parseFilmStockType(value)] as const;
      }
      if (key === "reciprocity_p_factor") {
        return [key, parseReciprocityPFactor(value)] as const;
      }
      return [key, value ?? null] as const;
    });
    const set = updates.map(([k]) => `${k} = ?`).join(", ");
    const result = await c.env.DB.prepare(
      `UPDATE films SET ${set} WHERE id = ? AND user_id = ?`
    ).bind(...updates.map(([, v]) => v), c.req.param("id"), userId).run();
    if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);

    const film = await c.env.DB.prepare("SELECT * FROM films WHERE id = ? AND user_id = ?")
      .bind(c.req.param("id"), userId).first<FilmStock>();
    if (!film) return c.json({ error: "Not found" }, 404);
    return c.json(toFilmStockResponse(film));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid film stock fields" }, 400);
  }
});

gear.delete("/films/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM films WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

export default gear;
