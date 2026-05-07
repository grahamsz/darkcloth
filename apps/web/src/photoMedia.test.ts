import { describe, expect, it } from "vitest";
import type { Camera, FilmHolder, FilmHolderLoad, Lens, Roll } from "./api/client";
import {
  buildHolderLoadPayload,
  buildRollCreatePayload,
  createEmptyHolderLoadDraft,
  createEmptyRollCreateDraft,
  filterApplicableFilmHolders,
  filterCompatibleLenses,
  filterCompatibleRolls,
  formatRollFormatLabel,
  getCameraFilmWorkflow,
  getCameraRollFormatSummary,
  normalizeLensSelectionForCamera,
  normalizeMediaSelectionForCamera,
} from "./photoMedia";

const createCamera = (overrides: Partial<Camera> = {}): Camera => ({
  id: "camera-1",
  user_id: "user-1",
  name: "Camera",
  maker: null,
  film_type: "roll",
  roll_format: "120",
  frame_format: null,
  frame_width_mm: null,
  frame_height_mm: null,
  has_bellows: false,
  has_shutter: true,
  min_shutter_speed_seconds: 1 / 250,
  max_shutter_speed_seconds: 1,
  supports_bulb: false,
  acceptable_lens_ids: [],
  created_at: "2026-05-02T00:00:00.000Z",
  ...overrides,
});

const createRoll = (overrides: Partial<Roll> = {}): Roll => ({
  id: "roll-1",
  user_id: "user-1",
  film_id: "film-1",
  roll_format: "120",
  name: "Roll",
  loaded_at: null,
  status: "unexposed",
  push_pull_stops: 0,
  finished_at: null,
  processed_at: null,
  developed_at: null,
  development_profile_id: null,
  development_notes: null,
  created_at: "2026-05-02T00:00:00.000Z",
  ...overrides,
});

const createLoad = (overrides: Partial<FilmHolderLoad> = {}): FilmHolderLoad => ({
  id: "load-1",
  user_id: "user-1",
  film_holder_id: "holder-1",
  film_id: "film-1",
  status: "loaded",
  loaded_at: "2026-05-02T00:00:00.000Z",
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
  created_at: "2026-05-02T00:00:00.000Z",
  updated_at: "2026-05-02T00:00:00.000Z",
  film: null,
  ...overrides,
});

const createHolder = (overrides: Partial<FilmHolder> = {}): FilmHolder => ({
  id: "holder-1",
  user_id: "user-1",
  name: "Holder",
  type: "4x5",
  width_mm: 102,
  height_mm: 127,
  brand: null,
  capacity: 4,
  applicable_camera_ids: [],
  created_at: "2026-05-02T00:00:00.000Z",
  current_load: null,
  load_history: [],
  ...overrides,
});

const createLens = (overrides: Partial<Lens> = {}): Lens => ({
  id: "lens-1",
  user_id: "user-1",
  name: "Lens",
  has_shutter: true,
  min_shutter_speed_seconds: 1 / 250,
  max_shutter_speed_seconds: 1,
  supports_bulb: false,
  min_focal_length_mm: null,
  max_focal_length_mm: null,
  focal_length_mm: null,
  max_aperture: null,
  min_f_stop: null,
  max_f_stop: null,
  aperture_increment: null,
  flare_factor: 0.02,
  applicable_camera_ids: [],
  created_at: "2026-05-02T00:00:00.000Z",
  ...overrides,
});

