import { describe, expect, it } from "vitest";
import type { Camera, FilmHolder, Filter, Lens } from "../api/client";
import { formatCameraDisplayName } from "./GearFormFields";
import { formatFilterDisplayLabel } from "../photoFilters";
import { compareGearDisplayNames, sortGearItemsByDisplayName } from "./gearListUtils";

describe("gear list sorting helpers", () => {
  it("compares names naturally and case-insensitively", () => {
    expect(compareGearDisplayNames("Item 2", "Item 10")).toBeLessThan(0);
    expect(compareGearDisplayNames("alpha", "Alpha")).toBe(0);
  });

  it("sorts cameras by the displayed camera name", () => {
    const cameras = [
      { name: "10", maker: "Nikon" },
      { name: "2", maker: "Canon" },
      { name: "Alpha", maker: "Fujifilm" },
    ] satisfies Array<Pick<Camera, "name" | "maker">>;

    expect(sortGearItemsByDisplayName(cameras, (camera) => formatCameraDisplayName(camera)).map(formatCameraDisplayName)).toEqual([
      "Canon 2",
      "Fujifilm Alpha",
      "Nikon 10",
    ]);
  });

  it("sorts lenses by name", () => {
    const lenses = [
      { name: "Lens 10" },
      { name: "lens 2" },
      { name: "Alpha" },
    ] satisfies Array<Pick<Lens, "name">>;

    expect(sortGearItemsByDisplayName(lenses, (lens) => lens.name).map((lens) => lens.name)).toEqual([
      "Alpha",
      "lens 2",
      "Lens 10",
    ]);
  });

  it("sorts film holders by visible name with natural numeric order", () => {
    const filmHolders = [
      { name: "10A" },
      { name: "2A" },
      { name: "1b" },
      { name: "1A" },
    ] satisfies Array<Pick<FilmHolder, "name">>;

    expect(sortGearItemsByDisplayName(filmHolders, (holder) => holder.name).map((holder) => holder.name)).toEqual([
      "1A",
      "1b",
      "2A",
      "10A",
    ]);
  });

  it("sorts filters by their display label", () => {
    const filters = [
      { name: "Red", code: "Wratten 25" },
      { name: "blue", code: "wratten 2" },
      { name: "Amber", code: null },
    ] satisfies Array<Pick<Filter, "name" | "code">>;

    expect(sortGearItemsByDisplayName(filters, (filter) => formatFilterDisplayLabel(filter)).map(formatFilterDisplayLabel)).toEqual([
      "Amber",
      "blue (wratten 2)",
      "Red (Wratten 25)",
    ]);
  });
});
