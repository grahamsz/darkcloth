import { Hono } from "hono";
import { ulid } from "ulid";
import { Env } from "../index";
import { Photograph, PhotographImage } from "../types";
import { authMiddleware, getUserId } from "./middleware";

const photos = new Hono<{ Bindings: Env }>();

photos.use("*", authMiddleware);

function paginate(query: Record<string, string>) {
  const limit = Math.min(parseInt(query.limit ?? "50"), 200);
  const offset = parseInt(query.offset ?? "0");
  return { limit: isNaN(limit) ? 50 : limit, offset: isNaN(offset) ? 0 : offset };
}

const PHOTO_FIELDS = [
  "roll_id", "camera_id", "lens_id", "film_id", "frame_number",
  "taken_at", "aperture", "shutter_speed", "iso", "exposure_compensation",
  "focal_length_mm", "latitude", "longitude", "altitude_m", "gps_accuracy_m", "notes",
];

photos.get("/", async (c) => {
  const userId = getUserId(c);
  const query = c.req.query();
  const { limit, offset } = paginate(query);
  const FILTER_COLS = ["roll_id", "camera_id", "lens_id", "film_id"] as const;
  const filters = FILTER_COLS.filter(k => query[k]);
  const whereClauses = ["user_id = ?", ...filters.map(k => `${k} = ?`)];
  const filterBinds = [userId, ...filters.map(k => query[k])];
  const where = whereClauses.join(" AND ");
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM photographs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...filterBinds, limit, offset).all<Photograph>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM photographs WHERE ${where}`)
      .bind(...filterBinds).first<{ total: number }>(),
  ]);
  return c.json({ items: rows.results, total: count?.total ?? 0 });
});

photos.post("/", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const id = ulid();
  const now = new Date().toISOString();
  const fields = PHOTO_FIELDS.filter(f => body[f] !== undefined);
  const columns = ["id", "user_id", ...fields, "created_at", "updated_at"].join(", ");
  const placeholders = Array(fields.length + 4).fill("?").join(", ");
  const values = [id, userId, ...fields.map(f => body[f] ?? null), now, now];
  await c.env.DB.prepare(`INSERT INTO photographs (${columns}) VALUES (${placeholders})`)
    .bind(...values).run();
  return c.json(await c.env.DB.prepare("SELECT * FROM photographs WHERE id = ?").bind(id).first<Photograph>(), 201);
});

photos.get("/:id", async (c) => {
  const userId = getUserId(c);
  const photo = await c.env.DB.prepare("SELECT * FROM photographs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<Photograph>();
  if (!photo) return c.json({ error: "Not found" }, 404);
  return c.json(photo);
});

photos.patch("/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const fields = Object.entries(body).filter(([k]) => PHOTO_FIELDS.includes(k));
  if (fields.length === 0) return c.json({ error: "No valid fields to update" }, 400);
  const now = new Date().toISOString();
  const set = [...fields.map(([k]) => `${k} = ?`), "updated_at = ?"].join(", ");
  const result = await c.env.DB.prepare(
    `UPDATE photographs SET ${set} WHERE id = ? AND user_id = ?`
  ).bind(...fields.map(([, v]) => v), now, c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return c.json(await c.env.DB.prepare("SELECT * FROM photographs WHERE id = ?").bind(c.req.param("id")).first<Photograph>());
});

photos.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM photographs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

// Image endpoints — R2 not yet enabled (photo-efz)

photos.get("/:id/images", async (c) => {
  const userId = getUserId(c);
  const photo = await c.env.DB.prepare("SELECT id FROM photographs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first();
  if (!photo) return c.json({ error: "Not found" }, 404);
  const rows = await c.env.DB.prepare(
    "SELECT id, photograph_id, content_type, width, height, original_filename, created_at FROM photograph_images WHERE photograph_id = ? ORDER BY created_at ASC"
  ).bind(c.req.param("id")).all<Omit<PhotographImage, "url">>();
  return c.json({ items: rows.results.map(img => ({ ...img, url: null })), total: rows.results.length });
});

photos.post("/:id/images", (c) => c.json({ error: "R2 not yet enabled" }, 503));

photos.delete("/:id/images/:image_id", (c) => c.json({ error: "R2 not yet enabled" }, 503));

export default photos;
