import { describe, expect, it } from "vitest";
import type { Filter, PhotographLifecycleSummary } from "./api/client";
import {
  formatPhotographExposureDisplay,
  formatPhotographFilmDisplay,
  formatPhotographLensDisplay,
  getPhotographLifecycleRows,
  getPhotographLocationLink,
  resolvePhotographSelectedFilters,
} from "./photoDetail";

describe("photo detail helpers", () => {
  it("formats lens displays with range and meaningful focal overrides", () => {
    expect(formatPhotographLensDisplay({
      name: "Schneider",
      min_focal_length_mm: 70,
      max_focal_length_mm: 200,
      focal_length_mm: null,
    }, 105)).toBe("Schneider 70-200mm @ 105mm");

    expect(formatPhotographLensDisplay({
      name: "Nikkor",
      min_focal_length_mm: 50,
      max_focal_length_mm: 50,
      focal_length_mm: 50,
    }, 50.2)).toBe("Nikkor 50mm");

    expect(formatPhotographLensDisplay(null, 50)).toBeNull();
  });

  it("combines film and holder names without raw identifiers", () => {
    expect(formatPhotographFilmDisplay({ name: "Ilford FP4" }, { name: "Holder 1B" })).toBe("Ilford FP4 - Holder 1B");
    expect(formatPhotographFilmDisplay({ name: "Ilford FP4" }, null)).toBe("Ilford FP4");
    expect(formatPhotographFilmDisplay(null, { name: "Holder 1B" })).toBe("Holder 1B");
  });

  it("combines aperture and shutter display values", () => {
    expect(formatPhotographExposureDisplay({
      aperture: "f/8",
      shutter_speed: "1/125",
      shutter_speed_seconds: 1 / 125,
      shutter_mode: "fixed",
      bulb_duration_seconds: null,
    })).toBe("1/125 @ f/8");

    expect(formatPhotographExposureDisplay({
      aperture: "f/11",
      shutter_speed: "bulb",
      shutter_speed_seconds: 12.5,
      shutter_mode: "bulb",
      bulb_duration_seconds: 12.5,
    })).toBe("Bulb · 12.5s @ f/11");
  });

  it("builds a rounded location label and a precise OpenStreetMap link", () => {
    const location = getPhotographLocationLink({
      latitude: 40.7608123,
      longitude: -111.8910123,
    });

    expect(location).toEqual({
      text: "40.7608, -111.8910",
      href: "https://www.openstreetmap.org/?mlat=40.7608123&mlon=-111.8910123#map=16/40.7608123/-111.8910123",
    });
  });

  it("formats lifecycle rows from the lifecycle summary", () => {
    const summary: PhotographLifecycleSummary = {
      loaded_at: "2026-05-02T12:00:00.000Z",
      exposed_at: "2026-05-02T13:00:00.000Z",
      processed_at: "2026-05-03T14:00:00.000Z",
      developed_at: null,
      development_profile_name: "BTZS N-1",
    };

    expect(getPhotographLifecycleRows(summary, "UTC")).toEqual([
      { label: "Loaded", value: "May 2, 2026, 12:00 PM UTC" },
      { label: "Exposed", value: "May 2, 2026, 1:00 PM UTC" },
      { label: "Processed", value: "May 3, 2026, 2:00 PM UTC" },
      { label: "Development profile", value: "BTZS N-1" },
    ]);
  });

  it("resolves selected filters from cached filter ids when embedded filters are missing", () => {
    const red = {
      id: "red",
      name: "Deep red",
      code: "Wratten 29",
    } as Filter;
    const green = {
      id: "green",
      name: "Green",
      code: "Wratten 58",
    } as Filter;

    expect(resolvePhotographSelectedFilters({
      filter_ids: ["red", "missing", "green"],
      filters: [],
    }, new Map([
      [red.id, red],
      [green.id, green],
    ]))).toEqual([red, green]);
  });
});
