import { Hono } from "hono";
import { ulid } from "ulid";
import { Env } from "../index";
import { Roll, RollStatus } from "../types";
import {
  parseRollFormatQuery,
  parseRollFormatValue,
} from "./media-compat";
import { authMiddleware, getUserId } from "./middleware";

const rolls = new Hono<{ Bindings: Env }>();

rolls.use("*", authMiddleware);

const TERMINAL_ROLL_STATUSES = new Set<RollStatus>(["finished", "processed", "developed"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBodyValue(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key) ? body[key] : undefined;
}

function parseOptionalStringValue(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parsePushPullStops(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -3 || value > 3) {
    throw new Error("push_pull_stops must be an integer between -3 and 3");
  }
  return value;
}

export function rollStatusUpdateStatement(c: { env: Env }, userId: string, rollId: string) {
  return c.env.DB.prepare(
    `UPDATE rolls
     SET status = CASE
       WHEN status IN ('finished', 'processed', 'developed') THEN status
       WHEN EXISTS (
         SELECT 1
         FROM photographs
         WHERE roll_id = ? AND user_id = ?
       ) THEN 'exposing'
       ELSE 'unexposed'
     END
     WHERE id = ? AND user_id = ?`
  ).bind(rollId, userId, rollId, userId);
}

async function fetchOwnDevelopmentProfile(c: { env: Env }, userId: string, profileId: string) {
  return c.env.DB.prepare("SELECT id, film_id FROM development_profiles WHERE id = ? AND user_id = ?")
    .bind(profileId, userId).first<{ id: string; film_id: string }>();
}

async function fetchOwnRollRow(c: { env: Env }, userId: string, rollId: string) {
  return c.env.DB.prepare("SELECT * FROM rolls WHERE id = ? AND user_id = ?")
    .bind(rollId, userId).first<Roll>();
}

async function rollHasPhotographs(c: { env: Env }, userId: string, rollId: string) {
  const row = await c.env.DB.prepare(
    "SELECT 1 as found FROM photographs WHERE roll_id = ? AND user_id = ? LIMIT 1"
  ).bind(rollId, userId).first<{ found: number }>();
  return row != null;
}

type ParsedRollLifecycleInput = {
  hasFinishedAt: boolean;
  hasProcessedAt: boolean;
  hasDevelopedAt: boolean;
  hasDevelopmentProfileId: boolean;
  hasDevelopmentNotes: boolean;
  finishedAt: string | null | undefined;
  processedAt: string | null | undefined;
  developmentProfileId: string | null | undefined;
  developmentNotes: string | null | undefined;
  hasLifecycleTimestampChange: boolean;
};

function parseRollLifecycleInput(body: Record<string, unknown>): ParsedRollLifecycleInput {
  const hasFinishedAt = Object.prototype.hasOwnProperty.call(body, "finished_at");
  const hasProcessedAt = Object.prototype.hasOwnProperty.call(body, "processed_at");
  const hasDevelopedAt = Object.prototype.hasOwnProperty.call(body, "developed_at");
  const hasDevelopmentProfileId = Object.prototype.hasOwnProperty.call(body, "development_profile_id");
  const hasDevelopmentNotes = Object.prototype.hasOwnProperty.call(body, "development_notes");

  const finishedAt = hasFinishedAt
    ? parseOptionalStringValue(getBodyValue(body, "finished_at"), "finished_at")
    : undefined;
  const processedAt = hasProcessedAt
    ? parseOptionalStringValue(getBodyValue(body, "processed_at"), "processed_at")
    : undefined;
  const developedAt = hasDevelopedAt
    ? parseOptionalStringValue(getBodyValue(body, "developed_at"), "developed_at")
    : undefined;

  if (processedAt !== undefined && developedAt !== undefined && processedAt !== developedAt) {
    throw new Error("processed_at and developed_at must match when both are provided");
  }

  return {
    hasFinishedAt,
    hasProcessedAt,
    hasDevelopedAt,
    hasDevelopmentProfileId,
    hasDevelopmentNotes,
    finishedAt,
    processedAt: processedAt !== undefined ? processedAt : developedAt,
    developmentProfileId: hasDevelopmentProfileId
      ? parseOptionalStringValue(getBodyValue(body, "development_profile_id"), "development_profile_id")
      : undefined,
    developmentNotes: hasDevelopmentNotes
      ? parseOptionalStringValue(getBodyValue(body, "development_notes"), "development_notes")
      : undefined,
    hasLifecycleTimestampChange: hasFinishedAt || hasProcessedAt || hasDevelopedAt,
  };
}

function normalizeRollResponse(roll: Roll): Roll {
  const processedAt = roll.processed_at ?? roll.developed_at;
  return {
    ...roll,
    processed_at: processedAt,
    developed_at: processedAt,
  };
}

function rollStatusAfterPatch(
  currentStatus: RollStatus,
  hasPhotographs: boolean,
  lifecycle: ParsedRollLifecycleInput,
) {
  if (lifecycle.processedAt !== undefined && lifecycle.processedAt !== null) {
    return "processed" as RollStatus;
  }
  if (lifecycle.finishedAt !== undefined && lifecycle.finishedAt !== null) {
    return "finished" as RollStatus;
  }
  if (lifecycle.hasLifecycleTimestampChange) {
    return hasPhotographs ? "exposing" : "unexposed";
  }
  if (TERMINAL_ROLL_STATUSES.has(currentStatus)) {
    return currentStatus;
  }
  return hasPhotographs ? "exposing" : "unexposed";
}

function rollStatusAfterCreate(lifecycle: ParsedRollLifecycleInput) {
  if (lifecycle.processedAt !== undefined && lifecycle.processedAt !== null) {
    return "processed" as RollStatus;
  }
  if (lifecycle.finishedAt !== undefined && lifecycle.finishedAt !== null) {
    return "finished" as RollStatus;
  }
  return "unexposed" as RollStatus;
}

async function ensureDevelopmentProfileMatchesRoll(
  c: { env: Env },
  userId: string,
  rollFilmId: string | null,
  developmentProfileId: string,
) {
  const profile = await fetchOwnDevelopmentProfile(c, userId, developmentProfileId);
  if (!profile) {
    throw new Error("development_profile_id must reference a development profile belonging to the current user");
  }
  if (rollFilmId !== null && profile.film_id !== rollFilmId) {
    throw new Error("development_profile_id must reference a development profile for the roll's film stock");
  }
}

async function fetchRollPhotographState(c: { env: Env }, userId: string, rollId: string) {
  return rollHasPhotographs(c, userId, rollId);
}

function paginate(query: Record<string, string>) {
  const limit = Math.min(parseInt(query.limit ?? "50"), 200);
  const offset = parseInt(query.offset ?? "0");
  return { limit: isNaN(limit) ? 50 : limit, offset: isNaN(offset) ? 0 : offset };
}

rolls.get("/", async (c) => {
  try {
    const userId = getUserId(c);
    const query = c.req.query();
    const { limit, offset } = paginate(query);
    const { film_id } = query;
    const rollFormat = parseRollFormatQuery(query.roll_format);
    const whereClauses = ["user_id = ?"];
    const baseBinds: Array<string | number | null> = [userId];
    if (film_id) {
      whereClauses.push("film_id = ?");
      baseBinds.push(film_id);
    }
    if (rollFormat !== undefined) {
      whereClauses.push("roll_format = ?");
      baseBinds.push(rollFormat);
    }
    const where = whereClauses.join(" AND ");
    const [rows, count] = await Promise.all([
      c.env.DB.prepare(`SELECT * FROM rolls WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...baseBinds, limit, offset).all<Roll>(),
      c.env.DB.prepare(`SELECT COUNT(*) as total FROM rolls WHERE ${where}`)
        .bind(...baseBinds).first<{ total: number }>(),
    ]);
    return c.json({ items: rows.results.map(normalizeRollResponse), total: count?.total ?? 0 });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid roll filters" }, 400);
  }
});

rolls.post("/", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  if (!isPlainObject(body)) return c.json({ error: "Request body must be an object" }, 400);

  const { name } = body;
  if (typeof name !== "string" || name.trim().length === 0) {
    return c.json({ error: "name is required" }, 400);
  }

  const filmId = Object.prototype.hasOwnProperty.call(body, "film_id")
    ? parseOptionalStringValue(getBodyValue(body, "film_id"), "film_id")
    : null;
  const rollFormat = Object.prototype.hasOwnProperty.call(body, "roll_format")
    ? parseRollFormatValue(getBodyValue(body, "roll_format"), "roll_format")
    : undefined;
  const loadedAt = Object.prototype.hasOwnProperty.call(body, "loaded_at")
    ? parseOptionalStringValue(getBodyValue(body, "loaded_at"), "loaded_at")
    : null;
  const lifecycle = parseRollLifecycleInput(body);
  const pushPullStops = Object.prototype.hasOwnProperty.call(body, "push_pull_stops")
    ? parsePushPullStops(getBodyValue(body, "push_pull_stops"))
    : 0;
  const normalizedRollFormat = rollFormat === undefined ? null : rollFormat;
  const developmentProfileId = lifecycle.hasDevelopmentProfileId
    ? lifecycle.developmentProfileId ?? null
    : null;
  const developmentNotes = lifecycle.hasDevelopmentNotes
    ? lifecycle.developmentNotes ?? null
    : null;

  try {
    if (developmentProfileId !== null && developmentProfileId !== undefined) {
      await ensureDevelopmentProfileMatchesRoll(c, userId, filmId, developmentProfileId);
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid roll fields" }, 400);
  }

  const id = ulid();
  const now = new Date().toISOString();
  const status = rollStatusAfterCreate(lifecycle);
  const processedAt = lifecycle.processedAt ?? null;
  const finishedAt = lifecycle.finishedAt ?? null;
  await c.env.DB.prepare(
    `INSERT INTO rolls
      (id, user_id, film_id, roll_format, name, loaded_at, finished_at, developed_at, processed_at,
       development_profile_id, development_notes, push_pull_stops, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    userId,
    filmId,
    normalizedRollFormat,
    name,
    loadedAt,
    finishedAt,
    processedAt,
    processedAt,
    developmentProfileId,
    developmentNotes,
    pushPullStops,
    status,
    now,
  ).run();

  const roll = await fetchOwnRollRow(c, userId, id);
  if (!roll) return c.json({ error: "Not found" }, 500);
  return c.json(normalizeRollResponse(roll), 201);
});

rolls.get("/:id", async (c) => {
  const userId = getUserId(c);
  const roll = await fetchOwnRollRow(c, userId, c.req.param("id"));
  if (!roll) return c.json({ error: "Not found" }, 404);
  return c.json(normalizeRollResponse(roll));
});

rolls.post("/:id/finish", async (c) => {
  const userId = getUserId(c);
  const roll = await fetchOwnRollRow(c, userId, c.req.param("id"));
  if (!roll) return c.json({ error: "Not found" }, 404);
  if (TERMINAL_ROLL_STATUSES.has(roll.status) && roll.status !== "finished") {
    return c.json({ error: "roll is already processed" }, 400);
  }
  if (roll.status === "finished") {
    return c.json(normalizeRollResponse(roll));
  }

  let finishedAt = new Date().toISOString();
  let body: Record<string, unknown> = {};
  if (c.req.header("content-type")?.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (!isPlainObject(parsed)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }
    body = parsed;
  }
  if (Object.prototype.hasOwnProperty.call(body, "finished_at")) {
    finishedAt = parseOptionalStringValue(getBodyValue(body, "finished_at"), "finished_at") ?? finishedAt;
  }

  await c.env.DB.prepare(
    "UPDATE rolls SET finished_at = ?, status = 'finished' WHERE id = ? AND user_id = ?"
  ).bind(finishedAt, c.req.param("id"), userId).run();
  const refreshed = await fetchOwnRollRow(c, userId, c.req.param("id"));
  if (!refreshed) return c.json({ error: "Not found" }, 404);
  return c.json(normalizeRollResponse(refreshed));
});

rolls.post("/:id/process", async (c) => {
  const userId = getUserId(c);
  const roll = await fetchOwnRollRow(c, userId, c.req.param("id"));
  if (!roll) return c.json({ error: "Not found" }, 404);
  if (roll.status === "processed" || roll.status === "developed") {
    return c.json({ error: "roll is already processed" }, 400);
  }

  let body: Record<string, unknown> = {};
  if (c.req.header("content-type")?.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (!isPlainObject(parsed)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }
    body = parsed;
  }

  const processedAt = Object.prototype.hasOwnProperty.call(body, "processed_at")
    ? parseOptionalStringValue(getBodyValue(body, "processed_at"), "processed_at") ?? new Date().toISOString()
    : Object.prototype.hasOwnProperty.call(body, "developed_at")
      ? parseOptionalStringValue(getBodyValue(body, "developed_at"), "developed_at") ?? new Date().toISOString()
      : new Date().toISOString();

  const lifecycle = parseRollLifecycleInput(body);
  const developmentProfileId = lifecycle.hasDevelopmentProfileId
    ? lifecycle.developmentProfileId ?? null
    : roll.development_profile_id;
  const developmentNotes = lifecycle.hasDevelopmentNotes
    ? lifecycle.developmentNotes ?? null
    : roll.development_notes;

  try {
    if (developmentProfileId !== null && developmentProfileId !== undefined) {
      await ensureDevelopmentProfileMatchesRoll(c, userId, roll.film_id, developmentProfileId);
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid roll fields" }, 400);
  }

  const finishedAt = roll.finished_at ?? processedAt;
  await c.env.DB.prepare(
    `UPDATE rolls
     SET finished_at = ?, processed_at = ?, developed_at = ?, development_profile_id = ?, development_notes = ?, status = 'processed'
     WHERE id = ? AND user_id = ?`
  ).bind(
    finishedAt,
    processedAt,
    processedAt,
    developmentProfileId,
    developmentNotes,
    c.req.param("id"),
    userId,
  ).run();
  const refreshed = await fetchOwnRollRow(c, userId, c.req.param("id"));
  if (!refreshed) return c.json({ error: "Not found" }, 404);
  return c.json(normalizeRollResponse(refreshed));
});

rolls.post("/:id/reopen", async (c) => {
  const userId = getUserId(c);
  const roll = await fetchOwnRollRow(c, userId, c.req.param("id"));
  if (!roll) return c.json({ error: "Not found" }, 404);
  const hasPhotographs = await fetchRollPhotographState(c, userId, roll.id);
  const status: RollStatus = hasPhotographs ? "exposing" : "unexposed";
  await c.env.DB.prepare(
    "UPDATE rolls SET finished_at = NULL, status = ? WHERE id = ? AND user_id = ?"
  ).bind(status, c.req.param("id"), userId).run();
  const refreshed = await fetchOwnRollRow(c, userId, c.req.param("id"));
  if (!refreshed) return c.json({ error: "Not found" }, 404);
  return c.json(normalizeRollResponse(refreshed));
});

rolls.patch("/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  if (!isPlainObject(body)) return c.json({ error: "Request body must be an object" }, 400);

  const currentRoll = await fetchOwnRollRow(c, userId, c.req.param("id"));
  if (!currentRoll) return c.json({ error: "Not found" }, 404);

  const fields: Array<[string, unknown]> = [];
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const value = getBodyValue(body, "name");
    if (typeof value !== "string" || value.trim().length === 0) {
      return c.json({ error: "name is required" }, 400);
    }
    fields.push(["name", value]);
  }
  if (Object.prototype.hasOwnProperty.call(body, "film_id")) {
    fields.push(["film_id", parseOptionalStringValue(getBodyValue(body, "film_id"), "film_id")]);
  }
  if (Object.prototype.hasOwnProperty.call(body, "roll_format")) {
    fields.push(["roll_format", parseRollFormatValue(getBodyValue(body, "roll_format"), "roll_format")]);
  }
  if (Object.prototype.hasOwnProperty.call(body, "loaded_at")) {
    fields.push(["loaded_at", parseOptionalStringValue(getBodyValue(body, "loaded_at"), "loaded_at")]);
  }
  if (Object.prototype.hasOwnProperty.call(body, "push_pull_stops")) {
    fields.push(["push_pull_stops", parsePushPullStops(getBodyValue(body, "push_pull_stops"))]);
  }

  const lifecycle = parseRollLifecycleInput(body);
  if (lifecycle.hasFinishedAt) {
    fields.push(["finished_at", lifecycle.finishedAt ?? null]);
  }
  if (lifecycle.hasProcessedAt || lifecycle.hasDevelopedAt) {
    fields.push(["processed_at", lifecycle.processedAt ?? null]);
    fields.push(["developed_at", lifecycle.processedAt ?? null]);
  }
  if (lifecycle.hasDevelopmentProfileId) {
    fields.push(["development_profile_id", lifecycle.developmentProfileId ?? null]);
  }
  if (lifecycle.hasDevelopmentNotes) {
    fields.push(["development_notes", lifecycle.developmentNotes ?? null]);
  }
  if (fields.length === 0) return c.json({ error: "No valid fields to update" }, 400);

  const nextFilmId = Object.prototype.hasOwnProperty.call(body, "film_id")
    ? (parseOptionalStringValue(getBodyValue(body, "film_id"), "film_id") ?? null)
    : currentRoll.film_id;
  try {
    const nextDevelopmentProfileId = lifecycle.hasDevelopmentProfileId
      ? lifecycle.developmentProfileId ?? null
      : currentRoll.development_profile_id;
    if (nextDevelopmentProfileId !== null && nextDevelopmentProfileId !== undefined) {
      await ensureDevelopmentProfileMatchesRoll(c, userId, nextFilmId, nextDevelopmentProfileId);
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid roll fields" }, 400);
  }

  const hasPhotographs = await fetchRollPhotographState(c, userId, currentRoll.id);
  const status = rollStatusAfterPatch(currentRoll.status, hasPhotographs, lifecycle);
  const set = [...fields.map(([k]) => `${k} = ?`), "status = ?"].join(", ");
  await c.env.DB.prepare(
    `UPDATE rolls SET ${set} WHERE id = ? AND user_id = ?`
  ).bind(...fields.map(([, v]) => v), status, c.req.param("id"), userId).run();
  const roll = await fetchOwnRollRow(c, userId, c.req.param("id"));
  if (!roll) return c.json({ error: "Not found" }, 404);
  return c.json(normalizeRollResponse(roll));
});

rolls.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM rolls WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

export default rolls;
