import { describe, expect, it } from "vitest";
import type { BTZSChartData, DevelopmentProfile, Filter, FilmStock, Lens } from "./api/client";
import {
  buildMeteredExposurePreview,
  buildPhotographExposureSummary,
  buildPhotographExposurePayload,
  buildPhotographExposureWritePayload,
  calculateApertureFromEv,
  calculateBtzsExposure,
  calculateSimpleZoneSystemExposure,
  calculateExposureEv,
  calculateShutterSecondsFromEv,
  calculateTargetEv,
  calculateZoneAdjustedEv,
  calculateZoneMeteringExposure,
  adjustEvForFiltersAndCompensation,
  adjustEvForIso,
  applyReciprocity,
  findBtzsLookupSeries,
  formatDevelopmentTimeClock,
  formatDevelopmentTimeMinutes,
  formatExposureEfs,
  formatExposureEv,
  formatExposureG,
  formatExposureSbr,
  createEmptyPhotographExposureDraft,
  createEmptyPhotographExposureModeDraft,
  createEmptyPhotographBtzsZoneMeteringDraft,
  formatBulbDurationInputValue,
  formatBulbTimerStatus,
  formatExposureEntryModeLabel,
  formatPhotographShutterDisplay,
  getPhotographExposureDraft,
  getPhotographExposureModeAvailability,
  getBtzsZoneChoiceOptions,
  interpolateBtzsSeriesValue,
  parseBulbDurationInput,
  parseDevelopmentTimeTextMinutes,
  removeReciprocity,
  snapApertureChoice,
  snapShutterChoice,
  resolveBtzsProfileSelection,
  resolveExposureChoiceDisplay,
} from "./photoExposure";
import { resolveBtzsProfilePaperEs } from "./btzs/xdf";

const createFilmStock = (overrides: Partial<FilmStock> = {}): FilmStock => ({
  id: "film-1",
  user_id: "user-1",
  name: "HP5+",
  stock_type: "bw",
  reciprocity_p_factor: 1,
  iso: 400,
  process: null,
  created_at: "2026-05-02T00:00:00.000Z",
  ...overrides,
});

const createLens = (overrides: Partial<Lens> = {}): Pick<Lens, "min_f_stop" | "max_f_stop" | "aperture_increment" | "flare_factor"> => ({
  min_f_stop: 5.6,
  max_f_stop: 22,
  aperture_increment: "full",
  flare_factor: 0,
  ...overrides,
});

const createShutterSource = (overrides: Partial<Pick<Lens, "min_shutter_speed_seconds" | "max_shutter_speed_seconds" | "supports_bulb">> = {}): Pick<Lens, "min_shutter_speed_seconds" | "max_shutter_speed_seconds" | "supports_bulb"> => ({
  min_shutter_speed_seconds: 1 / 8000,
  max_shutter_speed_seconds: 1 / 4,
  supports_bulb: false,
  ...overrides,
});

const createFilter = (overrides: Partial<Filter> = {}): Filter => ({
  id: "filter-1",
  user_id: "user-1",
  name: "Yellow",
  code: "Wratten 8",
  filter_factor: 4,
  source: null,
  standard_key: null,
  notes: null,
  can_simulate_bw: false,
  simulation_rgb: "#f05a28",
  simulation_strength: 0.42,
  simulation_brightness_boost: 1,
  applies_to_bw: true,
  applies_to_color: true,
  applies_to_infrared: true,
  applicable_lens_ids: [],
  created_at: "2026-05-02T00:00:00.000Z",
  updated_at: "2026-05-02T00:00:00.000Z",
  ...overrides,
});

const createBtzsProfile = (overrides: Partial<DevelopmentProfile> = {}): DevelopmentProfile => ({
  id: "profile-1",
  userId: "user-1",
  filmStockId: "film-1",
  type: "btzs",
  name: "BTZS N-1",
  developerName: "BTZS Developer",
  dilution: null,
  temperatureText: "20C",
  agitation: null,
  notes: null,
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  filmIso: "400",
  testDate: null,
  curvesText: null,
  flareDensityText: null,
  paperEsText: "Grade 2",
  methodText: null,
  keyValuesText: null,
  rawXdf: {
    versionOrType: "XDF-1",
    displayName: "FP4+ DDX 1+4",
    processLabel: "DDX 1+4.00 @ 68.00F",
    paperES: 1.27,
    reciprocityExpIndex: 2,
    reciprocityGIndex: 1,
    useReciprocity: 1,
  },
  chartData: [BTZS_PROFILE_G_DEV_CHART, BTZS_PROFILE_G_EFS_CHART],
  sourceFiles: null,
  ...overrides,
} as DevelopmentProfile);

const createSimpleProfile = (overrides: Partial<DevelopmentProfile> = {}): DevelopmentProfile => ({
  id: "simple-profile-1",
  userId: "user-1",
  filmStockId: "film-1",
  type: "simple",
  name: "D-76 normal",
  developerName: "D-76",
  dilution: "1+1",
  temperatureText: "20C",
  agitation: null,
  notes: null,
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  timeText: "10:00",
  nMinusTwoPercent: 65,
  nMinusOnePercent: 80,
  nPlusOnePercent: 125,
  nPlusTwoPercent: 160,
  ...overrides,
} as DevelopmentProfile);

