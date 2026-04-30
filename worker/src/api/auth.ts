import { Hono } from "hono";
import { sign } from "hono/jwt";
import { ulid } from "ulid";
import * as bcrypt from "bcryptjs";
import { Env } from "../index";
import { User } from "../types";
import { authMiddleware, getUserId } from "./middleware";

const auth = new Hono<{ Bindings: Env }>();

auth.post("/register", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password || password.length < 8) {
    return c.json({ error: "Invalid email or password (min 8 chars)" }, 400);
  }

  // Check if user exists
  const existingUser = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();

  if (existingUser) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const id = ulid();
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  try {
    await c.env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(id, email, passwordHash, now, now)
      .run();

    const user: User = { id, email, created_at: now, updated_at: now };
    const token = await sign({ sub: id, email }, c.env.JWT_SECRET);

    return c.json({ token, user }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password required" }, 400);
  }

  const userRecord = await c.env.DB.prepare(
    "SELECT id, email, password_hash, created_at, updated_at FROM users WHERE email = ?"
  )
    .bind(email)
    .first<any>();

  if (!userRecord || !(await bcrypt.compare(password, userRecord.password_hash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const user: User = {
    id: userRecord.id,
    email: userRecord.email,
    created_at: userRecord.created_at,
    updated_at: userRecord.updated_at,
  };
  const token = await sign({ sub: user.id, email: user.email }, c.env.JWT_SECRET);

  return c.json({ token, user }, 200);
});

auth.get("/me", authMiddleware, async (c) => {
  const userId = getUserId(c);
  const user = await c.env.DB.prepare(
    "SELECT id, email, created_at, updated_at FROM users WHERE id = ?"
  )
    .bind(userId)
    .first<User>();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(user);
});

export default auth;
