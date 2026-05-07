import { describe, expect, it } from "vitest";
import {
  FILM_STOCK_SPECTRAL_RESPONSE_OPTIONS,
  FILM_STOCK_TYPE_OPTIONS,
  formatFilmStockTypeLabel,
  getEnabledFilmSpectralResponseKey,
} from "./film-stocks";

describe("film stock helpers", () => {
  it("formats the labels used throughout the film stock UI", () => {
    expect(formatFilmStockTypeLabel("color_negative")).toBe("Color Negative");
    expect(formatFilmStockTypeLabel("bw")).toBe("B&W Negative");
    expect(formatFilmStockTypeLabel("color_slide")).toBe("Color Slide");
    expect(formatFilmStockTypeLabel("bw_slide")).toBe("B&W Slide");
    expect(formatFilmStockTypeLabel("color_infrared")).toBe("Color Infrared");
    expect(formatFilmStockTypeLabel("bw_infrared")).toBe("B&W Infrared");
    expect(formatFilmStockTypeLabel("other")).toBe("Other");
  });

  it("keeps the selector options aligned with the supported API enum values", () => {
    expect(FILM_STOCK_TYPE_OPTIONS).toEqual([
      { value: "color_negative", label: "Color Negative" },
      { value: "bw", label: "B&W Negative" },
      { value: "color_slide", label: "Color Slide" },
      { value: "bw_slide", label: "B&W Slide" },
      { value: "color_infrared", label: "Color Infrared" },
      { value: "bw_infrared", label: "B&W Infrared" },
      { value: "other", label: "Other" },
    ]);
  });

  it("enables spectral response only for monochrome stocks with the toggle on", () => {
    expect(getEnabledFilmSpectralResponseKey({
      stock_type: "bw",
      simulate_spectral_response: true,
      spectral_response_preset: "orthochromatic",
    })).toBe("orthochromatic");
    expect(getEnabledFilmSpectralResponseKey({
      stock_type: "color_negative",
      simulate_spectral_response: true,
      spectral_response_preset: "orthochromatic",
    })).toBeNull();
    expect(getEnabledFilmSpectralResponseKey({
      stock_type: "bw",
      simulate_spectral_response: false,
      spectral_response_preset: "orthochromatic",
    })).toBeNull();
  });

  it("exposes B&W spectral response presets for film stock forms", () => {
    expect(FILM_STOCK_SPECTRAL_RESPONSE_OPTIONS.map((option) => option.value)).toContain("orthochromatic");
    expect(FILM_STOCK_SPECTRAL_RESPONSE_OPTIONS.map((option) => option.value)).toContain("extended_red");
  });
});
