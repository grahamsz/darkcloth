import { Hono } from "hono";
import { sign } from "hono/jwt";
import * as bcrypt from "bcryptjs";
import { ulid } from "ulid";
import { Env } from "../index";
import { User } from "../types";
import { authMiddleware, getUserId } from "./middleware";

const auth = new Hono<{ Bindings: Env }>();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90;

type UserWithPasswordHash = User & {
  password_hash: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBodyValue(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key) ? body[key] : undefined;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseEmail(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  const normalized = normalizeEmail(value);
  if (!EMAIL_RE.test(normalized)) {
    throw new Error(`${field} must be a valid email address`);
  }

  return normalized;
}

function parsePassword(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  if (value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function parseTimezone(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string or null`);
  }

  const timezone = value.trim();
  if (timezone.length === 0) {
    throw new Error(`${field} must be a valid IANA timezone or null`);
  }

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions().timeZone;
  } catch {
    throw new Error(`${field} must be a valid IANA timezone or null`);
  }
}

function parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

type UserResponseRow = Pick<User, "id" | "email" | "default_timezone" | "created_at" | "updated_at"> & {
  auto_use_current_location?: boolean | number | null;
};

function toUserResponse(user: UserResponseRow): User {
  return {
    id: user.id,
    email: user.email,
    default_timezone: user.default_timezone ?? null,
    auto_use_current_location: user.auto_use_current_location === true || user.auto_use_current_location === 1,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

async function fetchUserById(env: Env, userId: string) {
  return env.DB.prepare(
    "SELECT id, email, default_timezone, auto_use_current_location, created_at, updated_at FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<User>();
}

async function fetchUserWithPasswordHash(env: Env, userId: string) {
  return env.DB.prepare(
    "SELECT id, email, default_timezone, auto_use_current_location, password_hash, created_at, updated_at FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<UserWithPasswordHash>();
}

async function fetchUserByNormalizedEmail(env: Env, email: string) {
  return env.DB.prepare(
    "SELECT id, email, default_timezone, auto_use_current_location, password_hash, created_at, updated_at FROM users WHERE LOWER(email) = ?",
  )
    .bind(email)
    .first<UserWithPasswordHash>();
}

function isEmailConflictError(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed: users\.email/i.test(error.message);
}

auth.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isPlainObject(body)) {
    return c.json({ error: "Request body must be an object" }, 400);
  }

  try {
    const email = parseEmail(getBodyValue(body, "email"), "email");
    const password = parsePassword(getBodyValue(body, "password"), "password");

    if (password.length < 8) {
      return c.json({ error: "Invalid email or password (min 8 chars)" }, 400);
    }

    const existingUser = await c.env.DB.prepare(
      "SELECT id FROM users WHERE LOWER(email) = ?",
    )
      .bind(email)
      .first<{ id: string }>();

    if (existingUser) {
      return c.json({ error: "Email already registered" }, 409);
    }

    const id = ulid();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    try {
      await c.env.DB.prepare(
        "INSERT INTO users (id, email, password_hash, default_timezone, auto_use_current_location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(id, email, passwordHash, null, 0, now, now)
        .run();
    } catch (error) {
      if (isEmailConflictError(error)) {
        return c.json({ error: "Email already registered" }, 409);
      }
      throw error;
    }

    const user = toUserResponse({ id, email, default_timezone: null, auto_use_current_location: false, created_at: now, updated_at: now });
    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    // JWT auth is keyed by sub; email remains an informational claim.
    const token = await sign({ sub: id, email, exp }, c.env.JWT_SECRET);

    return c.json({ token, user }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid registration payload" }, 400);
  }
});

auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isPlainObject(body)) {
    return c.json({ error: "Request body must be an object" }, 400);
  }

  try {
    const email = parseEmail(getBodyValue(body, "email"), "email");
    const password = parsePassword(getBodyValue(body, "password"), "password");

    const userRecord = await fetchUserByNormalizedEmail(c.env, email);
    if (!userRecord || !(await bcrypt.compare(password, userRecord.password_hash))) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const user = toUserResponse(userRecord);
    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    // JWT auth is keyed by sub; email remains an informational claim.
    const token = await sign({ sub: user.id, email: user.email, exp }, c.env.JWT_SECRET);

    return c.json({ token, user }, 200);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid login payload" }, 400);
  }
});

auth.get("/me", authMiddleware, async (c) => {
  const userId = getUserId(c);
  const user = await fetchUserById(c.env, userId);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(toUserResponse(user));
});

auth.patch("/me", authMiddleware, async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => null);
  if (!isPlainObject(body)) {
    return c.json({ error: "Request body must be an object" }, 400);
  }

  const currentUser = await fetchUserWithPasswordHash(c.env, userId);
  if (!currentUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");
  const hasTimezone = Object.prototype.hasOwnProperty.call(body, "default_timezone");
  const hasAutoLocation = Object.prototype.hasOwnProperty.call(body, "auto_use_current_location");
  const hasCurrentPassword = Object.prototype.hasOwnProperty.call(body, "current_password");

  if (!hasEmail && !hasTimezone && !hasAutoLocation) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  let nextEmail: string | undefined;
  let nextTimezone: string | null | undefined;
  let nextAutoLocation: boolean | undefined;

  try {
    if (hasEmail) {
      nextEmail = parseEmail(getBodyValue(body, "email"), "email");
    }

    if (hasTimezone) {
      nextTimezone = parseTimezone(getBodyValue(body, "default_timezone"), "default_timezone");
    }

    if (hasAutoLocation) {
      nextAutoLocation = parseOptionalBoolean(getBodyValue(body, "auto_use_current_location"), "auto_use_current_location");
    }

    if (hasEmail) {
      if (!hasCurrentPassword) {
        return c.json({ error: "current_password is required when updating email" }, 400);
      }

      const currentPassword = parsePassword(getBodyValue(body, "current_password"), "current_password");
      if (!(await bcrypt.compare(currentPassword, currentUser.password_hash))) {
        return c.json({ error: "Invalid current password" }, 401);
      }

      const existingEmailOwner = await c.env.DB.prepare(
        "SELECT id FROM users WHERE LOWER(email) = ? AND id != ?",
      )
        .bind(nextEmail, userId)
        .first<{ id: string }>();

      if (existingEmailOwner) {
        return c.json({ error: "Email already registered" }, 409);
      }
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid profile payload" }, 400);
  }

  const updates: Array<[string, string | number | null]> = [];
  if (hasEmail && nextEmail !== undefined) {
    updates.push(["email", nextEmail]);
  }
  if (hasTimezone) {
    updates.push(["default_timezone", nextTimezone ?? null]);
  }
  if (hasAutoLocation) {
    updates.push(["auto_use_current_location", nextAutoLocation ? 1 : 0]);
  }

  if (updates.length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  const now = new Date().toISOString();
  try {
    const setClause = [...updates.map(([key]) => `${key} = ?`), "updated_at = ?"].join(", ");
    const result = await c.env.DB.prepare(`UPDATE users SET ${setClause} WHERE id = ?`)
      .bind(...updates.map(([, value]) => value), now, userId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "User not found" }, 404);
    }
  } catch (error) {
    if (isEmailConflictError(error)) {
      return c.json({ error: "Email already registered" }, 409);
    }
    return c.json({ error: "Failed to update profile" }, 500);
  }

  const updatedUser = await fetchUserById(c.env, userId);
  if (!updatedUser) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(toUserResponse(updatedUser));
});

auth.patch("/password", authMiddleware, async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => null);
  if (!isPlainObject(body)) {
    return c.json({ error: "Request body must be an object" }, 400);
  }

  const currentUser = await fetchUserWithPasswordHash(c.env, userId);
  if (!currentUser) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const currentPassword = parsePassword(getBodyValue(body, "current_password"), "current_password");
    const newPassword = parsePassword(getBodyValue(body, "new_password"), "new_password");

    if (newPassword.length < 8) {
      return c.json({ error: "new_password must be at least 8 characters" }, 400);
    }

    if (!(await bcrypt.compare(currentPassword, currentUser.password_hash))) {
      return c.json({ error: "Invalid current password" }, 401);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();
    const result = await c.env.DB.prepare(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
    )
      .bind(passwordHash, now, userId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "User not found" }, 404);
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid password payload" }, 400);
  }

  const updatedUser = await fetchUserById(c.env, userId);
  if (!updatedUser) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(toUserResponse(updatedUser));
});

export default auth;
