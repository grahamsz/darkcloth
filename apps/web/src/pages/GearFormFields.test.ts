import { describe, expect, it } from "vitest";
import type { Camera, Filter, FilmHolder, FilmStock, Lens, Roll } from "../api/client";
import {
  buildCameraPayload,
  buildFilmHolderPayload,
  buildFilterCreatePayload,
  buildFilterUpdatePayload,
  buildLensPayload,
  cameraDraftFromCamera,
  applyFilmStockPreset,
  buildRollPayload,
  buildFilmStockPayload,
  createEmptyFilterDraft,
  createEmptyCameraDraft,
  createEmptyFilmHolderDraft,
  createEmptyFilmStockDraft,
  createEmptyLensDraft,
  createEmptyRollDraft,
  createDisabledShutterState,
  createEnabledShutterState,
  formatCameraDisplayName,
  getCameraCompatibilityText,
  getCameraLensApplicabilityText,
  formatRollPushPullLabel,
  formatRollSelectLabel,
  formatRollStatusLabel,
  filterDraftFromFilter,
  filmHolderDraftFromFilmHolder,
  filmStockDraftFromFilmStock,
  lensDraftFromLens,
  rollDraftFromRoll,
} from "./GearFormFields";

describe("lens form helpers", () => {
  it("defaults new lenses to a 0.02 flare factor", () => {
    expect(createEmptyLensDraft().flareFactor).toBe("0.02");
  });

  it("includes flare factor in lens payloads", () => {
    expect(
      buildLensPayload({
        ...createEmptyLensDraft(),
        name: "Schneider 135mm",
        minFocalLength: "135",
        maxFocalLength: "135",
        flareFactor: "0.04",
      }, []),
    ).toMatchObject({
      name: "Schneider 135mm",
      min_focal_length_mm: 135,
      max_focal_length_mm: 135,
      flare_factor: 0.04,
    });
  });

  it("hydrates flare factor from existing lenses", () => {
    const lens: Lens = {
      id: "lens-1",
      user_id: "user-1",
      name: "Nikkor 90mm",
      focal_length_mm: 90,
      min_focal_length_mm: 90,
      max_focal_length_mm: 90,
      max_aperture: null,
      min_f_stop: 5.6,
      max_f_stop: 32,
      aperture_increment: "full",
      flare_factor: 0.03,
      has_shutter: false,
      min_shutter_speed_seconds: null,
      max_shutter_speed_seconds: null,
      supports_bulb: false,
      applicable_camera_ids: [],
      created_at: "2026-05-02T00:00:00.000Z",
    };

    expect(lensDraftFromLens(lens).flareFactor).toBe("0.03");
  });
});

describe("film stock form helpers", () => {
  it("defaults the form draft to other and reciprocity p factor 1", () => {
    const draft = createEmptyFilmStockDraft();

    expect(draft).toEqual({
      presetKey: "",
      name: "",
      stockType: "other",
      iso: "",
      process: "",
      reciprocityPFactor: "1",
      simulateSpectralResponse: false,
      spectralResponsePreset: "generic_panchromatic",
    });
  });

  it("includes reciprocity p factor in the payload", () => {
    const draft = createEmptyFilmStockDraft();

    expect(
      buildFilmStockPayload({
        ...draft,
        name: "FP4+",
        stockType: "bw",
        reciprocityPFactor: "1.5",
      }),
    ).toEqual({
      name: "FP4+",
      stock_type: "bw",
      iso: undefined,
      process: undefined,
      reciprocity_p_factor: 1.5,
      simulate_spectral_response: false,
      spectral_response_preset: "generic_panchromatic",
    });
  });

  it("hydrates the draft from an existing film stock", () => {
    const filmStock: FilmStock = {
      id: "film-1",
      user_id: "user-1",
      name: "Portra 400",
      stock_type: "color_negative",
      reciprocity_p_factor: 1.25,
      iso: 400,
      process: "C-41",
      created_at: "2026-05-02T00:00:00.000Z",
    };

    expect(filmStockDraftFromFilmStock(filmStock)).toEqual({
      presetKey: "",
      name: "Portra 400",
      stockType: "color_negative",
      iso: "400",
      process: "C-41",
      reciprocityPFactor: "1.25",
      simulateSpectralResponse: false,
      spectralResponsePreset: "generic_panchromatic",
    });
  });

  it("falls back to 1 for legacy film stock responses without a p factor", () => {
    const legacyFilmStock = {
      id: "film-2",
      user_id: "user-1",
      name: "Tri-X 400",
      stock_type: "bw",
      iso: 400,
      process: null,
      created_at: "2026-05-02T00:00:00.000Z",
    } as FilmStock;

    expect(filmStockDraftFromFilmStock(legacyFilmStock)).toEqual({
      presetKey: "",
      name: "Tri-X 400",
      stockType: "bw",
      iso: "400",
      process: "",
      reciprocityPFactor: "1",
      simulateSpectralResponse: false,
      spectralResponsePreset: "generic_panchromatic",
    });
  });

  it("applies B&W film stock presets including reciprocity and spectral response", () => {
    expect(
      applyFilmStockPreset(createEmptyFilmStockDraft(), {
        key: "ilford_hp5_plus",
        brand: "Ilford",
        name: "HP5 Plus",
        iso: 400,
        stock_type: "bw",
        process: "B&W",
        reciprocity_p_factor: 1.31,
        spectral_response_preset: "modern_panchromatic",
        simulate_spectral_response: true,
      }),
    ).toMatchObject({
      presetKey: "ilford_hp5_plus",
      name: "Ilford HP5 Plus",
      stockType: "bw",
      iso: "400",
      process: "B&W",
      reciprocityPFactor: "1.31",
      simulateSpectralResponse: true,
      spectralResponsePreset: "modern_panchromatic",
    });
  });
});

