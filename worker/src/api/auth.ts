import { Hono } from "hono";
import { sign } from "hono/jwt";
import * as bcrypt from "bcryptjs";
import { ulid } from "ulid";
import { Env } from "../index";
import { User } from "../types";
import { sendEmail } from "../email";
import { authMiddleware, getUserId } from "./middleware";

const auth = new Hono<{ Bindings: Env }>();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90;
const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_RESET_TTL_SECONDS = 60 * 60;
const EMAIL_VERIFICATION_PURPOSE = "email_verification";
const PASSWORD_RESET_PURPOSE = "password_reset";

type UserWithPasswordHash = User & {
  password_hash: string;
};

type AuthTokenPurpose = typeof EMAIL_VERIFICATION_PURPOSE | typeof PASSWORD_RESET_PURPOSE;

type AuthTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
  email: string;
};

function buildNewUserSeedStatements(env: Env, userId: string, createdAt: string) {
  const filmId = ulid();
  const developmentProfileId = ulid();
  const cameraId = ulid();
  const lens135Id = ulid();
  const lens210Id = ulid();
  const red25FilterId = ulid();
  const holder01Id = ulid();
  const holder02Id = ulid();

  return [
    env.DB.prepare(
      "INSERT INTO films (id, user_id, name, iso, process, stock_type, reciprocity_p_factor, spectral_response_preset, simulate_spectral_response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      filmId,
      userId,
      "Ilford FP4 Plus",
      125,
      "B&W",
      "bw",
      1.26,
      "classic_panchromatic",
      1,
      createdAt,
    ),
    env.DB.prepare(
      "INSERT INTO development_profiles (id, user_id, film_id, profile_type, name, developer_name, dilution, temperature_text, agitation, notes, time_text, film_iso, test_date, curves_text, flare_density_text, paper_es_text, method_text, key_values_text, raw_xdf, chart_data, source_files, simple_n_minus_two_percent, simple_n_minus_one_percent, simple_n_plus_one_percent, simple_n_plus_two_percent, btzs_curve_interpolation_enabled, btzs_extrapolation_stops, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      developmentProfileId,
      userId,
      filmId,
      "simple",
      "FP4 Plus in DD-X",
      "Ilford DD-X",
      "1+4",
      "20 C / 68 F",
      "Ilford standard",
      "Starter profile. Adjust from your own tests.",
      "10:00",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      65,
      80,
      125,
      160,
      0,
      0,
      createdAt,
      createdAt,
    ),
    env.DB.prepare(
      "INSERT INTO cameras (id, user_id, name, maker, film_type, roll_format, frame_format, frame_width_mm, frame_height_mm, has_bellows, has_shutter, min_shutter_speed_seconds, max_shutter_speed_seconds, supports_bulb, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      cameraId,
      userId,
      "Toyo-View 45G",
      "Toyo",
      "sheet",
      null,
      "4x5 sheet",
      102,
      127,
      1,
      0,
      null,
      null,
      0,
      createdAt,
    ),
    env.DB.prepare(
      "INSERT INTO lenses (id, user_id, name, focal_length_mm, min_focal_length_mm, max_focal_length_mm, max_aperture, min_f_stop, max_f_stop, aperture_increment, flare_factor, min_shutter_speed_seconds, max_shutter_speed_seconds, supports_bulb, has_shutter, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      lens135Id,
      userId,
      "Caltar 135mm",
      135,
      135,
      135,
      "f/5.6",
      5.6,
      64,
      "full",
      0.02,
      1 / 500,
      1,
      1,
      1,
      createdAt,
    ),
    env.DB.prepare(
      "INSERT INTO lenses (id, user_id, name, focal_length_mm, min_focal_length_mm, max_focal_length_mm, max_aperture, min_f_stop, max_f_stop, aperture_increment, flare_factor, min_shutter_speed_seconds, max_shutter_speed_seconds, supports_bulb, has_shutter, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      lens210Id,
      userId,
      "Schneider Symmar-S 210mm",
      210,
      210,
      210,
      "f/5.6",
      5.6,
      64,
      "full",
      0.02,
      1 / 500,
      1,
      1,
      1,
      createdAt,
    ),
    env.DB.prepare(
      "INSERT INTO camera_lenses (camera_id, lens_id, user_id, created_at) VALUES (?, ?, ?, ?)",
    ).bind(cameraId, lens135Id, userId, createdAt),
    env.DB.prepare(
      "INSERT INTO camera_lenses (camera_id, lens_id, user_id, created_at) VALUES (?, ?, ?, ?)",
    ).bind(cameraId, lens210Id, userId, createdAt),
    env.DB.prepare(
      "INSERT INTO filters (id, user_id, name, code, filter_factor, source, standard_key, notes, can_simulate_bw, simulation_rgb, simulation_strength, simulation_brightness_boost, applies_to_bw, applies_to_color, applies_to_infrared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      red25FilterId,
      userId,
      "Red",
      "Wratten 25",
      8,
      "Filter factor from the common filter factors table (approximate and film-response dependent).",
      "wratten_25",
      null,
      1,
      "#f05a28",
      0.42,
      1,
      1,
      1,
      1,
      createdAt,
      createdAt,
    ),
    env.DB.prepare(
      "INSERT INTO film_holders (id, user_id, name, type, width_mm, height_mm, brand, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(holder01Id, userId, "01", "4x5", 102, 127, null, null, createdAt),
    env.DB.prepare(
      "INSERT INTO film_holders (id, user_id, name, type, width_mm, height_mm, brand, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(holder02Id, userId, "02", "4x5", 102, 127, null, null, createdAt),
  ];
}

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
  email_verified_at?: string | null;
};

function toUserResponse(user: UserResponseRow): User {
  return {
    id: user.id,
    email: user.email,
    email_verified_at: user.email_verified_at ?? null,
    default_timezone: user.default_timezone ?? null,
    auto_use_current_location: user.auto_use_current_location === true || user.auto_use_current_location === 1,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

async function fetchUserById(env: Env, userId: string) {
  return env.DB.prepare(
    "SELECT id, email, email_verified_at, default_timezone, auto_use_current_location, created_at, updated_at FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<User>();
}

async function fetchUserWithPasswordHash(env: Env, userId: string) {
  return env.DB.prepare(
    "SELECT id, email, email_verified_at, default_timezone, auto_use_current_location, password_hash, created_at, updated_at FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<UserWithPasswordHash>();
}

async function fetchUserByNormalizedEmail(env: Env, email: string) {
  return env.DB.prepare(
    "SELECT id, email, email_verified_at, default_timezone, auto_use_current_location, password_hash, created_at, updated_at FROM users WHERE LOWER(email) = ?",
  )
    .bind(email)
    .first<UserWithPasswordHash>();
}

function isEmailConflictError(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed: users\.email/i.test(error.message);
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

async function createAuthToken(env: Env, userId: string, purpose: AuthTokenPurpose, ttlSeconds: number) {
  const now = new Date();
  const nowIso = now.toISOString();
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const id = ulid();

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE auth_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL",
    ).bind(nowIso, userId, purpose),
    env.DB.prepare(
      "INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, userId, purpose, tokenHash, addSeconds(now, ttlSeconds), nowIso),
  ]);

  return token;
}

async function findValidAuthToken(env: Env, token: string, purpose: AuthTokenPurpose) {
  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT t.id, t.user_id, t.token_hash, t.expires_at, t.consumed_at, t.created_at, u.email
       FROM auth_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.purpose = ?`,
  )
    .bind(tokenHash, purpose)
    .first<AuthTokenRow>();

  if (!row || row.consumed_at || row.expires_at <= new Date().toISOString()) {
    return null;
  }

  return row;
}

async function sendVerificationEmail(env: Env, requestUrl: string, user: Pick<User, "id" | "email">) {
  const token = await createAuthToken(env, user.id, EMAIL_VERIFICATION_PURPOSE, EMAIL_VERIFICATION_TTL_SECONDS);
  const verifyUrl = new URL(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, requestUrl).toString();
  await sendEmail(env, {
    to: user.email,
    subject: "Verify your Darkcloth email",
    text: [
      "Verify your Darkcloth email address:",
      verifyUrl,
      "",
      "This link expires in 7 days.",
    ].join("\n"),
    html: [
      "<p>Verify your Darkcloth email address:</p>",
      `<p><a href="${verifyUrl}">Verify email address</a></p>`,
      "<p>This link expires in 7 days.</p>",
    ].join(""),
  });
}

async function sendPasswordResetEmail(env: Env, requestUrl: string, user: Pick<User, "id" | "email">) {
  const token = await createAuthToken(env, user.id, PASSWORD_RESET_PURPOSE, PASSWORD_RESET_TTL_SECONDS);
  const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(token)}`, requestUrl).toString();
  await sendEmail(env, {
    to: user.email,
    subject: "Reset your Darkcloth password",
    text: [
      "Reset your Darkcloth password:",
      resetUrl,
      "",
      "This link expires in 1 hour.",
    ].join("\n"),
    html: [
      "<p>Reset your Darkcloth password:</p>",
      `<p><a href="${resetUrl}">Reset password</a></p>`,
      "<p>This link expires in 1 hour.</p>",
    ].join(""),
  });
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
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT INTO users (id, email, password_hash, email_verified_at, default_timezone, auto_use_current_location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(id, email, passwordHash, null, null, 0, now, now),
        ...buildNewUserSeedStatements(c.env, id, now),
      ]);
    } catch (error) {
      if (isEmailConflictError(error)) {
        return c.json({ error: "Email already registered" }, 409);
      }
      throw error;
    }

    const user = toUserResponse({ id, email, email_verified_at: null, default_timezone: null, auto_use_current_location: false, created_at: now, updated_at: now });
    await sendVerificationEmail(c.env, c.req.url, user).catch((error) => {
      console.error("Failed to send verification email", error);
    });

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

auth.get("/verify-email", async (c) => {
  const token = c.req.query("token") ?? "";
  const row = token ? await findValidAuthToken(c.env, token, EMAIL_VERIFICATION_PURPOSE) : null;
  const redirectPath = row ? "/app/photos?email_verified=1" : "/login?email_verification=invalid";

  if (row) {
    const now = new Date().toISOString();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE auth_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
        .bind(now, row.id),
      c.env.DB.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?")
        .bind(now, now, row.user_id),
    ]);
  }

  return c.redirect(new URL(redirectPath, c.req.url).toString(), 302);
});

