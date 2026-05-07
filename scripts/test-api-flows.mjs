#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.PHOTOTRACKER_TEST_PORT ?? 8787);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = "phototracker-api-flow-test-secret";
const TEST_TIMEOUT_MS = Number(process.env.PHOTOTRACKER_TEST_TIMEOUT_MS ?? 120_000);

const tests = [];
let testContext = null;

function test(name, fn) {
  tests.push({ name, fn });
}

function nowIso() {
  return new Date().toISOString();
}

function uniqueEmail() {
  return `api-flow-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
}

function sqlStringLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function spawnCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? process.cwd(),
    detached: options.detached ?? false,
    env: {
      ...process.env,
      CI: "1",
      NO_COLOR: "1",
      ...options.env,
    },
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
    options.onStdout?.(chunk.toString());
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
    options.onStderr?.(chunk.toString());
  });

  return {
    child,
    done: new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code, signal) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        const detail = [
          `${command} ${args.join(" ")} failed with ${signal ?? `exit code ${code}`}`,
          stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
          stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
        ].filter(Boolean).join("\n\n");
        reject(new Error(detail));
      });
    }),
  };
}

function signalProcessTree(child, signal) {
  try {
    if (child.pid == null) return;
    if (child.spawnargs?.includes("wrangler") || child.spawnargs?.some((arg) => String(arg).includes("wrangler"))) {
      process.kill(-child.pid, signal);
      return;
    }
    child.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function runCommand(command, args, options) {
  return spawnCommand(command, args, options).done;
}

async function waitForHealth() {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < TEST_TIMEOUT_MS) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${BASE_URL}/api/health: ${lastError?.message ?? "unknown error"}`);
}

async function startWorker(persistDir, envFile, commandEnv) {
  const dev = spawnCommand("npx", [
    "wrangler",
    "dev",
    "--local",
    "--persist-to",
    persistDir,
    "--port",
    String(PORT),
    "--env-file",
    envFile,
    "--log-level",
    "error",
  ], {
    detached: true,
    env: commandEnv,
    onStdout: (text) => {
      if (process.env.PHOTOTRACKER_TEST_VERBOSE) process.stdout.write(text);
    },
    onStderr: (text) => {
      if (process.env.PHOTOTRACKER_TEST_VERBOSE) process.stderr.write(text);
    },
  });

  await waitForHealth();
  return async () => {
    let exited = false;
    const exitPromise = dev.done
      .catch(() => undefined)
      .finally(() => {
        exited = true;
      });

    signalProcessTree(dev.child, "SIGTERM");
    try {
      await Promise.race([exitPromise, sleep(5_000)]);
    } catch {
      // The dev process normally exits non-zero when interrupted.
    }
    if (!exited) {
      signalProcessTree(dev.child, "SIGKILL");
      await Promise.race([exitPromise, sleep(2_000)]);
    }
  };
}

async function setupCleanInstance() {
  const persistDir = await mkdtemp(path.join(tmpdir(), "phototracker-api-flow-"));
  const envFile = path.join(persistDir, ".dev.vars.test");
  const commandEnv = {
    XDG_CONFIG_HOME: path.join(persistDir, "xdg-config"),
    WRANGLER_SEND_METRICS: "false",
  };
  await writeFile(envFile, `JWT_SECRET=${JWT_SECRET}\n`, "utf8");

  await runCommand("npx", [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "phototracker",
    "--local",
    "--persist-to",
    persistDir,
  ], { env: commandEnv });

  const stopWorker = await startWorker(persistDir, envFile, commandEnv);
  return {
    persistDir,
    commandEnv,
    async cleanup() {
      await stopWorker();
      if (!process.env.PHOTOTRACKER_KEEP_TEST_STATE) {
        await rm(persistDir, { recursive: true, force: true });
      } else {
        console.log(`Keeping test state at ${persistDir}`);
      }
    },
  };
}

async function executeLocalSql(sql) {
  if (!testContext) {
    throw new Error("Test context is not initialized");
  }

  await runCommand("npx", [
    "wrangler",
    "d1",
    "execute",
    "phototracker",
    "--local",
    "--persist-to",
    testContext.persistDir,
    "--command",
    sql,
  ], { env: testContext.commandEnv });
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status === 204) return null;
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

class ApiClient {
  token = null;

  async request(method, path, body, expectedStatus = method === "POST" ? 201 : 200) {
    const headers = {};
    let requestBody;
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (body instanceof FormData) {
      requestBody = body;
    } else if (body !== undefined) {
      headers["content-type"] = "application/json";
      requestBody = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: requestBody,
    });
    const parsed = await parseResponse(response);
    assert.equal(
      response.status,
      expectedStatus,
      `${method} ${path} expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(parsed)}`,
    );
    return parsed;
  }

  get(path, expectedStatus = 200) {
    return this.request("GET", path, undefined, expectedStatus);
  }

  post(path, body, expectedStatus = 201) {
    return this.request("POST", path, body, expectedStatus);
  }

  patch(path, body, expectedStatus = 200) {
    return this.request("PATCH", path, body, expectedStatus);
  }

  delete(path, expectedStatus = 204) {
    return this.request("DELETE", path, undefined, expectedStatus);
  }

  async register() {
    const body = await this.post("/api/auth/register", {
      email: uniqueEmail(),
      password: "correct horse battery staple",
    });
    assert.ok(body.token);
    assert.ok(body.user.id);
    this.token = body.token;
    return body.user;
  }
}

test("health check is unauthenticated, cache-busting, and lightweight", async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");

  const body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    service: "phototracker",
  });
});

async function createFilmStock(api, overrides = {}) {
  return api.post("/api/film/stocks", {
    name: "Ilford FP4+",
    iso: 125,
    process: "B&W",
    stock_type: "bw",
    reciprocity_p_factor: 1,
    ...overrides,
  });
}

async function createCamera(api, overrides = {}) {
  return api.post("/api/gear/cameras", {
    name: "4x5",
    maker: "Shen Hao",
    film_type: "sheet",
    has_shutter: false,
    supports_bulb: false,
    ...overrides,
  });
}

async function createLens(api, overrides = {}) {
  return api.post("/api/gear/lenses", {
    name: "Schneider 135mm",
    focal_length_mm: 135,
    min_focal_length_mm: 135,
    max_focal_length_mm: 135,
    min_f_stop: 5.6,
    max_f_stop: 32,
    aperture_increment: "third",
    has_shutter: true,
    min_shutter_speed_seconds: 0.001,
    max_shutter_speed_seconds: 1,
    supports_bulb: true,
    ...overrides,
  });
}

async function createFilter(api, overrides = {}) {
  return api.post("/api/gear/filters", {
    name: "Yellow",
    code: "Y2",
    filter_factor: 2,
    applicable_lens_ids: [],
    ...overrides,
  });
}

async function createFilmHolder(api, overrides = {}) {
  return api.post("/api/film/holders", {
    name: "1A",
    type: "4x5",
    applicable_camera_ids: [],
    ...overrides,
  });
}

