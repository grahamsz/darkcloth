import { Context, Hono } from "hono";
import { ulid } from "ulid";
import { Env } from "../index";
import { Photograph, PhotographImage } from "../types";
import { authMiddleware, getUserId } from "./middleware";

const photos = new Hono<{ Bindings: Env }>();

type PhotoContext = Context<{ Bindings: Env }>;
type StoredPhotographImage = Omit<PhotographImage, "url"> & {
  r2_key: string;
};
type StoredPhotographImageWithOwner = StoredPhotographImage & {
  user_id: string;
};

const IMAGE_URL_TTL_SECONDS = 60 * 60;
const SIGNED_IMAGE_PATH_RE = /^\/api\/photographs\/[^/]+\/images\/[^/]+\/file$/;
const IMAGE_CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  bmp: "image/bmp",
};
const IMAGE_EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/tiff": "tif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

photos.use("*", async (c, next) => {
  if (c.req.method === "GET" && SIGNED_IMAGE_PATH_RE.test(new URL(c.req.url).pathname)) {
    return next();
  }

  return authMiddleware(c, next);
});

function paginate(query: Record<string, string>) {
  const limit = Math.min(parseInt(query.limit ?? "50"), 200);
  const offset = parseInt(query.offset ?? "0");
  return { limit: isNaN(limit) ? 50 : limit, offset: isNaN(offset) ? 0 : offset };
}

const PHOTO_FIELDS = [
  "roll_id", "camera_id", "lens_id", "film_id", "frame_number",
  "taken_at", "aperture", "shutter_speed", "iso", "exposure_compensation",
  "focal_length_mm", "latitude", "longitude", "altitude_m", "gps_accuracy_m", "notes",
  "film_holder_id",
];

function extensionFromFilename(filename: string | undefined) {
  if (!filename) return null;
  const name = filename.split(/[\\/]/).pop() ?? "";
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match?.[1] ?? null;
}

function originalFilename(file: File) {
  const name = file.name.split(/[\\/]/).pop()?.trim();
  return name ? name.slice(0, 255) : null;
}

function inferContentType(file: File) {
  const fileType = file.type.toLowerCase().trim();
  if (IMAGE_EXT_BY_CONTENT_TYPE[fileType]) return fileType;

  const ext = extensionFromFilename(file.name);
  if (ext) return IMAGE_CONTENT_TYPE_BY_EXT[ext] ?? null;

  return null;
}

function extensionFor(file: File, contentType: string) {
  const ext = extensionFromFilename(file.name);
  if (ext && IMAGE_CONTENT_TYPE_BY_EXT[ext] === contentType) {
    return ext === "jpeg" ? "jpg" : ext;
  }

  return IMAGE_EXT_BY_CONTENT_TYPE[contentType] ?? "img";
}

