import { Hono } from "hono";
import { ulid } from "ulid";
import { Env } from "../index";
import { Roll } from "../types";
import { authMiddleware, getUserId } from "./middleware";

const rolls = new Hono<{ Bindings: Env }>();

rolls.use("*", authMiddleware);

function paginate(query: Record<string, string>) {
  const limit = Math.min(parseInt(query.limit ?? "50"), 200);
  const offset = parseInt(query.offset ?? "0");
  return { limit: isNaN(limit) ? 50 : limit, offset: isNaN(offset) ? 0 : offset };
}

rolls.get("/", async (c) => {
  const userId = getUserId(c);
  const query = c.req.query();
  const { limit, offset } = paginate(query);
  const { film_id } = query;
  const where = film_id ? "user_id = ? AND film_id = ?" : "user_id = ?";
  const baseBinds = film_id ? [userId, film_id] : [userId];
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM rolls WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...baseBinds, limit, offset).all<Roll>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM rolls WHERE ${where}`)
      .bind(...baseBinds).first<{ total: number }>(),
  ]);
  return c.json({ items: rows.results, total: count?.total ?? 0 });
});

rolls.post("/", async (c) => {
  const userId = getUserId(c);
  const { name, film_id, loaded_at } = await c.req.json();
  if (!name) return c.json({ error: "name is required" }, 400);
  const id = ulid();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO rolls (id, user_id, film_id, name, loaded_at, developed_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)"
  ).bind(id, userId, film_id ?? null, name, loaded_at ?? null, now).run();
  const roll: Roll = { id, user_id: userId, film_id: film_id ?? null, name, loaded_at: loaded_at ?? null, developed_at: null, created_at: now };
  return c.json(roll, 201);
});

rolls.get("/:id", async (c) => {
  const userId = getUserId(c);
  const roll = await c.env.DB.prepare("SELECT * FROM rolls WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<Roll>();
  if (!roll) return c.json({ error: "Not found" }, 404);
  return c.json(roll);
});

rolls.patch("/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const fields = Object.entries(body).filter(([k]) => ["name", "film_id", "loaded_at", "developed_at"].includes(k));
  if (fields.length === 0) return c.json({ error: "No valid fields to update" }, 400);
  const set = fields.map(([k]) => `${k} = ?`).join(", ");
  const result = await c.env.DB.prepare(
    `UPDATE rolls SET ${set} WHERE id = ? AND user_id = ?`
  ).bind(...fields.map(([, v]) => v), c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return c.json(await c.env.DB.prepare("SELECT * FROM rolls WHERE id = ?").bind(c.req.param("id")).first<Roll>());
});

rolls.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const result = await c.env.DB.prepare("DELETE FROM rolls WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

export default rolls;