describe("camera form helpers", () => {
  it("defaults camera drafts without compatibility state", () => {
    expect(createEmptyCameraDraft()).toEqual({
      name: "",
      maker: "",
      filmType: "unspecified",
      rollFormat: "",
      frameFormatKey: "",
      hasBellows: false,
      shutter: createDisabledShutterState(),
    });
  });

  it("hydrates camera drafts from camera responses without legacy compatibility data", () => {
    const camera: Camera = {
      id: "camera-1",
      user_id: "user-1",
      name: "F4",
      maker: "Canon",
      film_type: "roll",
      roll_format: "120",
      frame_format: null,
      frame_width_mm: null,
      frame_height_mm: null,
      has_bellows: true,
      has_shutter: true,
      min_shutter_speed_seconds: 0.5,
      max_shutter_speed_seconds: 1,
      supports_bulb: true,
      acceptable_lens_ids: ["lens-1", "lens-2"],
      created_at: "2026-05-02T00:00:00.000Z",
    };

    expect(cameraDraftFromCamera(camera)).toEqual({
      name: "F4",
      maker: "Canon",
      filmType: "roll",
      rollFormat: "120",
      frameFormatKey: "",
      hasBellows: true,
      shutter: createEnabledShutterState(0.5, 1, true),
    });
  });

  it("omits camera compatibility ids from create payloads", () => {
    expect(
      buildCameraPayload({
        name: "F4",
        maker: "Canon",
        filmType: "roll",
        rollFormat: "35mm",
        frameFormatKey: "35mm-half",
        hasBellows: true,
        shutter: createDisabledShutterState(),
      }),
    ).toEqual({
      name: "F4",
      maker: "Canon",
      film_type: "roll",
      roll_format: "35mm",
      frame_format: "35mm half frame",
      frame_width_mm: 18,
      frame_height_mm: 24,
      has_bellows: true,
      has_shutter: false,
      min_shutter_speed_seconds: null,
      max_shutter_speed_seconds: null,
      supports_bulb: false,
    });
  });

  it("formats camera compatibility summaries from the read-only response field", () => {
    const camera: Camera = {
      id: "camera-2",
      user_id: "user-1",
      name: "AE-1",
      maker: "Canon",
      film_type: "roll",
      roll_format: "35mm",
      frame_format: "35mm",
      frame_width_mm: 36,
      frame_height_mm: 24,
      has_bellows: false,
      has_shutter: false,
      min_shutter_speed_seconds: null,
      max_shutter_speed_seconds: null,
      supports_bulb: false,
      acceptable_lens_ids: ["lens-1", "lens-2"],
      created_at: "2026-05-02T00:00:00.000Z",
    };

    expect(getCameraCompatibilityText(camera)).toBe("Compatible with 2 lenses");
    expect(getCameraCompatibilityText({ ...camera, acceptable_lens_ids: [] })).toBe("Compatible with all lenses");
  });

  it("formats camera lens applicability with resolved names", () => {
    const camera = {
      acceptable_lens_ids: ["lens-1", "lens-2"],
    } as Pick<Camera, "acceptable_lens_ids">;

    const lensNameById = new Map([
      ["lens-1", "Schneider 135mm"],
      ["lens-2", "Nikkor 50mm"],
    ]);

    expect(getCameraLensApplicabilityText(camera, lensNameById)).toBe("Lenses: Schneider 135mm, Nikkor 50mm");
  });

  it("uses an all-lenses fallback for unrestricted cameras", () => {
    const camera = {
      acceptable_lens_ids: [],
    } as Pick<Camera, "acceptable_lens_ids">;

    expect(getCameraLensApplicabilityText(camera, new Map())).toBe("Lenses: all");
  });

  it("falls back to selected-count wording when lens names are unavailable", () => {
    const camera = {
      acceptable_lens_ids: ["lens-1", "lens-2"],
    } as Pick<Camera, "acceptable_lens_ids">;

    expect(getCameraLensApplicabilityText(camera, new Map())).toBe("Lenses: 2 selected (unavailable)");
  });

  it("mixes resolved names with unavailable selections", () => {
    const camera = {
      acceptable_lens_ids: ["lens-1", "lens-2"],
    } as Pick<Camera, "acceptable_lens_ids">;

    const lensNameById = new Map([
      ["lens-1", "Schneider 135mm"],
    ]);

    expect(getCameraLensApplicabilityText(camera, lensNameById)).toBe("Lenses: Schneider 135mm (+ 1 unavailable)");
  });
});