async function createRoll(api, filmId, overrides = {}) {
  return api.post("/api/film/rolls", {
    name: "Roll 1",
    film_id: filmId,
    roll_format: "120",
    push_pull_stops: 0,
    ...overrides,
  });
}

async function createDevelopmentProfile(api, filmStockId, overrides = {}) {
  return api.post(`/api/film/stocks/${filmStockId}/development-profiles`, {
    type: "simple",
    name: "D-76 1+1",
    developerName: "D-76",
    dilution: "1+1",
    temperatureText: "20C",
    agitation: "10s every minute",
    timeText: "9 min",
    ...overrides,
  });
}

function createZoneMeteringExposureDetails(overrides = {}) {
  return {
    zoneMetering: {
      meterEV: 10.5,
      meterISO: 100,
      workingISO: 400,
      targetZone: 5,
      zoneAdjustedEV: 12.5,
      targetEV: 11.5,
      totalCompensationStops: -1,
      aperture: "f/8",
      shutterSpeed: "1/125",
      rawShutterSpeedSeconds: 1 / 125,
      finalShutterSpeedSeconds: 1 / 90,
      shutterMode: "fixed",
      bulbDurationSeconds: null,
      reciprocityApplied: false,
      warnings: ["Reciprocity correction may be required."],
      ...overrides,
    },
  };
}

function createBtzsExposureDetails(overrides = {}) {
  return {
    btzsZoneMetering: {
      meterEV: 10.5,
      meterISO: 100,
      workingISO: 200,
      compensationStops: -0.3,
      filterStops: 1,
      filterIds: ["filter-1"],
      filterFactors: [2],
      precedence: "aperture",
      readingThroughSelectedFilters: false,
      profileId: "btzs-profile-1",
      profileName: "FP4+ BTZS",
      lowEV: 4,
      lowZone: 3,
      highEV: 10,
      highZone: 7,
      evRange: 6,
      zoneRange: 4,
      sbr: 9,
      paperEs: 8,
      requiredG: 0.9,
      effectiveFilmSpeed: 200,
      developmentTimeMinutes: 9.5,
      targetEVBeforeCompensation: 7,
      targetEVAfterCompensation: 6.5,
      aperture: "f/7.1",
      shutterSpeed: "1/100",
      rawShutterSpeedSeconds: 1 / 100,
      finalShutterSpeedSeconds: 1 / 125,
      shutterMode: "fixed",
      bulbDurationSeconds: null,
      reciprocityApplied: false,
      warnings: ["Profile data is retained as historical metadata."],
      apertureChoice: {
        value: "f/8",
        label: "f/8",
        aperture: 8,
        stopError: -0.34,
        warning: "Rounded f/7.1 to f/8 (-0.34 stops).",
      },
      shutterChoice: {
        value: "1/125",
        label: "1/125",
        seconds: 1 / 125,
        stopError: -0.32,
        warning: "Rounded 1/100 to 1/125 (-0.32 stops).",
      },
      ...overrides,
    },
  };
}

function tinyPngFile() {
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  return new File([bytes], "reference.png", { type: "image/png" });
}

function invalidPngFile() {
  return new File([Uint8Array.from([0xde, 0xad, 0xbe, 0xef])], "broken.png", { type: "image/png" });
}

test("auth registration, token auth, and user isolation work", async () => {
  const api = new ApiClient();
  const user = await api.register();
  assert.equal(user.default_timezone, null);
  assert.equal(user.password_hash, undefined);
  const me = await api.get("/api/auth/me");
  assert.equal(me.id, user.id);
  assert.equal(me.email, user.email);
  assert.equal(me.default_timezone, null);
  assert.equal(me.password_hash, undefined);

  const anonymous = new ApiClient();
  await anonymous.get("/api/auth/me", 401);
});

test("auth profile updates and password changes persist timezone and enforce uniqueness", async () => {
  const api = new ApiClient();
  const user = await api.register();
  assert.equal(user.default_timezone, null);

  const timezoneSet = await api.patch("/api/auth/me", {
    default_timezone: "America/Denver",
  });
  assert.equal(timezoneSet.default_timezone, "America/Denver");
  assert.equal(timezoneSet.password_hash, undefined);

  const refreshedTimezone = await api.get("/api/auth/me");
  assert.equal(refreshedTimezone.default_timezone, "America/Denver");
  assert.equal(refreshedTimezone.password_hash, undefined);

  const timezoneCleared = await api.patch("/api/auth/me", {
    default_timezone: null,
  });
  assert.equal(timezoneCleared.default_timezone, null);

  const refreshedCleared = await api.get("/api/auth/me");
  assert.equal(refreshedCleared.default_timezone, null);

  await api.patch("/api/auth/me", { email: uniqueEmail() }, 400);
  await api.patch("/api/auth/me", { default_timezone: "Not/AZone" }, 400);
  await api.patch("/api/auth/me", {
    email: uniqueEmail(),
    current_password: "incorrect current password",
  }, 401);

  const duplicateCheck = new ApiClient();
  await duplicateCheck.register();
  await duplicateCheck.patch("/api/auth/me", {
    email: user.email,
    current_password: "correct horse battery staple",
  }, 409);

  const newEmail = uniqueEmail();
  const profileUpdated = await api.patch("/api/auth/me", {
    email: newEmail,
    current_password: "correct horse battery staple",
  });
  assert.equal(profileUpdated.email, newEmail);
  assert.equal(profileUpdated.default_timezone, null);
  assert.equal(profileUpdated.password_hash, undefined);

  const meAfterEmailUpdate = await api.get("/api/auth/me");
  assert.equal(meAfterEmailUpdate.email, newEmail);
  assert.equal(meAfterEmailUpdate.default_timezone, null);

  await api.patch("/api/auth/password", {
    current_password: "incorrect current password",
    new_password: "new correct horse battery staple",
  }, 401);
  await api.patch("/api/auth/password", {
    current_password: "correct horse battery staple",
    new_password: "short",
  }, 400);

  const passwordUpdated = await api.patch("/api/auth/password", {
    current_password: "correct horse battery staple",
    new_password: "new correct horse battery staple",
  });
  assert.equal(passwordUpdated.email, newEmail);
  assert.equal(passwordUpdated.default_timezone, null);
  assert.equal(passwordUpdated.password_hash, undefined);

  const anonymous = new ApiClient();
  await anonymous.post("/api/auth/login", {
    email: newEmail,
    password: "correct horse battery staple",
  }, 401);
  const login = await anonymous.post("/api/auth/login", {
    email: newEmail,
    password: "new correct horse battery staple",
  }, 200);
  assert.equal(login.user.email, newEmail);
  assert.equal(login.user.default_timezone, null);
});

