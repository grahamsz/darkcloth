import { afterEach, describe, expect, it, vi } from "vitest";
import { api, clearApiResourceCache, type FilmHolder, type FilmHolderLoad, type FilmStock, type Roll } from "./client";

afterEach(() => {
  clearApiResourceCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const createRollResponse = (overrides: Partial<Roll> = {}): Roll => ({
  id: "roll-1",
  user_id: "user-1",
  film_id: "film-1",
  roll_format: "120",
  name: "Roll",
  loaded_at: "2026-05-01T12:00:00.000Z",
  finished_at: null,
  status: "finished",
  push_pull_stops: 0,
  processed_at: null,
  developed_at: null,
  development_profile_id: null,
  development_notes: null,
  created_at: "2026-05-01T12:00:00.000Z",
  ...overrides,
});

const stubAuthedStorage = (token: string | null = "token-123") => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => token),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: token ? 1 : 0,
  } satisfies Storage);
};

const createFilmStockResponse = (overrides: Partial<FilmStock> = {}): FilmStock => ({
  id: "film-1",
  user_id: "user-1",
  name: "Portra 400",
  stock_type: "color_negative",
  reciprocity_p_factor: 1,
  iso: 400,
  process: "C-41",
  created_at: "2026-05-01T12:00:00.000Z",
  ...overrides,
});

const createFilmHolderLoadResponse = (overrides: Partial<FilmHolderLoad> = {}): FilmHolderLoad => ({
  id: "load-1",
  user_id: "user-1",
  film_holder_id: "holder-1",
  film_id: "film-1",
  status: "loaded",
  loaded_at: "2026-05-01T12:00:00.000Z",
  exposed_at: null,
  exposed_photograph_id: null,
  processed_at: null,
  discarded_at: null,
  discarded_reason: null,
  development_profile_id: null,
  development_profile: null,
  development_summary: null,
  exposed_photograph: null,
  notes: null,
  created_at: "2026-05-01T12:00:00.000Z",
  updated_at: "2026-05-02T12:00:00.000Z",
  film: createFilmStockResponse(),
  ...overrides,
});

const createFilmHolderResponse = (overrides: Partial<FilmHolder> = {}): FilmHolder => ({
  id: "holder-1",
  user_id: "user-1",
  name: "Holder",
  type: "4x5",
  width_mm: 102,
  height_mm: 127,
  brand: null,
  capacity: 4,
  applicable_camera_ids: [],
  created_at: "2026-05-01T12:00:00.000Z",
  current_load: createFilmHolderLoadResponse(),
  load_history: [],
  ...overrides,
});

describe("api client photograph image uploads", () => {
  it("sends the original image upload as multipart form data", async () => {
    const original = new File(["original"], "reference.jpg", { type: "image/jpeg" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "image-1",
      photograph_id: "photo-1",
      content_type: "image/jpeg",
      width: 800,
      height: 600,
      thumbnail_content_type: null,
      thumbnail_width: null,
      thumbnail_height: null,
      thumbnail_url: null,
      original_content_type: null,
      original_width: null,
      original_height: null,
      original_filename: "reference.jpg",
      original_url: null,
      url: "https://example.com/display.jpg",
      created_at: "2026-05-02T00:00:00.000Z",
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    } satisfies Storage);

    await api.uploadPhotographImage("photo-1", {
      original,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.has("original")).toBe(true);
    expect(form.has("display")).toBe(false);
    expect(form.has("thumbnail")).toBe(false);
    expect(form.has("file")).toBe(false);
    expect(form.has("original_width")).toBe(false);
    expect(form.has("original_height")).toBe(false);
    expect((form.get("original") as File).name).toBe("reference.jpg");
  });
});

describe("api client health checks", () => {
  it("calls /api/health without auth headers", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      service: "darkcloth",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "token-123"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 1,
    } satisfies Storage);

    const health = await api.health();

    expect(health).toEqual({
      ok: true,
      service: "darkcloth",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(url).toBe("/api/health");
    expect(init?.cache).toBe("no-store");
    expect(init?.headers).not.toMatchObject({ authorization: "Bearer token-123" });
  });

  it("times out stalled read requests so offline cache fallbacks can run", async () => {
    vi.useFakeTimers();
    try {
      stubAuthedStorage();
      const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }));
      vi.stubGlobal("fetch", fetchMock);

      const cameras = expect(api.listCameras()).rejects.toThrow("Request timed out");
      await vi.advanceTimersByTimeAsync(2_500);

      await cameras;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("api client resource list cache", () => {
  it("reuses authenticated list responses inside the resource cache window", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      items: [{ id: "camera-1", name: "Camera" }],
      total: 1,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage("token-123");

    const first = await api.listCameras();
    const second = await api.listCameras();

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("invalidates related cached lists after a successful mutation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: "roll-1", name: "Roll 1" }],
        total: 1,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(createRollResponse({
        id: "roll-2",
        name: "Roll 2",
      })), {
        status: 201,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: "roll-1", name: "Roll 1" }, { id: "roll-2", name: "Roll 2" }],
        total: 2,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage("token-123");

    await api.listRolls();
    await api.createRoll({
      name: "Roll 2",
      film_id: "film-1",
      roll_format: "120",
    });
    const refreshed = await api.listRolls();

    expect(refreshed.items).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      "/api/film/rolls",
      "/api/film/rolls",
      "/api/film/rolls",
    ]);
  });
});