describe("camera display name helpers", () => {
  it("prefixes the maker when the name is only the model", () => {
    expect(formatCameraDisplayName({ maker: "Shen Hao", name: "4x5" })).toBe("Shen Hao 4x5");
  });

  it("falls back to the trimmed name when maker is blank or missing", () => {
    expect(formatCameraDisplayName({ maker: "", name: " 4x5 " })).toBe("4x5");
    expect(formatCameraDisplayName({ maker: null, name: "4x5" })).toBe("4x5");
  });

  it("does not duplicate a safe maker prefix", () => {
    expect(formatCameraDisplayName({ maker: "Shen Hao", name: "shen hao 4x5" })).toBe("shen hao 4x5");
  });
});

describe("film holder form helpers", () => {
  it("defaults film holder drafts without legacy brand or capacity fields", () => {
    expect(createEmptyFilmHolderDraft()).toEqual({
      name: "",
      type: "",
      frameFormatKey: "",
      widthMm: "",
      heightMm: "",
    });
  });

  it("hydrates film holder drafts while ignoring legacy brand and capacity fields", () => {
    const filmHolder: FilmHolder = {
      id: "holder-1",
      user_id: "user-1",
      name: "Graflex holder",
      type: "4x5",
      width_mm: 101.6,
      height_mm: 127,
      brand: "Legacy Brand",
      capacity: 2,
      applicable_camera_ids: ["camera-1"],
      created_at: "2026-05-02T00:00:00.000Z",
      current_load: null,
      load_history: [],
    };

    expect(filmHolderDraftFromFilmHolder(filmHolder)).toEqual({
      name: "Graflex holder",
      type: "4x5",
      frameFormatKey: "",
      widthMm: "101.6",
      heightMm: "127",
    });
  });

  it("omits legacy brand and capacity fields from holder payloads", () => {
    expect(buildFilmHolderPayload({
      name: "Graflex holder",
      type: "4x5",
      frameFormatKey: "4x5",
      widthMm: "102",
      heightMm: "127",
    })).toEqual({
      name: "Graflex holder",
      type: "4x5",
      width_mm: 102,
      height_mm: 127,
    });
  });
});

describe("filter form helpers", () => {
  const filter: Filter = {
    id: "filter-1",
    user_id: "user-1",
    name: "Red",
    code: "Wratten 25",
    filter_factor: 8,
    source: null,
    standard_key: "wratten_25",
    notes: "Use in daylight",
    can_simulate_bw: true,
    simulation_rgb: "#e1261c",
    simulation_strength: 0.5,
    simulation_brightness_boost: 1.38,
    applies_to_bw: true,
    applies_to_color: false,
    applies_to_infrared: true,
    applicable_lens_ids: ["lens-1"],
    created_at: "2026-05-02T00:00:00.000Z",
    updated_at: "2026-05-02T00:00:00.000Z",
  };

  it("defaults filter drafts with blank fields", () => {
    expect(createEmptyFilterDraft()).toEqual({
      name: "",
      code: "",
      filterFactor: "",
      standardKey: "",
      notes: "",
      appliesToBw: true,
      appliesToColor: true,
      appliesToInfrared: true,
      applicableLensIds: [],
    });
  });

  it("hydrates filter drafts from existing filter responses and ignores legacy metadata", () => {
    const legacyFilter = {
      ...filter,
      maker: "Tiffen",
      category: "Color",
      size: "4x5",
      thread_size: "58mm",
      size_system: "metric",
    } as Filter;

    expect(filterDraftFromFilter(legacyFilter)).toEqual({
      name: "Red",
      code: "Wratten 25",
      filterFactor: "8",
      standardKey: "wratten_25",
      notes: "Use in daylight",
      appliesToBw: true,
      appliesToColor: false,
      appliesToInfrared: true,
      applicableLensIds: ["lens-1"],
    });
  });

  it("includes the simplified filter fields in create payloads and preserves selected lens IDs", () => {
    expect(
      buildFilterCreatePayload(
        {
          ...createEmptyFilterDraft(),
          name: "Red",
          code: "Wratten 25",
          filterFactor: "8",
          standardKey: "wratten_25",
          notes: "Use in daylight",
          appliesToBw: true,
          appliesToColor: false,
          appliesToInfrared: true,
          applicableLensIds: ["lens-1"],
        },
        [
          { id: "lens-1", name: "Lens One" },
          { id: "lens-2", name: "Lens Two" },
        ],
      ),
    ).toEqual({
      name: "Red",
      filter_factor: 8,
      code: "Wratten 25",
      standard_key: "wratten_25",
      notes: "Use in daylight",
      applies_to_bw: true,
      applies_to_color: false,
      applies_to_infrared: true,
      applicable_lens_ids: ["lens-1"],
    });
  });

  it("includes the simplified filter fields in update payloads and collapses an all-lens selection", () => {
    expect(
      buildFilterUpdatePayload(
        {
          ...filterDraftFromFilter(filter),
          applicableLensIds: ["lens-1", "lens-2"],
        },
        [
          { id: "lens-1", name: "Lens One" },
          { id: "lens-2", name: "Lens Two" },
        ],
      ),
    ).toEqual({
      name: "Red",
      filter_factor: 8,
      code: "Wratten 25",
      notes: "Use in daylight",
      applies_to_bw: true,
      applies_to_color: false,
      applies_to_infrared: true,
      applicable_lens_ids: [],
    });
  });
});

