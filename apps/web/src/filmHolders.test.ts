import { describe, expect, it } from "vitest";
import type { FilmHolder, FilmHolderLoad, FilmStock } from "./api/client";
import {
  formatFilmHolderLoadFilmLabel,
  formatFilmHolderLoadDevelopmentLabel,
  formatFilmHolderLoadDiscardReason,
  formatFilmHolderLoadPhotographLabel,
  formatFilmHolderLoadProfileLabel,
  formatFilmHolderLoadStatusLabel,
  formatFilmHolderLoadSummary,
  formatFilmHolderDetailSummary,
  getFilmHolderDiscardConfirmationText,
  getFilmHolderUndoExposureConfirmationText,
  getFilmHolderHistoricalLoads,
  getFilmHolderLoadPhotographAlt,
  getFilmHolderLoadPhotographThumbnailUrl,
  getFilmHolderLoadTone,
  isUndoableFilmHolderLoad,
} from "./filmHolders";

const createFilmStock = (): FilmStock => ({
  id: "film-1",
  user_id: "user-1",
  name: "Portra 400",
  stock_type: "color_negative",
  reciprocity_p_factor: 1,
  iso: 400,
  process: "C-41",
  created_at: "2026-05-02T00:00:00.000Z",
});

const createLoad = (overrides: Partial<FilmHolderLoad> = {}): FilmHolderLoad => ({
  id: "load-1",
  user_id: "user-1",
  film_holder_id: "holder-1",
  film_id: "film-1",
  status: "processed",
  loaded_at: "2026-05-01T12:00:00.000Z",
  exposed_at: "2026-05-02T12:00:00.000Z",
  exposed_photograph_id: "photo-1",
  processed_at: "2026-05-03T12:00:00.000Z",
  discarded_at: null,
  discarded_reason: null,
  development_profile_id: "profile-1",
  development_profile: {
    id: "profile-1",
    name: "D-76 1:1",
  },
  development_summary: null,
  exposed_photograph: {
    id: "photo-1",
    title: "Trees",
    frame_number: "12",
    taken_at: "2026-05-02T12:05:00.000Z",
    camera_id: "camera-1",
    camera_name: "Canon AE-1",
    lens_id: "lens-1",
    lens_name: "50mm",
    aperture: "f/8",
    shutter_speed: "1/125",
    shutter_speed_seconds: 0.008,
    shutter_mode: "fixed",
    bulb_duration_seconds: null,
    exposure_entry_mode: "manual",
    reference_image: {
      id: "image-1",
      content_type: "image/jpeg",
      width: 800,
      height: 600,
      thumbnail_content_type: "image/jpeg",
      thumbnail_width: 200,
      thumbnail_height: 150,
      thumbnail_url: "https://example.com/thumb.jpg",
      url: "https://example.com/display.jpg",
    },
  },
  notes: null,
  created_at: "2026-05-01T12:00:00.000Z",
  updated_at: "2026-05-03T12:00:00.000Z",
  film: createFilmStock(),
  ...overrides,
});