describe("api client photograph writes", () => {
  it("includes the re-exposure confirmation flag when reusing an exposed holder", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    } satisfies Storage);

    await api.createPhotograph({
      camera_id: "camera-1",
      film_holder_id: "holder-1",
      confirm_reexposure: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      camera_id: "camera-1",
      film_holder_id: "holder-1",
      confirm_reexposure: true,
    });
  });
});

describe("api client film holder loads", () => {
  it("preserves development summary fields on load history responses", async () => {
    const developmentSummary = {
      label: "Development time",
      source: "development-profile-time" as const,
      minutes: null,
      time_text: "9 min",
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      items: [
        createFilmHolderLoadResponse({
          development_profile_id: "profile-1",
          development_profile: {
            id: "profile-1",
            name: "D-76 1+1",
          },
          development_summary: developmentSummary,
        }),
      ],
      total: 1,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage();

    const response = await api.listFilmHolderLoads("holder-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.items[0].development_summary).toEqual(developmentSummary);
    expect(response.items[0].development_profile?.name).toBe("D-76 1+1");
  });
});

describe("api client auth profile updates", () => {
  it("patches /auth/me with snake_case profile fields", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "user-1",
      email: "new@example.com",
      default_timezone: "America/Denver",
      auto_use_current_location: true,
      created_at: "2026-05-02T00:00:00.000Z",
      updated_at: "2026-05-02T00:00:00.000Z",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "token-123"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 1,
    } satisfies Storage);

    const updated = await api.updateMe({
      email: "new@example.com",
      current_password: "correct horse battery staple",
      default_timezone: "America/Denver",
      auto_use_current_location: true,
    });

    expect(updated.default_timezone).toBe("America/Denver");
    expect(updated.auto_use_current_location).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(url).toBe("/api/auth/me");
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer token-123",
      "content-type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      email: "new@example.com",
      current_password: "correct horse battery staple",
      default_timezone: "America/Denver",
      auto_use_current_location: true,
    });
  });

  it("patches /auth/password with current and new password fields", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "user-1",
      email: "new@example.com",
      default_timezone: null,
      auto_use_current_location: false,
      created_at: "2026-05-02T00:00:00.000Z",
      updated_at: "2026-05-02T00:00:00.000Z",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "token-123"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 1,
    } satisfies Storage);

    const updated = await api.updatePassword({
      current_password: "correct horse battery staple",
      new_password: "new correct horse battery staple",
    });

    expect(updated.email).toBe("new@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(url).toBe("/api/auth/password");
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer token-123",
      "content-type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      current_password: "correct horse battery staple",
      new_password: "new correct horse battery staple",
    });
  });
});