describe("roll form helpers", () => {
  it("defaults roll drafts to normal push/pull", () => {
    expect(createEmptyRollDraft()).toEqual({
      name: "",
      filmId: "",
      loadedAt: "",
      finishedAt: "",
      processedAt: "",
      developmentProfileId: "",
      developmentNotes: "",
      pushPullStops: 0,
    });
  });

  it("hydrates roll drafts from existing rolls", () => {
    const roll: Roll = {
      id: "roll-1",
      user_id: "user-1",
      film_id: "film-1",
      roll_format: "120",
      name: "Portra 400 #1",
      loaded_at: "2026-05-01T12:34:00.000Z",
      finished_at: "2026-05-01T18:45:00.000Z",
      processed_at: "2026-05-02T09:15:00.000Z",
      developed_at: "2026-05-02T09:15:00.000Z",
      development_profile_id: "profile-1",
      development_notes: "Push one stop",
      status: "processed",
      push_pull_stops: 1,
      created_at: "2026-05-01T12:34:00.000Z",
    };

    expect(rollDraftFromRoll(roll)).toEqual({
      name: "Portra 400 #1",
      filmId: "film-1",
      loadedAt: "2026-05-01T12:34",
      finishedAt: "2026-05-01T18:45",
      processedAt: "2026-05-02T09:15",
      developmentProfileId: "profile-1",
      developmentNotes: "Push one stop",
      pushPullStops: 1,
    });
  });

  it("includes push/pull and timestamps in the payload", () => {
    const loadedAt = new Date("2026-05-01T12:34").toISOString();

    expect(buildRollPayload({
      name: "Portra 400 #1",
      filmId: "film-1",
      loadedAt: "2026-05-01T12:34",
      finishedAt: "2026-05-01T18:45",
      processedAt: "2026-05-02T09:15",
      developmentProfileId: "profile-1",
      developmentNotes: "  Push one stop  ",
      pushPullStops: -1,
    })).toEqual({
      name: "Portra 400 #1",
      film_id: "film-1",
      loaded_at: loadedAt,
      finished_at: new Date("2026-05-01T18:45").toISOString(),
      processed_at: new Date("2026-05-02T09:15").toISOString(),
      developed_at: new Date("2026-05-02T09:15").toISOString(),
      development_profile_id: "profile-1",
      development_notes: "Push one stop",
      push_pull_stops: -1,
    });
  });

  it("formats push/pull labels for roll selection", () => {
    expect(formatRollPushPullLabel(-2)).toBe("Pull 2");
    expect(formatRollPushPullLabel(0)).toBe("Normal");
    expect(formatRollPushPullLabel(3)).toBe("Push +3");
    expect(formatRollStatusLabel("exposing")).toBe("Exposing");
    expect(formatRollStatusLabel("finished")).toBe("Finished");
    expect(formatRollStatusLabel("processed")).toBe("Processed");
    expect(formatRollSelectLabel({
      name: "Portra 400 #1",
      status: "exposing",
      push_pull_stops: 1,
      roll_format: "120",
    })).toBe("Portra 400 #1 · Exposing · Push +1 · 120");
  });
});
