import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "offline-user",
  email: "offline@example.test",
  default_timezone: "America/Denver",
  auto_use_current_location: false,
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

const now = "2026-05-04T00:00:00.000Z";

const camera = {
  id: "camera-offline",
  user_id: user.id,
  name: "Offline Test Camera",
  maker: null,
  film_type: "sheet",
  roll_format: null,
  has_shutter: false,
  min_shutter_speed_seconds: null,
  max_shutter_speed_seconds: null,
  supports_bulb: false,
  acceptable_lens_ids: ["lens-offline"],
  created_at: now,
};

const lens = {
  id: "lens-offline",
  user_id: user.id,
  name: "Offline Test Lens",
  has_shutter: true,
  min_shutter_speed_seconds: 0.001,
  max_shutter_speed_seconds: 1,
  supports_bulb: true,
  min_focal_length_mm: 135,
  max_focal_length_mm: 135,
  focal_length_mm: 135,
  max_aperture: null,
  min_f_stop: 5.6,
  max_f_stop: 45,
  aperture_increment: "third",
  flare_factor: 0.02,
  applicable_camera_ids: ["camera-offline"],
  created_at: now,
};

const filmHolder = {
  id: "holder-offline",
  user_id: user.id,
  name: "Offline Test Holder",
  type: "4x5",
  width_mm: null,
  height_mm: null,
  brand: null,
  capacity: null,
  applicable_camera_ids: ["camera-offline"],
  created_at: now,
  current_load: null,
  load_history: [],
};

const filmStock = {
  id: "film-offline",
  user_id: user.id,
  name: "Offline Test Film",
  stock_type: "bw",
  reciprocity_p_factor: 1,
  iso: 100,
  process: "B&W",
  created_at: now,
};

const roll = {
  id: "roll-offline",
  user_id: user.id,
  film_id: filmStock.id,
  roll_format: "120",
  name: "Offline Test Roll",
  loaded_at: now,
  finished_at: null,
  status: "exposing",
  push_pull_stops: 0,
  processed_at: null,
  developed_at: null,
  development_profile_id: null,
  development_notes: null,
  created_at: now,
};

const filter = {
  id: "filter-offline",
  user_id: user.id,
  name: "Offline Test Filter",
  code: "Y2",
  filter_factor: 2,
  source: "custom",
  standard_key: null,
  notes: null,
  applicable_lens_ids: [lens.id],
  created_at: now,
  updated_at: now,
};

const photographs = Array.from({ length: 6 }, (_, index) => {
  const number = index + 1;
  return {
    id: `photo-offline-${number}`,
    user_id: user.id,
    roll_id: null,
    camera_id: camera.id,
    lens_id: lens.id,
    film_id: filmStock.id,
    filter_ids: [filter.id],
    filters: [filter],
    frame_number: null,
    exposure_entry_mode: "manual",
    exposure_details: null,
    taken_at: `2026-05-04T1${index}:00:00.000Z`,
    aperture: "f/11",
    shutter_speed: "1/125",
    shutter_speed_seconds: 0.008,
    shutter_mode: "fixed",
    bulb_duration_seconds: null,
    focal_length_mm: 135,
    latitude: null,
    longitude: null,
    altitude_m: null,
    gps_accuracy_m: null,
    notes: null,
    title: `Offline Photo ${number}`,
    film_holder_id: filmHolder.id,
    lifecycle_summary: null,
    created_at: now,
    updated_at: now,
    images: { items: [] },
  };
});

const storeNames = [
  "cameras",
  "lenses",
  "filters",
  "film_stocks",
  "film_rolls",
  "film_holders",
  "film_holder_loads",
  "development_profiles",
  "btzs_chart_data",
  "photographs",
  "reference_image_metadata",
  "reference_image_blobs",
  "sync_queue",
] as const;

