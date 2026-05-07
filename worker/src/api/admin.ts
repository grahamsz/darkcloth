import { Context, Hono, Next } from "hono";
import { Env } from "../index";
import { authMiddleware, getUserId } from "./middleware";

const ADMIN_EMAIL = "graha.ms@graha.ms";
const IMAGE_URL_TTL_SECONDS = 60 * 60;

type AdminContext = Context<{ Bindings: Env }>;
type ImageVariant = "display" | "thumbnail";

type AdminUserRow = {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  camera_count: number;
  lens_count: number;
  filter_count: number;
  film_stock_count: number;
  development_profile_count: number;
  film_holder_count: number;
  film_holder_load_count: number;
  roll_count: number;
  photograph_count: number;
  reference_image_count: number;
  last_photograph_at: string | null;
};

type AdminPhotographRow = {
  id: string;
  user_id: string;
  title: string | null;
  frame_number: string | null;
  taken_at: string | null;
  created_at: string;
  camera_id: string | null;
  camera_name: string | null;
  camera_maker: string | null;
  lens_id: string | null;
  lens_name: string | null;
  film_id: string | null;
  film_name: string | null;
  film_holder_id: string | null;
  film_holder_name: string | null;
  roll_id: string | null;
  roll_name: string | null;
  aperture: string | null;
  shutter_speed: string | null;
  shutter_mode: string | null;
  bulb_duration_seconds: number | null;
  notes: string | null;
};

type AdminPhotographImageRow = {
  id: string;
  photograph_id: string;
  r2_key: string;
  content_type: string;
  width: number | null;
  height: number | null;
  thumbnail_r2_key: string | null;
  thumbnail_content_type: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  created_at: string;
};

const admin = new Hono<{ Bindings: Env }>();

