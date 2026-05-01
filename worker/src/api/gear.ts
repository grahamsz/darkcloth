import { Hono } from "hono";
import { ulid } from "ulid";
import { Env } from "../index";
import { Camera, Lens, FilmStock, FilmHolder } from "../types";
import { authMiddleware, getUserId } from "./middleware";

const gear = new Hono<{ Bindings: Env }>();

gear.use("*", authMiddleware);

function paginate(query: Record<string, string>) {
  const limit = Math.min(parseInt(query.limit ?? "50"), 200);
  const offset = parseInt(query.offset ?? "0");
  return { limit: isNaN(limit) ? 50 : limit, offset: isNaN(offset) ? 0 : offset };
}

function parseCamera(row: Camera & { compatible_lenses: string | null }): Camera {
  return {
    ...row,
    compatible_lenses: row.compatible_lenses ? JSON.parse(row.compatible_lenses) : null,
  };
}

// ─── Cameras ──────────────────────────────────────────────────────────────────

gear.get("/cameras", async (c) => {
  const userId = getUserId(c);
  const { limit, offset } = paginate(c.req.query());
  const [rows, count] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM cameras WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(userId, limit, offset).all<Camera & { compatible_lenses: string | null }>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM cameras WHERE user_id = ?")
      .bind(userId).first<{ total: number }>(),
  ]);
  return c.json({ items: rows.results.map(parseCamera), total: count?.total ?? 0 });
});

gear.post("/cameras", async (c) => {
  const userId = getUserId(c);
  const { name, maker, film_type, film_holders_id, compatible_lenses } = await c.req.json();
  if (!name) return c.json({ error: "name is required" }, 400);
  const id = ulid();
  const now = new Date().toISOString();
  const compatibleLensesJson = Array.isArray(compatible_lenses) ? JSON.stringify(compatible_lenses) : null;
  await c.env.DB.prepare(
    "INSERT INTO cameras (id, user_id, name, maker, film_type, film_holders_id, compatible_lenses, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, userId, name, maker ?? null, film_type ?? null, film_holders_id ?? null, compatibleLensesJson, now).run();
  const camera: Camera = { id, user_id: userId, name, maker: maker ?? null, film_type: film_type ?? null, film_holders_id: film_holders_id ?? null, compatible_lenses: compatible_lenses ?? null, created_at: now };
  return c.json(camera, 201);
});

gear.get("/cameras/:id", async (c) => {
  const userId = getUserId(c);
  const row = await c.env.DB.prepare("SELECT * FROM cameras WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<Camera & { compatible_lenses: string | null }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(parseCamera(row));
});

gear.patch("/cameras/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const ALLOWED = ["name", "maker", "film_type", "film_holders_id", "compatible_lenses"];
  const rawFields = Object.entries(body).filter(([k]) => ALLOWED.includes(k));
  if (rawFields.length === 0) return c.json({ error: "No valid fields to update" }, 400);
  const fields = rawFields.map(([k, v]) =>
    k === "compatible_lenses" ? [k, Array.isArray(v) ? JSON.stringify(v) : null] : [k, v]
  );
  const set = fields.map(([k]) => `${k} = ?`).join(", ");
  const result = await c.env.DB.prepare(
    `UPDATE cameras SET ${set} WHERE id = ? AND user_id = ?`
  ).bind(...fields.map(([, v]) => v), c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  const row = await c.env.DB.prepare("SELECT * FROM cameras WHERE id = ?")
    .bind(c.req.param("id")).first<Camera & { compatible_lenses: string | null }>();
  return c.json(parseCamera(row!));
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
  try {
    await c.env.DB.prepare(
      "INSERT INTO film_holders (id, user_id, name, type, width_mm, height_mm, brand, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, userId, name, type ?? null, width_mm ?? null, height_mm ?? null, brand ?? null, capacity ?? null, now).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to create film holder: ${msg}` }, 500);
  }
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
  return c.json(await c.env.DB.prepare("SELECT * FROM film_holders WHERE id = ?").bind(c.req.param("id")).first<FilmHolder>());
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
  return c.json({ items: rows.results, total: count?.total ?? 0 });
});

gear.post("/lenses", async (c) => {
  const userId = getUserId(c);
  const { name, focal_length_mm, max_aperture } = await c.req.json();
  if (!name) return c.json({ error: "name is required" }, 400);
  const id = ulid();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO lenses (id, user_id, name, focal_length_mm, max_aperture, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, userId, name, focal_length_mm ?? null, max_aperture ?? null, now).run();
  const lens: Lens = { id, user_id: userId, name, focal_length_mm: focal_length_mm ?? null, max_aperture: max_aperture ?? null, created_at: now };
  return c.json(lens, 201);
});

gear.get("/lenses/:id", async (c) => {
  const userId = getUserId(c);
  const lens = await c.env.DB.prepare("SELECT * FROM lenses WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<Lens>();
  if (!lens) return c.json({ error: "Not found" }, 404);
  return c.json(lens);
});

gear.patch("/lenses/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const fields = Object.entries(body).filter(([k]) => ["name", "focal_length_mm", "max_aperture"].includes(k));
  if (fields.length === 0) return c.json({ error: "No valid fields to update" }, 400);
  const set = fields.map(([k]) => `${k} = ?`).join(", ");
  const result = await c.env.DB.prepare(
    `UPDATE lenses SET ${set} WHERE id = ? AND user_id = ?`
  ).bind(...fields.map(([, v]) => v), c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return c.json(await c.env.DB.prepare("SELECT * FROM lenses WHERE id = ?").bind(c.req.param("id")).first<Lens>());
});

gear.delete("/lenses/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM lenses WHERE id = ? AND user_id = ?")
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
  return c.json({ items: rows.results, total: count?.total ?? 0 });
});

gear.post("/films", async (c) => {
  const userId = getUserId(c);
  const { name, iso, process } = await c.req.json();
  if (!name) return c.json({ error: "name is required" }, 400);
  const id = ulid();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO films (id, user_id, name, iso, process, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, userId, name, iso ?? null, process ?? null, now).run();
  const film: FilmStock = { id, user_id: userId, name, iso: iso ?? null, process: process ?? null, created_at: now };
  return c.json(film, 201);
});

gear.get("/films/:id", async (c) => {
  const userId = getUserId(c);
  const film = await c.env.DB.prepare("SELECT * FROM films WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<FilmStock>();
  if (!film) return c.json({ error: "Not found" }, 404);
  return c.json(film);
});

gear.patch("/films/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const fields = Object.entries(body).filter(([k]) => ["name", "iso", "process"].includes(k));
  if (fields.length === 0) return c.json({ error: "No valid fields to update" }, 400);
  const set = fields.map(([k]) => `${k} = ?`).join(", ");
  const result = await c.env.DB.prepare(
    `UPDATE films SET ${set} WHERE id = ? AND user_id = ?`
  ).bind(...fields.map(([, v]) => v), c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return c.json(await c.env.DB.prepare("SELECT * FROM films WHERE id = ?").bind(c.req.param("id")).first<FilmStock>());
});

gear.delete("/films/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM films WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

export default gear;
