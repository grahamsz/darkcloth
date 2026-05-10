import { Hono } from "hono";
import { ulid } from "ulid";
import { Env } from "../index";
import {
  BTZSChartData,
  BTZSDevelopmentProfile,
  BTZSSourceFile,
  DevelopmentProfile,
  DevelopmentProfileRow,
  FilmStock,
  RawXdfMetadata,
  SimpleDevelopmentProfile,
} from "../types";
import { isBwFilmStockType } from "./film-stock";
import { getUserId } from "./middleware";

type DevelopmentProfileType = "simple" | "btzs";

const SIMPLE_CREATE_KEYS = new Set([
  "type",
  "name",
  "developerName",
  "dilution",
  "temperatureText",
  "agitation",
  "notes",
  "timeText",
  "nMinusTwoPercent",
  "nMinusOnePercent",
  "nPlusOnePercent",
  "nPlusTwoPercent",
]);

const BTZS_CREATE_KEYS = new Set([
  "type",
  "name",
  "developerName",
  "dilution",
  "temperatureText",
  "agitation",
  "notes",
  "filmIso",
  "testDate",
  "curvesText",
  "flareDensityText",
  "paperEsText",
  "methodText",
  "keyValuesText",
  "rawXdf",
  "chartData",
  "sourceFiles",
  "btzsCurveInterpolationEnabled",
  "btzsExtrapolationStops",
]);

const SIMPLE_UPDATE_KEYS = new Set([
  "name",
  "developerName",
  "dilution",
  "temperatureText",
  "agitation",
  "notes",
  "timeText",
  "nMinusTwoPercent",
  "nMinusOnePercent",
  "nPlusOnePercent",
  "nPlusTwoPercent",
]);

const BTZS_UPDATE_KEYS = new Set([
  "name",
  "developerName",
  "dilution",
  "temperatureText",
  "agitation",
  "notes",
  "filmIso",
  "testDate",
  "curvesText",
  "flareDensityText",
  "paperEsText",
  "methodText",
  "keyValuesText",
  "rawXdf",
  "chartData",
  "sourceFiles",
  "btzsCurveInterpolationEnabled",
  "btzsExtrapolationStops",
]);

const RAW_XDF_LEGACY_PAPER_ES_SCALE = 100;
const RAW_XDF_RECIPROCITY_EXP_INDEX_RANGE = [0, 4] as const;
const RAW_XDF_RECIPROCITY_G_INDEX_RANGE = [0, 6] as const;
const RAW_XDF_USE_RECIPROCITY_RANGE = [0, 1] as const;
const DEFAULT_SIMPLE_N_MINUS_TWO_PERCENT = 65;
const DEFAULT_SIMPLE_N_MINUS_ONE_PERCENT = 80;
const DEFAULT_SIMPLE_N_PLUS_ONE_PERCENT = 125;
const DEFAULT_SIMPLE_N_PLUS_TWO_PERCENT = 160;

const developmentProfiles = new Hono<{ Bindings: Env }>();

