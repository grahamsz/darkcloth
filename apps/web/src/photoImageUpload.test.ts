import { describe, expect, it } from "vitest";
import {
  buildPhotographImageUploadFormData,
  getPhotographImageUploadPreviewFile,
  preparePhotographImageUpload,
} from "./photoImageUpload";

describe("photo image upload helpers", () => {
  it("keeps the original file as the upload source", async () => {
    const file = new File(["scan"], "reference.jpg", { type: "image/jpeg" });

    await expect(preparePhotographImageUpload(file)).resolves.toEqual({
      original: file,
    });
  });

  it("builds form data with only the original upload by default", () => {
    const file = new File(["scan"], "reference.jpg", { type: "image/jpeg" });
    const form = buildPhotographImageUploadFormData({
      original: file,
    });

    expect(form.has("original")).toBe(true);
    expect(form.has("display")).toBe(false);
    expect(form.has("thumbnail")).toBe(false);
    expect(form.has("original_width")).toBe(false);
    expect(form.has("original_height")).toBe(false);
    expect((form.get("original") as File).name).toBe("reference.jpg");
  });

  it("can include a prepared display image while preserving the original", () => {
    const original = new File(["original"], "reference.jpg", { type: "image/jpeg" });
    const display = new File(["display"], "reference.display.jpg", { type: "image/jpeg" });
    const form = buildPhotographImageUploadFormData({ original, display });

    expect((form.get("original") as File).name).toBe("reference.jpg");
    expect((form.get("display") as File).name).toBe("reference.display.jpg");
  });

  it("uses a prepared thumbnail as the temporary display when the full display is deferred", () => {
    const original = new File(["original"], "reference.jpg", { type: "image/jpeg" });
    const thumbnail = new File(["filtered"], "reference.thumbnail.jpg", { type: "image/jpeg" });
    const form = buildPhotographImageUploadFormData({
      original,
      thumbnail,
      deferredDisplay: {
        aspectRatio: null,
        cropToFrame: false,
        simulation: null,
        monochrome: true,
      },
    });

    expect((form.get("original") as File).name).toBe("reference.jpg");
    expect((form.get("display") as File).name).toBe("reference.thumbnail.jpg");
    expect((form.get("thumbnail") as File).name).toBe("reference.thumbnail.jpg");
  });

  it("prefers a larger quick display over the thumbnail while detailed display processing is deferred", () => {
    const original = new File(["original"], "reference.jpg", { type: "image/jpeg" });
    const display = new File(["display"], "reference.display.jpg", { type: "image/jpeg" });
    const thumbnail = new File(["filtered"], "reference.thumbnail.jpg", { type: "image/jpeg" });
    const form = buildPhotographImageUploadFormData({
      original,
      display,
      thumbnail,
      deferredDisplay: {
        aspectRatio: null,
        cropToFrame: false,
        simulation: null,
        monochrome: true,
      },
    });

    expect((form.get("display") as File).name).toBe("reference.display.jpg");
    expect((form.get("thumbnail") as File).name).toBe("reference.thumbnail.jpg");
  });

  it("uses the prepared thumbnail for pending previews when one exists", () => {
    const original = new File(["original"], "reference.jpg", { type: "image/jpeg" });
    const display = new File(["display"], "reference.display.jpg", { type: "image/jpeg" });
    const thumbnail = new File(["filtered"], "reference.thumbnail.jpg", { type: "image/jpeg" });

    expect(getPhotographImageUploadPreviewFile({ original, display, thumbnail })).toBe(thumbnail);
  });
});
