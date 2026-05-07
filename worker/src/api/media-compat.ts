import type { RollFormat } from "../types";

export const ROLL_FORMATS = ["35mm", "120", "220", "127", "620"] as const;

type DbContext = { env: { DB: D1Database } };

type FilmHolderCameraApplicabilityRow = {
  film_holder_id: string;
  camera_id: string;
};

type OwnRollRow = {
  id: string;
  film_id: string | null;
  roll_format: RollFormat | null;
};

export function parseRollFormatValue(value: unknown, field = "roll_format"): RollFormat | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string or null`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!ROLL_FORMATS.includes(trimmed as RollFormat)) {
    throw new Error(`${field} must be one of: ${ROLL_FORMATS.join(", ")}`);
  }
  return trimmed as RollFormat;
}

export function parseRollFormatQuery(value: string | null | undefined): RollFormat | undefined {
  if (value === undefined || value === null) return undefined;

  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!ROLL_FORMATS.includes(trimmed as RollFormat)) {
    throw new Error(`roll_format must be one of: ${ROLL_FORMATS.join(", ")}`);
  }
  return trimmed as RollFormat;
}

export function cameraRollFormatAllowsRoll(cameraRollFormat: RollFormat | null, rollFormat: RollFormat | null) {
  return cameraRollFormat === null || rollFormat === cameraRollFormat;
}

export async function ensureOwnCameraIds(c: DbContext, userId: string, cameraIds: string[]) {
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

export async function fetchFilmHolderCameraIdsByHolderIds(c: DbContext, userId: string, holderIds: string[]) {
  const cameraIdsByHolder = new Map<string, string[]>();
  for (const holderId of holderIds) {
    cameraIdsByHolder.set(holderId, []);
  }
  if (holderIds.length === 0) return cameraIdsByHolder;

  const placeholders = holderIds.map(() => "?").join(", ");
  const rows = await c.env.DB.prepare(
    `SELECT film_holder_id, camera_id
     FROM film_holder_camera_applicability
     WHERE user_id = ? AND film_holder_id IN (${placeholders})
     ORDER BY film_holder_id ASC, camera_id ASC`
  ).bind(userId, ...holderIds).all<FilmHolderCameraApplicabilityRow>();

  for (const row of rows.results) {
    const existing = cameraIdsByHolder.get(row.film_holder_id);
    if (existing) existing.push(row.camera_id);
  }

  return cameraIdsByHolder;
}

export async function fetchFilmHolderCameraIds(c: DbContext, userId: string, holderId: string) {
  const ids = await fetchFilmHolderCameraIdsByHolderIds(c, userId, [holderId]);
  return ids.get(holderId) ?? [];
}

export async function ensureFilmHolderApplicableToCamera(
  c: DbContext,
  userId: string,
  holderId: string,
  cameraId: string,
) {
  const cameraIds = await fetchFilmHolderCameraIds(c, userId, holderId);
  if (cameraIds.length > 0 && !cameraIds.includes(cameraId)) {
    throw new Error("film_holder_id is not applicable to the selected camera");
  }
}

export async function replaceFilmHolderCameraIds(
  c: DbContext,
  userId: string,
  holderId: string,
  cameraIds: string[],
) {
  await ensureOwnCameraIds(c, userId, cameraIds);
  await c.env.DB.prepare("DELETE FROM film_holder_camera_applicability WHERE user_id = ? AND film_holder_id = ?")
    .bind(userId, holderId).run();
  if (cameraIds.length === 0) return;

  await c.env.DB.batch(
    cameraIds.map((cameraId) =>
      c.env.DB.prepare(
        "INSERT INTO film_holder_camera_applicability (user_id, film_holder_id, camera_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
      ).bind(userId, holderId, cameraId)
    )
  );
}

export async function fetchOwnRoll(c: DbContext, userId: string, rollId: string) {
  return c.env.DB.prepare("SELECT id, film_id, roll_format FROM rolls WHERE id = ? AND user_id = ?")
    .bind(rollId, userId).first<OwnRollRow>();
}
