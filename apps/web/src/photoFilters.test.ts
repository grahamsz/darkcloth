import { describe, expect, it } from "vitest";
import type { Filter } from "./api/client";
import {
  formatFilterDisplayLabel,
  formatFilterSelectionSummary,
  getCompatibleFilters,
  getReferenceImagePreviewFilters,
  getFilterSimulationOptions,
  isFilterCompatibleWithLens,
  normalizeFilterSimulationSettings,
  pruneFilterIdsToCompatible,
} from "./photoFilters";

const createFilter = (overrides: Partial<Filter> = {}): Filter => ({
  id: "filter-1",
  user_id: "user-1",
  name: "Red",
  code: "Wratten 25",
  filter_factor: 8,
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

describe("photo filter helpers", () => {
  it("treats an empty applicable_lens_ids array as compatible with every lens", () => {
    const filter = createFilter();

    expect(isFilterCompatibleWithLens(filter, "lens-1")).toBe(true);
    expect(isFilterCompatibleWithLens(filter, "lens-2")).toBe(true);
    expect(isFilterCompatibleWithLens(filter, null)).toBe(false);
  });

  it("filters lens-specific filters and preserves their order", () => {
    const filters = [
      createFilter({ id: "filter-1", applicable_lens_ids: ["lens-1"] }),
      createFilter({ id: "filter-2", applicable_lens_ids: [] }),
      createFilter({ id: "filter-3", applicable_lens_ids: ["lens-2"] }),
    ];

    expect(getCompatibleFilters(filters, "lens-1").map((filter) => filter.id)).toEqual(["filter-1", "filter-2"]);
    expect(getCompatibleFilters(filters, "lens-2").map((filter) => filter.id)).toEqual(["filter-2", "filter-3"]);
  });

  it("filters by film type availability when a film stock type is known", () => {
    const filters = [
      createFilter({ id: "filter-bw", applies_to_bw: true, applies_to_color: false, applies_to_infrared: false }),
      createFilter({ id: "filter-color", applies_to_bw: false, applies_to_color: true, applies_to_infrared: false }),
      createFilter({ id: "filter-infrared", applies_to_bw: false, applies_to_color: false, applies_to_infrared: true }),
      createFilter({ id: "filter-all", applies_to_bw: true, applies_to_color: true, applies_to_infrared: true }),
    ];

    expect(getCompatibleFilters(filters, "lens-1", "bw").map((filter) => filter.id)).toEqual(["filter-bw", "filter-all"]);
    expect(getCompatibleFilters(filters, "lens-1", "color_negative").map((filter) => filter.id)).toEqual(["filter-color", "filter-all"]);
    expect(getCompatibleFilters(filters, "lens-1", "bw_infrared").map((filter) => filter.id)).toEqual(["filter-infrared", "filter-all"]);
    expect(getCompatibleFilters(filters, "lens-1", "other").map((filter) => filter.id)).toEqual(["filter-all"]);
  });

  it("shows film-compatible reference image preview filters before a lens is selected", () => {
    const filters = [
      createFilter({ id: "filter-bw-lens", applicable_lens_ids: ["lens-1"], applies_to_bw: true, applies_to_color: false, applies_to_infrared: false }),
      createFilter({ id: "filter-color", applies_to_bw: false, applies_to_color: true, applies_to_infrared: false }),
      createFilter({ id: "filter-all", applies_to_bw: true, applies_to_color: true, applies_to_infrared: true }),
    ];

    expect(getReferenceImagePreviewFilters(filters, "", "bw").map((filter) => filter.id)).toEqual(["filter-bw-lens", "filter-all"]);
    expect(getReferenceImagePreviewFilters(filters, "lens-2", "bw").map((filter) => filter.id)).toEqual(["filter-all"]);
  });

  it("prunes incompatible filter IDs without changing the remaining order", () => {
    const filters = [
      createFilter({ id: "filter-1", applicable_lens_ids: ["lens-1"] }),
      createFilter({ id: "filter-2", applicable_lens_ids: [] }),
      createFilter({ id: "filter-3", applicable_lens_ids: ["lens-2"] }),
    ];

    expect(pruneFilterIdsToCompatible(["filter-3", "filter-2", "filter-1"], filters, "lens-1")).toEqual({
      nextFilterIds: ["filter-2", "filter-1"],
      removedFilterIds: ["filter-3"],
    });
  });

  it("formats readable filter labels and summaries", () => {
    const filters = [
      createFilter({ id: "filter-1", name: "Red", code: "Wratten 25" }),
      createFilter({ id: "filter-2", name: "Yellow", code: null }),
      createFilter({ id: "filter-3", name: "Blue", code: "Wratten 47" }),
    ];

    expect(formatFilterDisplayLabel(filters[0])).toBe("Red (Wratten 25)");
    expect(formatFilterDisplayLabel(filters[1])).toBe("Yellow");
    expect(formatFilterSelectionSummary(filters, 2)).toBe("Red (Wratten 25) · Yellow +1 more");
  });

  it("normalizes simulation settings only for known spectral filters", () => {
    const red = createFilter({
      can_simulate_bw: false,
      standard_key: "wratten_25",
      simulation_rgb: "#E1261C",
      simulation_strength: 2,
      simulation_brightness_boost: 0,
    });
    const yellow = createFilter({ id: "filter-2", name: "Yellow", code: "Wratten 8" });

    expect(normalizeFilterSimulationSettings(red)).toEqual({
      id: "filter-1",
      label: "Red (Wratten 25)",
      color: "#f05a28",
      strength: 1,
      spectralCurveKey: "wratten_25",
    });
    expect(getFilterSimulationOptions([red, yellow]).map(option => option.id)).toEqual(["filter-1", "filter-2"]);
    expect(normalizeFilterSimulationSettings(yellow)).toMatchObject({
      spectralCurveKey: "wratten_8",
    });
    expect(normalizeFilterSimulationSettings(createFilter({
      id: "filter-4",
      name: "Green",
      code: "Wratten 99",
    }))).toMatchObject({
      spectralCurveKey: "wratten_99",
    });
    expect(normalizeFilterSimulationSettings(createFilter({
      id: "filter-5",
      name: "ND",
      code: "ND 0.9",
      standard_key: "nd_0_9",
    }))).toBeNull();
    expect(normalizeFilterSimulationSettings(createFilter({
      id: "filter-6",
      name: "UV",
      code: "Wratten 2A",
      standard_key: "wratten_2a",
    }))).toBeNull();
    expect(normalizeFilterSimulationSettings(createFilter({
      id: "filter-3",
      name: "Custom red",
      code: null,
      can_simulate_bw: true,
      simulation_rgb: "#ff0000",
      simulation_strength: 3,
    }))).toEqual({
      id: "filter-3",
      label: "Custom red",
      color: "#ff0000",
      strength: 3,
    });
  });

  it("maps legacy deep-red preset keys to the Wratten 29 curve", () => {
    expect(normalizeFilterSimulationSettings(createFilter({
      can_simulate_bw: true,
      standard_key: "wratten_25a",
      code: "Wratten 25A",
    }))).toMatchObject({
      spectralCurveKey: "wratten_29",
    });
  });
});