auth.post("/email/verification/resend", authMiddleware, async (c) => {
  const userId = getUserId(c);
  const user = await fetchUserById(c.env, userId);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const responseUser = toUserResponse(user);
  if (responseUser.email_verified_at) {
    return c.json({ sent: false, already_verified: true, user: responseUser });
  }

  await sendVerificationEmail(c.env, c.req.url, responseUser);
  return c.json({ sent: true, already_verified: false });
});

auth.post("/password/forgot", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isPlainObject(body)) {
    return c.json({ error: "Request body must be an object" }, 400);
  }

  try {
    const email = parseEmail(getBodyValue(body, "email"), "email");
    const user = await fetchUserByNormalizedEmail(c.env, email);
    if (user) {
      await sendPasswordResetEmail(c.env, c.req.url, user);
    }

    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid password reset payload" }, 400);
  }
});

auth.post("/password/reset", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isPlainObject(body)) {
    return c.json({ error: "Request body must be an object" }, 400);
  }

  try {
    const tokenValue = getBodyValue(body, "token");
    if (typeof tokenValue !== "string" || tokenValue.trim().length === 0) {
      return c.json({ error: "Reset token is required" }, 400);
    }

    const newPassword = parsePassword(getBodyValue(body, "new_password"), "new_password");
    if (newPassword.length < 8) {
      return c.json({ error: "new_password must be at least 8 characters" }, 400);
    }

    const token = await findValidAuthToken(c.env, tokenValue.trim(), PASSWORD_RESET_PURPOSE);
    if (!token) {
      return c.json({ error: "Reset link is invalid or expired" }, 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE auth_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
        .bind(now, token.id),
      c.env.DB.prepare(
        "UPDATE auth_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL",
      ).bind(now, token.user_id, PASSWORD_RESET_PURPOSE),
      c.env.DB.prepare(
        "UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?",
      ).bind(passwordHash, now, now, token.user_id),
    ]);

    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid password reset payload" }, 400);
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
  let emailChanged = false;

  try {
    if (hasEmail) {
      nextEmail = parseEmail(getBodyValue(body, "email"), "email");
      emailChanged = nextEmail !== normalizeEmail(currentUser.email);
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

      const existingEmailOwner = emailChanged
        ? await c.env.DB.prepare(
          "SELECT id FROM users WHERE LOWER(email) = ? AND id != ?",
        )
          .bind(nextEmail, userId)
          .first<{ id: string }>()
        : null;

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
    if (emailChanged) {
      updates.push(["email_verified_at", null]);
    }
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

  const responseUser = toUserResponse(updatedUser);
  if (emailChanged) {
    await sendVerificationEmail(c.env, c.req.url, responseUser).catch((error) => {
      console.error("Failed to send verification email", error);
    });
  }

  return c.json(responseUser);
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