function paginate(query: Record<string, string>) {
  const limit = Math.min(parseInt(query.limit ?? "50"), 200);
  const offset = parseInt(query.offset ?? "0");
  return { limit: isNaN(limit) ? 50 : limit, offset: isNaN(offset) ? 0 : offset };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function parseProfileType(value: unknown): DevelopmentProfileType {
  if (value === "simple" || value === "btzs") return value;
  throw new Error("type must be simple or btzs");
}

function parseTextField(value: unknown, field: string, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return trimmed.length === 0 ? null : trimmed;
}

function parseOptionalPositiveNumberField(
  body: Record<string, unknown>,
  field: string,
  defaultValue: number,
): number {
  if (!hasOwn(body, field) || body[field] == null || body[field] === "") return defaultValue;
  const value = typeof body[field] === "number"
    ? body[field]
    : typeof body[field] === "string"
      ? Number(body[field].trim())
      : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return value;
}

function appendOptionalPositiveNumberUpdate(
  body: Record<string, unknown>,
  updates: Array<[string, string | number | null]>,
  field: string,
  column: string,
  defaultValue: number,
) {
  if (!hasOwn(body, field)) return;
  updates.push([column, parseOptionalPositiveNumberField(body, field, defaultValue)]);
}

function parseOptionalBooleanField(
  body: Record<string, unknown>,
  field: string,
  defaultValue: boolean,
): boolean {
  if (!hasOwn(body, field) || body[field] == null || body[field] === "") return defaultValue;
  if (typeof body[field] !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return body[field];
}

function parseOptionalNonNegativeNumberField(
  body: Record<string, unknown>,
  field: string,
  defaultValue: number,
): number {
  if (!hasOwn(body, field) || body[field] == null || body[field] === "") return defaultValue;
  const value = typeof body[field] === "number"
    ? body[field]
    : typeof body[field] === "string"
      ? Number(body[field].trim())
      : Number.NaN;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be zero or greater`);
  }
  return value;
}

function appendOptionalBooleanUpdate(
  body: Record<string, unknown>,
  updates: Array<[string, string | number | null]>,
  field: string,
  column: string,
  defaultValue: boolean,
) {
  if (!hasOwn(body, field)) return;
  updates.push([column, parseOptionalBooleanField(body, field, defaultValue) ? 1 : 0]);
}

function appendOptionalNonNegativeNumberUpdate(
  body: Record<string, unknown>,
  updates: Array<[string, string | number | null]>,
  field: string,
  column: string,
  defaultValue: number,
) {
  if (!hasOwn(body, field)) return;
  updates.push([column, parseOptionalNonNegativeNumberField(body, field, defaultValue)]);
}

function parseRequiredTextField(body: Record<string, unknown>, field: string): string {
  if (!hasOwn(body, field)) {
    throw new Error(`${field} is required`);
  }
  return parseTextField(body[field], field, true) as string;
}

function parseOptionalTextField(body: Record<string, unknown>, field: string): string | null {
  return parseTextField(body[field], field, false);
}

function parseJsonArrayField(
  body: Record<string, unknown>,
  field: string,
): Record<string, unknown>[] | null {
  if (!hasOwn(body, field)) return null;
  const value = body[field];
  if (value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  if (!value.every(isPlainObject)) {
    throw new Error(`${field} must be an array of objects`);
  }
  return value as Record<string, unknown>[];
}

function parseFiniteNumberField(value: unknown, field: string): number {
  if (typeof value !== "number") {
    throw new Error(`${field} must be a number`);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite`);
  }
  return value;
}

function parsePositiveNumberField(value: unknown, field: string): number {
  const numberValue = parseFiniteNumberField(value, field);
  if (numberValue <= 0) {
    throw new Error(`${field} must be greater than 0`);
  }
  return numberValue;
}

function parseBoundedIntegerField(value: unknown, field: string, min: number, max: number): number {
  const numberValue = parseFiniteNumberField(value, field);
  if (!Number.isInteger(numberValue)) {
    throw new Error(`${field} must be an integer`);
  }
  if (numberValue < min || numberValue > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return numberValue;
}

function parseRawXdfPaperEsField(value: unknown, field: string): number {
  return parsePositiveNumberField(value, field);
}

function parseLegacyRawXdfPaperEsField(value: unknown, field: string): number {
  if (!(typeof value === "string" || typeof value === "number")) {
    throw new Error(`${field} must be a string or number`);
  }

  const numericValue = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numericValue)) {
    throw new Error(`${field} must be finite`);
  }
  if (numericValue <= 0) {
    throw new Error(`${field} must be greater than 0`);
  }

  // Legacy XDF rows stored the Paper ES slot as a scaled integer (for example
  // 125 represents 1.25). Normalize that raw value into the decimal API shape.
  return numericValue / RAW_XDF_LEGACY_PAPER_ES_SCALE;
}

function parseRawXdfReciprocityTuple(
  value: unknown,
  field: string,
): [number, number, number] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  if (value.length !== 3) {
    throw new Error(`${field} must contain exactly 3 numbers`);
  }

  const reciprocityExpIndex = parseBoundedIntegerField(
    value[0],
    `${field}[0]`,
    RAW_XDF_RECIPROCITY_EXP_INDEX_RANGE[0],
    RAW_XDF_RECIPROCITY_EXP_INDEX_RANGE[1],
  );
  const reciprocityGIndex = parseBoundedIntegerField(
    value[1],
    `${field}[1]`,
    RAW_XDF_RECIPROCITY_G_INDEX_RANGE[0],
    RAW_XDF_RECIPROCITY_G_INDEX_RANGE[1],
  );
  const useReciprocity = parseBoundedIntegerField(
    value[2],
    `${field}[2]`,
    RAW_XDF_USE_RECIPROCITY_RANGE[0],
    RAW_XDF_USE_RECIPROCITY_RANGE[1],
  );

  return [reciprocityExpIndex, reciprocityGIndex, useReciprocity];
}

