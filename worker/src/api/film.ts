import { Hono } from "hono";
import { ulid } from "ulid";
import { Env } from "../index";
import {
  FilmHolder,
  FilmHolderLoadDevelopmentSummary,
  FilmHolderLoad,
  FilmHolderLoadPhotographSummary,
  FilmHolderLoadReferenceImageSummary,
  FilmStock,
  PhotographImage,
} from "../types";
import {
  ensureOwnCameraIds,
  fetchFilmHolderCameraIds,
  fetchFilmHolderCameraIdsByHolderIds,
  replaceFilmHolderCameraIds,
} from "./media-compat";
import {
  isPlainObject,
  parseFilmStockType,
  parseFilmSpectralResponseEnabled,
  parseFilmSpectralResponsePreset,
  parseReciprocityPFactor,
  resolveFilmStockType,
  resolveReciprocityPFactor,
  toFilmStockResponse,
} from "./film-stock";
import developmentProfilesRouter from "./development-profiles";
import { authMiddleware, getUserId } from "./middleware";
import { publicReferenceImagesForPhotographs } from "./photos";

const filmStocks = new Hono<{ Bindings: Env }>();
const filmHolders = new Hono<{ Bindings: Env }>();
type FilmHolderLoadContext = { env: Env; req: { url: string } };

filmStocks.use("*", authMiddleware);
filmHolders.use("*", authMiddleware);
filmStocks.route("/:filmStockId/development-profiles", developmentProfilesRouter);

type FilmHolderLoadWithFilmRow = Omit<FilmHolderLoad, "film" | "development_profile" | "development_summary" | "exposed_photograph"> & {
  film__id: string | null;
  film__user_id: string | null;
  film__name: string | null;
  film__iso: number | null;
  film__process: string | null;
  film__stock_type: FilmStock["stock_type"] | null;
  film__reciprocity_p_factor: number | null;
  film__spectral_response_preset: string | null;
  film__simulate_spectral_response: boolean | number | null;
  film__created_at: string | null;
  development_profile__profile_type: "simple" | "btzs" | null;
  development_profile__time_text: string | null;
  development_profile__name: string | null;
  exposed_photograph__exposure_details_json: string | null;
  exposed_photograph__title: string | null;
  exposed_photograph__frame_number: string | null;
  exposed_photograph__taken_at: string | null;
  exposed_photograph__camera_id: string | null;
  exposed_photograph__camera_name: string | null;
  exposed_photograph__lens_id: string | null;
  exposed_photograph__lens_name: string | null;
  exposed_photograph__aperture: string | null;
  exposed_photograph__shutter_speed: string | null;
  exposed_photograph__shutter_speed_seconds: number | null;
  exposed_photograph__shutter_mode: FilmHolderLoadPhotographSummary["shutter_mode"] | null;
  exposed_photograph__bulb_duration_seconds: number | null;
  exposed_photograph__exposure_entry_mode: FilmHolderLoadPhotographSummary["exposure_entry_mode"] | null;
  discarded_at: string | null;
  discarded_reason: string | null;
};

const DEFAULT_FILM_HOLDER_DISCARD_REASON = "Discarded after holder was re-exposed";

function getBodyValue(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key) ? body[key] : undefined;
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

