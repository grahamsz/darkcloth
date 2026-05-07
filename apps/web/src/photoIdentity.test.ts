import { describe, expect, it } from "vitest";
import {
  getPhotographFallbackLabel,
  getPhotographListLabel,
  getPhotographSecondaryTitle,
  normalizePhotographTitle,
} from "./photoIdentity";

describe("photograph identity helpers", () => {
  it("trims titles and collapses blank values", () => {
    expect(normalizePhotographTitle("  Sunset  ")).toBe("Sunset");
    expect(normalizePhotographTitle("   ")).toBeNull();
    expect(normalizePhotographTitle(null)).toBeNull();
  });

  it("falls back to frame, sheet, then generic labels", () => {
    expect(getPhotographFallbackLabel({ frame_number: " 12 ", film_holder_id: null })).toBe("Frame 12");
    expect(getPhotographFallbackLabel({ frame_number: "", film_holder_id: "holder-1" })).toBe("Sheet photograph");
    expect(getPhotographFallbackLabel({ frame_number: null, film_holder_id: null })).toBe("Photograph");
  });

  it("uses titles first in list labels and falls back when untitled", () => {
    expect(getPhotographListLabel({
      title: "  Sunset  ",
      frame_number: "12",
      film_holder_id: null,
    })).toBe("Sunset");

    expect(getPhotographListLabel({
      title: "   ",
      frame_number: "12",
      film_holder_id: null,
    })).toBe("Frame 12");

    expect(getPhotographListLabel({
      title: null,
      frame_number: null,
      film_holder_id: null,
    })).toBe("Photograph");
  });

  it("omits secondary titles that duplicate the technical fallback label", () => {
    expect(getPhotographSecondaryTitle({
      title: "Frame 12",
      frame_number: "12",
      film_holder_id: null,
    })).toBeNull();

    expect(getPhotographSecondaryTitle({
      title: "Sunrise",
      frame_number: "12",
      film_holder_id: null,
    })).toBe("Sunrise");
  });
});