test("film stock defaults, updates, and BTZS gating work", async () => {
  const api = new ApiClient();
  await api.register();

  const color = await createFilmStock(api, {
    name: "Portra 400",
    stock_type: "color_negative",
    reciprocity_p_factor: undefined,
  });
  assert.equal(color.stock_type, "color_negative");
  assert.equal(color.reciprocity_p_factor, 1);

  await api.post(`/api/film/stocks/${color.id}/development-profiles`, {
    type: "btzs",
    name: "Should fail",
    developerName: "DDX",
    temperatureText: "68F",
  }, 400);

  const bw = await createFilmStock(api, { name: "FP4+", stock_type: "bw" });
  const profile = await api.post(`/api/film/stocks/${bw.id}/development-profiles`, {
    type: "btzs",
    name: "FP4+ DDX",
    developerName: "DDX",
    dilution: "1+4",
    temperatureText: "68F",
    chartData: [
      {
        title: "Average G vs Development Time",
        points: [
          { developmentMinutes: 4, averageGradient: 0.36505307074053617 },
          { developmentMinutes: 8, averageGradient: 0.5025125628140712 },
          { developmentMinutes: 16, averageGradient: 0.7028753993610241 },
        ],
      },
    ],
    rawXdf: {
      versionOrType: 2,
      displayName: "FP4+ DDX 1+4",
      processLabel: "DDX 1+4.00 @ 68.00F",
      paperES: 1.25,
      reciprocityExpIndex: 2,
      reciprocityGIndex: 1,
      useReciprocity: 1,
    },
  });
  assert.equal(profile.type, "btzs");
  assert.equal(profile.chartData[0].points.length, 3);
  assert.deepEqual(profile.rawXdf, {
    versionOrType: 2,
    displayName: "FP4+ DDX 1+4",
    processLabel: "DDX 1+4.00 @ 68.00F",
    paperES: 1.25,
    reciprocityExpIndex: 2,
    reciprocityGIndex: 1,
    useReciprocity: 1,
  });

  await api.post(`/api/film/stocks/${bw.id}/development-profiles`, {
    type: "btzs",
    name: "Invalid raw XDF",
    developerName: "DDX",
    temperatureText: "68F",
    rawXdf: {
      versionOrType: 2,
      displayName: "Invalid raw XDF",
      processLabel: "DDX 1+4.00 @ 68.00F",
      reciprocityExpIndex: 2,
      reciprocityGIndex: 1,
      useReciprocity: 1,
    },
  }, 400);

  const profileDetail = await api.get(`/api/film/stocks/${bw.id}/development-profiles/${profile.id}`);
  assert.deepEqual(profileDetail.rawXdf, profile.rawXdf);

  const updatedProfile = await api.patch(`/api/film/stocks/${bw.id}/development-profiles/${profile.id}`, {
    rawXdf: {
      versionOrType: 2,
      displayName: "FP4+ DDX 1+4",
      processLabel: "DDX 1+4.00 @ 68.00F",
      paperES: 1.5,
      reciprocityExpIndex: 3,
      reciprocityGIndex: 2,
      useReciprocity: 0,
    },
  });
  assert.deepEqual(updatedProfile.rawXdf, {
    versionOrType: 2,
    displayName: "FP4+ DDX 1+4",
    processLabel: "DDX 1+4.00 @ 68.00F",
    paperES: 1.5,
    reciprocityExpIndex: 3,
    reciprocityGIndex: 2,
    useReciprocity: 0,
  });

  const reloadedProfile = await api.get(`/api/film/stocks/${bw.id}/development-profiles/${profile.id}`);
  assert.deepEqual(reloadedProfile.rawXdf, updatedProfile.rawXdf);
});

test("legacy rawXdf rows normalize on read", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const profile = await api.post(`/api/film/stocks/${film.id}/development-profiles`, {
    type: "btzs",
    name: "Legacy row seed",
    developerName: "DDX",
    temperatureText: "68F",
    rawXdf: {
      versionOrType: 2,
      displayName: "Legacy FP4+ DDX",
      processLabel: "DDX 1+4.00 @ 68.00F",
      paperES: 1.25,
      reciprocityExpIndex: 2,
      reciprocityGIndex: 1,
      useReciprocity: 1,
    },
  });

  const legacyRawXdf = {
    versionOrType: 2,
    displayName: "Legacy FP4+ DDX",
    processLabel: "DDX 1+4.00 @ 68.00F",
    filmISO: 125,
    unknownOrReciprocityFields: [2, 1, 1],
  };

  await executeLocalSql(
    `UPDATE development_profiles SET raw_xdf = ${sqlStringLiteral(JSON.stringify(legacyRawXdf))} WHERE id = ${sqlStringLiteral(profile.id)}`,
  );

  const fetched = await api.get(`/api/film/stocks/${film.id}/development-profiles/${profile.id}`);
  assert.deepEqual(fetched.rawXdf, {
    versionOrType: 2,
    displayName: "Legacy FP4+ DDX",
    processLabel: "DDX 1+4.00 @ 68.00F",
    paperES: 1.25,
    reciprocityExpIndex: 2,
    reciprocityGIndex: 1,
    useReciprocity: 1,
  });
});

test("gear, filter editing, and lens-compatible photo filters work", async () => {
  const api = new ApiClient();
  await api.register();

  const camera = await createCamera(api);
  const lens = await createLens(api, { applicable_camera_ids: [camera.id] });
  const filter = await createFilter(api, { applicable_lens_ids: [lens.id] });
  assert.equal(filter.filter_factor, 2);

  const edited = await api.patch(`/api/gear/filters/${filter.id}`, {
    name: "Yellow 8",
    code: "Y8",
    filter_factor: 2.5,
    applicable_lens_ids: [lens.id],
  });
  assert.equal(edited.name, "Yellow 8");
  assert.equal(edited.filter_factor, 2.5);
  assert.deepEqual(edited.applicable_lens_ids, [lens.id]);

  const film = await createFilmStock(api);
  const holder = await createFilmHolder(api, { applicable_camera_ids: [camera.id] });
  await api.post(`/api/film/holders/${holder.id}/loads`, { film_id: film.id });

  const photo = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    aperture: "f/8",
    shutter_mode: "fixed",
    shutter_speed: "1/125",
    shutter_speed_seconds: 0.008,
    filter_ids: [filter.id],
    taken_at: nowIso(),
  });
  assert.deepEqual(photo.filter_ids, [filter.id]);
  assert.equal(photo.filters[0].id, filter.id);
});