function parseRequiredStringValue(value: unknown, field: string): string {
  if (value === undefined || value === null) throw new Error(`${field} is required`);
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${field} must be a non-empty string`);
  return trimmed;
}

function parseApplicableCameraIds(body: Record<string, unknown>) {
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

function isActiveFilmHolderLoadStatus(status: FilmHolderLoad["status"]) {
  return status === "loaded" || status === "exposed";
}

function toFilmHolderLoadReferenceImageSummary(
  image: PhotographImage | null,
): FilmHolderLoadReferenceImageSummary | null {
  if (!image) return null;
  return {
    id: image.id,
    content_type: image.content_type,
    width: image.width,
    height: image.height,
    thumbnail_content_type: image.thumbnail_content_type,
    thumbnail_width: image.thumbnail_width,
    thumbnail_height: image.thumbnail_height,
    thumbnail_url: image.thumbnail_url,
    url: image.url,
  };
}

function toFilmHolderLoadPhotographSummary(
  row: FilmHolderLoadWithFilmRow,
  referenceImage: PhotographImage | null,
): FilmHolderLoadPhotographSummary | null {
  if (!row.exposed_photograph_id) return null;
  return {
    id: row.exposed_photograph_id,
    title: row.exposed_photograph__title,
    frame_number: row.exposed_photograph__frame_number,
    taken_at: row.exposed_photograph__taken_at,
    camera_id: row.exposed_photograph__camera_id,
    camera_name: row.exposed_photograph__camera_name,
    lens_id: row.exposed_photograph__lens_id,
    lens_name: row.exposed_photograph__lens_name,
    aperture: row.exposed_photograph__aperture,
    shutter_speed: row.exposed_photograph__shutter_speed,
    shutter_speed_seconds: row.exposed_photograph__shutter_speed_seconds,
    shutter_mode: row.exposed_photograph__shutter_mode ?? "fixed",
    bulb_duration_seconds: row.exposed_photograph__bulb_duration_seconds,
    exposure_entry_mode: row.exposed_photograph__exposure_entry_mode ?? "manual",
    reference_image: toFilmHolderLoadReferenceImageSummary(referenceImage),
  };
}

function formatDevelopmentTimeClock(minutes: number) {
  const totalSeconds = Math.max(0, Math.round(minutes * 60));
  const wholeMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${wholeMinutes}:${String(seconds).padStart(2, "0")}`;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getStoredBtzsDevelopmentMinutes(exposureDetailsJson: string | null) {
  if (!exposureDetailsJson) return null;
  try {
    const parsed = JSON.parse(exposureDetailsJson);
    if (!isPlainObject(parsed)) return null;
    const btzsZoneMetering = parsed.btzsZoneMetering;
    if (!isPlainObject(btzsZoneMetering)) return null;
    const developmentTimeMinutes = parseFiniteNumber(btzsZoneMetering.developmentTimeMinutes);
    if (developmentTimeMinutes != null) return developmentTimeMinutes;
    return parseFiniteNumber(btzsZoneMetering.developmentMinutes);
  } catch {
    return null;
  }
}

function toFilmHolderLoadDevelopmentSummary(
  row: FilmHolderLoadWithFilmRow,
): FilmHolderLoadDevelopmentSummary | null {
  const storedBtzsMinutes = getStoredBtzsDevelopmentMinutes(row.exposed_photograph__exposure_details_json);
  if (storedBtzsMinutes != null) {
    return {
      label: "Development time",
      source: "stored-btzs-calculation",
      minutes: storedBtzsMinutes,
      time_text: formatDevelopmentTimeClock(storedBtzsMinutes),
    };
  }

  const profileTimeText = row.development_profile__profile_type === "simple"
    ? row.development_profile__time_text?.trim() ?? ""
    : "";
  if (profileTimeText.length === 0) return null;

  return {
    label: "Development time",
    source: "development-profile-time",
    minutes: null,
    time_text: profileTimeText,
  };
}

function toFilmHolderLoadResponse(
  row: FilmHolderLoadWithFilmRow,
  referenceImage: PhotographImage | null,
): FilmHolderLoad {
  const film = row.film__id
    ? {
        id: row.film__id,
        user_id: row.film__user_id ?? row.user_id,
        name: row.film__name ?? "",
        iso: row.film__iso,
        process: row.film__process,
        stock_type: row.film__stock_type ?? "other",
        reciprocity_p_factor: row.film__reciprocity_p_factor ?? 1,
        spectral_response_preset: row.film__spectral_response_preset ?? null,
        simulate_spectral_response: row.film__simulate_spectral_response === true || row.film__simulate_spectral_response === 1,
        created_at: row.film__created_at ?? row.created_at,
      }
    : null;

  return {
    id: row.id,
    user_id: row.user_id,
    film_holder_id: row.film_holder_id,
    film_id: row.film_id,
    status: row.status,
    loaded_at: row.loaded_at,
    exposed_at: row.exposed_at,
    exposed_photograph_id: row.exposed_photograph_id,
    processed_at: row.processed_at,
    discarded_at: row.discarded_at ?? null,
    discarded_reason: row.discarded_reason ?? null,
    development_profile_id: row.development_profile_id,
    development_profile: row.development_profile_id
      ? {
          id: row.development_profile_id,
          name: row.development_profile__name ?? null,
        }
      : null,
    development_summary: toFilmHolderLoadDevelopmentSummary(row),
    exposed_photograph: toFilmHolderLoadPhotographSummary(row, referenceImage),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    film: film ? toFilmStockResponse(film) : null,
  };
}

async function hydrateFilmHolderLoadResponses(
  c: FilmHolderLoadContext,
  userId: string,
  rows: FilmHolderLoadWithFilmRow[],
) {
  const exposedPhotographIds = [...new Set(rows.map((row) => row.exposed_photograph_id).filter((id): id is string => id !== null))];
  const referenceImagesByPhotograph = await publicReferenceImagesForPhotographs(c, userId, exposedPhotographIds);
  return rows.map((row) => toFilmHolderLoadResponse(
    row,
    row.exposed_photograph_id ? referenceImagesByPhotograph.get(row.exposed_photograph_id) ?? null : null,
  ));
}

function toFilmHolderResponse(
  holder: FilmHolder,
  currentLoad: FilmHolderLoad | null,
  loadHistory?: FilmHolderLoad[],
  applicableCameraIds: string[] = [],
): FilmHolder {
  return {
    ...holder,
    applicable_camera_ids: applicableCameraIds,
    current_load: currentLoad,
    load_history: loadHistory,
  };
}

const FILM_HOLDER_LOAD_SELECT = `
  SELECT
    l.id,
    l.user_id,
    l.film_holder_id,
    l.film_id,
    l.status,
    l.loaded_at,
    l.exposed_at,
    l.exposed_photograph_id,
    l.processed_at,
    l.discarded_at,
    l.discarded_reason,
    l.development_profile_id,
    dp.profile_type AS development_profile__profile_type,
    dp.time_text AS development_profile__time_text,
    dp.name AS development_profile__name,
    p.exposure_details_json AS exposed_photograph__exposure_details_json,
    p.title AS exposed_photograph__title,
    p.frame_number AS exposed_photograph__frame_number,
    p.taken_at AS exposed_photograph__taken_at,
    p.camera_id AS exposed_photograph__camera_id,
    c.name AS exposed_photograph__camera_name,
    p.lens_id AS exposed_photograph__lens_id,
    ln.name AS exposed_photograph__lens_name,
    p.aperture AS exposed_photograph__aperture,
    p.shutter_speed AS exposed_photograph__shutter_speed,
    p.shutter_speed_seconds AS exposed_photograph__shutter_speed_seconds,
    p.shutter_mode AS exposed_photograph__shutter_mode,
    p.bulb_duration_seconds AS exposed_photograph__bulb_duration_seconds,
    p.exposure_entry_mode AS exposed_photograph__exposure_entry_mode,
    l.notes,
    l.created_at,
    l.updated_at,
    f.id AS film__id,
    f.user_id AS film__user_id,
    f.name AS film__name,
    f.iso AS film__iso,
    f.process AS film__process,
    f.stock_type AS film__stock_type,
    f.reciprocity_p_factor AS film__reciprocity_p_factor,
    f.spectral_response_preset AS film__spectral_response_preset,
    f.simulate_spectral_response AS film__simulate_spectral_response,
    f.created_at AS film__created_at
  FROM film_holder_loads l
  LEFT JOIN films f ON f.id = l.film_id AND f.user_id = l.user_id
  LEFT JOIN development_profiles dp ON dp.id = l.development_profile_id AND dp.user_id = l.user_id
  LEFT JOIN photographs p ON p.id = l.exposed_photograph_id AND p.user_id = l.user_id
  LEFT JOIN cameras c ON c.id = p.camera_id AND c.user_id = p.user_id
  LEFT JOIN lenses ln ON ln.id = p.lens_id AND ln.user_id = p.user_id
`;

async function fetchFilmHolderRow(c: { env: Env }, userId: string, holderId: string) {
  return c.env.DB.prepare("SELECT * FROM film_holders WHERE id = ? AND user_id = ?")
    .bind(holderId, userId).first<FilmHolder>();
}

async function fetchFilmHolderLoads(c: FilmHolderLoadContext, userId: string, holderId: string) {
  const rows = await c.env.DB.prepare(
    `${FILM_HOLDER_LOAD_SELECT}
     WHERE l.user_id = ? AND l.film_holder_id = ?
     ORDER BY l.loaded_at DESC, l.created_at DESC`,
  ).bind(userId, holderId).all<FilmHolderLoadWithFilmRow>();
  return hydrateFilmHolderLoadResponses(c, userId, rows.results);
}

async function fetchActiveFilmHolderLoad(c: FilmHolderLoadContext, userId: string, holderId: string) {
  const row = await c.env.DB.prepare(
    `${FILM_HOLDER_LOAD_SELECT}
     WHERE l.user_id = ? AND l.film_holder_id = ? AND l.status IN ('loaded', 'exposed')
     ORDER BY l.loaded_at DESC, l.created_at DESC
     LIMIT 1`,
  ).bind(userId, holderId).first<FilmHolderLoadWithFilmRow>();
  if (!row) return null;
  const [load] = await hydrateFilmHolderLoadResponses(c, userId, [row]);
  return load ?? null;
}

async function fetchLatestFilmHolderLoad(c: FilmHolderLoadContext, userId: string, holderId: string) {
  const row = await c.env.DB.prepare(
    `${FILM_HOLDER_LOAD_SELECT}
     WHERE l.user_id = ? AND l.film_holder_id = ?
     ORDER BY l.loaded_at DESC, l.created_at DESC
     LIMIT 1`,
  ).bind(userId, holderId).first<FilmHolderLoadWithFilmRow>();
  if (!row) return null;
  const [load] = await hydrateFilmHolderLoadResponses(c, userId, [row]);
  return load ?? null;
}

async function fetchActiveFilmHolderLoads(c: FilmHolderLoadContext, userId: string, holderIds: string[]) {
  const loadsByHolder = new Map<string, FilmHolderLoad>();
  if (holderIds.length === 0) return loadsByHolder;
  const placeholders = holderIds.map(() => "?").join(", ");
  const rows = await c.env.DB.prepare(
    `${FILM_HOLDER_LOAD_SELECT}
     WHERE l.user_id = ? AND l.film_holder_id IN (${placeholders}) AND l.status IN ('loaded', 'exposed')
     ORDER BY l.loaded_at DESC, l.created_at DESC`,
  ).bind(userId, ...holderIds).all<FilmHolderLoadWithFilmRow>();
  const loads = await hydrateFilmHolderLoadResponses(c, userId, rows.results);
  for (const load of loads) {
    loadsByHolder.set(load.film_holder_id, load);
  }
  return loadsByHolder;
}

async function fetchFilmHolderResponse(c: FilmHolderLoadContext, userId: string, holderId: string, includeHistory = false) {
  const holder = await fetchFilmHolderRow(c, userId, holderId);
  if (!holder) return null;
  const loadHistory = includeHistory ? await fetchFilmHolderLoads(c, userId, holderId) : undefined;
  const currentLoad = loadHistory?.find((load: FilmHolderLoad) => isActiveFilmHolderLoadStatus(load.status))
    ?? (includeHistory ? null : await fetchActiveFilmHolderLoad(c, userId, holderId));
  const applicableCameraIds = await fetchFilmHolderCameraIds(c, userId, holderId);
  return toFilmHolderResponse(holder, currentLoad ?? null, loadHistory, applicableCameraIds);
}

async function fetchOwnFilmStock(c: { env: Env }, userId: string, filmId: string) {
  return c.env.DB.prepare("SELECT * FROM films WHERE id = ? AND user_id = ?")
    .bind(filmId, userId).first<FilmStock>();
}

async function fetchOwnDevelopmentProfile(c: { env: Env }, userId: string, profileId: string) {
  return c.env.DB.prepare("SELECT id, film_id FROM development_profiles WHERE id = ? AND user_id = ?")
    .bind(profileId, userId).first<{ id: string; film_id: string }>();
}

filmStocks.get("/", async (c) => {
  const userId = getUserId(c);
  const { limit, offset } = (() => {
    const query = c.req.query();
    const parsedLimit = Math.min(parseInt(query.limit ?? "50"), 200);
    const parsedOffset = parseInt(query.offset ?? "0");
    return { limit: isNaN(parsedLimit) ? 50 : parsedLimit, offset: isNaN(parsedOffset) ? 0 : parsedOffset };
  })();

  const [rows, count] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM films WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(userId, limit, offset).all<FilmStock>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM films WHERE user_id = ?")
      .bind(userId).first<{ total: number }>(),
  ]);
  return c.json({ items: rows.results.map(toFilmStockResponse), total: count?.total ?? 0 });
});

