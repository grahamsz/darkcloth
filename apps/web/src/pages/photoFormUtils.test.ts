import { describe, expect, it } from "vitest";
import {
  createEmptyPhotographLocationDraft,
  formatPhotographLocationDraft,
  setNullableNumberPayloadValue,
  setOptionalNumberPayloadValue,
} from "./photoFormUtils";

describe("photo form location helpers", () => {
  it("defaults location drafts to blank inputs", () => {
    expect(createEmptyPhotographLocationDraft()).toEqual({
      latitude: "",
      longitude: "",
      altitude_m: "",
    });
  });

  it("formats geolocation coordinates to the displayed precision", () => {
    expect(formatPhotographLocationDraft({
      latitude: 40.7608123,
      longitude: -111.8910123,
      altitude: null,
    })).toEqual({
      latitude: "40.7608",
      longitude: "-111.8910",
      altitude_m: "",
    });
  });

  it("omits blank optional numbers from payloads", () => {
    const payload: Record<string, unknown> = {};

    setOptionalNumberPayloadValue(payload, "latitude", " ");
    setOptionalNumberPayloadValue(payload, "longitude", "40.7608123");

    expect(payload).toEqual({
      longitude: 40.7608123,
    });
  });

  it("writes null for blank nullable numbers in payloads", () => {
    const payload: Record<string, unknown> = {};

    setNullableNumberPayloadValue(payload, "latitude", " ");
    setNullableNumberPayloadValue(payload, "altitude_m", "1823.46");

    expect(payload).toEqual({
      latitude: null,
      altitude_m: 1823.46,
    });
  });
});