function parseRawXdfCommonFields(value: Record<string, unknown>, field: string) {
  if (!isPlainObject(value)) {
    throw new Error(`${field} must be an object`);
  }

  const versionOrType = value.versionOrType;
  if (!(typeof versionOrType === "string" || typeof versionOrType === "number")) {
    throw new Error(`${field}.versionOrType must be a string or number`);
  }

  const displayName = value.displayName;
  if (typeof displayName !== "string") {
    throw new Error(`${field}.displayName must be a string`);
  }

  const processLabel = value.processLabel;
  if (typeof processLabel !== "string") {
    throw new Error(`${field}.processLabel must be a string`);
  }

  return {
    versionOrType,
    displayName,
    processLabel,
  };
}

function normalizeRawXdfMetadata(value: unknown, field: string): RawXdfMetadata {
  if (!isPlainObject(value)) {
    throw new Error(`${field} must be an object`);
  }

  const { versionOrType, displayName, processLabel } = parseRawXdfCommonFields(value, field);

  if (
    hasOwn(value, "paperES") ||
    hasOwn(value, "reciprocityExpIndex") ||
    hasOwn(value, "reciprocityGIndex") ||
    hasOwn(value, "useReciprocity")
  ) {
    const {
      paperES,
      reciprocityExpIndex,
      reciprocityGIndex,
      useReciprocity,
      filmISO: _legacyFilmISO,
      unknownOrReciprocityFields: _legacyReciprocityFields,
      versionOrType: _ignoredVersionOrType,
      displayName: _ignoredDisplayName,
      processLabel: _ignoredProcessLabel,
      ...rest
    } = value;

    return {
      ...rest,
      versionOrType,
      displayName,
      processLabel,
      paperES: parseRawXdfPaperEsField(paperES, `${field}.paperES`),
      reciprocityExpIndex: parseBoundedIntegerField(
        reciprocityExpIndex,
        `${field}.reciprocityExpIndex`,
        RAW_XDF_RECIPROCITY_EXP_INDEX_RANGE[0],
        RAW_XDF_RECIPROCITY_EXP_INDEX_RANGE[1],
      ),
      reciprocityGIndex: parseBoundedIntegerField(
        reciprocityGIndex,
        `${field}.reciprocityGIndex`,
        RAW_XDF_RECIPROCITY_G_INDEX_RANGE[0],
        RAW_XDF_RECIPROCITY_G_INDEX_RANGE[1],
      ),
      useReciprocity: parseBoundedIntegerField(
        useReciprocity,
        `${field}.useReciprocity`,
        RAW_XDF_USE_RECIPROCITY_RANGE[0],
        RAW_XDF_USE_RECIPROCITY_RANGE[1],
      ),
    };
  }

  if (hasOwn(value, "filmISO") || hasOwn(value, "unknownOrReciprocityFields")) {
    const {
      filmISO,
      unknownOrReciprocityFields,
      paperES: _paperES,
      reciprocityExpIndex: _reciprocityExpIndex,
      reciprocityGIndex: _reciprocityGIndex,
      useReciprocity: _useReciprocity,
      versionOrType: _ignoredVersionOrType,
      displayName: _ignoredDisplayName,
      processLabel: _ignoredProcessLabel,
      ...rest
    } = value;
    const [reciprocityExpIndex, reciprocityGIndex, useReciprocity] = parseRawXdfReciprocityTuple(
      unknownOrReciprocityFields,
      `${field}.unknownOrReciprocityFields`,
    );

    return {
      ...rest,
      versionOrType,
      displayName,
      processLabel,
      paperES: parseLegacyRawXdfPaperEsField(filmISO, `${field}.filmISO`),
      reciprocityExpIndex,
      reciprocityGIndex,
      useReciprocity,
    };
  }

  throw new Error(`${field} must include paperES metadata`);
}