test("photograph exposure details persist manual defaults, zone updates, BTZS creates, and validation", async () => {
  const api = new ApiClient();
  await api.register();

  const manualPhoto = await api.post("/api/photographs", {
    aperture: "f/5.6",
    shutter_mode: "fixed",
    shutter_speed: "1/125",
    shutter_speed_seconds: 1 / 125,
    focal_length_mm: 35,
    taken_at: nowIso(),
  });
  assert.equal(manualPhoto.exposure_entry_mode, "manual");
  assert.equal(manualPhoto.exposure_details, null);

  const zoneDetails = createZoneMeteringExposureDetails();
  const zoneUpdated = await api.patch(`/api/photographs/${manualPhoto.id}`, {
    exposure_entry_mode: "zone-metering",
    exposure_details: zoneDetails,
  });
  assert.equal(zoneUpdated.exposure_entry_mode, "zone-metering");
  assert.deepEqual(zoneUpdated.exposure_details, zoneDetails);
  assert.equal(zoneUpdated.aperture, "f/5.6");
  assert.equal(zoneUpdated.shutter_speed_seconds, 1 / 125);

  const btzsPhoto = await api.post("/api/photographs", {
    aperture: "f/11",
    shutter_mode: "fixed",
    shutter_speed: "1/60",
    shutter_speed_seconds: 1 / 60,
    focal_length_mm: 50,
    taken_at: nowIso(),
    exposure_entry_mode: "btzs-zone-metering",
    exposure_details: createBtzsExposureDetails(),
  });
  assert.equal(btzsPhoto.exposure_entry_mode, "btzs-zone-metering");
  assert.deepEqual(btzsPhoto.exposure_details, createBtzsExposureDetails());
  assert.equal(btzsPhoto.shutter_speed, "1/60");
  assert.equal(btzsPhoto.shutter_speed_seconds, 1 / 60);

  await api.post("/api/photographs", {
    exposure_entry_mode: "not-a-mode",
  }, 400);

  await api.post("/api/photographs", {
    exposure_entry_mode: "zone-metering",
  }, 400);

  await api.post("/api/photographs", {
    exposure_entry_mode: "zone-metering",
    exposure_details: {
      zoneMetering: {
        meterEV: 10,
      },
    },
  }, 400);

  await api.post("/api/photographs", {
    exposure_entry_mode: "btzs-zone-metering",
    exposure_details: {
      btzsZoneMetering: {
        profileId: "btzs-profile-1",
      },
    },
  }, 400);
});

test("photograph titles round-trip through create, update, list, and validation", async () => {
  const api = new ApiClient();
  await api.register();

  const untitled = await api.post("/api/photographs", {
    aperture: "f/5.6",
    shutter_mode: "fixed",
    shutter_speed: "1/125",
    shutter_speed_seconds: 1 / 125,
    taken_at: nowIso(),
  });
  assert.equal(untitled.title, null);

  const titled = await api.post("/api/photographs", {
    title: "  Golden Hour  ",
    aperture: "f/8",
    shutter_mode: "fixed",
    shutter_speed: "1/60",
    shutter_speed_seconds: 1 / 60,
    taken_at: nowIso(),
  });
  assert.equal(titled.title, "Golden Hour");

  const fetched = await api.get(`/api/photographs/${titled.id}`);
  assert.equal(fetched.title, "Golden Hour");

  const list = await api.get("/api/photographs");
  assert.equal(list.items.length, 2);
  assert.equal(list.items.find((photo) => photo.id === untitled.id)?.title, null);
  assert.equal(list.items.find((photo) => photo.id === titled.id)?.title, "Golden Hour");

  const trimmedUpdate = await api.patch(`/api/photographs/${titled.id}`, {
    title: "  Evening Shot  ",
  });
  assert.equal(trimmedUpdate.title, "Evening Shot");

  const blankCleared = await api.patch(`/api/photographs/${titled.id}`, {
    title: "   ",
  });
  assert.equal(blankCleared.title, null);

  const nullCleared = await api.patch(`/api/photographs/${titled.id}`, {
    title: null,
  });
  assert.equal(nullCleared.title, null);

  const refetched = await api.get(`/api/photographs/${titled.id}`);
  assert.equal(refetched.title, null);

  const invalidCreate = await api.post("/api/photographs", {
    title: 123,
  }, 400);
  assert.equal(invalidCreate.error, "title must be a string");

  const invalidPatch = await api.patch(`/api/photographs/${titled.id}`, {
    title: 123,
  }, 400);
  assert.equal(invalidPatch.error, "title must be a string");
});

test("roll photo creation marks roll as exposing and preserves push/pull", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const camera = await createCamera(api, {
    name: "Mamiya 7",
    maker: "Mamiya",
    film_type: "roll",
    roll_format: "120",
    has_shutter: true,
    supports_bulb: true,
  });
  const lens = await createLens(api, { name: "80mm", applicable_camera_ids: [camera.id] });
  const roll = await createRoll(api, film.id, { roll_format: "120", push_pull_stops: 1 });
  assert.equal(roll.status, "unexposed");
  assert.equal(roll.push_pull_stops, 1);

  const photo = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    roll_id: roll.id,
    frame_number: "1",
    aperture: "f/5.6",
    shutter_mode: "bulb",
    bulb_duration_seconds: 12,
    taken_at: nowIso(),
  });
  assert.equal(photo.roll_id, roll.id);
  assert.equal(photo.shutter_mode, "bulb");
  assert.equal(photo.bulb_duration_seconds, 12);

  const refreshed = await api.get(`/api/film/rolls/${roll.id}`);
  assert.equal(refreshed.status, "exposing");
  assert.equal(refreshed.push_pull_stops, 1);
});

