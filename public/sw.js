const CACHE_NAME = "darkcloth-shell-v12";
const IMAGE_CACHE_NAME = "darkcloth-photograph-images-v1";
const APP_SHELL_READY_MESSAGE = "DARKCLOTH_APP_SHELL_READY";
const NAVIGATION_NETWORK_TIMEOUT_MS = 750;

const APP_SHELL_PATHS = new Set([
  "/",
  "/index.html",
  "/login",
  "/register",
  "/app",
  "/app/photos",
  "/app/photos/new",
  "/app/gear",
  "/app/gear/cameras",
  "/app/gear/lenses",
  "/app/gear/filters",
  "/app/film",
  "/app/film/stocks",
  "/app/film/rolls",
  "/app/film/holders",
  "/app/profile",
  "/app/timer",
]);
const STATIC_ASSET_PATHS = new Set([
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/darkcloth-icon.svg",
]);
const STATIC_ASSET_DESTINATIONS = new Set(["script", "style", "image", "font"]);
const SIGNED_PHOTOGRAPH_IMAGE_RE = /^\/api\/photographs\/[^/]+\/images\/[^/]+\/file$/;

function isAppShellPath(pathname) {
  return APP_SHELL_PATHS.has(pathname) || pathname.startsWith("/app/");
}

function isShellAssetPath(pathname) {
  return STATIC_ASSET_PATHS.has(pathname) || pathname.startsWith("/assets/");
}

function collectPrecacheUrls(html) {
  const urls = new Set(["/", "/index.html", ...STATIC_ASSET_PATHS]);
  const matcher = /(?:src|href)=["']([^"']+)["']/g;

  for (const match of html.matchAll(matcher)) {
    const raw = match[1];

    try {
      const url = new URL(raw, self.location.href);
      if (url.origin !== self.location.origin) continue;
      if (url.pathname.startsWith("/api/")) continue;

      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      urls.add(`${pathname}${url.search}`);
    } catch {
      // Ignore malformed or non-URL asset references.
    }
  }

  return urls;
}

async function warmShellCache() {
  const cache = await caches.open(CACHE_NAME);
  const shellResponse = await fetch(new Request("/", { cache: "no-store" }));

  if (!shellResponse.ok) {
    throw new Error(`Failed to fetch app shell: ${shellResponse.status}`);
  }

  await cacheShellResponse(cache, shellResponse);
}

let warmShellCachePromise = null;

function scheduleWarmShellCache() {
  if (!warmShellCachePromise) {
    warmShellCachePromise = warmShellCache()
      .catch(() => undefined)
      .finally(() => {
        warmShellCachePromise = null;
      });
  }

  return warmShellCachePromise;
}

function rejectAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Network timeout")), ms);
  });
}

function fetchWithTimeout(request, timeoutMs) {
  return Promise.race([
    fetch(request),
    rejectAfter(timeoutMs),
  ]);
}

async function cacheShellResponse(cache, shellResponse) {
  const html = await shellResponse.clone().text();
  const shellCacheResponse = new Response(html, {
    status: shellResponse.status,
    statusText: shellResponse.statusText,
    headers: shellResponse.headers,
  });
  await cache.put("/", shellCacheResponse.clone());
  await cache.put("/index.html", shellCacheResponse.clone());
  for (const path of APP_SHELL_PATHS) {
    await cache.put(path, shellCacheResponse.clone());
  }

  const assetUrls = collectPrecacheUrls(html);
  await Promise.all(
    [...assetUrls].map(async (url) => {
      if (url === "/" || url === "/index.html") {
        return;
      }

      try {
        const assetResponse = await fetch(new Request(url, { cache: "no-store" }));
        if (assetResponse.ok) {
          await cache.put(url, assetResponse);
        }
      } catch {
        // Skip assets that are unavailable at install time.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await warmShellCache();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const liveCacheNames = new Set([CACHE_NAME, IMAGE_CACHE_NAME]);
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(async (key) => {
        if (!liveCacheNames.has(key)) {
          await caches.delete(key);
        }
      }));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === APP_SHELL_READY_MESSAGE) {
    event.waitUntil(scheduleWarmShellCache());
  }
});

async function serveAppShell(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetchWithTimeout(
      new Request("/", { cache: "no-store" }),
      NAVIGATION_NETWORK_TIMEOUT_MS,
    );
    if (response.ok) {
      await cacheShellResponse(cache, response.clone());
      return (await cache.match(urlPathFromRequest(request), { ignoreSearch: true }))
        ?? (await cache.match("/index.html", { ignoreSearch: true }))
        ?? response;
    }
  } catch {
    // Fall through to the cached shell.
  }

  return (await cache.match(request, { ignoreSearch: true }))
    ?? (await cache.match(urlPathFromRequest(request), { ignoreSearch: true }))
    ?? (await cache.match("/index.html", { ignoreSearch: true }))
    ?? (await cache.match("/", { ignoreSearch: true }))
    ?? new Response(
      "<!doctype html><title>Darkcloth offline</title><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><body><h1>Darkcloth is offline</h1><p>The app shell has not been cached yet. Reopen Darkcloth while online once, then offline refreshes will work.</p></body>",
      {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
}

function urlPathFromRequest(request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/index.html";
  }
}

async function serveStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached ?? Response.error();
  }
}

function stablePhotographImageCacheRequest(url) {
  if (!SIGNED_PHOTOGRAPH_IMAGE_RE.test(url.pathname)) {
    return null;
  }

  const variant = url.searchParams.get("variant") || "display";
  if (variant !== "display" && variant !== "thumbnail" && variant !== "original") {
    return null;
  }

  return new Request(`${url.origin}${url.pathname}?variant=${variant}`, {
    method: "GET",
    credentials: "same-origin",
  });
}

async function servePhotographImage(request, cacheKeyRequest) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cached = await cache.match(cacheKeyRequest);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(cacheKeyRequest, response.clone());
    }
    return response;
  } catch {
    return cached ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  const photographImageCacheKey = stablePhotographImageCacheRequest(url);
  if (photographImageCacheKey) {
    event.respondWith(servePhotographImage(request, photographImageCacheKey));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    if (!isAppShellPath(url.pathname)) {
      return;
    }

    event.respondWith(serveAppShell(request));
    return;
  }

  if (STATIC_ASSET_DESTINATIONS.has(request.destination) || isShellAssetPath(url.pathname)) {
    event.respondWith(serveStaticAsset(request));
  }
});