filmStocks.post("/", async (c) => {
  const userId = getUserId(c);
  try {
    const body = await c.req.json();
    if (!isPlainObject(body)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }

    const { name, iso, process, stock_type, reciprocity_p_factor, spectral_response_preset, simulate_spectral_response } = body;
    if (!name) return c.json({ error: "name is required" }, 400);

    const stockType = resolveFilmStockType(stock_type);
    const reciprocityPFactor = resolveReciprocityPFactor(reciprocity_p_factor);
    const spectralResponsePreset = parseFilmSpectralResponsePreset(spectral_response_preset);
    const simulateSpectralResponse = parseFilmSpectralResponseEnabled(simulate_spectral_response);
    const id = ulid();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      "INSERT INTO films (id, user_id, name, iso, process, stock_type, reciprocity_p_factor, spectral_response_preset, simulate_spectral_response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, userId, name, iso ?? null, process ?? null, stockType, reciprocityPFactor, spectralResponsePreset, simulateSpectralResponse ? 1 : 0, now).run();

    const film: FilmStock = {
      id,
      user_id: userId,
      name: name as string,
      iso: (iso ?? null) as number | null,
      process: (process ?? null) as string | null,
      stock_type: stockType,
      reciprocity_p_factor: reciprocityPFactor,
      spectral_response_preset: spectralResponsePreset,
      simulate_spectral_response: simulateSpectralResponse,
      created_at: now,
    };
    return c.json(toFilmStockResponse(film), 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid film stock fields" }, 400);
  }
});

filmStocks.get("/:id", async (c) => {
  const userId = getUserId(c);
  const film = await c.env.DB.prepare("SELECT * FROM films WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<FilmStock>();
  if (!film) return c.json({ error: "Not found" }, 404);
  return c.json(toFilmStockResponse(film));
});

filmStocks.patch("/:id", async (c) => {
  const userId = getUserId(c);
  try {
    const body = await c.req.json();
    if (!isPlainObject(body)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }

    const fields = Object.entries(body).filter(([k]) => ["name", "iso", "process", "stock_type", "reciprocity_p_factor", "spectral_response_preset", "simulate_spectral_response"].includes(k));
    if (fields.length === 0) return c.json({ error: "No valid fields to update" }, 400);

    const updates = fields.map(([key, value]) => {
      if (key === "stock_type") {
        return [key, parseFilmStockType(value)] as const;
      }
      if (key === "reciprocity_p_factor") {
        return [key, parseReciprocityPFactor(value)] as const;
      }
      if (key === "spectral_response_preset") {
        return [key, parseFilmSpectralResponsePreset(value)] as const;
      }
      if (key === "simulate_spectral_response") {
        return [key, parseFilmSpectralResponseEnabled(value) ? 1 : 0] as const;
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

filmStocks.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM films WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

filmHolders.get("/", async (c) => {
  const userId = getUserId(c);
  const { limit, offset } = (() => {
    const query = c.req.query();
    const parsedLimit = Math.min(parseInt(query.limit ?? "50"), 200);
    const parsedOffset = parseInt(query.offset ?? "0");
    return { limit: isNaN(parsedLimit) ? 50 : parsedLimit, offset: isNaN(parsedOffset) ? 0 : parsedOffset };
  })();

  const [rows, count] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM film_holders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(userId, limit, offset).all<FilmHolder>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM film_holders WHERE user_id = ?")
      .bind(userId).first<{ total: number }>(),
  ]);
  const holders = rows.results as FilmHolder[];
  const [currentLoadsByHolder, applicableCameraIdsByHolder] = await Promise.all([
    fetchActiveFilmHolderLoads(c, userId, holders.map((holder) => holder.id)),
    fetchFilmHolderCameraIdsByHolderIds(c, userId, holders.map((holder) => holder.id)),
  ]);
  return c.json({
    items: holders.map((holder) => toFilmHolderResponse(
      holder,
      currentLoadsByHolder.get(holder.id) ?? null,
      undefined,
      applicableCameraIdsByHolder.get(holder.id) ?? [],
    )),
    total: count?.total ?? 0,
  });
});

filmHolders.post("/", async (c) => {
  const userId = getUserId(c);
  try {
    const body = await c.req.json();
    if (!isPlainObject(body)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }

    const name = parseRequiredStringValue(getBodyValue(body, "name"), "name");
    const type = parseRequiredStringValue(getBodyValue(body, "type"), "type");
    const hasApplicableCameraIds = Object.prototype.hasOwnProperty.call(body, "applicable_camera_ids");
    let applicableCameraIds: string[] | undefined;
    const width_mm = Object.prototype.hasOwnProperty.call(body, "width_mm") ? getBodyValue(body, "width_mm") ?? null : null;
    const height_mm = Object.prototype.hasOwnProperty.call(body, "height_mm") ? getBodyValue(body, "height_mm") ?? null : null;
    const brand = parseOptionalStringValue(getBodyValue(body, "brand"), "brand") ?? null;
    const capacity = Object.prototype.hasOwnProperty.call(body, "capacity") ? getBodyValue(body, "capacity") ?? null : null;
    if (hasApplicableCameraIds) {
      applicableCameraIds = parseApplicableCameraIds(body);
      if (applicableCameraIds !== undefined && applicableCameraIds.length > 0) {
        await ensureOwnCameraIds(c, userId, applicableCameraIds);
      }
    }

    const id = ulid();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      "INSERT INTO film_holders (id, user_id, name, type, width_mm, height_mm, brand, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, userId, name, type ?? null, width_mm, height_mm, brand, capacity, now).run();

    if (applicableCameraIds !== undefined) {
      await replaceFilmHolderCameraIds(c, userId, id, applicableCameraIds);
    }
    const refreshed = await fetchFilmHolderResponse(c, userId, id, false);
    if (!refreshed) return c.json({ error: "Not found" }, 404);
    return c.json(refreshed, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid film holder fields" }, 400);
  }
});

filmHolders.get("/:id", async (c) => {
  const userId = getUserId(c);
  const holder = await fetchFilmHolderResponse(c, userId, c.req.param("id"), true);
  if (!holder) return c.json({ error: "Not found" }, 404);
  return c.json(holder);
});

filmHolders.get("/:id/loads", async (c) => {
  const userId = getUserId(c);
  const holder = await fetchFilmHolderRow(c, userId, c.req.param("id"));
  if (!holder) return c.json({ error: "Not found" }, 404);
  const items = await fetchFilmHolderLoads(c, userId, holder.id);
  return c.json({ items, total: items.length });
});

filmHolders.post("/:id/loads", async (c) => {
  const userId = getUserId(c);
  try {
    const holder = await fetchFilmHolderRow(c, userId, c.req.param("id"));
    if (!holder) return c.json({ error: "Not found" }, 404);

    const currentLoad = await fetchActiveFilmHolderLoad(c, userId, holder.id);
    if (currentLoad) {
      const message = currentLoad.status === "exposed"
        ? "film holder already has an exposed load that must be processed before loading another film"
        : "film holder already has a loaded film stock";
      return c.json({ error: message }, 400);
    }

    const body = await c.req.json();
    if (!isPlainObject(body)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }

    const filmId = parseRequiredStringValue(getBodyValue(body, "film_id"), "film_id");
    const film = await fetchOwnFilmStock(c, userId, filmId);
    if (!film) return c.json({ error: "film_id must reference a film stock belonging to the current user" }, 400);

    const notes = parseOptionalStringValue(getBodyValue(body, "notes"), "notes") ?? null;
    const id = ulid();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO film_holder_loads
       (id, user_id, film_holder_id, film_id, status, loaded_at, exposed_at, exposed_photograph_id, processed_at, development_profile_id, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'loaded', ?, NULL, NULL, NULL, NULL, ?, ?, ?)`
    ).bind(id, userId, holder.id, film.id, now, notes, now, now).run();

    const refreshed = await fetchFilmHolderResponse(c, userId, holder.id, true);
    if (!refreshed) return c.json({ error: "Not found" }, 404);
    return c.json(refreshed, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid film holder load fields" }, 400);
  }
});

filmHolders.delete("/:id/loads/current", async (c) => {
  const userId = getUserId(c);
  const holder = await fetchFilmHolderRow(c, userId, c.req.param("id"));
  if (!holder) return c.json({ error: "Not found" }, 404);

  const currentLoad = await fetchActiveFilmHolderLoad(c, userId, holder.id);
  if (!currentLoad) {
    return c.json({ error: "film holder has no active load" }, 400);
  }
  if (currentLoad.status === "exposed") {
    return c.json({ error: "film holder has an exposed load that must be processed before it can be emptied" }, 400);
  }
  if (currentLoad.exposed_photograph_id) {
    return c.json({ error: "film holder current load has an exposure link and cannot be emptied safely" }, 400);
  }

  const result = await c.env.DB.prepare("DELETE FROM film_holder_loads WHERE id = ? AND user_id = ?")
    .bind(currentLoad.id, userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);

  const refreshed = await fetchFilmHolderResponse(c, userId, holder.id, true);
  if (!refreshed) return c.json({ error: "Not found" }, 404);
  return c.json(refreshed);
});

filmHolders.post("/:id/loads/current/discard", async (c) => {
  const userId = getUserId(c);
  try {
    const holder = await fetchFilmHolderRow(c, userId, c.req.param("id"));
    if (!holder) return c.json({ error: "Not found" }, 404);

    const currentLoad = await fetchActiveFilmHolderLoad(c, userId, holder.id);
    if (!currentLoad) {
      const latestLoad = await fetchLatestFilmHolderLoad(c, userId, holder.id);
      if (latestLoad?.status === "processed") {
        return c.json({ error: "film holder current load has already been processed" }, 400);
      }
      return c.json({ error: "film holder has no active exposed load to discard" }, 400);
    }
    if (currentLoad.status !== "exposed") {
      return c.json({ error: "film holder has a loaded film stock" }, 400);
    }

    let body: Record<string, unknown> = {};
    if (c.req.header("content-type")?.includes("application/json")) {
      const parsed = await c.req.json();
      if (!isPlainObject(parsed)) {
        return c.json({ error: "Request body must be an object" }, 400);
      }
      body = parsed;
    }

    const hasReason = Object.prototype.hasOwnProperty.call(body, "reason");
    const reason = hasReason
      ? parseOptionalStringValue(getBodyValue(body, "reason"), "reason")
      : undefined;
    const hasNotes = Object.prototype.hasOwnProperty.call(body, "notes");
    const notes = hasNotes
      ? parseOptionalStringValue(getBodyValue(body, "notes"), "notes")
      : undefined;

    const now = new Date().toISOString();
    const updates: Array<[string, unknown]> = [
      ["status", "discarded"],
      ["discarded_at", now],
      ["discarded_reason", reason ?? DEFAULT_FILM_HOLDER_DISCARD_REASON],
      ["updated_at", now],
    ];
    if (hasNotes) {
      updates.push(["notes", notes ?? null]);
    }

    const set = updates.map(([column]) => `${column} = ?`).join(", ");
    const result = await c.env.DB.prepare(
      `UPDATE film_holder_loads SET ${set} WHERE id = ? AND user_id = ? AND status = 'exposed'`
    ).bind(...updates.map(([, value]) => value), currentLoad.id, userId).run();
    if (result.meta.changes === 0) {
      return c.json({ error: "film holder load could not be discarded" }, 400);
    }

    const refreshed = await fetchFilmHolderResponse(c, userId, holder.id, true);
    if (!refreshed) return c.json({ error: "Not found" }, 404);
    return c.json(refreshed);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid film holder load fields" }, 400);
  }
});

filmHolders.post("/:id/loads/current/process", async (c) => {
  const userId = getUserId(c);
  try {
    const holder = await fetchFilmHolderRow(c, userId, c.req.param("id"));
    if (!holder) return c.json({ error: "Not found" }, 404);

    const currentLoad = await fetchActiveFilmHolderLoad(c, userId, holder.id);
    if (!currentLoad) {
      return c.json({ error: "film holder has no active load to process" }, 400);
    }
    if (currentLoad.status !== "exposed") {
      return c.json({ error: "film holder load must be exposed before it can be processed" }, 400);
    }

    let body: Record<string, unknown> = {};
    if (c.req.header("content-type")?.includes("application/json")) {
      const parsed = await c.req.json();
      if (!isPlainObject(parsed)) {
        return c.json({ error: "Request body must be an object" }, 400);
      }
      body = parsed;
    }

    const hasDevelopmentProfileId = Object.prototype.hasOwnProperty.call(body, "development_profile_id");
    const hasNotes = Object.prototype.hasOwnProperty.call(body, "notes");
    let developmentProfileId: string | null | undefined;
    let notes: string | null | undefined;
    if (hasDevelopmentProfileId) {
      developmentProfileId = parseOptionalStringValue(getBodyValue(body, "development_profile_id"), "development_profile_id");
      if (developmentProfileId !== undefined && developmentProfileId !== null) {
        const profile = await fetchOwnDevelopmentProfile(c, userId, developmentProfileId);
        if (!profile) {
          return c.json({ error: "development_profile_id must reference a development profile belonging to the current user" }, 400);
        }
        if (profile.film_id !== currentLoad.film_id) {
          return c.json({ error: "development_profile_id must reference a development profile for the current holder film stock" }, 400);
        }
      }
    }
    if (hasNotes) {
      notes = parseOptionalStringValue(getBodyValue(body, "notes"), "notes");
    }

    const now = new Date().toISOString();
    const updates: Array<[string, unknown]> = [
      ["status", "processed"],
      ["processed_at", now],
    ];
    if (hasDevelopmentProfileId) {
      updates.push(["development_profile_id", developmentProfileId ?? null]);
    }
    if (hasNotes) {
      updates.push(["notes", notes ?? null]);
    }
    updates.push(["updated_at", now]);
    const set = updates.map(([column]) => `${column} = ?`).join(", ");
    const result = await c.env.DB.prepare(
      `UPDATE film_holder_loads SET ${set} WHERE id = ? AND user_id = ? AND status = 'exposed'`
    ).bind(...updates.map(([, value]) => value), currentLoad.id, userId).run();
    if (result.meta.changes === 0) {
      return c.json({ error: "film holder load could not be processed" }, 400);
    }

    const refreshed = await fetchFilmHolderResponse(c, userId, holder.id, true);
    if (!refreshed) return c.json({ error: "Not found" }, 404);
    return c.json(refreshed);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid film holder load fields" }, 400);
  }
});

filmHolders.post("/:id/loads/current/undo-exposure", async (c) => {
  const userId = getUserId(c);
  try {
    const holder = await fetchFilmHolderRow(c, userId, c.req.param("id"));
    if (!holder) return c.json({ error: "Not found" }, 404);

    const currentLoad = await fetchActiveFilmHolderLoad(c, userId, holder.id);
    if (!currentLoad) {
      const latestLoad = await fetchLatestFilmHolderLoad(c, userId, holder.id);
      if (latestLoad?.status === "processed") {
        return c.json({ error: "film holder current load has already been processed" }, 400);
      }
      return c.json({ error: "film holder has no active load to undo" }, 400);
    }
    if (currentLoad.status !== "exposed") {
      return c.json({ error: "film holder load must be exposed before it can be undone" }, 400);
    }

    let body: Record<string, unknown> = {};
    if (c.req.header("content-type")?.includes("application/json")) {
      const parsed = await c.req.json();
      if (!isPlainObject(parsed)) {
        return c.json({ error: "Request body must be an object" }, 400);
      }
      body = parsed;
    }

    const hasClearPhotographHolder = Object.prototype.hasOwnProperty.call(body, "clear_photograph_holder");
    const clearPhotographHolder = hasClearPhotographHolder
      ? parseOptionalBooleanValue(getBodyValue(body, "clear_photograph_holder"), "clear_photograph_holder")
      : undefined;

    let linkedPhotographHolderId: string | null = null;
    if (currentLoad.exposed_photograph_id) {
      const photograph = await c.env.DB.prepare(
        "SELECT film_holder_id FROM photographs WHERE id = ? AND user_id = ?"
      ).bind(currentLoad.exposed_photograph_id, userId).first<{ film_holder_id: string | null }>();
      linkedPhotographHolderId = photograph?.film_holder_id ?? null;
    }

    if (currentLoad.exposed_photograph_id && linkedPhotographHolderId === holder.id && clearPhotographHolder !== true) {
      return c.json({
        error: "clear_photograph_holder must be true when the exposed photograph still references this film holder",
      }, 409);
    }

    const now = new Date().toISOString();
    const statements = [
      c.env.DB.prepare(
        `UPDATE film_holder_loads
         SET status = 'loaded', exposed_at = NULL, exposed_photograph_id = NULL, processed_at = NULL, updated_at = ?
         WHERE id = ? AND user_id = ? AND status = 'exposed'`
      ).bind(now, currentLoad.id, userId),
    ];
    if (currentLoad.exposed_photograph_id && linkedPhotographHolderId === holder.id && clearPhotographHolder === true) {
      statements.push(
        c.env.DB.prepare(
          `UPDATE photographs
           SET film_holder_id = NULL, updated_at = ?
           WHERE id = ? AND user_id = ? AND film_holder_id = ?`
        ).bind(now, currentLoad.exposed_photograph_id, userId, holder.id),
      );
    }

    await c.env.DB.batch(statements);

    const refreshed = await fetchFilmHolderResponse(c, userId, holder.id, true);
    if (!refreshed) return c.json({ error: "Not found" }, 404);
    return c.json(refreshed);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid film holder load fields" }, 400);
  }
});

filmHolders.post("/:id/loads/:loadId/unprocess", async (c) => {
  const userId = getUserId(c);
  const holder = await fetchFilmHolderRow(c, userId, c.req.param("id"));
  if (!holder) return c.json({ error: "Not found" }, 404);

  const currentLoad = await fetchActiveFilmHolderLoad(c, userId, holder.id);
  if (currentLoad) {
    return c.json({ error: "film holder must be empty before restoring a processed load" }, 400);
  }

  const loadId = c.req.param("loadId");
  const load = await c.env.DB.prepare(
    `SELECT id, status
     FROM film_holder_loads
     WHERE id = ? AND film_holder_id = ? AND user_id = ?`
  ).bind(loadId, holder.id, userId).first<{ id: string; status: FilmHolderLoad["status"] }>();
  if (!load) return c.json({ error: "film holder load not found" }, 404);
  if (load.status !== "processed") {
    return c.json({ error: "only processed film holder loads can be restored" }, 400);
  }

  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `UPDATE film_holder_loads
     SET status = 'exposed', processed_at = NULL, development_profile_id = NULL, updated_at = ?
     WHERE id = ? AND film_holder_id = ? AND user_id = ? AND status = 'processed'`
  ).bind(now, load.id, holder.id, userId).run();
  if (result.meta.changes === 0) {
    return c.json({ error: "film holder load could not be restored" }, 400);
  }

  const refreshed = await fetchFilmHolderResponse(c, userId, holder.id, true);
  if (!refreshed) return c.json({ error: "Not found" }, 404);
  return c.json(refreshed);
});

filmHolders.patch("/:id", async (c) => {
  const userId = getUserId(c);
  try {
    const body = await c.req.json();
    if (!isPlainObject(body)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }

    const fields = Object.entries(body).filter(([k]) => ["name", "type", "width_mm", "height_mm", "brand", "capacity"].includes(k));
    const hasApplicableCameraIds = Object.prototype.hasOwnProperty.call(body, "applicable_camera_ids");
    let applicableCameraIds: string[] | undefined;
    if (hasApplicableCameraIds) {
      applicableCameraIds = parseApplicableCameraIds(body);
      if (applicableCameraIds !== undefined && applicableCameraIds.length > 0) {
        await ensureOwnCameraIds(c, userId, applicableCameraIds);
      }
    }
    if (fields.length === 0 && !hasApplicableCameraIds) return c.json({ error: "No valid fields to update" }, 400);
    const set = fields.map(([k]) => `${k} = ?`).join(", ");
    if (fields.length > 0) {
      const result = await c.env.DB.prepare(
        `UPDATE film_holders SET ${set} WHERE id = ? AND user_id = ?`
      ).bind(...fields.map(([, v]) => v), c.req.param("id"), userId).run();
      if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
    } else {
      const holder = await fetchFilmHolderRow(c, userId, c.req.param("id"));
      if (!holder) return c.json({ error: "Not found" }, 404);
    }
    if (hasApplicableCameraIds) {
      await replaceFilmHolderCameraIds(c, userId, c.req.param("id"), applicableCameraIds ?? []);
    }
    const holder = await fetchFilmHolderResponse(c, userId, c.req.param("id"), true);
    if (!holder) return c.json({ error: "Not found" }, 404);
    return c.json(holder);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid film holder fields" }, 400);
  }
});

filmHolders.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM film_holders WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

export { filmHolders as filmHoldersRouter, filmStocks as filmStocksRouter };