function imageSignaturePayload(userId: string, photographId: string, imageId: string, expires: number) {
  return ["GET", userId, photographId, imageId, String(expires)].join("\n");
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

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function signedImageUrl(c: PhotoContext, userId: string, photographId: string, imageId: string) {
  const expires = Math.floor(Date.now() / 1000) + IMAGE_URL_TTL_SECONDS;
  const url = new URL(
    `/api/photographs/${encodeURIComponent(photographId)}/images/${encodeURIComponent(imageId)}/file`,
    c.req.url,
  );
  url.searchParams.set("expires", String(expires));
  url.searchParams.set(
    "signature",
    await signImageUrl(c.env.JWT_SECRET, imageSignaturePayload(userId, photographId, imageId, expires)),
  );
  return url.toString();
}

async function publicImage(c: PhotoContext, userId: string, image: StoredPhotographImage): Promise<PhotographImage> {
  return {
    id: image.id,
    photograph_id: image.photograph_id,
    content_type: image.content_type,
    width: image.width,
    height: image.height,
    original_filename: image.original_filename,
    url: await signedImageUrl(c, userId, image.photograph_id, image.id),
    created_at: image.created_at,
  };
}

async function publicImagesForPhotographs(c: PhotoContext, userId: string, photographIds: string[]) {
  if (photographIds.length === 0) return new Map<string, PhotographImage[]>();

  const placeholders = photographIds.map(() => "?").join(", ");
  const rows = await c.env.DB.prepare(
    `SELECT pi.id, pi.photograph_id, pi.r2_key, pi.content_type, pi.width, pi.height, pi.original_filename, pi.created_at
     FROM photograph_images pi
     JOIN photographs p ON p.id = pi.photograph_id
     WHERE p.user_id = ? AND pi.photograph_id IN (${placeholders})
     ORDER BY pi.created_at ASC`
  ).bind(userId, ...photographIds).all<StoredPhotographImage>();

  const grouped = new Map<string, PhotographImage[]>();
  for (const photographId of photographIds) {
    grouped.set(photographId, []);
  }

  const publicImages = await Promise.all(rows.results.map(image => publicImage(c, userId, image)));
  for (const image of publicImages) {
    grouped.get(image.photograph_id)?.push(image);
  }

  return grouped;
}

async function photographsWithImages(c: PhotoContext, userId: string, photos: Photograph[]) {
  const imagesByPhotograph = await publicImagesForPhotographs(c, userId, photos.map(photo => photo.id));
  return photos.map(photo => ({
    ...photo,
    images: imagesByPhotograph.get(photo.id) ?? [],
  }));
}

async function deleteR2Keys(c: PhotoContext, keys: string[]) {
  if (keys.length === 0) return true;
  if (!c.env.REFERENCE_IMAGES) return false;

  try {
    await Promise.all(keys.map(key => c.env.REFERENCE_IMAGES.delete(key)));
    return true;
  } catch {
    return false;
  }
}

photos.get("/", async (c) => {
  const userId = getUserId(c);
  const query = c.req.query();
  const { limit, offset } = paginate(query);
  const FILTER_COLS = ["roll_id", "camera_id", "lens_id", "film_id", "film_holder_id"] as const;
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
  const items = await photographsWithImages(c, userId, rows.results);
  return c.json({ items, total: count?.total ?? 0 });
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
  const [item] = await photographsWithImages(c, userId, [photo]);
  return c.json(item);
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
  const photo = await c.env.DB.prepare("SELECT id FROM photographs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<{ id: string }>();
  if (!photo) return c.json({ error: "Not found" }, 404);

  const images = await c.env.DB.prepare("SELECT r2_key FROM photograph_images WHERE photograph_id = ?")
    .bind(c.req.param("id")).all<{ r2_key: string }>();
  const deletedImages = await deleteR2Keys(c, images.results.map(image => image.r2_key));
  if (!deletedImages) return c.json({ error: "Image storage is not configured" }, 503);

  const result = await c.env.DB.prepare("DELETE FROM photographs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).run();
  if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

// Image endpoints

photos.get("/:id/images", async (c) => {
  const userId = getUserId(c);
  const photo = await c.env.DB.prepare("SELECT id FROM photographs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first();
  if (!photo) return c.json({ error: "Not found" }, 404);
  const rows = await c.env.DB.prepare(
    "SELECT id, photograph_id, r2_key, content_type, width, height, original_filename, created_at FROM photograph_images WHERE photograph_id = ? ORDER BY created_at ASC"
  ).bind(c.req.param("id")).all<StoredPhotographImage>();
  const items = await Promise.all(rows.results.map(img => publicImage(c, userId, img)));
  return c.json({ items, total: items.length });
});

photos.get("/:id/images/:image_id/file", async (c) => {
  const image = await c.env.DB.prepare(
    `SELECT pi.id, pi.photograph_id, pi.r2_key, pi.content_type, pi.width, pi.height, pi.original_filename, pi.created_at, p.user_id
     FROM photograph_images pi
     JOIN photographs p ON p.id = pi.photograph_id
     WHERE pi.id = ? AND pi.photograph_id = ?`
  ).bind(c.req.param("image_id"), c.req.param("id")).first<StoredPhotographImageWithOwner>();
  if (!image) return c.json({ error: "Not found" }, 404);
  if (!c.env.JWT_SECRET) return c.json({ error: "Image URL signing is not configured" }, 500);
  if (!c.env.REFERENCE_IMAGES) return c.json({ error: "Image storage is not configured" }, 503);

  const expires = Number.parseInt(c.req.query("expires") ?? "", 10);
  const signature = c.req.query("signature");
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000) || !signature) {
    return c.json({ error: "Image URL expired" }, 403);
  }

  const expected = await signImageUrl(
    c.env.JWT_SECRET,
    imageSignaturePayload(image.user_id, image.photograph_id, image.id, expires),
  );
  if (!constantTimeEqual(signature, expected)) {
    return c.json({ error: "Image URL expired" }, 403);
  }

  const object = await c.env.REFERENCE_IMAGES.get(image.r2_key);
  if (!object) return c.json({ error: "Not found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", image.content_type);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
});

photos.post("/:id/images", async (c) => {
  const userId = getUserId(c);
  if (!c.env.REFERENCE_IMAGES) return c.json({ error: "Image storage is not configured" }, 503);

  const photo = await c.env.DB.prepare("SELECT id FROM photographs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId).first<{ id: string }>();
  if (!photo) return c.json({ error: "Not found" }, 404);

  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return c.json({ error: "Expected multipart form data" }, 400);
  }

  const value = form.get("file");
  if (!(value instanceof File) || value.size === 0) {
    return c.json({ error: "Image file is required" }, 400);
  }

  const contentType = inferContentType(value);
  if (!contentType) return c.json({ error: "Unsupported image type" }, 400);

  const id = ulid();
  const ext = extensionFor(value, contentType);
  const key = `${userId}/${photo.id}/${id}.${ext}`;
  const createdAt = new Date().toISOString();
  const filename = originalFilename(value);

  try {
    await c.env.REFERENCE_IMAGES.put(key, value.stream(), {
      httpMetadata: { contentType },
      customMetadata: {
        user_id: userId,
        photograph_id: photo.id,
        image_id: id,
        original_filename: filename ?? "",
      },
    });
  } catch {
    return c.json({ error: "Image storage failed" }, 502);
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO photograph_images
       (id, photograph_id, r2_key, content_type, width, height, original_filename, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, photo.id, key, contentType, null, null, filename, createdAt).run();
  } catch {
    await c.env.REFERENCE_IMAGES.delete(key).catch(() => undefined);
    return c.json({ error: "Image metadata storage failed" }, 500);
  }

  const image = await c.env.DB.prepare(
    "SELECT id, photograph_id, r2_key, content_type, width, height, original_filename, created_at FROM photograph_images WHERE id = ?"
  ).bind(id).first<StoredPhotographImage>();
  if (!image) return c.json({ error: "Image metadata storage failed" }, 500);

  return c.json(await publicImage(c, userId, image), 201);
});

photos.delete("/:id/images/:image_id", async (c) => {
  const userId = getUserId(c);
  const image = await c.env.DB.prepare(
    `SELECT pi.id, pi.photograph_id, pi.r2_key, pi.content_type, pi.width, pi.height, pi.original_filename, pi.created_at
     FROM photograph_images pi
     JOIN photographs p ON p.id = pi.photograph_id
     WHERE pi.id = ? AND pi.photograph_id = ? AND p.user_id = ?`
  ).bind(c.req.param("image_id"), c.req.param("id"), userId).first<StoredPhotographImage>();
  if (!image) return c.json({ error: "Not found" }, 404);

  const deletedImage = await deleteR2Keys(c, [image.r2_key]);
  if (!deletedImage) return c.json({ error: "Image storage is not configured" }, 503);

  await c.env.DB.prepare("DELETE FROM photograph_images WHERE id = ?")
    .bind(image.id).run();
  return new Response(null, { status: 204 });
});

export default photos;