describe("photo exposure helpers", () => {
  it("parses and formats bulb durations for the form", () => {
    expect(parseBulbDurationInput("12.5")).toBe(12.5);
    expect(parseBulbDurationInput(" 0 ")).toBeNull();
    expect(formatBulbDurationInputValue(12)).toBe("12");
    expect(formatBulbDurationInputValue(12.25)).toBe("12.25");
  });

  it("hydrates a bulb draft from the photograph response shape", () => {
    expect(getPhotographExposureDraft({
      shutter_speed: "bulb",
      shutter_speed_seconds: 12,
      shutter_mode: "bulb",
      bulb_duration_seconds: 12,
    })).toEqual({
      shutter_speed: "bulb",
      bulb_duration_seconds: "12",
    });

    expect(createEmptyPhotographExposureDraft()).toEqual({
      shutter_speed: "",
      bulb_duration_seconds: "",
    });
    expect(createEmptyPhotographBtzsZoneMeteringDraft().paper_es).toBe("1.0");
    expect(createEmptyPhotographExposureModeDraft().btzs_zone_metering.paper_es).toBe("1.0");
  });

  it("builds structured payloads for bulb and fixed exposures", () => {
    expect(buildPhotographExposurePayload({
      shutter_speed: "bulb",
      bulb_duration_seconds: "12.5",
    })).toEqual({
      payload: {
        shutter_speed: "bulb",
        shutter_speed_seconds: 12.5,
        shutter_mode: "bulb",
        bulb_duration_seconds: 12.5,
      },
      error: null,
    });

    expect(buildPhotographExposurePayload({
      shutter_speed: "1/250",
      bulb_duration_seconds: "",
    })).toEqual({
      payload: {
        shutter_speed: "1/250",
        shutter_speed_seconds: 1 / 250,
        shutter_mode: "fixed",
        bulb_duration_seconds: null,
      },
      error: null,
    });
  });

  it("resolves paper ES from raw XDF before profile text and falls back when unavailable", () => {
    expect(resolveBtzsProfilePaperEs(createBtzsProfile())).toBeCloseTo(1.27);
    expect(resolveBtzsProfilePaperEs(createBtzsProfile({
      rawXdf: null,
      paperEsText: "1.33",
    }))).toBeCloseTo(1.33);
    expect(resolveBtzsProfilePaperEs(createBtzsProfile({
      rawXdf: null,
      paperEsText: "Grade 2",
    }))).toBeNull();
  });

  it("builds the manual exposure write payload and preserves reciprocity guidance", () => {
    const result = buildPhotographExposureWritePayload({
      exposure_entry_mode: "manual",
      aperture: "f/8",
      shutter_speed: "2",
      bulb_duration_seconds: "",
      filter_ids: [],
      filters: [],
      film_stock: createFilmStock({ reciprocity_p_factor: 1.5 }),
      lens: createLens(),
      shutter_source: createShutterSource(),
      zone_metering: createEmptyPhotographExposureModeDraft().zone_metering,
      btzs_zone_metering: createEmptyPhotographExposureModeDraft().btzs_zone_metering,
      btzs_profiles: [],
    });

    expect(result).toEqual({
      payload: {
        aperture: "f/8",
        shutter_speed: "2",
        shutter_speed_seconds: 2,
        shutter_mode: "fixed",
        bulb_duration_seconds: null,
        exposure_entry_mode: "manual",
        exposure_details: null,
      },
      error: null,
      warnings: ["Reciprocity correction may be required."],
    });
  });

  it("builds the zone metering write payload without double-counting selected filters", () => {
    const selectedFilters = [createFilter({ id: "filter-1", filter_factor: 4 })];
    const baseDraft = createEmptyPhotographExposureModeDraft();
    const withMeteredFilters = buildPhotographExposureWritePayload({
      exposure_entry_mode: "zone-metering",
      aperture: "f/8",
      shutter_speed: "",
      bulb_duration_seconds: "",
      filter_ids: ["filter-1"],
      filters: selectedFilters,
      film_stock: createFilmStock({ reciprocity_p_factor: 1 }),
      lens: createLens(),
      shutter_source: createShutterSource(),
      zone_metering: {
        ...baseDraft.zone_metering,
        meter_ev: "10",
        meter_iso: "100",
        working_iso: "100",
        target_zone: "5",
        compensation_stops: "0",
        precedence: "aperture",
        reading_through_selected_filters: true,
      },
      btzs_zone_metering: baseDraft.btzs_zone_metering,
      btzs_profiles: [],
    });

    const withoutMeteredFilters = buildPhotographExposureWritePayload({
      exposure_entry_mode: "zone-metering",
      aperture: "f/8",
      shutter_speed: "",
      bulb_duration_seconds: "",
      filter_ids: ["filter-1"],
      filters: selectedFilters,
      film_stock: createFilmStock({ reciprocity_p_factor: 1 }),
      lens: createLens(),
      shutter_source: createShutterSource(),
      zone_metering: {
        ...baseDraft.zone_metering,
        meter_ev: "10",
        meter_iso: "100",
        working_iso: "100",
        target_zone: "5",
        compensation_stops: "0",
        precedence: "aperture",
        reading_through_selected_filters: false,
      },
      btzs_zone_metering: baseDraft.btzs_zone_metering,
      btzs_profiles: [],
    });

    expect(withMeteredFilters.error).toBeNull();
    expect(withMeteredFilters.payload.exposure_entry_mode).toBe("zone-metering");
    expect(withMeteredFilters.payload.shutter_speed_seconds).toBeCloseTo(1 / 60);
    expect((withMeteredFilters.payload.exposure_details as any).zoneMetering.filterStops).toBe(0);
    expect((withMeteredFilters.payload.exposure_details as any).zoneMetering.heldAperture).toBe("f/8");
    expect((withMeteredFilters.payload.exposure_details as any).zoneMetering.idealShutterSeconds).toBeCloseTo(1 / 64);
    expect((withMeteredFilters.payload.exposure_details as any).zoneMetering.shutterChoice.label).toBe("1/60");
    expect(withMeteredFilters.warnings.some((warning) => warning.includes("Rounded"))).toBe(false);

    expect(withoutMeteredFilters.error).toBeNull();
    expect(withoutMeteredFilters.payload.shutter_speed_seconds).toBeCloseTo(1 / 15);
    expect((withoutMeteredFilters.payload.exposure_details as any).zoneMetering.filterStops).toBeCloseTo(2);
  });

  it("builds cell camera metering as a zone-metering payload with source metadata", () => {
    const baseDraft = createEmptyPhotographExposureModeDraft();
    const result = buildPhotographExposureWritePayload({
      exposure_entry_mode: "cell-camera",
      aperture: "f/8",
      shutter_speed: "",
      bulb_duration_seconds: "",
      filter_ids: [],
      filters: [],
      film_stock: createFilmStock({ reciprocity_p_factor: 1 }),
      lens: createLens(),
      shutter_source: createShutterSource(),
      zone_metering: {
        ...baseDraft.zone_metering,
        cell_camera_ev: "10",
        cell_camera_correction_stops: "1",
        target_zone: "5",
        precedence: "aperture",
      },
      btzs_zone_metering: baseDraft.btzs_zone_metering,
      btzs_profiles: [],
    });

    expect(result.error).toBeNull();
    expect(result.payload.exposure_entry_mode).toBe("zone-metering");
    const details = (result.payload.exposure_details as any).zoneMetering;
    expect(details.meteringSource).toBe("cell-camera");
    expect(details.cellCameraEV).toBe(10);
    expect(details.cellCameraCorrectionStops).toBe(1);
    expect(details.meterEV).toBe(9);
  });

  it("builds cell and single spot metering without selecting a development profile", () => {
    const baseDraft = createEmptyPhotographExposureModeDraft();
    const profiles = [createSimpleProfile()];
    const singleSpot = buildPhotographExposureWritePayload({
      exposure_entry_mode: "zone-metering",
      aperture: "f/8",
      shutter_speed: "",
      bulb_duration_seconds: "",
      filter_ids: [],
      filters: [],
      film_stock: createFilmStock({ reciprocity_p_factor: 1 }),
      lens: createLens(),
      shutter_source: createShutterSource(),
      zone_metering: {
        ...baseDraft.zone_metering,
        meter_ev: "10",
        target_zone: "5",
        precedence: "aperture",
      },
      btzs_zone_metering: {
        ...baseDraft.btzs_zone_metering,
        profile_id: "",
      },
      btzs_profiles: profiles,
    });
    const cell = buildPhotographExposureWritePayload({
      exposure_entry_mode: "cell-camera",
      aperture: "f/8",
      shutter_speed: "",
      bulb_duration_seconds: "",
      filter_ids: [],
      filters: [],
      film_stock: createFilmStock({ reciprocity_p_factor: 1 }),
      lens: createLens(),
      shutter_source: createShutterSource(),
      zone_metering: {
        ...baseDraft.zone_metering,
        cell_camera_ev: "10",
        cell_camera_correction_stops: "0",
        target_zone: "5",
        precedence: "aperture",
      },
      btzs_zone_metering: {
        ...baseDraft.btzs_zone_metering,
        profile_id: "",
      },
      btzs_profiles: profiles,
    });

    expect(singleSpot.error).toBeNull();
    expect((singleSpot.payload.exposure_details as any).zoneMetering.profileId).toBeNull();
    expect((singleSpot.payload.exposure_details as any).zoneMetering.developmentTimeMinutes).toBeNull();
    expect(cell.error).toBeNull();
    expect((cell.payload.exposure_details as any).zoneMetering.profileId).toBeNull();
    expect((cell.payload.exposure_details as any).zoneMetering.developmentTimeMinutes).toBeNull();
  });

  it("builds the zone metering write payload when holding shutter and removing reciprocity", () => {
    const result = buildPhotographExposureWritePayload({
      exposure_entry_mode: "zone-metering",
      aperture: "f/11",
      shutter_speed: "4",
      bulb_duration_seconds: "",
      filter_ids: [],
      filters: [],
      film_stock: createFilmStock({ reciprocity_p_factor: 1.5 }),
      lens: createLens(),
      shutter_source: createShutterSource({ max_shutter_speed_seconds: 30 }),
      zone_metering: {
        ...createEmptyPhotographExposureModeDraft().zone_metering,
        meter_ev: "5",
        meter_iso: "100",
        working_iso: "100",
        target_zone: "5",
        compensation_stops: "0",
        precedence: "shutter",
        reading_through_selected_filters: false,
      },
      btzs_zone_metering: createEmptyPhotographExposureModeDraft().btzs_zone_metering,
      btzs_profiles: [],
    });

    expect(result.error).toBeNull();
    expect(result.payload.exposure_entry_mode).toBe("zone-metering");
    expect(result.payload.aperture).toBe("f/16");
    expect(result.payload.shutter_speed_seconds).toBe(4);
    expect((result.payload.exposure_details as any).zoneMetering.heldShutterSpeed).toBe("4");
    expect((result.payload.exposure_details as any).zoneMetering.idealAperture).toBeCloseTo(15.69312812957464);
    expect((result.payload.exposure_details as any).zoneMetering.apertureChoice.label).toBe("f/16");
    expect((result.payload.exposure_details as any).zoneMetering.reciprocityApplied).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("builds the BTZS write payload and respects the selected filter toggle", () => {
    const profile = createBtzsProfile();
    const selectedFilters = [createFilter({ id: "filter-1", filter_factor: 4 })];
    const draft = createEmptyPhotographExposureModeDraft();
    const result = buildPhotographExposureWritePayload({
      exposure_entry_mode: "btzs-zone-metering",
      aperture: "f/8",
      shutter_speed: "",
      bulb_duration_seconds: "",
      filter_ids: ["filter-1"],
      filters: selectedFilters,
      film_stock: createFilmStock({ reciprocity_p_factor: 1 }),
      lens: createLens(),
      shutter_source: createShutterSource(),
      zone_metering: draft.zone_metering,
      btzs_zone_metering: {
        ...draft.btzs_zone_metering,
        profile_id: "",
        meter_ev: "10",
        meter_iso: "100",
        working_iso: "100",
        low_ev: "10",
        high_ev: "13.714285714285714",
        low_zone: "3",
        high_zone: "7",
        paper_es: "1.0",
        flare_factor: "0",
        compensation_stops: "0",
        precedence: "aperture",
        reading_through_selected_filters: true,
      },
      btzs_profiles: [profile],
    });

    expect(result.error).toBeNull();
    expect(result.payload.exposure_entry_mode).toBe("btzs-zone-metering");
    expect(result.payload.shutter_speed_seconds).toBeCloseTo(1 / 125);
    expect((result.payload.exposure_details as any).btzsZoneMetering.profileId).toBe(profile.id);
    expect((result.payload.exposure_details as any).btzsZoneMetering.meterISO).toBe(100);
    expect((result.payload.exposure_details as any).btzsZoneMetering.workingISO).toBeCloseTo(200);
    expect((result.payload.exposure_details as any).btzsZoneMetering.heldAperture).toBe("f/8");
    expect((result.payload.exposure_details as any).btzsZoneMetering.idealShutterSeconds).toBeCloseTo(1 / 128);
    expect((result.payload.exposure_details as any).btzsZoneMetering.requiredG).toBeCloseTo(BTZS_PROFILE_LOW_TARGET_G);
    expect((result.payload.exposure_details as any).btzsZoneMetering.developmentTimeMinutes).toBeCloseTo(5.5);
    expect((result.payload.exposure_details as any).btzsZoneMetering.paperEs).toBeCloseTo(1);
    expect((result.payload.exposure_details as any).btzsZoneMetering.filterStops).toBe(0);
    expect((result.payload.exposure_details as any).btzsZoneMetering.shutterChoice.label).toBe("1/125");
    expect(result.warnings.some((warning) => warning.includes("Rounded"))).toBe(false);
  });

  it("builds the BTZS write payload when holding shutter and preserving BTZS target EV details", () => {
    const profile = createBtzsProfile();
    const result = buildPhotographExposureWritePayload({
      exposure_entry_mode: "btzs-zone-metering",
      aperture: "f/11",
      shutter_speed: "4",
      bulb_duration_seconds: "",
      filter_ids: [],
      filters: [],
      film_stock: createFilmStock({ reciprocity_p_factor: 1.5 }),
      lens: createLens(),
      shutter_source: createShutterSource({ max_shutter_speed_seconds: 30 }),
      zone_metering: createEmptyPhotographExposureModeDraft().zone_metering,
      btzs_zone_metering: {
        ...createEmptyPhotographExposureModeDraft().btzs_zone_metering,
        profile_id: "",
        meter_ev: "2",
        meter_iso: "100",
        working_iso: "100",
        low_ev: "2",
        high_ev: "5.714285714285714",
        low_zone: "3",
        high_zone: "7",
        paper_es: "1.0",
        flare_factor: "0",
        compensation_stops: "0",
        precedence: "shutter",
        reading_through_selected_filters: false,
      },
      btzs_profiles: [profile],
    });

    expect(result.error).toBeNull();
    expect(result.payload.exposure_entry_mode).toBe("btzs-zone-metering");
    expect(result.payload.aperture).toBe("f/8");
    expect(result.payload.shutter_speed_seconds).toBe(4);
    expect((result.payload.exposure_details as any).btzsZoneMetering.heldShutterSpeed).toBe("4");
    expect((result.payload.exposure_details as any).btzsZoneMetering.idealAperture).toBeCloseTo(7.84656406478732);
    expect((result.payload.exposure_details as any).btzsZoneMetering.apertureChoice.label).toBe("f/8");
    expect((result.payload.exposure_details as any).btzsZoneMetering.targetEVBeforeCompensation).toBe(5);
    expect((result.payload.exposure_details as any).btzsZoneMetering.targetEVAfterCompensation).toBe(5);
    expect((result.payload.exposure_details as any).btzsZoneMetering.developmentTimeMinutes).toBeCloseTo(5.5);
    expect((result.payload.exposure_details as any).btzsZoneMetering.effectiveFilmSpeed).toBeCloseTo(200);
    expect((result.payload.exposure_details as any).btzsZoneMetering.reciprocityApplied).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("falls back to a neutral Paper ES when the selected profile has no numeric Paper ES", () => {
    const profile = createBtzsProfile({
      rawXdf: null,
      paperEsText: "Grade 2",
      flareDensityText: null,
    });
    const draft = createEmptyPhotographExposureModeDraft();
    const result = buildPhotographExposureWritePayload({
      exposure_entry_mode: "btzs-zone-metering",
      aperture: "f/8",
      shutter_speed: "",
      bulb_duration_seconds: "",
      filter_ids: [],
      filters: [],
      film_stock: createFilmStock({ reciprocity_p_factor: 1 }),
      lens: createLens(),
      shutter_source: createShutterSource(),
      zone_metering: draft.zone_metering,
      btzs_zone_metering: {
        ...draft.btzs_zone_metering,
        profile_id: "",
        meter_ev: "10",
        meter_iso: "100",
        working_iso: "100",
        low_ev: "10",
        high_ev: "13.5",
        low_zone: "3",
        high_zone: "7",
        paper_es: "",
        compensation_stops: "0",
        precedence: "aperture",
        reading_through_selected_filters: false,
      },
      btzs_profiles: [profile],
    });

    expect(result.error).toBeNull();
    expect((result.payload.exposure_details as any).btzsZoneMetering.paperEs).toBe(1);
  });

  it("resolves BTZS profile selection and keeps single profiles auto-selected", () => {
    const singleProfile = createBtzsProfile();
    const extraProfile = createBtzsProfile({ id: "profile-2", name: "BTZS N-2" });

    expect(resolveBtzsProfileSelection([], "")).toEqual({
      profiles: [],
      selectedProfile: null,
      selectedProfileId: "",
      mode: "none",
    });
    expect(resolveBtzsProfileSelection([singleProfile], "")).toMatchObject({
      selectedProfile: singleProfile,
      selectedProfileId: singleProfile.id,
      mode: "single",
    });
    expect(resolveBtzsProfileSelection([singleProfile, extraProfile], singleProfile.id)).toMatchObject({
      selectedProfile: singleProfile,
      selectedProfileId: singleProfile.id,
      mode: "multiple",
    });
    expect(resolveBtzsProfileSelection([singleProfile, extraProfile], "missing")).toMatchObject({
      selectedProfile: null,
      selectedProfileId: "",
      mode: "multiple",
    });
  });

  it("lists common BTZS zone choices and preserves custom selections", () => {
    const labels = getBtzsZoneChoiceOptions("7.5").map((choice) => choice.label);
    expect(labels).toEqual(expect.arrayContaining([
      "Zone 2.5",
      "Zone 3",
      "Zone 7",
      "Zone 7.5",
    ]));
    expect(getBtzsZoneChoiceOptions("10.5").map((choice) => choice.value)).toContain("10.5");
  });

  it("shows ideal and snapped exposure choices with rounding warnings", () => {
    const display = resolveExposureChoiceDisplay(
      {
        aperture: 7.1,
        rawShutterSeconds: 1 / 97,
        finalShutterSeconds: 1 / 97,
        reciprocityApplied: false,
        warnings: ["BTZS warning"],
      },
      createLens({ aperture_increment: "full" }),
      {
        min_shutter_speed_seconds: 1 / 250,
        max_shutter_speed_seconds: 1 / 60,
        supports_bulb: false,
      },
    );

    expect(display).not.toBeNull();
    expect(display).toMatchObject({
      idealAperture: "f/7.1",
      idealShutter: "1/97",
      rawShutterSeconds: 1 / 97,
      finalShutterSeconds: 1 / 97,
      reciprocityApplied: false,
      warnings: expect.arrayContaining(["BTZS warning"]),
      finalFields: {
        aperture: "f/8",
        shutter_speed: "1/125",
        shutter_mode: "fixed",
        bulb_duration_seconds: null,
      },
    });
    expect(display?.warnings.some((warning) => warning.includes("Rounded"))).toBe(false);
    expect(display?.apertureChoice?.label).toBe("f/8");
    expect(display?.shutterChoice?.label).toBe("1/125");
  });

  it("formats held-aperture and held-shutter metering previews", () => {
    const heldApertureCalculation = calculateZoneMeteringExposure({
      meterEv: 3,
      meterIso: 100,
      workingIso: 100,
      targetZone: 5,
      aperture: 4,
      precedence: "aperture",
      reciprocityPFactor: 1.5,
    });
    const heldApertureDisplay = resolveExposureChoiceDisplay(
      heldApertureCalculation,
      createLens({ min_f_stop: 4, max_f_stop: 22, aperture_increment: "full" }),
      createShutterSource({ max_shutter_speed_seconds: 30 }),
    );
    const heldAperturePreview = buildMeteredExposurePreview("aperture", heldApertureDisplay, "f/4");

    expect(heldAperturePreview).toMatchObject({
      cards: [
        { label: "Held aperture", value: "f/4" },
        { label: "Metered shutter", value: "2s" },
        { label: "With reciprocity", value: "4.1962s", tone: "accent" },
        { label: "Closest supported shutter", value: "4" },
        { label: "Exposure error", value: "-0.07 stops" },
      ],
    });
    expect(heldAperturePreview?.warnings.some((warning) => warning.includes("Rounded"))).toBe(false);

    const heldShutterCalculation = calculateZoneMeteringExposure({
      meterEv: 5,
      meterIso: 100,
      workingIso: 100,
      targetZone: 5,
      shutterSeconds: 4,
      precedence: "shutter",
      reciprocityPFactor: 2,
    });
    const heldShutterDisplay = resolveExposureChoiceDisplay(
      heldShutterCalculation,
      createLens(),
      createShutterSource({ max_shutter_speed_seconds: 30 }),
    );
    const heldShutterPreview = buildMeteredExposurePreview("shutter", heldShutterDisplay, "4");

    expect(heldShutterPreview).toMatchObject({
      cards: [
        { label: "Held shutter", value: "4" },
        { label: "Metered shutter", value: "1.2361s" },
        { label: "With reciprocity", value: "4s" },
        { label: "Ideal aperture", value: "f/6.289", tone: "accent" },
        { label: "Closest supported aperture", value: "f/5.6" },
        { label: "Exposure error", value: "+0.33 stops" },
      ],
      warnings: [],
    });
  });

  it("keeps ideal shutter visible in bulb-supported metering previews", () => {
    const longExposureDisplay = resolveExposureChoiceDisplay(
      {
        aperture: 4,
        rawShutterSeconds: 6.8,
        finalShutterSeconds: 6.8,
        reciprocityApplied: false,
        warnings: [],
      },
      createLens({ min_f_stop: 4, max_f_stop: 22, aperture_increment: "full" }),
      createShutterSource({ max_shutter_speed_seconds: 1 / 2, supports_bulb: true }),
    );

    expect(longExposureDisplay).toMatchObject({
      idealShutter: "6.8s",
      shutterChoice: {
        value: "bulb",
        label: "BULB",
        seconds: null,
      },
      finalFields: {
        aperture: "f/4",
        shutter_speed: "bulb",
        shutter_mode: "bulb",
        bulb_duration_seconds: 6.8,
      },
    });
    expect(longExposureDisplay?.warnings).toEqual([]);

    const longExposurePreview = buildMeteredExposurePreview("aperture", longExposureDisplay, "f/4");
    expect(longExposurePreview).toMatchObject({
      cards: [
        { label: "Held aperture", value: "f/4" },
        { label: "Ideal shutter", value: "6.8s", tone: "accent" },
        { label: "Closest supported shutter", value: "BULB" },
        { label: "Exposure error", value: "—" },
      ],
      warnings: [],
    });
  });

  it("warns about uncommon BTZS zone placements", () => {
    const result = calculateBtzsExposure({
      lowEv: 10,
      highEv: 13.5,
      lowZone: 2.25,
      highZone: 7.25,
      paperEs: 1.17,
      meterIso: 100,
      chartData: [BTZS_G_DEV_CHART, BTZS_G_EFS_CHART],
      aperture: 8,
      precedence: "aperture",
    });

    expect(result.warnings).toEqual(expect.arrayContaining([
      "Low zone uses an uncommon Zone System placement.",
      "High zone uses an uncommon Zone System placement.",
    ]));
  });

  it("calculates simple profile zone-system development from low exposure and high placement", () => {
    expect(parseDevelopmentTimeTextMinutes("10:30")).toBeCloseTo(10.5, 12);
    expect(parseDevelopmentTimeTextMinutes("12 min + 30 sec")).toBeCloseTo(12.5, 12);

    const result = calculateSimpleZoneSystemExposure({
      lowEv: 10,
      lowZone: 3,
      highEv: 15,
      highZone: 7,
      paperEs: 1,
      meterIso: 100,
      workingIso: 100,
      baseDevelopmentMinutes: parseDevelopmentTimeTextMinutes("10:00"),
      adjustmentCurve: {
        nMinusTwoPercent: 65,
        nMinusOnePercent: 80,
        nPlusOnePercent: 125,
        nPlusTwoPercent: 160,
      },
      aperture: 8,
      precedence: "aperture",
    });

    expect(result.error).toBeUndefined();
    expect(result.developmentAdjustmentStops).toBe(-1);
    expect(result.developmentPercent).toBe(80);
    expect(result.developmentTimeMinutes).toBeCloseTo(8, 12);
    expect(result.effectiveFilmSpeed).toBe(100);
    expect(result.exposure?.rawShutterSeconds).toBeCloseTo(1 / 64, 12);
  });

  it("reports exposure mode availability from the selected film and BTZS profile set", () => {
    expect(getPhotographExposureModeAvailability(createFilmStock({ stock_type: "bw" }), [])).toEqual({
      zoneMeteringEnabled: true,
      zoneMeteringReason: null,
      btzsZoneMeteringEnabled: false,
      btzsZoneMeteringReason: "Zone Metering requires a development profile for this film.",
    });

    expect(getPhotographExposureModeAvailability(createFilmStock({ stock_type: "bw" }), [createSimpleProfile()])).toEqual({
      zoneMeteringEnabled: true,
      zoneMeteringReason: null,
      btzsZoneMeteringEnabled: true,
      btzsZoneMeteringReason: null,
    });

    expect(getPhotographExposureModeAvailability(createFilmStock({ stock_type: "color_negative" }), [createBtzsProfile()])).toEqual({
      zoneMeteringEnabled: false,
      zoneMeteringReason: "Single Spot is available for B&W negative film.",
      btzsZoneMeteringEnabled: false,
      btzsZoneMeteringReason: "Zone Metering requires a development profile for this film.",
    });
  });

  it("formats bulb exposures for list and detail views", () => {
    expect(formatPhotographShutterDisplay({
      shutter_speed: "bulb",
      shutter_speed_seconds: 12,
      shutter_mode: "bulb",
      bulb_duration_seconds: 12,
    })).toBe("Bulb · 12s");

    expect(formatPhotographShutterDisplay({
      shutter_speed: "1/250",
      shutter_speed_seconds: 0.004,
      shutter_mode: "fixed",
      bulb_duration_seconds: null,
    })).toBe("1/250");
  });

  it("describes timer states clearly", () => {
    expect(formatBulbTimerStatus({
      phase: "idle",
      durationSeconds: null,
      precountRemaining: null,
      exposureRemainingSeconds: null,
    })).toEqual({
      title: "Add duration",
      detail: "Enter seconds to enable the timer.",
    });

    expect(formatBulbTimerStatus({
      phase: "idle",
      durationSeconds: 12,
      precountRemaining: null,
      exposureRemainingSeconds: null,
    })).toEqual({
      title: "12s",
      detail: "Start gives you a 3 second countdown before the exposure.",
    });

    expect(formatBulbTimerStatus({
      phase: "precount",
      durationSeconds: 12,
      precountRemaining: 3,
      exposureRemainingSeconds: null,
    })).toEqual({
      title: "3s",
      detail: "Starting in 3 seconds.",
    });

    expect(formatBulbTimerStatus({
      phase: "exposing",
      durationSeconds: 12,
      precountRemaining: null,
      exposureRemainingSeconds: 11.5,
    })).toEqual({
      title: "11.500s",
      detail: "Stop to cancel.",
    });

    expect(formatBulbTimerStatus({
      phase: "complete",
      durationSeconds: 12,
      precountRemaining: null,
      exposureRemainingSeconds: null,
    })).toEqual({
      title: "Exposure complete",
      detail: "",
    });
  });

  it("formats exposure entry modes and skips manual summaries", () => {
    expect(formatExposureEntryModeLabel("manual")).toBe("Manual");
    expect(formatExposureEntryModeLabel("zone-metering")).toBe("Single Spot");
    expect(formatExposureEntryModeLabel("cell-camera")).toBe("Cell Camera");
    expect(formatExposureEntryModeLabel("btzs-zone-metering")).toBe("Zone Metering");
    expect(formatExposureEntryModeLabel(undefined)).toBe("Unknown");

    expect(buildPhotographExposureSummary({
      exposure_entry_mode: "manual",
      exposure_details: null,
    })).toBeNull();
  });

  it("formats stored zone metering summaries from persisted detail data", () => {
    expect(buildPhotographExposureSummary({
      exposure_entry_mode: "zone-metering",
      exposure_details: {
        zoneMetering: {
          meterEV: 10,
          meterISO: 100,
          workingISO: 200,
          targetZone: 3,
          zoneAdjustedEV: 13,
          targetEV: 12,
          totalCompensationStops: 1,
          heldAperture: "f/8",
          aperture: "f/8",
          shutterSpeed: "1/128",
          rawShutterSpeedSeconds: 1 / 128,
          finalShutterSpeedSeconds: 1 / 128,
          shutterChoice: {
            value: "1/128",
            label: "1/128",
            seconds: 1 / 128,
            stopError: 0,
            warning: null,
          },
          shutterMode: "fixed",
          bulbDurationSeconds: null,
          reciprocityApplied: false,
          warnings: [],
        },
      },
    })).toEqual({
      rows: [
        { label: "Meter EV / ISO", value: "EV 10.00 · ISO 100" },
        { label: "Target zone", value: "Zone 3" },
        { label: "Working ISO / EI", value: "ISO/EI 200" },
        { label: "Target EV", value: "12.00" },
        { label: "Total compensation", value: "+1 stops" },
        { label: "Held aperture", value: "f/8" },
        { label: "Ideal shutter", value: "1/128" },
        { label: "Closest supported shutter", value: "1/128" },
        { label: "Final aperture", value: "f/8" },
        { label: "Final shutter", value: "1/128" },
        { label: "Reciprocity", value: "Not applied" },
      ],
      warnings: [],
    });
  });

  it("formats stored zone metering summaries for held shutter mode", () => {
    expect(buildPhotographExposureSummary({
      exposure_entry_mode: "zone-metering",
      exposure_details: {
        zoneMetering: {
          meterEV: 5,
          meterISO: 100,
          workingISO: 100,
          targetZone: 5,
          zoneAdjustedEV: 5,
          targetEV: 5,
          totalCompensationStops: 0,
          heldShutterSpeed: "4",
          idealAperture: 8,
          aperture: "f/8",
          shutterSpeed: "4",
          rawShutterSpeedSeconds: 4,
          finalShutterSpeedSeconds: 4,
          apertureChoice: {
            value: "f/8",
            label: "f/8",
            aperture: 8,
            stopError: 0,
            warning: null,
          },
          shutterMode: "fixed",
          bulbDurationSeconds: null,
          reciprocityApplied: true,
          warnings: [],
        },
      },
    })).toEqual({
      rows: [
        { label: "Meter EV / ISO", value: "EV 5.00 · ISO 100" },
        { label: "Target zone", value: "Zone 5" },
        { label: "Working ISO / EI", value: "ISO/EI 100" },
        { label: "Target EV", value: "5.00" },
        { label: "Total compensation", value: "0 stops" },
        { label: "Held shutter", value: "4" },
        { label: "Ideal aperture", value: "f/8" },
        { label: "Closest supported aperture", value: "f/8" },
        { label: "Final aperture", value: "f/8" },
        { label: "Final shutter", value: "4" },
        { label: "Reciprocity", value: "Applied" },
      ],
      warnings: [],
    });
  });

  it("formats stored zone metering summaries with reciprocity before/after values", () => {
    expect(buildPhotographExposureSummary({
      exposure_entry_mode: "zone-metering",
      exposure_details: {
        zoneMetering: {
          meterEV: 10,
          meterISO: 100,
          workingISO: 100,
          targetZone: 5,
          zoneAdjustedEV: 10,
          targetEV: 10,
          totalCompensationStops: 0,
          aperture: "f/4",
          shutterSpeed: "bulb",
          rawShutterSpeedSeconds: 2,
          finalShutterSpeedSeconds: 2.8284271247461903,
          shutterMode: "bulb",
          bulbDurationSeconds: 2.8284271247461903,
          reciprocityApplied: true,
          warnings: [],
        },
      },
    })).toEqual({
      rows: [
        { label: "Meter EV / ISO", value: "EV 10.00 · ISO 100" },
        { label: "Target zone", value: "Zone 5" },
        { label: "Working ISO / EI", value: "ISO/EI 100" },
        { label: "Target EV", value: "10.00" },
        { label: "Total compensation", value: "0 stops" },
        { label: "Metered shutter", value: "2s" },
        { label: "With reciprocity", value: "2.8284s" },
        { label: "Aperture", value: "f/4" },
        { label: "Reciprocity", value: "Applied" },
      ],
      warnings: [],
    });
  });

  it("formats stored BTZS zone metering summaries and preserves warnings", () => {
    expect(buildPhotographExposureSummary({
      exposure_entry_mode: "btzs-zone-metering",
      exposure_details: {
        btzsZoneMetering: {
          profileId: "profile-123",
          profileName: "N-1 Portrait",
          lowEV: 10,
          lowZone: 3,
          highEV: 13.5,
          highZone: 7,
          evRange: 3.5,
          zoneRange: 4,
          sbr: 6.5,
          paperEs: 1.17,
          requiredG: 0.6,
          effectiveFilmSpeed: 200,
          developmentTimeMinutes: 6.5,
          targetEVBeforeCompensation: 13,
          targetEVAfterCompensation: 12,
          heldAperture: "f/8",
          aperture: "f/8",
          shutterSpeed: "1/128",
          rawShutterSpeedSeconds: 1 / 128,
          finalShutterSpeedSeconds: 1 / 128,
          shutterChoice: {
            value: "1/128",
            label: "1/128",
            seconds: 1 / 128,
            stopError: 0,
            warning: null,
          },
          shutterMode: "fixed",
          bulbDurationSeconds: null,
          reciprocityApplied: false,
          warnings: [
            "Average G development time data was unavailable; using SBR fallback.",
          ],
        },
      },
    })).toEqual({
      rows: [
        { label: "Profile", value: "N-1 Portrait" },
        { label: "Low EV / Zone", value: "EV 10.00 · Zone 3" },
        { label: "High EV / Zone", value: "EV 13.50 · Zone 7" },
        { label: "EV range", value: "3.50" },
        { label: "Zone range", value: "4" },
        { label: "SBR", value: "6.5" },
        { label: "Paper ES", value: "1.17" },
        { label: "Required G", value: "0.60" },
        { label: "EFS", value: "200" },
        { label: "Development time", value: "6:30" },
        { label: "Target EV before compensation", value: "13.00" },
        { label: "Target EV after compensation", value: "12.00" },
        { label: "Held aperture", value: "f/8" },
        { label: "Ideal shutter", value: "1/128" },
        { label: "Closest supported shutter", value: "1/128" },
        { label: "Final aperture", value: "f/8" },
        { label: "Final shutter", value: "1/128" },
        { label: "Reciprocity", value: "Not applied" },
      ],
      warnings: [
        "Average G development time data was unavailable; using SBR fallback.",
      ],
    });
  });

  it("formats stored BTZS zone metering summaries with reciprocity before/after values", () => {
    expect(buildPhotographExposureSummary({
      exposure_entry_mode: "btzs-zone-metering",
      exposure_details: {
        btzsZoneMetering: {
          profileId: "profile-123",
          profileName: "N-1 Portrait",
          lowEV: 10,
          lowZone: 3,
          highEV: 13.5,
          highZone: 7,
          evRange: 3.5,
          zoneRange: 4,
          sbr: 6.5,
          paperEs: 1.17,
          requiredG: 0.6,
          effectiveFilmSpeed: 200,
          developmentTimeMinutes: 6.5,
          targetEVBeforeCompensation: 13,
          targetEVAfterCompensation: 12,
          aperture: "f/4",
          shutterSpeed: "bulb",
          rawShutterSpeedSeconds: 2,
          finalShutterSpeedSeconds: 2.8284271247461903,
          shutterMode: "bulb",
          bulbDurationSeconds: 2.8284271247461903,
          reciprocityApplied: true,
          warnings: [],
        },
      },
    })).toEqual({
      rows: [
        { label: "Profile", value: "N-1 Portrait" },
        { label: "Low EV / Zone", value: "EV 10.00 · Zone 3" },
        { label: "High EV / Zone", value: "EV 13.50 · Zone 7" },
        { label: "EV range", value: "3.50" },
        { label: "Zone range", value: "4" },
        { label: "SBR", value: "6.5" },
        { label: "Paper ES", value: "1.17" },
        { label: "Required G", value: "0.60" },
        { label: "EFS", value: "200" },
        { label: "Development time", value: "6:30" },
        { label: "Target EV before compensation", value: "13.00" },
        { label: "Target EV after compensation", value: "12.00" },
        { label: "Metered shutter", value: "2s" },
        { label: "With reciprocity", value: "2.8284s" },
        { label: "Aperture", value: "f/4" },
        { label: "Reciprocity", value: "Applied" },
      ],
      warnings: [],
    });
  });

  it("falls back to Unknown profile when the stored BTZS profile name is missing", () => {
    expect(buildPhotographExposureSummary({
      exposure_entry_mode: "btzs-zone-metering",
      exposure_details: {
        btzsZoneMetering: {
          profileId: "profile-123",
          profileName: "   ",
          lowEV: 10,
          lowZone: 3,
          highEV: 13.5,
          highZone: 7,
          evRange: 3.5,
          zoneRange: 4,
          sbr: 6.5,
          paperEs: 1.17,
          requiredG: 0.6,
          effectiveFilmSpeed: 200,
          developmentTimeMinutes: 6.5,
          targetEVBeforeCompensation: 13,
          targetEVAfterCompensation: 12,
          heldAperture: "f/8",
          aperture: "f/8",
          shutterSpeed: "1/128",
          rawShutterSpeedSeconds: 1 / 128,
          finalShutterSpeedSeconds: 1 / 128,
          shutterChoice: {
            value: "1/128",
            label: "1/128",
            seconds: 1 / 128,
            stopError: 0,
            warning: null,
          },
          shutterMode: "fixed",
          bulbDurationSeconds: null,
          reciprocityApplied: false,
          warnings: [],
        },
      },
    })).toEqual({
      rows: [
        { label: "Profile", value: "Unknown profile" },
        { label: "Low EV / Zone", value: "EV 10.00 · Zone 3" },
        { label: "High EV / Zone", value: "EV 13.50 · Zone 7" },
        { label: "EV range", value: "3.50" },
        { label: "Zone range", value: "4" },
        { label: "SBR", value: "6.5" },
        { label: "Paper ES", value: "1.17" },
        { label: "Required G", value: "0.60" },
        { label: "EFS", value: "200" },
        { label: "Development time", value: "6:30" },
        { label: "Target EV before compensation", value: "13.00" },
        { label: "Target EV after compensation", value: "12.00" },
        { label: "Held aperture", value: "f/8" },
        { label: "Ideal shutter", value: "1/128" },
        { label: "Closest supported shutter", value: "1/128" },
        { label: "Final aperture", value: "f/8" },
        { label: "Final shutter", value: "1/128" },
        { label: "Reciprocity", value: "Not applied" },
      ],
      warnings: [],
    });
  });

  it("degrades gracefully when stored exposure details are partial", () => {
    const summary = buildPhotographExposureSummary({
      exposure_entry_mode: "zone-metering",
      exposure_details: {
        zoneMetering: {
          meterEV: 10,
          meterISO: 100,
          workingISO: 100,
          targetZone: 5,
          zoneAdjustedEV: 10,
          targetEV: 10,
          totalCompensationStops: 0,
          aperture: null,
          shutterSpeed: null,
          rawShutterSpeedSeconds: null,
          finalShutterSpeedSeconds: null,
          shutterMode: "fixed",
          bulbDurationSeconds: null,
          reciprocityApplied: false,
          warnings: [],
        } as any,
      },
    });

    expect(summary).toEqual({
      rows: [
        { label: "Meter EV / ISO", value: "EV 10.00 · ISO 100" },
        { label: "Target zone", value: "Zone 5" },
        { label: "Working ISO / EI", value: "ISO/EI 100" },
        { label: "Target EV", value: "10.00" },
        { label: "Total compensation", value: "0 stops" },
        { label: "Raw shutter", value: "—" },
        { label: "Final shutter", value: "—" },
        { label: "Aperture", value: "—" },
        { label: "Reciprocity", value: "Not applied" },
      ],
      warnings: [],
    });
  });
});

const BTZS_G_DEV_CHART: BTZSChartData = {
  title: "Average G vs Development Time",
  xAxisLabel: "Average G",
  yAxisLabel: "Development Time",
  points: [
    { averageG: 0.1, developmentTime: 4 },
    { averageG: 0.3, developmentTime: 8 },
  ],
};

const BTZS_G_EFS_CHART: BTZSChartData = {
  title: "Effective Film Speed vs Average G",
  xAxisLabel: "Average G",
  yAxisLabel: "Effective Film Speed",
  points: [
    { averageG: 0.1, effectiveFilmSpeed: 100 },
    { averageG: 0.3, effectiveFilmSpeed: 400 },
  ],
};

const BTZS_PROFILE_REQUIRED_G = 4 / 9;
const BTZS_PROFILE_LOW_TARGET_G = 1 / (0.3 * 6.5);
const BTZS_PROFILE_HIGH_TARGET_G = 1.27 / (0.3 * 6.5);

const BTZS_PROFILE_G_DEV_CHART: BTZSChartData = {
  title: "Average G vs Development Time",
  xAxisLabel: "Average G",
  yAxisLabel: "Development Time",
  points: [
    { averageG: BTZS_PROFILE_LOW_TARGET_G, developmentTime: 5.5 },
    { averageG: BTZS_PROFILE_HIGH_TARGET_G, developmentTime: 6.5 },
  ],
};

const BTZS_PROFILE_G_EFS_CHART: BTZSChartData = {
  title: "Effective Film Speed vs Average G",
  xAxisLabel: "Average G",
  yAxisLabel: "Effective Film Speed",
  points: [
    { averageG: BTZS_PROFILE_LOW_TARGET_G, effectiveFilmSpeed: 200 },
    { averageG: BTZS_PROFILE_HIGH_TARGET_G, effectiveFilmSpeed: 200 },
  ],
};

const BTZS_EXAMPLE_G_DEV_CHART: BTZSChartData = {
  title: "Average G vs Development Time",
  xAxisLabel: "Average G",
  yAxisLabel: "Development Time",
  points: [
    { averageG: BTZS_PROFILE_REQUIRED_G, developmentTime: 6.5 },
  ],
};

const BTZS_EXAMPLE_G_EFS_CHART: BTZSChartData = {
  title: "Effective Film Speed vs Average G",
  xAxisLabel: "Average G",
  yAxisLabel: "Effective Film Speed",
  points: [
    { averageG: BTZS_PROFILE_REQUIRED_G, effectiveFilmSpeed: 200 },
  ],
};

const BTZS_SBR_DEV_CHART: BTZSChartData = {
  title: "Development Time vs SBR",
  xAxisLabel: "SBR",
  yAxisLabel: "Development Time",
  points: [
    { sbr: 6, developmentTime: 4 },
    { sbr: 7, developmentTime: 5 },
  ],
};

const BTZS_SBR_EFS_CHART: BTZSChartData = {
  title: "Effective Film Speed vs SBR",
  xAxisLabel: "SBR",
  yAxisLabel: "Effective Film Speed",
  points: [
    { sbr: 6, effectiveFilmSpeed: 100 },
    { sbr: 7, effectiveFilmSpeed: 400 },
  ],
};

describe("photo exposure math helpers", () => {
  it("converts EV, shutter, and aperture values bidirectionally", () => {
    expect(calculateExposureEv(4, 0.25)).toBe(6);
    expect(calculateShutterSecondsFromEv(4, 6)).toBe(0.25);
    expect(calculateApertureFromEv(0.25, 6)).toBe(4);
  });

  it("adjusts EV for ISO, filters, and compensation", () => {
    expect(adjustEvForIso(10, 100, 400)).toBe(12);
    expect(adjustEvForFiltersAndCompensation(12, [{ filter_factor: 2 }], false, 1)).toBe(10);
    expect(adjustEvForFiltersAndCompensation(12, [{ filter_factor: 2 }], true, 1)).toBe(11);
    expect(calculateTargetEv(10, 100, 100, 3, [{ filter_factor: 2 }], false, 1)).toBe(10);
  });

  it("applies reciprocity over one half second and reverses it", () => {
    expect(applyReciprocity(0.5, 1.5)).toBe(0.5);
    expect(applyReciprocity(2, 1)).toBe(2);
    expect(applyReciprocity(0.75, 1.5)).toBeCloseTo(Math.pow(1.75, 1.5) - 1);

    const compensated = applyReciprocity(2, 1.5);
    expect(compensated).toBeCloseTo(Math.pow(3, 1.5) - 1);
    expect(removeReciprocity(compensated, 1.5)).toBeCloseTo(2);
  });

  it("places Zone III and Zone VII readings at the requested EV offsets", () => {
    const zoneIII = calculateZoneMeteringExposure({
      meterEv: 10,
      meterIso: 100,
      workingIso: 100,
      targetZone: 3,
      aperture: 8,
      precedence: "aperture",
    });

    expect(zoneIII).toMatchObject({
      zoneAdjustedEV: 12,
      targetEV: 12,
      aperture: 8,
      rawShutterSeconds: 1 / 64,
      finalShutterSeconds: 1 / 64,
      reciprocityApplied: false,
      warnings: [],
    });

    const zoneVII = calculateZoneMeteringExposure({
      meterEv: 10,
      meterIso: 100,
      workingIso: 100,
      targetZone: 7,
      aperture: 8,
      precedence: "aperture",
    });

    expect(zoneVII).toMatchObject({
      zoneAdjustedEV: 8,
      targetEV: 8,
      aperture: 8,
      rawShutterSeconds: 0.25,
      finalShutterSeconds: 0.25,
      reciprocityApplied: false,
      warnings: [],
    });
  });

  it("warns when a chosen aperture is outside the lens range", () => {
    const result = calculateZoneMeteringExposure({
      meterEv: 10,
      meterIso: 100,
      workingIso: 100,
      targetZone: 5,
      aperture: 32,
      precedence: "aperture",
      lensMinFStop: 5.6,
      lensMaxFStop: 22,
    });

    expect(result.warnings).toContain("Aperture is outside the lens range.");
  });

  it("formats exposure values for the UI", () => {
    expect(formatExposureEv(12.345)).toBe("12.35");
    expect(formatExposureSbr(6)).toBe("6.0");
    expect(formatExposureSbr(6.75)).toBe("6.75");
    expect(formatExposureG(0.6)).toBe("0.60");
    expect(formatExposureEfs(199.6)).toBe("200");
    expect(formatDevelopmentTimeMinutes(6)).toBe("6.0");
    expect(formatDevelopmentTimeClock(6.5)).toBe("6:30");
  });

  it("snaps shutter and aperture values to available options", () => {
    expect(snapApertureChoice(7.1, {
      min_f_stop: 5.6,
      max_f_stop: 22,
      aperture_increment: "full",
    })).toMatchObject({
      value: "f/8",
      label: "f/8",
    });

    const shutterSnap = snapShutterChoice(1 / 100, {
      min_shutter_speed_seconds: 1 / 250,
      max_shutter_speed_seconds: 1 / 60,
      supports_bulb: false,
    });

    expect(shutterSnap.value).toBe("1/125");
    expect(shutterSnap.warning).toContain("Rounded");
  });

  it("guides bulb-supported long exposures instead of rounding to BULB", () => {
    const shutterSnap = snapShutterChoice(6.8, {
      min_shutter_speed_seconds: 1 / 250,
      max_shutter_speed_seconds: 1 / 2,
      supports_bulb: true,
    });

    expect(shutterSnap).toMatchObject({
      value: "bulb",
      label: "BULB",
      seconds: null,
      stopError: null,
      warning: null,
    });
  });

  it("flags long exposures as out of range when bulb is unavailable", () => {
    const shutterSnap = snapShutterChoice(6.8, {
      min_shutter_speed_seconds: 1 / 250,
      max_shutter_speed_seconds: 1 / 2,
      supports_bulb: false,
    });

    expect(shutterSnap).toMatchObject({
      value: "1/2",
      label: "1/2",
      seconds: 0.5,
    });
    expect(shutterSnap.warning).toBe(
      "Ideal shutter is about 6.8s, which is longer than this camera/lens supports.",
    );
  });

  it("interpolates BTZS development time and EFS from Average G charts", () => {
    const devSeries = findBtzsLookupSeries([BTZS_G_DEV_CHART], "developmentTime");
    const efsSeries = findBtzsLookupSeries([BTZS_G_EFS_CHART], "effectiveFilmSpeed");

    expect(devSeries?.axis).toBe("averageG");
    expect(efsSeries?.axis).toBe("averageG");
    expect(interpolateBtzsSeriesValue(devSeries!, 0.2)).toMatchObject({ value: 6 });
    expect(interpolateBtzsSeriesValue(efsSeries!, 0.2).value).toBeCloseTo(200);
  });

  it("supports optional BTZS curve interpolation and bounded experimental extrapolation", () => {
    const curvedSeries = findBtzsLookupSeries([
      {
        title: "Average G vs Development Time",
        xAxisLabel: "Average G",
        yAxisLabel: "Development Time",
        points: [
          { averageG: 1, developmentTime: 1 },
          { averageG: 2, developmentTime: 4 },
          { averageG: 3, developmentTime: 9 },
        ],
      },
    ], "developmentTime");
    const straightLookup = interpolateBtzsSeriesValue(curvedSeries!, 1.5);
    const curvedLookup = interpolateBtzsSeriesValue(curvedSeries!, 1.5, { curveInterpolation: true });
    const curvedExpandedLookup = interpolateBtzsSeriesValue(curvedSeries!, 3.5, {
      curveInterpolation: true,
      extrapolationStops: 1,
    });

    expect(straightLookup.value).toBeCloseTo(2.5);
    expect(curvedLookup.value).not.toBeCloseTo(straightLookup.value ?? 0, 5);
    expect(curvedExpandedLookup.value).toBeCloseTo(12.2, 1);
    expect(curvedExpandedLookup.value).not.toBeCloseTo(10.9);

    const curvedEfsSeries = findBtzsLookupSeries([
      {
        title: "Effective Film Speed vs Average G",
        xAxisLabel: "Average G",
        yAxisLabel: "Effective Film Speed",
        points: [
          { averageG: 0.22, effectiveFilmSpeed: 83.41 },
          { averageG: 0.33, effectiveFilmSpeed: 87.06 },
          { averageG: 0.41, effectiveFilmSpeed: 102.34 },
        ],
      },
    ], "effectiveFilmSpeed");
    const expandedLowEfs = interpolateBtzsSeriesValue(curvedEfsSeries!, 0.18, {
      curveInterpolation: true,
      extrapolationStops: 0.3,
    });
    const expandedHighEfs = interpolateBtzsSeriesValue(curvedEfsSeries!, 0.5, {
      curveInterpolation: true,
      extrapolationStops: 0.3,
    });

    expect(expandedLowEfs.value).toBeLessThan(83.41);
    expect(expandedHighEfs.value).toBeGreaterThan(102.34);
    expect(expandedHighEfs.value).toBeCloseTo(130.8, 1);

    const curveLogValue = (target: number) => {
      const value = interpolateBtzsSeriesValue(curvedEfsSeries!, target, {
        curveInterpolation: true,
        extrapolationStops: 0.3,
      }).value;
      if (typeof value !== "number") throw new Error(`Expected curve value for ${target}.`);
      return Math.log2(value);
    };
    const boundary = 0.41;
    const delta = 0.0001;
    const insideSlope = (curveLogValue(boundary) - curveLogValue(boundary - delta)) / delta;
    const outsideSlope = (curveLogValue(boundary + delta) - curveLogValue(boundary)) / delta;
    const insideCurvature = (curveLogValue(boundary) - (2 * curveLogValue(boundary - delta)) + curveLogValue(boundary - (2 * delta))) / (delta * delta);
    const outsideCurvature = (curveLogValue(boundary + (2 * delta)) - (2 * curveLogValue(boundary + delta)) + curveLogValue(boundary)) / (delta * delta);

    expect(Math.abs(outsideSlope - insideSlope)).toBeLessThan(0.01);
    expect(Math.abs(outsideCurvature - insideCurvature)).toBeLessThan(0.5);

    const boundedSeries = findBtzsLookupSeries([
      {
        title: "Average G vs Development Time",
        xAxisLabel: "Average G",
        yAxisLabel: "Development Time",
        points: [
          { averageG: 0.5, developmentTime: 5 },
          { averageG: 1, developmentTime: 10 },
        ],
      },
    ], "developmentTime");
    expect(interpolateBtzsSeriesValue(boundedSeries!, 0.25).value).toBeUndefined();
    const expandedLookup = interpolateBtzsSeriesValue(boundedSeries!, 0.25, { extrapolationStops: 1 });

    expect(expandedLookup.value).toBeCloseTo(2.5);
    expect(expandedLookup.warning).toContain("Extrapolated");
  });

  it("converts stop-based SBR to Average G for BTZS exposure calculations", () => {
    const result = calculateBtzsExposure({
      lowEv: 10,
      highEv: 14.285714285714286,
      lowZone: 3,
      highZone: 7,
      paperEs: 1.0,
      meterIso: 100,
      chartData: [BTZS_EXAMPLE_G_DEV_CHART, BTZS_EXAMPLE_G_EFS_CHART],
      aperture: 8,
      precedence: "aperture",
    });

    expect(result).toMatchObject({
      developmentTimeMinutes: 6.5,
      effectiveFilmSpeed: 200,
      supportedRange: {
        developmentTime: { axis: "averageG", min: BTZS_PROFILE_REQUIRED_G, max: BTZS_PROFILE_REQUIRED_G },
        effectiveFilmSpeed: { axis: "averageG", min: BTZS_PROFILE_REQUIRED_G, max: BTZS_PROFILE_REQUIRED_G },
      },
      developmentTimeLookup: {
        axis: "averageG",
        metric: "developmentTime",
        value: 6.5,
      },
      effectiveFilmSpeedLookup: {
        axis: "averageG",
        metric: "effectiveFilmSpeed",
        value: 200,
      },
      exposure: {
        zoneAdjustedEV: 13,
        targetEV: 13,
        aperture: 8,
        rawShutterSeconds: 1 / 128,
        finalShutterSeconds: 1 / 128,
        reciprocityApplied: false,
      },
    });
    expect(result.sbr).toBeCloseTo(7.5);
    expect(result.requiredG).toBeCloseTo(BTZS_PROFILE_REQUIRED_G);
    expect(result.developmentTimeLookup?.target).toBeCloseTo(BTZS_PROFILE_REQUIRED_G);
    expect(result.effectiveFilmSpeedLookup?.target).toBeCloseTo(BTZS_PROFILE_REQUIRED_G);
    expect(formatExposureG(result.requiredG)).toBe("0.444");
    expect(result.warnings).toEqual([]);
    expect(result.effectiveFilmSpeed).toBeCloseTo(200);
  });

  it("falls back to SBR lookup when Average G charts are unavailable", () => {
    const result = calculateBtzsExposure({
      lowEv: 10,
      highEv: 13.714285714285714,
      lowZone: 3,
      highZone: 7,
      paperEs: 1.17,
      meterIso: 100,
      chartData: [BTZS_SBR_DEV_CHART, BTZS_SBR_EFS_CHART],
      aperture: 8,
      precedence: "aperture",
    });

    expect(result.developmentTimeLookup).toMatchObject({ axis: "sbr" });
    expect(result.developmentTimeLookup?.value).toBeCloseTo(4.5);
    expect(result.effectiveFilmSpeedLookup).toMatchObject({ axis: "sbr" });
    expect(result.effectiveFilmSpeedLookup?.value).toBeCloseTo(200);
    expect(result.developmentTimeMinutes).toBeCloseTo(4.5);
    expect(result.effectiveFilmSpeed).toBeCloseTo(200);
    expect(result.warnings).toEqual(expect.arrayContaining([
      "Average G development time data was unavailable; using SBR fallback.",
      "Average G effective film speed data was unavailable; using SBR fallback.",
    ]));
  });

  it("returns warnings and no extrapolated values when the profile is out of range", () => {
    const result = calculateBtzsExposure({
      lowEv: 10,
      highEv: 13.5,
      lowZone: 3,
      highZone: 7,
      paperEs: 1.17,
      meterIso: 100,
      chartData: [
        {
          title: "Average G vs Development Time",
          xAxisLabel: "Average G",
          yAxisLabel: "Development Time",
          points: [
            { averageG: 0.7, developmentTime: 4 },
            { averageG: 0.8, developmentTime: 6 },
          ],
        },
        {
          title: "Effective Film Speed vs Average G",
          xAxisLabel: "Average G",
          yAxisLabel: "Effective Film Speed",
          points: [
            { averageG: 0.7, effectiveFilmSpeed: 100 },
            { averageG: 0.8, effectiveFilmSpeed: 400 },
          ],
        },
      ],
      aperture: 8,
      precedence: "aperture",
    });

    expect(result.developmentTimeMinutes).toBeNull();
    expect(result.effectiveFilmSpeed).toBeNull();
    expect(result.warnings.join(" ")).toContain("outside the supported Average G range");
    expect(result.exposure).toBeNull();
  });

  it("warns when low and high readings are reversed", () => {
    const result = calculateBtzsExposure({
      lowEv: 13.714285714285714,
      highEv: 10,
      lowZone: 7,
      highZone: 3,
      paperEs: 1.17,
      meterIso: 100,
      chartData: [BTZS_G_DEV_CHART, BTZS_G_EFS_CHART],
      aperture: 8,
      precedence: "aperture",
    });

    expect(result.sbr).toBeCloseTo(6.5);
    expect(result.warnings).toEqual(expect.arrayContaining([
      "Low and high EV readings were reversed and were swapped.",
      "Low and high zone readings were reversed and were swapped.",
    ]));
  });
});