test("roll lifecycle actions preserve terminal states, validation, and processing history", async () => {
  const api = new ApiClient();
  await api.register();

  const rollFilm = await createFilmStock(api, { name: "FP4+ Roll", stock_type: "bw" });
  const altFilm = await createFilmStock(api, { name: "Portra 400", stock_type: "color_negative" });
  const matchingProfile = await createDevelopmentProfile(api, rollFilm.id, {
    name: "FP4+ D-76",
    developerName: "D-76",
    dilution: "1+1",
    temperatureText: "20C",
    agitation: "10s every minute",
    timeText: "9 min",
  });
  const mismatchProfile = await createDevelopmentProfile(api, altFilm.id, {
    name: "Portra C-41",
    developerName: "C-41",
    dilution: null,
    temperatureText: "38C",
    agitation: "agitate continuously",
    timeText: "3 min 15 sec",
  });
  const camera = await createCamera(api, {
    name: "Mamiya 7",
    maker: "Mamiya",
    film_type: "roll",
    roll_format: "120",
    has_shutter: true,
    supports_bulb: true,
  });
  const lens = await createLens(api, { name: "80mm", applicable_camera_ids: [camera.id] });
  const roll = await createRoll(api, rollFilm.id, { roll_format: "120" });
  assert.equal(roll.status, "unexposed");

  const finished = await api.post(`/api/film/rolls/${roll.id}/finish`, {}, 200);
  assert.equal(finished.status, "finished");
  assert.ok(finished.finished_at);
  assert.equal(finished.processed_at, null);

  const firstPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    roll_id: roll.id,
    frame_number: "1",
    aperture: "f/5.6",
    shutter_mode: "fixed",
    shutter_speed: "1/125",
    shutter_speed_seconds: 1 / 125,
    taken_at: nowIso(),
  });
  assert.equal(firstPhoto.roll_id, roll.id);

  const afterFirstPhoto = await api.get(`/api/film/rolls/${roll.id}`);
  assert.equal(afterFirstPhoto.status, "finished");
  assert.ok(afterFirstPhoto.finished_at);

  const reopened = await api.post(`/api/film/rolls/${roll.id}/reopen`, {}, 200);
  assert.equal(reopened.status, "exposing");
  assert.equal(reopened.finished_at, null);
  assert.equal(reopened.processed_at, null);

  await api.post(`/api/film/rolls/${roll.id}/process`, {
    development_profile_id: mismatchProfile.id,
  }, 400);

  const processed = await api.post(`/api/film/rolls/${roll.id}/process`, {
    development_profile_id: matchingProfile.id,
    development_notes: "Processed in DDX",
  }, 200);
  assert.equal(processed.status, "processed");
  assert.ok(processed.processed_at);
  assert.equal(processed.developed_at, processed.processed_at);
  assert.equal(processed.development_profile_id, matchingProfile.id);
  assert.equal(processed.development_notes, "Processed in DDX");
  assert.ok(processed.finished_at);

  const secondPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    roll_id: roll.id,
    frame_number: "2",
    aperture: "f/8",
    shutter_mode: "fixed",
    shutter_speed: "1/60",
    shutter_speed_seconds: 1 / 60,
    taken_at: nowIso(),
  });
  assert.equal(secondPhoto.roll_id, roll.id);

  const afterProcessedPhoto = await api.get(`/api/film/rolls/${roll.id}`);
  assert.equal(afterProcessedPhoto.status, "processed");
  assert.equal(afterProcessedPhoto.processed_at, processed.processed_at);

  const reopenedProcessed = await api.post(`/api/film/rolls/${roll.id}/reopen`, {}, 200);
  assert.equal(reopenedProcessed.status, "exposing");
  assert.equal(reopenedProcessed.finished_at, null);
  assert.ok(reopenedProcessed.processed_at);
  assert.equal(reopenedProcessed.processed_at, processed.processed_at);
  assert.equal(reopenedProcessed.development_profile_id, matchingProfile.id);

  const thirdPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    roll_id: roll.id,
    frame_number: "3",
    aperture: "f/11",
    shutter_mode: "fixed",
    shutter_speed: "1/30",
    shutter_speed_seconds: 1 / 30,
    taken_at: nowIso(),
  });
  assert.equal(thirdPhoto.roll_id, roll.id);

  const afterReopenPhoto = await api.get(`/api/film/rolls/${roll.id}`);
  assert.equal(afterReopenPhoto.status, "exposing");
  assert.ok(afterReopenPhoto.processed_at);
  assert.equal(afterReopenPhoto.processed_at, processed.processed_at);
});

test("roll patch compatibility accepts developed_at aliases", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const profile = await createDevelopmentProfile(api, film.id, {
    name: "Compat D-76",
    developerName: "D-76",
    dilution: "1+1",
    temperatureText: "20C",
    agitation: "10s every minute",
    timeText: "9 min",
  });
  const roll = await createRoll(api, film.id);

  const patched = await api.patch(`/api/film/rolls/${roll.id}`, {
    developed_at: nowIso(),
    development_profile_id: profile.id,
    development_notes: "Legacy patch path",
  });
  assert.equal(patched.status, "processed");
  assert.ok(patched.processed_at);
  assert.equal(patched.developed_at, patched.processed_at);
  assert.equal(patched.development_profile_id, profile.id);
  assert.equal(patched.development_notes, "Legacy patch path");
});

test("roll-detail photograph listing orders by frame number and batches relations", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const camera = await createCamera(api, {
    name: "Mamiya 7",
    maker: "Mamiya",
    film_type: "roll",
    roll_format: "120",
    has_shutter: true,
    supports_bulb: true,
  });
  const lens = await createLens(api, { name: "80mm", applicable_camera_ids: [camera.id] });
  const filter = await createFilter(api, { applicable_lens_ids: [lens.id] });
  const roll = await createRoll(api, film.id, { roll_format: "120" });

  const laterPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    roll_id: roll.id,
    frame_number: "10",
    aperture: "f/5.6",
    shutter_mode: "fixed",
    shutter_speed: "1/125",
    shutter_speed_seconds: 1 / 125,
    taken_at: nowIso(),
  });
  const earlierPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    roll_id: roll.id,
    frame_number: "2",
    aperture: "f/8",
    shutter_mode: "fixed",
    shutter_speed: "1/60",
    shutter_speed_seconds: 1 / 60,
    filter_ids: [filter.id],
    taken_at: nowIso(),
  });

  const imageForm = new FormData();
  imageForm.set("original", tinyPngFile());
  const image = await api.post(`/api/photographs/${earlierPhoto.id}/images`, imageForm);
  assert.equal(image.photograph_id, earlierPhoto.id);
  assert.equal(image.content_type, "image/jpeg");
  assert.equal(image.thumbnail_content_type, "image/jpeg");
  assert.equal(image.original_content_type, "image/png");
  assert.equal(image.width, 1);
  assert.equal(image.height, 1);
  assert.equal(image.thumbnail_width, 1);
  assert.equal(image.thumbnail_height, 1);
  assert.equal(image.original_width, 1);
  assert.equal(image.original_height, 1);
  assert.ok(image.url);
  assert.ok(image.thumbnail_url);
  assert.ok(image.original_url);

  const list = await api.get(`/api/photographs?roll_id=${roll.id}`);
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].frame_number, "2");
  assert.equal(list.items[0].id, earlierPhoto.id);
  assert.deepEqual(list.items[0].filter_ids, [filter.id]);
  assert.equal(list.items[0].filters[0].id, filter.id);
  assert.equal(list.items[0].images.length, 1);
  assert.ok(list.items[0].images[0].thumbnail_url);
  assert.equal(list.items[1].frame_number, "10");
  assert.equal(list.items[1].id, laterPhoto.id);
});