describe("photo media helpers", () => {
  it("defaults roll drafts from the selected camera format and film", () => {
    expect(createEmptyRollCreateDraft(createCamera(), "film-2")).toEqual({
      name: "",
      filmId: "film-2",
      rollFormat: "120",
    });
    expect(buildRollCreatePayload({
      name: "  Roll 1  ",
      filmId: "film-2",
      rollFormat: "120",
    })).toEqual({
      name: "Roll 1",
      film_id: "film-2",
      roll_format: "120",
    });
  });

  it("defaults holder load drafts and trims the payload", () => {
    expect(createEmptyHolderLoadDraft("film-3", "  note  ")).toEqual({
      filmId: "film-3",
      notes: "  note  ",
    });
    expect(buildHolderLoadPayload({
      filmId: "  film-3  ",
      notes: "  note  ",
    })).toEqual({
      film_id: "film-3",
      notes: "note",
    });
  });

  it("filters rolls to the selected camera roll format", () => {
    const camera = createCamera({ roll_format: "120" });
    const rolls = [
      createRoll({ id: "roll-1", roll_format: "120" }),
      createRoll({ id: "roll-2", roll_format: "35mm" }),
      createRoll({ id: "roll-3", roll_format: "120", film_id: null }),
    ];

    expect(filterCompatibleRolls(rolls, camera).map(roll => roll.id)).toEqual(["roll-1"]);
    expect(filterCompatibleRolls(rolls, createCamera({ roll_format: null })).map(roll => roll.id)).toEqual([
      "roll-1",
      "roll-2",
    ]);
    expect(formatRollFormatLabel(null)).toBe("Any roll format");
    expect(getCameraRollFormatSummary(camera)).toBe("Roll format 120");
    expect(getCameraFilmWorkflow(camera)).toBe("roll");
  });

  it("filters holders by camera applicability and keeps empty holders visible", () => {
    const camera = createCamera({ id: "camera-2" });
    const holders = [
      createHolder({ id: "holder-1", applicable_camera_ids: [] }),
      createHolder({ id: "holder-2", applicable_camera_ids: ["camera-2"], current_load: createLoad({ film_holder_id: "holder-2" }) }),
      createHolder({ id: "holder-3", applicable_camera_ids: ["camera-3"] }),
    ];

    expect(filterApplicableFilmHolders(holders, camera).map(holder => holder.id)).toEqual(["holder-1", "holder-2"]);
  });

  it("filters lenses by camera applicability and falls back to all lenses when compatibility is not configured", () => {
    const explicitCamera = createCamera({ id: "camera-explicit" });
    const explicitLenses = [
      createLens({ id: "lens-1", applicable_camera_ids: ["camera-explicit"] }),
      createLens({ id: "lens-2", applicable_camera_ids: ["camera-other"] }),
      createLens({ id: "lens-3" }),
    ];

    expect(filterCompatibleLenses(explicitLenses, explicitCamera).map(lens => lens.id)).toEqual(["lens-1", "lens-3"]);

    const legacyCamera = createCamera({ id: "camera-legacy", acceptable_lens_ids: ["lens-2"] });
    const legacyLenses = [
      createLens({ id: "lens-1" }),
      createLens({ id: "lens-2" }),
      createLens({ id: "lens-3" }),
    ];

    expect(filterCompatibleLenses(legacyLenses, legacyCamera).map(lens => lens.id)).toEqual(["lens-2"]);
    expect(filterCompatibleLenses(legacyLenses, createCamera({ id: "camera-fallback", acceptable_lens_ids: [] })).map(lens => lens.id)).toEqual([
      "lens-1",
      "lens-2",
      "lens-3",
    ]);
  });

  it("normalizes lens selection to the sole compatible option and clears incompatible picks otherwise", () => {
    const compatibleLenses = [createLens({ id: "lens-1" })];
    const multipleCompatibleLenses = [
      createLens({ id: "lens-1" }),
      createLens({ id: "lens-2" }),
    ];

    expect(normalizeLensSelectionForCamera("", compatibleLenses)).toBe("lens-1");
    expect(normalizeLensSelectionForCamera("lens-2", compatibleLenses)).toBe("lens-1");
    expect(normalizeLensSelectionForCamera("lens-1", compatibleLenses)).toBe("lens-1");
    expect(normalizeLensSelectionForCamera("", multipleCompatibleLenses)).toBe("");
    expect(normalizeLensSelectionForCamera("lens-3", multipleCompatibleLenses)).toBe("");
  });

  it("clears incompatible media when the camera changes", () => {
    const rolls = [
      createRoll({ id: "roll-1", roll_format: "35mm" }),
      createRoll({ id: "roll-2", roll_format: "120" }),
    ];
    const holders = [
      createHolder({
        id: "holder-1",
        applicable_camera_ids: ["camera-sheet"],
        current_load: createLoad(),
      }),
      createHolder({
        id: "holder-2",
        applicable_camera_ids: ["camera-sheet"],
        current_load: createLoad({ id: "load-2", film_holder_id: "holder-2", film_id: "film-2" }),
      }),
    ];

    expect(normalizeMediaSelectionForCamera(
      { rollId: "roll-1", frameNumber: "12", filmHolderId: "holder-1" },
      createCamera({ id: "camera-roll", film_type: "roll", roll_format: "120" }),
      rolls,
      holders,
    )).toEqual({
      rollId: "",
      frameNumber: "",
      filmHolderId: "",
    });

    expect(normalizeMediaSelectionForCamera(
      { rollId: "roll-2", frameNumber: "12", filmHolderId: "holder-2" },
      createCamera({ id: "camera-sheet", film_type: "sheet", roll_format: null }),
      rolls,
      holders,
    )).toEqual({
      rollId: "",
      frameNumber: "",
      filmHolderId: "holder-2",
    });
  });

  it("clears discarded holders when normalizing media selection", () => {
    const holders = [
      createHolder({
        id: "holder-1",
        current_load: createLoad({
          status: "discarded",
          discarded_at: "2026-05-02T12:00:00.000Z",
          discarded_reason: "Re-exposed in the field",
        }),
      }),
    ];

    expect(normalizeMediaSelectionForCamera(
      { rollId: "", frameNumber: "", filmHolderId: "holder-1" },
      createCamera({ id: "camera-sheet", film_type: "sheet", roll_format: null }),
      [],
      holders,
    )).toEqual({
      rollId: "",
      frameNumber: "",
      filmHolderId: "",
    });
  });
});
