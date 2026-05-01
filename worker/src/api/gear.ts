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
  return c.json({ items: rows.results, total: count?.total ?? 0 });
});

gear.post("/cameras", async (c) => {
  const userId = getUserId(c);
  const { name, maker, film_type, film_holders_id } = await c.req.json();
  if (!name) return c.json({ error: "name is required" }, 400);
  const id = ulid();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO cameras (id, user_id, name, maker, film_type, film_holders_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, userId, name, maker ?? null, film_type ?? null, film_holders_id ?? null, now).run();
  const camera: Camera = { id, user_id: userId, name, maker: maker ?? null, film_type: film_type ?? null, film_holders_id: film_holders_id ?? null, created_at: now };
  return c.json(camera, 201);
});

gear.get("/cameras/:id", async (c) => {
  const userId = getUserId(c);
  const camera = await c.env.DB.prepare("SELECT * FROM cameras WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<Camera>();
  if (!camera) return c.json({ error: "Not found" }, 404);
  return c.json(camera);
});

gear.patch("/cameras/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const fields = Object.entries(body).filter(([k]) => ["name", "maker", "film_type", "film_holders_id"].includes(k));
  if (fields.length === 0) return c.json({ error: "No valid fields to update" }, 400);
  const set = fields.map(([k]) => `${k} = ?`).join(", ");
  const result = await c.env.DB.prepare(
    `UPDATE cameras SET ${set} WHERE id = ? AND user_id = ?`
  ).bind(...fields.map(([, v]) => v), c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return c.json(await c.env.DB.prepare("SELECT * FROM cameras WHERE id = ?").bind(c.req.param("id")).first<Camera>());
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