test("film holder loads expose development time summaries from profile time and stored BTZS calculations", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const camera = await createCamera(api);
  const lens = await createLens(api, { applicable_camera_ids: [camera.id] });
  const holder = await createFilmHolder(api, { applicable_camera_ids: [camera.id] });
  const profile = await createDevelopmentProfile(api, film.id, { name: "D-76 1+1" });

  const loadedHolder = await api.post(`/api/film/holders/${holder.id}/loads`, { film_id: film.id });
  assert.equal(loadedHolder.current_load.status, "loaded");
  assert.ok(Object.prototype.hasOwnProperty.call(loadedHolder.current_load, "development_summary"));
  assert.equal(loadedHolder.current_load.development_summary, null);
  const firstLoadAt = loadedHolder.current_load.loaded_at;

  const holderList = await api.get("/api/film/holders");
  assert.equal(holderList.items[0].id, holder.id);
  assert.equal(holderList.items[0].current_load.status, "loaded");
  assert.ok(Object.prototype.hasOwnProperty.call(holderList.items[0].current_load, "development_summary"));
  assert.equal(holderList.items[0].current_load.development_summary, null);

  const photo = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    aperture: "f/11",
    shutter_mode: "fixed",
    shutter_speed: "1/60",
    shutter_speed_seconds: 1 / 60,
    taken_at: nowIso(),
  });
  assert.equal(photo.film_holder_id, holder.id);
  assert.ok(photo.lifecycle_summary);
  assert.equal(photo.lifecycle_summary.loaded_at, firstLoadAt);
  assert.ok(photo.lifecycle_summary.exposed_at);
  assert.equal(photo.lifecycle_summary.processed_at, null);
  assert.equal(photo.lifecycle_summary.developed_at, null);
  assert.equal(photo.lifecycle_summary.development_profile_name, null);

  const secondPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    aperture: "f/16",
    shutter_mode: "fixed",
    shutter_speed: "1/30",
    shutter_speed_seconds: 1 / 30,
    confirm_reexposure: true,
    taken_at: nowIso(),
  });
  assert.equal(secondPhoto.film_holder_id, holder.id);
  assert.ok(secondPhoto.lifecycle_summary);
  const reexposedHolder = await api.get(`/api/film/holders/${holder.id}`);
  assert.equal(reexposedHolder.current_load.status, "exposed");
  assert.equal(reexposedHolder.current_load.exposed_photograph_id, secondPhoto.id);
  assert.equal(reexposedHolder.load_history[0].status, "exposed");
  assert.equal(reexposedHolder.load_history[0].exposed_photograph_id, secondPhoto.id);
  assert.equal(reexposedHolder.load_history[1].status, "discarded");
  assert.equal(reexposedHolder.load_history[1].exposed_photograph_id, photo.id);
  assert.equal(reexposedHolder.load_history[1].discarded_reason, "Discarded after holder was re-exposed");
  assert.equal(secondPhoto.lifecycle_summary.loaded_at, reexposedHolder.current_load.loaded_at);
  assert.equal(secondPhoto.lifecycle_summary.exposed_at, reexposedHolder.current_load.exposed_at);
  assert.equal(secondPhoto.lifecycle_summary.processed_at, null);
  assert.equal(secondPhoto.lifecycle_summary.developed_at, null);
  assert.equal(secondPhoto.lifecycle_summary.development_profile_name, null);

  const imageForm = new FormData();
  imageForm.set("original", tinyPngFile());
  const image = await api.post(`/api/photographs/${secondPhoto.id}/images`, imageForm);
  assert.ok(image.thumbnail_url);

  const exposedHolder = await api.get(`/api/film/holders/${holder.id}`);
  assert.equal(exposedHolder.current_load.status, "exposed");
  assert.equal(exposedHolder.current_load.exposed_photograph_id, secondPhoto.id);
  assert.equal(exposedHolder.current_load.exposed_photograph.id, secondPhoto.id);
  assert.equal(exposedHolder.current_load.exposed_photograph.camera_id, camera.id);
  assert.equal(exposedHolder.current_load.exposed_photograph.camera_name, camera.name);
  assert.equal(exposedHolder.current_load.exposed_photograph.lens_id, lens.id);
  assert.equal(exposedHolder.current_load.exposed_photograph.lens_name, lens.name);
  assert.equal(exposedHolder.current_load.exposed_photograph.reference_image.id, image.id);
  assert.ok(exposedHolder.current_load.exposed_photograph.reference_image.thumbnail_url);
  assert.ok(Object.prototype.hasOwnProperty.call(exposedHolder.current_load, "development_summary"));
  assert.equal(exposedHolder.current_load.development_summary, null);
  assert.ok(
    exposedHolder.current_load.exposed_photograph.reference_image.thumbnail_url.includes(
      `/api/photographs/${secondPhoto.id}/images/${image.id}/file`,
    ),
  );

  const processedHolder = await api.post(`/api/film/holders/${holder.id}/loads/current/process`, {
    development_profile_id: profile.id,
    notes: "Processed in DDX",
  }, 200);
  assert.equal(processedHolder.current_load, null);
  assert.equal(processedHolder.load_history[0].status, "processed");
  assert.equal(processedHolder.load_history[0].development_profile.id, profile.id);
  assert.equal(processedHolder.load_history[0].development_profile.name, profile.name);
  assert.deepEqual(processedHolder.load_history[0].development_summary, {
    label: "Development time",
    source: "development-profile-time",
    minutes: null,
    time_text: profile.timeText,
  });
  assert.equal(processedHolder.load_history[0].exposed_photograph.id, secondPhoto.id);
  assert.equal(processedHolder.load_history[0].exposed_photograph.reference_image.id, image.id);
  assert.equal(processedHolder.load_history[1].status, "discarded");
  assert.equal(processedHolder.load_history[1].exposed_photograph.id, photo.id);
  assert.equal(processedHolder.load_history[1].discarded_reason, "Discarded after holder was re-exposed");

  const holderDetail = await api.get(`/api/film/holders/${holder.id}`);
  assert.deepEqual(holderDetail.load_history[0].development_summary, {
    label: "Development time",
    source: "development-profile-time",
    minutes: null,
    time_text: profile.timeText,
  });

  const refreshedFirstPhoto = await api.get(`/api/photographs/${photo.id}`);
  assert.ok(refreshedFirstPhoto.lifecycle_summary);
  assert.equal(refreshedFirstPhoto.lifecycle_summary.loaded_at, firstLoadAt);
  assert.equal(refreshedFirstPhoto.lifecycle_summary.processed_at, null);
  assert.equal(refreshedFirstPhoto.lifecycle_summary.developed_at, null);
  assert.equal(refreshedFirstPhoto.lifecycle_summary.development_profile_name, null);

  const refreshedSecondPhoto = await api.get(`/api/photographs/${secondPhoto.id}`);
  assert.ok(refreshedSecondPhoto.lifecycle_summary);
  assert.equal(refreshedSecondPhoto.lifecycle_summary.loaded_at, reexposedHolder.current_load.loaded_at);
  assert.equal(refreshedSecondPhoto.lifecycle_summary.exposed_at, reexposedHolder.current_load.exposed_at);
  assert.equal(refreshedSecondPhoto.lifecycle_summary.processed_at, processedHolder.load_history[0].processed_at);
  assert.equal(refreshedSecondPhoto.lifecycle_summary.developed_at, processedHolder.load_history[0].processed_at);
  assert.equal(refreshedSecondPhoto.lifecycle_summary.development_profile_name, profile.name);

  const loadHistory = await api.get(`/api/film/holders/${holder.id}/loads`);
  assert.equal(loadHistory.items[0].status, "processed");
  assert.equal(loadHistory.items[0].development_profile.id, profile.id);
  assert.equal(loadHistory.items[0].development_profile.name, profile.name);
  assert.deepEqual(loadHistory.items[0].development_summary, {
    label: "Development time",
    source: "development-profile-time",
    minutes: null,
    time_text: profile.timeText,
  });
  assert.equal(loadHistory.items[0].exposed_photograph.id, secondPhoto.id);
  assert.equal(
    new URL(loadHistory.items[0].exposed_photograph.reference_image.thumbnail_url).pathname,
    new URL(image.thumbnail_url).pathname,
  );
});