function parseRawXdfField(
  body: Record<string, unknown>,
  field: string,
): RawXdfMetadata | null {
  if (!hasOwn(body, field)) return null;
  const value = body[field];
  if (value === null) return null;
  return normalizeRawXdfMetadata(value, field);
}

function validateAllowedKeys(body: Record<string, unknown>, allowedKeys: Set<string>) {
  const unexpected = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected fields: ${unexpected.join(", ")}`);
  }
}

async function ensureOwnedFilmStock(env: Env, userId: string, filmStockId: string) {
  return env.DB.prepare("SELECT id, stock_type FROM films WHERE id = ? AND user_id = ?")
    .bind(filmStockId, userId)
    .first<Pick<FilmStock, "id" | "stock_type">>();
}

function assertBtzsAllowed(profileType: DevelopmentProfileType, filmStock: Pick<FilmStock, "stock_type">) {
  if (profileType === "btzs" && !isBwFilmStockType(filmStock.stock_type)) {
    throw new Error("BTZS development profiles are only allowed for bw film stocks");
  }
}

function parseJsonArrayColumn(value: string | null): Record<string, unknown>[] | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(isPlainObject)) return null;
    return parsed as Record<string, unknown>[];
  } catch {
    return null;
  }
}

function parseRawXdfColumn(value: string | null | undefined): RawXdfMetadata | null {
  if (value == null) return null;
  try {
    return normalizeRawXdfMetadata(JSON.parse(value), "rawXdf");
  } catch {
    return null;
  }
}

function toDevelopmentProfileResponse(row: DevelopmentProfileRow): DevelopmentProfile {
  const base = {
    id: row.id,
    userId: row.user_id,
    filmStockId: row.film_id,
    name: row.name ?? "",
    developerName: row.developer_name ?? "",
    dilution: row.dilution,
    temperatureText: row.temperature_text ?? "",
    agitation: row.agitation,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.profile_type === "simple") {
    const simpleProfile: SimpleDevelopmentProfile = {
      ...base,
      type: "simple",
      timeText: row.time_text ?? "",
      nMinusTwoPercent: row.simple_n_minus_two_percent ?? DEFAULT_SIMPLE_N_MINUS_TWO_PERCENT,
      nMinusOnePercent: row.simple_n_minus_one_percent ?? DEFAULT_SIMPLE_N_MINUS_ONE_PERCENT,
      nPlusOnePercent: row.simple_n_plus_one_percent ?? DEFAULT_SIMPLE_N_PLUS_ONE_PERCENT,
      nPlusTwoPercent: row.simple_n_plus_two_percent ?? DEFAULT_SIMPLE_N_PLUS_TWO_PERCENT,
    };
    return simpleProfile;
  }

  const btzsProfile: BTZSDevelopmentProfile = {
    ...base,
    type: "btzs",
    filmIso: row.film_iso,
    testDate: row.test_date,
    curvesText: row.curves_text,
    flareDensityText: row.flare_density_text,
    paperEsText: row.paper_es_text,
    methodText: row.method_text,
    keyValuesText: row.key_values_text,
    chartData: parseJsonArrayColumn(row.chart_data) as BTZSChartData[] | null,
    sourceFiles: parseJsonArrayColumn(row.source_files) as BTZSSourceFile[] | null,
    rawXdf: parseRawXdfColumn(row.raw_xdf),
    btzsCurveInterpolationEnabled: Boolean(row.btzs_curve_interpolation_enabled),
    btzsExtrapolationStops: row.btzs_extrapolation_stops ?? 0,
  };
  return btzsProfile;
}

developmentProfiles.get("/", async (c) => {
  const userId = getUserId(c);
  const filmStockId = c.req.param("filmStockId");
  const filmStock = await ensureOwnedFilmStock(c.env, userId, filmStockId);
  if (!filmStock) return c.json({ error: "Not found" }, 404);

  const { limit, offset } = paginate(c.req.query());
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(
      "SELECT * FROM development_profiles WHERE user_id = ? AND film_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
      .bind(userId, filmStockId, limit, offset)
      .all<DevelopmentProfileRow>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM development_profiles WHERE user_id = ? AND film_id = ?")
      .bind(userId, filmStockId)
      .first<{ total: number }>(),
  ]);

  return c.json({
    items: rows.results.map(toDevelopmentProfileResponse),
    total: count?.total ?? 0,
  });
});

developmentProfiles.post("/", async (c) => {
  const userId = getUserId(c);
  const filmStockId = c.req.param("filmStockId");
  const filmStock = await ensureOwnedFilmStock(c.env, userId, filmStockId);
  if (!filmStock) return c.json({ error: "Not found" }, 404);

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

  try {
    const profileType = parseProfileType(body.type);
    validateAllowedKeys(body, profileType === "simple" ? SIMPLE_CREATE_KEYS : BTZS_CREATE_KEYS);
    assertBtzsAllowed(profileType, filmStock);

    const name = parseRequiredTextField(body, "name");
    const developerName = parseRequiredTextField(body, "developerName");
    const dilution = parseOptionalTextField(body, "dilution");
    const temperatureText = parseRequiredTextField(body, "temperatureText");
    const agitation = parseOptionalTextField(body, "agitation");
    const notes = parseOptionalTextField(body, "notes");

    const timeText = profileType === "simple" ? parseRequiredTextField(body, "timeText") : null;
    const nMinusTwoPercent = profileType === "simple"
      ? parseOptionalPositiveNumberField(body, "nMinusTwoPercent", DEFAULT_SIMPLE_N_MINUS_TWO_PERCENT)
      : DEFAULT_SIMPLE_N_MINUS_TWO_PERCENT;
    const nMinusOnePercent = profileType === "simple"
      ? parseOptionalPositiveNumberField(body, "nMinusOnePercent", DEFAULT_SIMPLE_N_MINUS_ONE_PERCENT)
      : DEFAULT_SIMPLE_N_MINUS_ONE_PERCENT;
    const nPlusOnePercent = profileType === "simple"
      ? parseOptionalPositiveNumberField(body, "nPlusOnePercent", DEFAULT_SIMPLE_N_PLUS_ONE_PERCENT)
      : DEFAULT_SIMPLE_N_PLUS_ONE_PERCENT;
    const nPlusTwoPercent = profileType === "simple"
      ? parseOptionalPositiveNumberField(body, "nPlusTwoPercent", DEFAULT_SIMPLE_N_PLUS_TWO_PERCENT)
      : DEFAULT_SIMPLE_N_PLUS_TWO_PERCENT;
    const filmIso = profileType === "btzs" ? parseOptionalTextField(body, "filmIso") : null;
    const testDate = profileType === "btzs" ? parseOptionalTextField(body, "testDate") : null;
    const curvesText = profileType === "btzs" ? parseOptionalTextField(body, "curvesText") : null;
    const flareDensityText = profileType === "btzs" ? parseOptionalTextField(body, "flareDensityText") : null;
    const paperEsText = profileType === "btzs" ? parseOptionalTextField(body, "paperEsText") : null;
    const methodText = profileType === "btzs" ? parseOptionalTextField(body, "methodText") : null;
    const keyValuesText = profileType === "btzs" ? parseOptionalTextField(body, "keyValuesText") : null;
    const rawXdf = profileType === "btzs" ? parseRawXdfField(body, "rawXdf") : null;
    const chartData = profileType === "btzs" ? parseJsonArrayField(body, "chartData") : null;
    const sourceFiles = profileType === "btzs" ? parseJsonArrayField(body, "sourceFiles") : null;
    const btzsCurveInterpolationEnabled = profileType === "btzs"
      ? parseOptionalBooleanField(body, "btzsCurveInterpolationEnabled", false)
      : false;
    const btzsExtrapolationStops = profileType === "btzs"
      ? parseOptionalNonNegativeNumberField(body, "btzsExtrapolationStops", 0)
      : 0;

    const id = ulid();
    const now = new Date().toISOString();
    const row: DevelopmentProfileRow = {
      id,
      user_id: userId,
      film_id: filmStockId,
      profile_type: profileType,
      name,
      developer_name: developerName,
      dilution,
      temperature_text: temperatureText,
      agitation,
      notes,
      time_text: timeText,
      film_iso: filmIso,
      test_date: testDate,
      curves_text: curvesText,
      flare_density_text: flareDensityText,
      paper_es_text: paperEsText,
      method_text: methodText,
      key_values_text: keyValuesText,
      raw_xdf: rawXdf == null ? null : JSON.stringify(rawXdf),
      chart_data: chartData == null ? null : JSON.stringify(chartData),
      source_files: sourceFiles == null ? null : JSON.stringify(sourceFiles),
      simple_n_minus_two_percent: nMinusTwoPercent,
      simple_n_minus_one_percent: nMinusOnePercent,
      simple_n_plus_one_percent: nPlusOnePercent,
      simple_n_plus_two_percent: nPlusTwoPercent,
      btzs_curve_interpolation_enabled: btzsCurveInterpolationEnabled ? 1 : 0,
      btzs_extrapolation_stops: btzsExtrapolationStops,
      created_at: now,
      updated_at: now,
    };

    await c.env.DB.prepare(
      "INSERT INTO development_profiles (id, user_id, film_id, profile_type, name, developer_name, dilution, temperature_text, agitation, notes, time_text, film_iso, test_date, curves_text, flare_density_text, paper_es_text, method_text, key_values_text, raw_xdf, chart_data, source_files, simple_n_minus_two_percent, simple_n_minus_one_percent, simple_n_plus_one_percent, simple_n_plus_two_percent, btzs_curve_interpolation_enabled, btzs_extrapolation_stops, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        row.id,
        row.user_id,
        row.film_id,
        row.profile_type,
        row.name,
        row.developer_name,
        row.dilution,
        row.temperature_text,
        row.agitation,
        row.notes,
        row.time_text,
        row.film_iso,
        row.test_date,
        row.curves_text,
        row.flare_density_text,
        row.paper_es_text,
        row.method_text,
        row.key_values_text,
        row.raw_xdf,
        row.chart_data,
        row.source_files,
        row.simple_n_minus_two_percent,
        row.simple_n_minus_one_percent,
        row.simple_n_plus_one_percent,
        row.simple_n_plus_two_percent,
        row.btzs_curve_interpolation_enabled,
        row.btzs_extrapolation_stops,
        row.created_at,
        row.updated_at,
      )
      .run();

    return c.json(toDevelopmentProfileResponse(row), 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid development profile fields" }, 400);
  }
});

developmentProfiles.get("/:profileId", async (c) => {
  const userId = getUserId(c);
  const filmStockId = c.req.param("filmStockId");
  const filmStock = await ensureOwnedFilmStock(c.env, userId, filmStockId);
  if (!filmStock) return c.json({ error: "Not found" }, 404);

  const profile = await c.env.DB.prepare(
    "SELECT * FROM development_profiles WHERE id = ? AND film_id = ? AND user_id = ?",
  )
    .bind(c.req.param("profileId"), filmStockId, userId)
    .first<DevelopmentProfileRow>();

  if (!profile) return c.json({ error: "Not found" }, 404);
  return c.json(toDevelopmentProfileResponse(profile));
});

developmentProfiles.patch("/:profileId", async (c) => {
  const userId = getUserId(c);
  const filmStockId = c.req.param("filmStockId");
  const filmStock = await ensureOwnedFilmStock(c.env, userId, filmStockId);
  if (!filmStock) return c.json({ error: "Not found" }, 404);

  const currentProfile = await c.env.DB.prepare(
    "SELECT * FROM development_profiles WHERE id = ? AND film_id = ? AND user_id = ?",
  )
    .bind(c.req.param("profileId"), filmStockId, userId)
    .first<DevelopmentProfileRow>();
  if (!currentProfile) return c.json({ error: "Not found" }, 404);

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

  try {
    validateAllowedKeys(body, currentProfile.profile_type === "simple" ? SIMPLE_UPDATE_KEYS : BTZS_UPDATE_KEYS);
    assertBtzsAllowed(currentProfile.profile_type, filmStock);

    const updates: Array<[string, string | number | null]> = [];
    const appendTextField = (column: string, field: string, required: boolean) => {
      if (!hasOwn(body, field)) return;
      updates.push([column, parseTextField(body[field], field, required)]);
    };

    appendTextField("name", "name", true);
    appendTextField("developer_name", "developerName", true);
    appendTextField("dilution", "dilution", false);
    appendTextField("temperature_text", "temperatureText", true);
    appendTextField("agitation", "agitation", false);
    appendTextField("notes", "notes", false);

    if (currentProfile.profile_type === "simple") {
      appendTextField("time_text", "timeText", true);
      appendOptionalPositiveNumberUpdate(body, updates, "nMinusTwoPercent", "simple_n_minus_two_percent", DEFAULT_SIMPLE_N_MINUS_TWO_PERCENT);
      appendOptionalPositiveNumberUpdate(body, updates, "nMinusOnePercent", "simple_n_minus_one_percent", DEFAULT_SIMPLE_N_MINUS_ONE_PERCENT);
      appendOptionalPositiveNumberUpdate(body, updates, "nPlusOnePercent", "simple_n_plus_one_percent", DEFAULT_SIMPLE_N_PLUS_ONE_PERCENT);
      appendOptionalPositiveNumberUpdate(body, updates, "nPlusTwoPercent", "simple_n_plus_two_percent", DEFAULT_SIMPLE_N_PLUS_TWO_PERCENT);
    } else {
      appendTextField("film_iso", "filmIso", false);
      appendTextField("test_date", "testDate", false);
      appendTextField("curves_text", "curvesText", false);
      appendTextField("flare_density_text", "flareDensityText", false);
      appendTextField("paper_es_text", "paperEsText", false);
      appendTextField("method_text", "methodText", false);
      appendTextField("key_values_text", "keyValuesText", false);

      if (hasOwn(body, "rawXdf")) {
        const rawXdf = parseRawXdfField(body, "rawXdf");
        updates.push(["raw_xdf", rawXdf === null ? null : JSON.stringify(rawXdf)]);
      }
      if (hasOwn(body, "chartData")) {
        const chartData = parseJsonArrayField(body, "chartData");
        updates.push(["chart_data", chartData === null ? null : JSON.stringify(chartData)]);
      }
      if (hasOwn(body, "sourceFiles")) {
        const sourceFiles = parseJsonArrayField(body, "sourceFiles");
        updates.push(["source_files", sourceFiles === null ? null : JSON.stringify(sourceFiles)]);
      }
      appendOptionalBooleanUpdate(body, updates, "btzsCurveInterpolationEnabled", "btzs_curve_interpolation_enabled", false);
      appendOptionalNonNegativeNumberUpdate(body, updates, "btzsExtrapolationStops", "btzs_extrapolation_stops", 0);
    }

    if (updates.length === 0) {
      return c.json({ error: "No valid fields to update" }, 400);
    }

    const now = new Date().toISOString();
    updates.push(["updated_at", now]);

    const set = updates.map(([column]) => `${column} = ?`).join(", ");
    const values = updates.map(([, value]) => value);
    const result = await c.env.DB.prepare(
      `UPDATE development_profiles SET ${set} WHERE id = ? AND film_id = ? AND user_id = ?`,
    )
      .bind(...values, c.req.param("profileId"), filmStockId, userId)
      .run();

    if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);

    const updatedProfile = await c.env.DB.prepare(
      "SELECT * FROM development_profiles WHERE id = ? AND film_id = ? AND user_id = ?",
    )
      .bind(c.req.param("profileId"), filmStockId, userId)
      .first<DevelopmentProfileRow>();

    if (!updatedProfile) return c.json({ error: "Not found" }, 404);
    return c.json(toDevelopmentProfileResponse(updatedProfile));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid development profile fields" }, 400);
  }
});

developmentProfiles.delete("/:profileId", async (c) => {
  const userId = getUserId(c);
  const filmStockId = c.req.param("filmStockId");
  const filmStock = await ensureOwnedFilmStock(c.env, userId, filmStockId);
  if (!filmStock) return c.json({ error: "Not found" }, 404);

  const result = await c.env.DB.prepare(
    "DELETE FROM development_profiles WHERE id = ? AND film_id = ? AND user_id = ?",
  )
    .bind(c.req.param("profileId"), filmStockId, userId)
    .run();

  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

export default developmentProfiles;
