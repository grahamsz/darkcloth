export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  JWT_SECRET: string;
}

const openApiContentTypes: Record<string, string> = {
  "/api/openapi.yaml": "application/yaml; charset=utf-8",
  "/api/openapi.json": "application/json; charset=utf-8",
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

async function openApiAsset(request: Request, env: Env, contentType: string) {
  const response = await env.ASSETS.fetch(request);

  if (!response.ok) {
    return json({ error: "OpenAPI asset not found" }, { status: 500 });
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "phototracker",
        hostname: url.hostname,
      });
    }

    const openApiContentType = openApiContentTypes[url.pathname];
    if (openApiContentType) {
      return openApiAsset(request, env, openApiContentType);
    }

    if (url.pathname === "/developers" || url.pathname === "/developers/api") {
      return env.ASSETS.fetch(new Request(new URL("/developers.html", url), request));
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