describe("api client film collection endpoints", () => {
  it("requests the canonical film collection paths", async () => {
    const response = new Response(JSON.stringify({ items: [], total: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response.clone())
      .mockResolvedValueOnce(response.clone())
      .mockResolvedValueOnce(response.clone());
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage("token-123");

    await api.listFilmStocks();
    await api.listFilmHolders();
    await api.listRolls({ film_id: "film-1", roll_format: "120" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/film/stocks");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/film/holders");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/film/rolls?film_id=film-1&roll_format=120");
  });
});

describe("api client film holder lifecycle", () => {
  it("posts discard requests with optional reason and notes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(createFilmHolderResponse({
      current_load: null,
      load_history: [
        createFilmHolderLoadResponse({
          status: "discarded",
          discarded_at: "2026-05-02T12:00:00.000Z",
          discarded_reason: "Re-exposed in the field",
        }),
      ],
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage("token-123");

    const updated = await api.discardFilmHolderLoad("holder-1", {
      reason: "Re-exposed in the field",
      notes: "Freed for another shot",
    });

    expect(updated.current_load).toBeNull();
    expect(updated.load_history?.[0].status).toBe("discarded");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(url).toBe("/api/film/holders/holder-1/loads/current/discard");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer token-123",
      "content-type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      reason: "Re-exposed in the field",
      notes: "Freed for another shot",
    });
  });

  it("posts undo exposure requests with the clear photograph flag when needed", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(createFilmHolderResponse({
      current_load: createFilmHolderLoadResponse({
        status: "loaded",
        exposed_at: null,
        exposed_photograph_id: null,
        processed_at: null,
        discarded_at: null,
        discarded_reason: null,
        development_profile_id: null,
        development_profile: null,
        exposed_photograph: null,
      }),
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage("token-123");

    const updated = await api.undoFilmHolderExposure("holder-1", { clear_photograph_holder: true });

    expect(updated.current_load?.status).toBe("loaded");
    expect(updated.current_load?.film?.name).toBe("Portra 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(url).toBe("/api/film/holders/holder-1/loads/current/undo-exposure");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer token-123",
      "content-type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      clear_photograph_holder: true,
    });
  });

  it("posts processed load restore requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(createFilmHolderResponse({
      current_load: createFilmHolderLoadResponse({
        id: "load-processed",
        status: "exposed",
        processed_at: null,
      }),
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage("token-123");

    const updated = await api.unprocessFilmHolderLoad("holder-1", "load-processed");

    expect(updated.current_load?.status).toBe("exposed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(url).toBe("/api/film/holders/holder-1/loads/load-processed/unprocess");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer token-123",
    });
  });
});

describe("api client roll lifecycle", () => {
  it("posts finish requests with a finished timestamp", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(createRollResponse({
      status: "finished",
      finished_at: "2026-05-02T00:00:00.000Z",
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage();

    const finished = await api.finishRoll("roll-1", { finished_at: "2026-05-02T00:00:00.000Z" });

    expect(finished.finished_at).toBe("2026-05-02T00:00:00.000Z");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(url).toBe("/api/film/rolls/roll-1/finish");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      finished_at: "2026-05-02T00:00:00.000Z",
    });
  });

  it("posts process requests with the selected profile and notes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(createRollResponse({
      status: "processed",
      finished_at: "2026-05-02T00:00:00.000Z",
      processed_at: "2026-05-02T12:34:00.000Z",
      developed_at: "2026-05-02T12:34:00.000Z",
      development_profile_id: "profile-1",
      development_notes: "Push one stop",
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage();

    const processed = await api.processRoll("roll-1", {
      processed_at: "2026-05-02T12:34:00.000Z",
      development_profile_id: "profile-1",
      development_notes: "Push one stop",
    });

    expect(processed.status).toBe("processed");
    expect(processed.processed_at).toBe("2026-05-02T12:34:00.000Z");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(url).toBe("/api/film/rolls/roll-1/process");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      processed_at: "2026-05-02T12:34:00.000Z",
      development_profile_id: "profile-1",
      development_notes: "Push one stop",
    });
  });

  it("posts reopen requests without a body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(createRollResponse({
      status: "exposing",
      finished_at: null,
      processed_at: null,
      developed_at: null,
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage();

    const reopened = await api.reopenRoll("roll-1");

    expect(reopened.status).toBe("exposing");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(url).toBe("/api/film/rolls/roll-1/reopen");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
  });

  it("serializes roll photograph list params", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      items: [],
      total: 0,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    stubAuthedStorage();

    await api.listPhotographs({ roll_id: "roll-1", limit: 200, offset: 25 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(url).toBe("/api/photographs?roll_id=roll-1&limit=200&offset=25");
  });
});