test("film holder discard and confirmed re-exposure preserve exposed history and reject processed loads", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const camera = await createCamera(api);
  const lens = await createLens(api, { applicable_camera_ids: [camera.id] });
  const holder = await createFilmHolder(api, { applicable_camera_ids: [camera.id] });

  await api.post(`/api/film/holders/${holder.id}/loads`, { film_id: film.id });

  const firstPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    aperture: "f/8",
    shutter_mode: "fixed",
    shutter_speed: "1/125",
    shutter_speed_seconds: 1 / 125,
    taken_at: nowIso(),
  });
  assert.equal(firstPhoto.film_holder_id, holder.id);

  const beforeReject = await api.get(`/api/film/holders/${holder.id}`);
  await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    aperture: "f/11",
    shutter_mode: "fixed",
    shutter_speed: "1/60",
    shutter_speed_seconds: 1 / 60,
    taken_at: nowIso(),
  }, 400);
  const afterReject = await api.get(`/api/film/holders/${holder.id}`);
  assert.equal(afterReject.current_load.exposed_photograph_id, firstPhoto.id);
  assert.equal(afterReject.load_history.length, beforeReject.load_history.length);

  const secondPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    aperture: "f/11",
    shutter_mode: "fixed",
    shutter_speed: "1/60",
    shutter_speed_seconds: 1 / 60,
    confirm_reexposure: true,
    taken_at: nowIso(),
  });
  assert.equal(secondPhoto.film_holder_id, holder.id);

  const reexposedHolder = await api.get(`/api/film/holders/${holder.id}`);
  assert.equal(reexposedHolder.current_load.status, "exposed");
  assert.equal(reexposedHolder.current_load.exposed_photograph_id, secondPhoto.id);
  assert.equal(reexposedHolder.load_history[0].status, "exposed");
  assert.equal(reexposedHolder.load_history[0].exposed_photograph_id, secondPhoto.id);
  assert.equal(reexposedHolder.load_history[1].status, "discarded");
  assert.equal(reexposedHolder.load_history[1].exposed_photograph_id, firstPhoto.id);
  assert.equal(reexposedHolder.load_history[1].discarded_reason, "Discarded after holder was re-exposed");

  const discarded = await api.post(`/api/film/holders/${holder.id}/loads/current/discard`, {}, 200);
  assert.equal(discarded.current_load, null);
  assert.equal(discarded.load_history[0].status, "discarded");
  assert.equal(discarded.load_history[0].exposed_photograph_id, secondPhoto.id);
  assert.equal(discarded.load_history[0].discarded_reason, "Discarded after holder was re-exposed");

  const thirdPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    aperture: "f/16",
    shutter_mode: "fixed",
    shutter_speed: "1/30",
    shutter_speed_seconds: 1 / 30,
    confirm_reexposure: true,
    taken_at: nowIso(),
  });
  assert.equal(thirdPhoto.film_holder_id, holder.id);

  const thirdHolder = await api.get(`/api/film/holders/${holder.id}`);
  assert.equal(thirdHolder.current_load.status, "exposed");
  assert.equal(thirdHolder.current_load.exposed_photograph_id, thirdPhoto.id);
  assert.equal(thirdHolder.load_history[0].status, "exposed");
  assert.equal(thirdHolder.load_history[0].exposed_photograph_id, thirdPhoto.id);
  assert.equal(thirdHolder.load_history[1].status, "discarded");
  assert.equal(thirdHolder.load_history[1].exposed_photograph_id, secondPhoto.id);
  assert.equal(thirdHolder.load_history[2].status, "discarded");
  assert.equal(thirdHolder.load_history[2].exposed_photograph_id, firstPhoto.id);

  const processed = await api.post(`/api/film/holders/${holder.id}/loads/current/process`, {}, 200);
  assert.equal(processed.current_load, null);

  await api.post(`/api/film/holders/${holder.id}/loads/current/discard`, {}, 400);
});

test("film holder load development summaries prefer stored BTZS calculation minutes over profile time", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const camera = await createCamera(api);
  const lens = await createLens(api, { applicable_camera_ids: [camera.id] });
  const holder = await createFilmHolder(api, { applicable_camera_ids: [camera.id] });
  const fallbackProfile = await createDevelopmentProfile(api, film.id, {
    name: "D-76 1+1 (slow)",
    timeText: "12 min",
  });

  const loadedHolder = await api.post(`/api/film/holders/${holder.id}/loads`, { film_id: film.id });
  assert.equal(loadedHolder.current_load.status, "loaded");

  const photo = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    aperture: "f/11",
    shutter_mode: "fixed",
    shutter_speed: "1/60",
    shutter_speed_seconds: 1 / 60,
    taken_at: nowIso(),
    exposure_entry_mode: "btzs-zone-metering",
    exposure_details: createBtzsExposureDetails({
      developmentTimeMinutes: 6.5,
    }),
  });
  assert.equal(photo.film_holder_id, holder.id);
  assert.ok(photo.lifecycle_summary);
  assert.ok(photo.exposure_details);

  const processedHolder = await api.post(`/api/film/holders/${holder.id}/loads/current/process`, {
    development_profile_id: fallbackProfile.id,
    notes: "Processed with fallback profile",
  }, 200);
  assert.equal(processedHolder.current_load, null);
  assert.deepEqual(processedHolder.load_history[0].development_summary, {
    label: "Development time",
    source: "stored-btzs-calculation",
    minutes: 6.5,
    time_text: "6:30",
  });

  const holderDetail = await api.get(`/api/film/holders/${holder.id}`);
  assert.deepEqual(holderDetail.load_history[0].development_summary, {
    label: "Development time",
    source: "stored-btzs-calculation",
    minutes: 6.5,
    time_text: "6:30",
  });

  const loadHistory = await api.get(`/api/film/holders/${holder.id}/loads`);
  assert.deepEqual(loadHistory.items[0].development_summary, {
    label: "Development time",
    source: "stored-btzs-calculation",
    minutes: 6.5,
    time_text: "6:30",
  });
});

test("photograph detail lifecycle summary follows roll lifecycle timestamps and profile display names", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const profile = await createDevelopmentProfile(api, film.id, { name: "D-76 1+1" });
  const loadedAt = "2026-05-01T12:00:00.000Z";
  const takenAt = "2026-05-01T12:34:56.000Z";
  const processedAt = "2026-05-02T09:15:00.000Z";
  const roll = await createRoll(api, film.id, {
    roll_format: "120",
    loaded_at: loadedAt,
  });
  const camera = await createCamera(api, {
    name: "Mamiya 7",
    maker: "Mamiya",
    film_type: "roll",
    roll_format: "120",
    has_shutter: true,
    supports_bulb: true,
  });
  const lens = await createLens(api, { name: "80mm", applicable_camera_ids: [camera.id] });

  const photo = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    roll_id: roll.id,
    frame_number: "1",
    aperture: "f/8",
    shutter_mode: "fixed",
    shutter_speed: "1/125",
    shutter_speed_seconds: 1 / 125,
    taken_at: takenAt,
  });
  assert.ok(photo.lifecycle_summary);
  assert.equal(photo.lifecycle_summary.loaded_at, loadedAt);
  assert.equal(photo.lifecycle_summary.exposed_at, takenAt);
  assert.equal(photo.lifecycle_summary.processed_at, null);
  assert.equal(photo.lifecycle_summary.developed_at, null);
  assert.equal(photo.lifecycle_summary.development_profile_name, null);

  const processedRoll = await api.patch(`/api/film/rolls/${roll.id}`, {
    developed_at: processedAt,
    development_profile_id: profile.id,
  });
  assert.equal(processedRoll.processed_at, processedAt);
  assert.equal(processedRoll.developed_at, processedAt);

  const refreshedPhoto = await api.get(`/api/photographs/${photo.id}`);
  assert.ok(refreshedPhoto.lifecycle_summary);
  assert.equal(refreshedPhoto.lifecycle_summary.loaded_at, loadedAt);
  assert.equal(refreshedPhoto.lifecycle_summary.exposed_at, takenAt);
  assert.equal(refreshedPhoto.lifecycle_summary.processed_at, processedAt);
  assert.equal(refreshedPhoto.lifecycle_summary.developed_at, processedAt);
  assert.equal(refreshedPhoto.lifecycle_summary.development_profile_name, profile.name);
});

