export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

const openApiYaml = `openapi: 3.1.0
info:
  title: Phototracker API
  version: 0.1.0
servers:
  - url: https://phototracker.graha.ms
paths:
  /api/health:
    get:
      operationId: getHealth
      summary: Health check
      responses:
        "200":
          description: Worker is reachable
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
                  service:
                    type: string
`;

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function text(body: string, contentType: string) {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=300",
    },
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

    if (url.pathname === "/api/openapi.yaml") {
      return text(openApiYaml, "application/yaml; charset=utf-8");
    }

    if (url.pathname === "/api/openapi.json") {
      return json({
        openapi: "3.1.0",
        info: {
          title: "Phototracker API",
          version: "0.1.0",
        },
        servers: [{ url: "https://phototracker.graha.ms" }],
        paths: {
          "/api/health": {
            get: {
              operationId: "getHealth",
              summary: "Health check",
              responses: {
                "200": {
                  description: "Worker is reachable",
                },
              },
            },
          },
        },
      });
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