async function seedOfflineDatabase(page: Page) {
  await page.evaluate(
    async ({ storeNames, user, camera, lens, filmHolder, filmStock, roll, filter, photographs, now }) => {
      const openDatabase = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("darkcloth-offline");

          request.onupgradeneeded = () => {
            const db = request.result;
            for (const storeName of storeNames) {
              if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id" });
              }
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

      const cachedRecord = (entityId: string, data: unknown) => ({
        id: entityId,
        entityId,
        userId: user.id,
        data,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        serverRevision: null,
        syncStatus: "synced",
      });

      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeNames, "readwrite");
        for (const storeName of storeNames) {
          tx.objectStore(storeName).clear();
        }
        tx.objectStore("cameras").put(cachedRecord(camera.id, camera));
        tx.objectStore("lenses").put(cachedRecord(lens.id, lens));
        tx.objectStore("filters").put(cachedRecord(filter.id, filter));
        tx.objectStore("film_stocks").put(cachedRecord(filmStock.id, filmStock));
        tx.objectStore("film_rolls").put(cachedRecord(roll.id, roll));
        tx.objectStore("film_holders").put(cachedRecord(filmHolder.id, filmHolder));
        for (const photograph of photographs) {
          tx.objectStore("photographs").put({
            ...cachedRecord(photograph.id, photograph),
            rollId: photograph.roll_id,
            filmHolderId: photograph.film_holder_id,
            takenAt: photograph.taken_at,
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      localStorage.setItem(`darkcloth-offline-cache-last-refresh:${user.id}`, now);
    },
    { storeNames, user, camera, lens, filmHolder, filmStock, roll, filter, photographs, now },
  );
}

async function seedPhotoOnlyOfflineDatabase(page: Page) {
  await seedOfflineDatabase(page);
  await page.evaluate(
    async ({ storeNames }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("darkcloth-offline");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeNames, "readwrite");
        for (const storeName of storeNames) {
          if (storeName === "photographs" || storeName === "sync_queue") continue;
          tx.objectStore(storeName).clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { storeNames },
  );
}

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are unavailable.");
    }

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    await registration.update().catch(() => undefined);
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for service worker.")), 5_000)),
    ]);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function seedLegacyPartialDatabase(page: Page) {
  await page.route("**/legacy-offline-seed", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html>
        <meta charset="utf-8">
        <script>
          const request = indexedDB.open("darkcloth-offline", 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            for (const storeName of ["cameras", "lenses", "film_stocks", "photographs", "sync_queue"]) {
              if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id" });
              }
            }
          };
          request.onsuccess = () => {
            request.result.close();
            window.legacySeedDone = true;
          };
          request.onerror = () => {
            window.legacySeedError = request.error?.message ?? "unknown";
          };
        </script>`,
    });
  });

  await page.goto("/legacy-offline-seed", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as Window & { legacySeedDone?: boolean }).legacySeedDone));
  await page.unroute("**/legacy-offline-seed");
}

async function readOfflineStoreNames(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("darkcloth-offline");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = Array.from(db.objectStoreNames);
    db.close();
    return names;
  });
}

async function readShellCachePaths(page: Page) {
  return page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const darkclothCacheName = cacheNames.find((name) => name.startsWith("darkcloth-shell-"));
    if (!darkclothCacheName) return [];
    const cache = await caches.open(darkclothCacheName);
    const requests = await cache.keys();
    return requests.map((request) => new URL(request.url).pathname).sort();
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ user }) => {
    localStorage.setItem("pt_token", "offline-test-token");
    localStorage.setItem("pt_user", JSON.stringify(user));
  }, { user });
});

test("unvisited log photograph route is cached as app shell", async ({ context, page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForServiceWorker(page);

  await expect.poll(
    () => readShellCachePaths(page),
    { timeout: 5_000 },
  ).toContain("/app/photos/new");

  await context.setOffline(true);

  await page.goto("/app/photos/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Log photograph" })).toBeVisible();
});

test("log photograph route refreshes while offline", async ({ context, page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await seedOfflineDatabase(page);
  await waitForServiceWorker(page);

  await page.goto("/app/photos/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Log photograph" })).toBeVisible();

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Log photograph" })).toBeVisible();
  await expect(page.getByText("Darkcloth is offline")).toHaveCount(0);
});

test("core app pages refresh while offline", async ({ context, page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await seedOfflineDatabase(page);
  await waitForServiceWorker(page);

  await context.setOffline(true);

  for (const [path, heading] of [
    ["/app/photos", "Photographs"],
    ["/app/photos/new", "Log photograph"],
    ["/app/gear/cameras", "Cameras"],
    ["/app/gear/lenses", "Lenses"],
    ["/app/gear/filters", "Filters"],
    ["/app/film/stocks", "Film Stocks"],
    ["/app/film/rolls", "Rolls"],
    ["/app/film/holders", "Film Holders"],
  ] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText("Darkcloth is offline")).toHaveCount(0);
  }
});

test("core app pages refresh while offline with a partial photo-only cache", async ({ context, page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await seedPhotoOnlyOfflineDatabase(page);
  await waitForServiceWorker(page);

  await context.setOffline(true);

  for (const [path, heading] of [
    ["/app/photos", "Photographs"],
    ["/app/photos/new", "Log photograph"],
    ["/app/gear/cameras", "Cameras"],
    ["/app/gear/lenses", "Lenses"],
    ["/app/gear/filters", "Filters"],
    ["/app/film/stocks", "Film Stocks"],
    ["/app/film/rolls", "Rolls"],
    ["/app/film/holders", "Film Holders"],
  ] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText("Darkcloth is offline")).toHaveCount(0);
    await expect(page.locator(".form-error")).toHaveCount(0);
  }
});

test("gear pages recover after transient refresh connectivity failures", async ({ page }) => {
  let healthIsRecovered = false;
  let healthCalls = 0;

  await page.route("**/api/health", async (route) => {
    healthCalls += 1;
    if (healthCalls === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary health failure" }),
      });
      return;
    }

    healthIsRecovered = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, service: "phototracker" }),
    });
  });
  await page.route("**/api/gear/cameras", async (route) => {
    if (!healthIsRecovered) {
      await route.abort("failed");
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [camera], total: 1 }),
    });
  });
  await page.route("**/api/gear/lenses", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0 }),
    });
  });

  await page.goto("/app/gear/cameras", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Cameras" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Offline Test Camera/ })).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".form-error")).toHaveCount(0);
});

test("legacy partial offline databases are upgraded with all required stores", async ({ page }) => {
  await seedLegacyPartialDatabase(page);

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => readOfflineStoreNames(page),
    { timeout: 5_000 },
  ).toEqual(expect.arrayContaining([...storeNames]));
});

test("cached gear and film-holder detail pages open from collection lists while offline", async ({ context, page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await seedOfflineDatabase(page);
  await waitForServiceWorker(page);

  await context.setOffline(true);

  await page.goto("/app/gear/cameras", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /Offline Test Camera/ })).toBeVisible();

  await page.getByRole("link", { name: "Lenses" }).click();
  await expect(page.getByRole("link", { name: /Offline Test Lens/ })).toBeVisible();
  await page.getByRole("link", { name: /Offline Test Lens/ }).click();
  await expect(page.getByRole("heading", { name: "Offline Test Lens" })).toBeVisible();

  await page.goto("/app/gear/cameras", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: /Offline Test Camera/ }).click();
  await expect(page.getByRole("heading", { name: "Offline Test Camera" })).toBeVisible();

  await page.goto("/app/film/holders", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /Offline Test Holder/ })).toBeVisible();
  await page.getByRole("link", { name: /Offline Test Holder/ }).click();
  await expect(page.getByRole("heading", { name: "Offline Test Holder" })).toBeVisible();
});

test("cached gear, film, roll, and holder collections remain navigable while offline", async ({ context, page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await seedOfflineDatabase(page);
  await waitForServiceWorker(page);

  await context.setOffline(true);

  await page.goto("/app/gear/lenses", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /Offline Test Lens/ })).toBeVisible();
  await page.getByRole("link", { name: /Offline Test Lens/ }).click();
  await expect(page).toHaveURL(/\/app\/gear\/lenses\/lens-offline\/edit$/);
  await expect(page.getByRole("heading", { name: "Offline Test Lens" })).toBeVisible();

  await page.goto("/app/gear/filters", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Filters" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Offline Test Filter/ })).toBeVisible();
  await page.getByRole("link", { name: /Offline Test Filter/ }).click();
  await expect(page).toHaveURL(/\/app\/gear\/filters\/filter-offline\/edit$/);
  await expect(page.getByRole("heading", { name: "Offline Test Filter" })).toBeVisible();

  await page.goto("/app/film/rolls", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Rolls" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Offline Test Roll/ })).toBeVisible();
  await page.getByRole("link", { name: /Offline Test Roll/ }).click();
  await expect(page).toHaveURL(/\/app\/film\/rolls\/roll-offline$/);
  await expect(page.getByRole("heading", { name: "Offline Test Roll" })).toBeVisible();

  await page.goto("/app/film/holders", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Film Holders" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Offline Test Holder/ })).toBeVisible();
  await page.getByRole("link", { name: /Offline Test Holder/ }).click();
  await expect(page).toHaveURL(/\/app\/film\/holders\/holder-offline\/edit$/);
  await expect(page.getByRole("heading", { name: "Offline Test Holder" })).toBeVisible();

  await page.goto("/app/film/stocks", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Film Stocks" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Offline Test Film/ })).toBeVisible();
  await page.getByRole("link", { name: /Offline Test Film/ }).click();
  await expect(page).toHaveURL(/\/app\/film\/stocks\/film-offline$/);
  await expect(page.getByRole("heading", { name: "Offline Test Film" })).toBeVisible();
});

test("offline detail refreshes keep rendering cached resources", async ({ context, page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await seedOfflineDatabase(page);
  await waitForServiceWorker(page);

  await context.setOffline(true);

  for (const [path, heading] of [
    ["/app/gear/cameras/camera-offline/edit", "Offline Test Camera"],
    ["/app/gear/lenses/lens-offline/edit", "Offline Test Lens"],
    ["/app/film/holders/holder-offline/edit", "Offline Test Holder"],
  ] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("log photograph button opens the logging screen while offline", async ({ context, page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await seedOfflineDatabase(page);
  await waitForServiceWorker(page);

  await context.setOffline(true);

  await page.goto("/app/photos", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".form-error")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Log photograph" })).toBeVisible();

  await page.getByRole("link", { name: "Log photograph" }).click();

  await expect(page).toHaveURL(/\/app\/photos\/new$/);
  await expect(page.getByRole("heading", { name: "Log photograph" })).toBeVisible();
});

test("queued offline photograph keeps gear and second log navigation usable", async ({ context, page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await seedOfflineDatabase(page);
  await page.evaluate(
    async ({ camera }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("darkcloth-offline");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("cameras", "readwrite");
        const store = tx.objectStore("cameras");
        const request = store.get(camera.id);
        request.onsuccess = () => {
          const record = request.result;
          store.put({
            ...record,
            data: {
              ...record.data,
              film_type: "roll",
              roll_format: "120",
            },
          });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { camera },
  );
  await waitForServiceWorker(page);

  await context.setOffline(true);

  await page.goto("/app/photos/new", { waitUntil: "domcontentloaded" });
  await page.locator("#camera_id").selectOption(camera.id);
  await page.locator("#lens_id").selectOption(lens.id);
  await page.locator("#roll_id").selectOption(roll.id);
  await page.locator("#frame_number").fill("7");
  await page.locator("#aperture").press("ArrowRight");
  await page.locator("#shutter_speed").fill("1/125");
  await page.getByRole("button", { name: "Save photograph" }).click();

  await expect(page).toHaveURL(/\/app\/photos$/);

  await page.getByRole("link", { name: "Gear" }).click();
  await expect(page.getByRole("heading", { name: "Cameras" })).toBeVisible();
  await expect(page.locator(".form-error")).toHaveCount(0);

  await page.getByRole("link", { name: "Photos" }).click();
  await page.getByRole("link", { name: "Log photograph" }).click();

  await expect(page).toHaveURL(/\/app\/photos\/new$/);
  await expect(page.getByRole("heading", { name: "Log photograph" })).toBeVisible();
});

test("several cached photo detail pages refresh while offline", async ({ context, page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await seedOfflineDatabase(page);
  await waitForServiceWorker(page);

  await context.setOffline(true);

  for (const photograph of photographs) {
    await page.goto(`/app/photos/${photograph.id}`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: photograph.title })).toBeVisible();
    await expect(page.locator(".form-error")).toHaveCount(0);
  }
});