test("film holder exposure undo clears linked photographs and preserves the load lifecycle", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const camera = await createCamera(api);
  const lens = await createLens(api, { applicable_camera_ids: [camera.id] });
  const holder = await createFilmHolder(api, { applicable_camera_ids: [camera.id] });
  const profile = await createDevelopmentProfile(api, film.id, { name: "D-76 1+1" });

  await api.post(`/api/film/holders/${holder.id}/loads/current/undo-exposure`, {}, 400);
  await api.post("/api/film/holders/does-not-exist/loads/current/undo-exposure", {}, 404);

  const loadedHolder = await api.post(`/api/film/holders/${holder.id}/loads`, {
    film_id: film.id,
    notes: "Accidental exposure",
  });
  assert.equal(loadedHolder.current_load.status, "loaded");
  assert.equal(loadedHolder.current_load.notes, "Accidental exposure");
  assert.equal(loadedHolder.current_load.film_id, film.id);

  const firstPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    aperture: "f/11",
    shutter_mode: "fixed",
    shutter_speed: "1/60",
    shutter_speed_seconds: 1 / 60,
    taken_at: nowIso(),
  });
  assert.equal(firstPhoto.film_holder_id, holder.id);
  assert.equal(firstPhoto.film_id, film.id);

  await api.post(`/api/film/holders/${holder.id}/loads/current/undo-exposure`, {}, 409);

  const undone = await api.post(`/api/film/holders/${holder.id}/loads/current/undo-exposure`, {
    clear_photograph_holder: true,
  }, 200);
  assert.equal(undone.current_load.status, "loaded");
  assert.equal(undone.current_load.exposed_at, null);
  assert.equal(undone.current_load.exposed_photograph_id, null);
  assert.equal(undone.current_load.processed_at, null);
  assert.equal(undone.current_load.loaded_at, loadedHolder.current_load.loaded_at);
  assert.equal(undone.current_load.film_id, film.id);
  assert.equal(undone.current_load.notes, "Accidental exposure");
  assert.equal(undone.current_load.film.id, film.id);

  const clearedPhoto = await api.get(`/api/photographs/${firstPhoto.id}`);
  assert.equal(clearedPhoto.film_holder_id, null);
  assert.equal(clearedPhoto.film_id, film.id);

  const reexposedPhoto = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    aperture: "f/8",
    shutter_mode: "fixed",
    shutter_speed: "1/125",
    shutter_speed_seconds: 1 / 125,
    taken_at: nowIso(),
  });
  assert.equal(reexposedPhoto.film_holder_id, holder.id);

  const reexposedHolder = await api.get(`/api/film/holders/${holder.id}`);
  assert.equal(reexposedHolder.current_load.status, "exposed");
  assert.equal(reexposedHolder.current_load.exposed_photograph_id, reexposedPhoto.id);

  const processedHolder = await api.post(`/api/film/holders/${holder.id}/loads/current/process`, {
    development_profile_id: profile.id,
  }, 200);
  assert.equal(processedHolder.current_load, null);
  assert.equal(processedHolder.load_history[0].status, "processed");

  await api.post(`/api/film/holders/${holder.id}/loads/current/undo-exposure`, {}, 400);
});

test("reference image metadata upload works for an existing photograph", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const camera = await createCamera(api);
  const lens = await createLens(api, { applicable_camera_ids: [camera.id] });
  const holder = await createFilmHolder(api, { applicable_camera_ids: [camera.id] });
  await api.post(`/api/film/holders/${holder.id}/loads`, { film_id: film.id });

  const photo = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    shutter_mode: "fixed",
    shutter_speed: "1/30",
    shutter_speed_seconds: 1 / 30,
    taken_at: nowIso(),
  });

  const form = new FormData();
  form.set("display", tinyPngFile());

  const image = await api.post(`/api/photographs/${photo.id}/images`, form);
  assert.equal(image.photograph_id, photo.id);
  assert.equal(image.content_type, "image/jpeg");
  assert.equal(image.thumbnail_content_type, "image/jpeg");
  assert.equal(image.original_content_type, "image/png");
  assert.ok(image.url);
  assert.ok(image.thumbnail_url);
  assert.ok(image.original_url);

  const refreshed = await api.get(`/api/photographs/${photo.id}`);
  assert.equal(refreshed.images.length, 1);
  assert.equal(refreshed.images[0].id, image.id);
});

test("reference image upload rejects invalid source files cleanly", async () => {
  const api = new ApiClient();
  await api.register();

  const film = await createFilmStock(api);
  const camera = await createCamera(api);
  const lens = await createLens(api, { applicable_camera_ids: [camera.id] });
  const holder = await createFilmHolder(api, { applicable_camera_ids: [camera.id] });
  await api.post(`/api/film/holders/${holder.id}/loads`, { film_id: film.id });

  const photo = await api.post("/api/photographs", {
    camera_id: camera.id,
    lens_id: lens.id,
    film_holder_id: holder.id,
    shutter_mode: "fixed",
    shutter_speed: "1/30",
    shutter_speed_seconds: 1 / 30,
    taken_at: nowIso(),
  });

  const form = new FormData();
  form.set("file", invalidPngFile());

  await api.post(`/api/photographs/${photo.id}/images`, form, 400);

  const refreshed = await api.get(`/api/photographs/${photo.id}`);
  assert.equal(refreshed.images.length, 0);
});

async function main() {
  const context = await setupCleanInstance();
  testContext = context;
  const failures = [];

  try {
    for (const { name, fn } of tests) {
      const started = Date.now();
      try {
        await fn();
        console.log(`✓ ${name} (${Date.now() - started}ms)`);
      } catch (error) {
        failures.push({ name, error });
        console.error(`✗ ${name}`);
        console.error(error.stack ?? error.message);
      }
    }
  } finally {
    await context.cleanup();
    testContext = null;
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} API flow test(s) failed.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${tests.length} API flow tests passed.`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
