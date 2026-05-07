import { describe, expect, it } from "vitest";
import { getApertureChoiceOptions } from "./optics";

describe("aperture choice labels", () => {
  it("labels third-stop values with standard f-numbers and relative offsets", () => {
    expect(getApertureChoiceOptions({
      min_f_stop: 5.6,
      max_f_stop: 8,
      aperture_increment: "third",
    })).toEqual([
      { value: "f/5.6", label: "f/5.6" },
      { value: "f/6.3", label: "f/6.3 (f/5.6 + ⅓)" },
      { value: "f/7.1", label: "f/7.1 (f/5.6 + ⅔)" },
      { value: "f/8", label: "f/8" },
    ]);
  });
});
