import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import auth from "./api/auth";
import gear from "./api/gear";
import rolls from "./api/rolls";
import photos from "./api/photos";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "phototracker",
    hostname: new URL(c.req.url).hostname,
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
app.route("/api/gear", gear);
app.route("/api/rolls", rolls);
app.route("/api/photographs", photos);

// Fallback for /api/*
app.all("/api/*", (c) => {
  return c.json({ error: "Not found" }, 404);
});

// Fallback for everything else (Static Assets)
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