describe("film holder load helpers", () => {
  it("formats current load labels with film stock type and profile name", () => {
    const load = createLoad();

    expect(formatFilmHolderLoadFilmLabel(load)).toBe("Portra 400 · Color Negative");
    expect(formatFilmHolderLoadProfileLabel(load)).toBe("D-76 1:1");
  });

  it("formats development profile time summaries without raw ids", () => {
    const load = createLoad({
      development_profile_id: "profile-1",
      development_profile: {
        id: "profile-1",
        name: "D-76 1:1",
      },
      development_summary: {
        label: "Development time",
        source: "development-profile-time",
        minutes: null,
        time_text: "8 min",
      },
    });

    expect(formatFilmHolderLoadDevelopmentLabel(load)).toBe("8 min");
    expect(formatFilmHolderLoadDevelopmentLabel(load)).not.toContain("profile-1");
  });

  it("formats stored BTZS development summaries as minutes and seconds", () => {
    const load = createLoad({
      development_summary: {
        label: "Development time",
        source: "stored-btzs-calculation",
        minutes: 8.4,
        time_text: "8:24",
      },
    });

    expect(formatFilmHolderLoadDevelopmentLabel(load)).toBe("8 min 24 sec");
  });

  it("returns null when development time is missing", () => {
    const load = createLoad({
      development_summary: null,
    });

    expect(formatFilmHolderLoadDevelopmentLabel(load)).toBeNull();
  });

  it("does not expose raw development profile ids in the development label", () => {
    const load = createLoad({
      development_profile_id: "profile-1",
      development_profile: null,
      development_summary: null,
    });

    expect(formatFilmHolderLoadDevelopmentLabel(load)).toBeNull();
    expect(formatFilmHolderLoadProfileLabel(load)).not.toContain("profile-1");
  });

  it("falls back without exposing raw development profile ids", () => {
    const load = createLoad({
      development_profile: null,
    });

    expect(formatFilmHolderLoadProfileLabel(load)).toBe("Development profile unavailable");
    expect(formatFilmHolderLoadProfileLabel(load)).not.toContain("profile-1");
  });

  it("includes development time in detail summaries for the latest load", () => {
    const load = createLoad({
      status: "processed",
      development_summary: {
        label: "Development time",
        source: "stored-btzs-calculation",
        minutes: 6.5,
        time_text: "6:30",
      },
    });
    const holder: Pick<FilmHolder, "current_load" | "load_history"> = {
      current_load: null,
      load_history: [load],
    };

    expect(formatFilmHolderDetailSummary(holder, "UTC")).toContain("BTZS development: 6 min 30 sec");
  });

  it("formats discarded loads with discarded timestamps and fallback reasons", () => {
    const load = createLoad({
      status: "discarded",
      processed_at: null,
      discarded_at: "2026-05-04T12:00:00.000Z",
      discarded_reason: " ",
      notes: "Freed for reuse",
    });
    const holder: Pick<FilmHolder, "current_load" | "load_history"> = {
      current_load: null,
      load_history: [load],
    };

    expect(formatFilmHolderLoadStatusLabel(load.status)).toBe("Discarded");
    expect(getFilmHolderLoadTone(load)).toBe("done");
    expect(formatFilmHolderLoadSummary(load, "UTC")).toContain("Discarded");
    expect(formatFilmHolderLoadSummary(load, "UTC")).toContain("May 4, 2026");
    expect(formatFilmHolderLoadSummary(load, "UTC")).not.toContain("May 1, 2026");
    expect(formatFilmHolderLoadDiscardReason(load)).toBe("Discarded after holder was re-exposed");
    expect(formatFilmHolderDetailSummary(holder, "UTC")).toContain("Discarded");
  });

  it("builds discard confirmation copy for re-exposure and reload flows", () => {
    const load = createLoad({
      status: "exposed",
      processed_at: null,
    });

    const reexposureCopy = getFilmHolderDiscardConfirmationText("Holder", load, "UTC", "reexpose");
    expect(reexposureCopy).toContain("Re-expose Holder?");
    expect(reexposureCopy).toContain("Current film: Portra 400 · Color Negative");
    expect(reexposureCopy).toContain("Existing exposure: Frame 12");
    expect(reexposureCopy).toContain("recording the new exposure");
    expect(reexposureCopy).toContain("Cancel leaves the current holder unchanged.");
    expect(reexposureCopy).not.toContain("photo-1");

    const reloadCopy = getFilmHolderDiscardConfirmationText("Holder", load, "UTC", "reload");
    expect(reloadCopy).toContain("Discard exposed load for Holder?");
    expect(reloadCopy).toContain("holder is loaded again");
  });

  it("describes photograph summaries and thumbnail urls from the API payload", () => {
    const load = createLoad();

    expect(formatFilmHolderLoadPhotographLabel(load, "UTC")).toContain("Frame 12");
    expect(formatFilmHolderLoadPhotographLabel(load, "UTC")).toContain("Canon AE-1");
    expect(formatFilmHolderLoadPhotographLabel(load, "UTC")).toContain("50mm");
    expect(formatFilmHolderLoadPhotographLabel(load, "UTC")).toContain("Taken");
    expect(getFilmHolderLoadPhotographThumbnailUrl(load)).toBe("https://example.com/thumb.jpg");
    expect(getFilmHolderLoadPhotographAlt(load)).toBe("Frame 12 thumbnail");
  });

  it("filters the current load out of load history", () => {
    const currentLoad = createLoad();
    const historicalLoad = createLoad({
      id: "load-2",
      exposed_photograph_id: null,
      exposed_photograph: null,
      development_profile_id: null,
      development_profile: null,
      development_summary: null,
      processed_at: null,
      status: "loaded",
    });
    const holder: Pick<FilmHolder, "current_load" | "load_history"> = {
      current_load: currentLoad,
      load_history: [historicalLoad, currentLoad],
    };

    expect(getFilmHolderHistoricalLoads(holder)).toEqual([historicalLoad]);
  });

  it("marks exposed loads as undoable and builds the confirmation copy", () => {
    const exposedLoad = createLoad({
      status: "exposed",
      processed_at: null,
    });
    const loadedLoad = createLoad({
      status: "loaded",
      exposed_photograph_id: null,
      exposed_photograph: null,
      processed_at: null,
    });
    const processedLoad = createLoad({
      status: "processed",
    });

    expect(isUndoableFilmHolderLoad(exposedLoad)).toBe(true);
    expect(isUndoableFilmHolderLoad(loadedLoad)).toBe(false);
    expect(isUndoableFilmHolderLoad(processedLoad)).toBe(false);
    expect(isUndoableFilmHolderLoad(null)).toBe(false);
    expect(getFilmHolderUndoExposureConfirmationText(exposedLoad)).toBe(
      "Undo this exposure? The holder will become loaded/unexposed again. The linked photograph's holder reference will be cleared.",
    );
    expect(getFilmHolderUndoExposureConfirmationText(loadedLoad)).toBe(
      "Undo this exposure? The holder will become loaded/unexposed again.",
    );
  });
});