async function requireAdmin(c: AdminContext, next: Next) {
  const userId = getUserId(c);
  const row = await c.env.DB.prepare("SELECT email FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string }>();

  if (!row || row.email.trim().toLowerCase() !== ADMIN_EMAIL) {
    return c.json({ error: "Not found" }, 404);
  }

  return next();
}

function clampPageSize(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseOffset(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function base64UrlEncode(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signImageUrl(secret: string, payload: string) {
  const data = new TextEncoder().encode(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64UrlEncode(await crypto.subtle.sign("HMAC", key, data));
}

function imageSignaturePayload(userId: string, photographId: string, imageId: string, expires: number) {
  return ["GET", userId, photographId, imageId, String(expires)].join("\n");
}

function imageVariantSignaturePayload(
  variant: ImageVariant,
  userId: string,
  photographId: string,
  imageId: string,
  expires: number,
) {
  return ["GET", variant, userId, photographId, imageId, String(expires)].join("\n");
}

async function signedImageUrl(
  c: AdminContext,
  userId: string,
  photographId: string,
  imageId: string,
  variant: ImageVariant,
) {
  if (!c.env.JWT_SECRET) return null;

  const expires = Math.floor(Date.now() / 1000) + IMAGE_URL_TTL_SECONDS;
  const url = new URL(
    `/api/photographs/${encodeURIComponent(photographId)}/images/${encodeURIComponent(imageId)}/file`,
    c.req.url,
  );
  url.searchParams.set("expires", String(expires));
  if (variant !== "display") url.searchParams.set("variant", variant);
  url.searchParams.set(
    "signature",
    await signImageUrl(
      c.env.JWT_SECRET,
      variant === "display"
        ? imageSignaturePayload(userId, photographId, imageId, expires)
        : imageVariantSignaturePayload(variant, userId, photographId, imageId, expires),
    ),
  );
  return url.toString();
}

admin.use("*", authMiddleware);
admin.use("*", requireAdmin);

admin.get("/users", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT
       u.id,
       u.email,
       u.created_at,
       u.updated_at,
       (SELECT COUNT(*) FROM cameras c WHERE c.user_id = u.id) AS camera_count,
       (SELECT COUNT(*) FROM lenses l WHERE l.user_id = u.id) AS lens_count,
       (SELECT COUNT(*) FROM filters f WHERE f.user_id = u.id) AS filter_count,
       (SELECT COUNT(*) FROM films fs WHERE fs.user_id = u.id) AS film_stock_count,
       (SELECT COUNT(*) FROM development_profiles dp WHERE dp.user_id = u.id) AS development_profile_count,
       (SELECT COUNT(*) FROM film_holders fh WHERE fh.user_id = u.id) AS film_holder_count,
       (SELECT COUNT(*) FROM film_holder_loads fhl WHERE fhl.user_id = u.id) AS film_holder_load_count,
       (SELECT COUNT(*) FROM rolls r WHERE r.user_id = u.id) AS roll_count,
       (SELECT COUNT(*) FROM photographs p WHERE p.user_id = u.id) AS photograph_count,
       (
         SELECT COUNT(*)
           FROM photograph_images pi
           JOIN photographs p ON p.id = pi.photograph_id
          WHERE p.user_id = u.id
       ) AS reference_image_count,
       (SELECT MAX(COALESCE(p.taken_at, p.created_at)) FROM photographs p WHERE p.user_id = u.id) AS last_photograph_at
     FROM users u
     WHERE LOWER(u.email) != ?
     ORDER BY u.created_at DESC`
  ).bind(ADMIN_EMAIL).all<AdminUserRow>();

  return c.json({ items: rows.results, total: rows.results.length });
});

admin.get("/users/:userId/photos", async (c) => {
  const targetUserId = c.req.param("userId");
  const limit = clampPageSize(c.req.query("limit"), 50, 100);
  const offset = parseOffset(c.req.query("offset"));

  const target = await c.env.DB.prepare("SELECT id, email FROM users WHERE id = ?")
    .bind(targetUserId)
    .first<{ id: string; email: string }>();
  if (!target) return c.json({ error: "User not found" }, 404);

  const [countResult, photoResult] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM photographs WHERE user_id = ?")
      .bind(targetUserId)
      .first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT
         p.id,
         p.user_id,
         p.title,
         p.frame_number,
         p.taken_at,
         p.created_at,
         p.camera_id,
         c.name AS camera_name,
         c.maker AS camera_maker,
         p.lens_id,
         l.name AS lens_name,
         p.film_id,
         f.name AS film_name,
         p.film_holder_id,
         fh.name AS film_holder_name,
         p.roll_id,
         r.name AS roll_name,
         p.aperture,
         p.shutter_speed,
         p.shutter_mode,
         p.bulb_duration_seconds,
         p.notes
       FROM photographs p
       LEFT JOIN cameras c ON c.id = p.camera_id AND c.user_id = p.user_id
       LEFT JOIN lenses l ON l.id = p.lens_id AND l.user_id = p.user_id
       LEFT JOIN films f ON f.id = p.film_id AND f.user_id = p.user_id
       LEFT JOIN film_holders fh ON fh.id = p.film_holder_id AND fh.user_id = p.user_id
       LEFT JOIN rolls r ON r.id = p.roll_id AND r.user_id = p.user_id
       WHERE p.user_id = ?
       ORDER BY COALESCE(p.taken_at, p.created_at) DESC, p.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(targetUserId, limit, offset).all<AdminPhotographRow>(),
  ]);

  const photos = photoResult.results;
  const imageByPhotoId = new Map<string, AdminPhotographImageRow>();

  if (photos.length > 0) {
    const placeholders = photos.map(() => "?").join(", ");
    const imageResult = await c.env.DB.prepare(
      `SELECT
         pi.id,
         pi.photograph_id,
         pi.r2_key,
         pi.content_type,
         pi.width,
         pi.height,
         pi.thumbnail_r2_key,
         pi.thumbnail_content_type,
         pi.thumbnail_width,
         pi.thumbnail_height,
         pi.created_at
       FROM photograph_images pi
       JOIN photographs p ON p.id = pi.photograph_id
       WHERE p.user_id = ? AND pi.photograph_id IN (${placeholders})
       ORDER BY pi.created_at ASC`
    ).bind(targetUserId, ...photos.map((photo) => photo.id)).all<AdminPhotographImageRow>();

    for (const image of imageResult.results) {
      if (!imageByPhotoId.has(image.photograph_id)) {
        imageByPhotoId.set(image.photograph_id, image);
      }
    }
  }

  const items = await Promise.all(photos.map(async (photo) => {
    const image = imageByPhotoId.get(photo.id) ?? null;
    return {
      ...photo,
      preview_image: image
        ? {
            id: image.id,
            content_type: image.content_type,
            width: image.width,
            height: image.height,
            thumbnail_width: image.thumbnail_width,
            thumbnail_height: image.thumbnail_height,
            thumbnail_url: image.thumbnail_r2_key
              ? await signedImageUrl(c, photo.user_id, photo.id, image.id, "thumbnail")
              : null,
            url: await signedImageUrl(c, photo.user_id, photo.id, image.id, "display"),
            created_at: image.created_at,
          }
        : null,
    };
  }));

  return c.json({
    user: target,
    items,
    total: countResult?.total ?? 0,
    limit,
    offset,
  });
});

export default admin;
