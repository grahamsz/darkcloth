import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import auth from "./api/auth";
import { filmHoldersRouter, filmStocksRouter } from "./api/film";
import gear from "./api/gear";
import rolls from "./api/rolls";
import photos from "./api/photos";
import dataExport from "./api/export";
import admin from "./api/admin";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: ImagesBinding;
  REFERENCE_IMAGES: R2Bucket;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

const CORS_ORIGINS = new Set([
  "https://darkcloth.zone",
]);

function resolveCorsOrigin(origin: string) {
  if (!origin) return null;
  if (CORS_ORIGINS.has(origin)) return origin;

  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const hostname = url.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    ) {
      return origin;
    }
  } catch {
    // Ignore malformed origins and fall through to a CORS rejection.
  }

  return null;
}

app.use("*", logger());
app.use("*", cors({ origin: resolveCorsOrigin }));
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()");
});

// Health check
app.get("/api/health", (c) => {
  return new Response(JSON.stringify({
    ok: true,
    service: "phototracker",
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
      expires: "0",
    },
  });
});

// OpenAPI Assets
const openApiContentTypes: Record<string, string> = {
  "/api/openapi.yaml": "application/yaml; charset=utf-8",
  "/api/openapi.json": "application/json; charset=utf-8",
};

app.get("/api/openapi.yaml", async (c) => serveOpenApiAsset(c, "application/yaml; charset=utf-8"));
app.get("/api/openapi.json", async (c) => serveOpenApiAsset(c, "application/json; charset=utf-8"));

async function serveOpenApiAsset(c: any, contentType: string) {
  const response = await c.env.ASSETS.fetch(c.req.raw);
  if (!response.ok) {
    return c.json({ error: "OpenAPI asset not found" }, 500);
  }

  const headers = new Headers(response.headers);
  headers.set("content-type", contentType);
  headers.set("cache-control", "public, max-age=300");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Developer Docs
app.get("/developers", async (c) => {
  return c.env.ASSETS.fetch(new Request(new URL("/developers.html", c.req.url), c.req.raw));
});

app.get("/developers/api", async (c) => {
  return c.env.ASSETS.fetch(new Request(new URL("/developers.html", c.req.url), c.req.raw));
});

// API routes
app.route("/api/auth", auth);
app.route("/api/film/stocks", filmStocksRouter);
app.route("/api/film/holders", filmHoldersRouter);
app.route("/api/film/rolls", rolls);

// Compatibility aliases for older clients
app.route("/api/film-stocks", filmStocksRouter);
app.route("/api/film-holders", filmHoldersRouter);
app.route("/api/gear", gear);
app.route("/api/rolls", rolls);
app.route("/api/photographs", photos);
app.route("/api/export", dataExport);
app.route("/api/admin", admin);

// Fallback for /api/*
app.all("/api/*", (c) => {
  return c.json({ error: "Not found" }, 404);
});

// Fallback for everything else (Static Assets)
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
