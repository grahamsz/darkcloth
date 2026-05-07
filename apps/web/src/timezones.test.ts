import { describe, expect, it } from "vitest";
import { buildTimezoneOptions } from "./timezones";

describe("timezone options", () => {
  it("keeps the browser timezone first and dedupes the option list", () => {
    expect(buildTimezoneOptions("America/Denver", ["America/Denver", "UTC", "Europe/London"])).toEqual([
      "America/Denver",
      "UTC",
      "Europe/London",
    ]);
  });

  it("falls back to common IANA zones when supported values are unavailable", () => {
    const options = buildTimezoneOptions("America/Denver");

    expect(options[0]).toBe("America/Denver");
    expect(options).toContain("UTC");
    expect(options).toContain("America/Los_Angeles");
    expect(options).toContain("Europe/London");
  });
});
