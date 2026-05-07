import { describe, expect, it } from "vitest";
import {
  formatPhotographImageLabel,
  getPhotographImageDisplayUrl,
  getPhotographImageOpenUrl,
  getPhotographImagePreviewUrl,
} from "./photoReferenceImages";

describe("photo reference image helpers", () => {
  it("prefers thumbnail metadata for compact display URLs", () => {
    expect(getPhotographImageDisplayUrl({
      thumbnail_url: "https://example.com/thumb.jpg",
      url: "https://example.com/display.jpg",
      original_url: "https://example.com/original.jpg",
    })).toBe("https://example.com/thumb.jpg");

    expect(getPhotographImageDisplayUrl({
      thumbnail_url: null,
      url: "https://example.com/display.jpg",
      original_url: "https://example.com/original.jpg",
    })).toBe("https://example.com/display.jpg");

    expect(getPhotographImageDisplayUrl({
      thumbnail_url: null,
      url: null,
      original_url: "https://example.com/original.jpg",
    })).toBe("https://example.com/original.jpg");
  });

  it("prefers the display/original asset for full-size opens", () => {
    expect(getPhotographImageOpenUrl({
      thumbnail_url: "https://example.com/thumb.jpg",
      url: "https://example.com/display.jpg",
      original_url: "https://example.com/original.jpg",
    })).toBe("https://example.com/display.jpg");

    expect(getPhotographImageOpenUrl({
      thumbnail_url: "https://example.com/thumb.jpg",
      url: null,
      original_url: "https://example.com/original.jpg",
    })).toBe("https://example.com/original.jpg");

    expect(getPhotographImageOpenUrl({
      thumbnail_url: "https://example.com/thumb.jpg",
      url: null,
      original_url: null,
    })).toBe("https://example.com/thumb.jpg");
  });

  it("prefers the thumbnail asset for fixed-size preview boxes", () => {
    expect(getPhotographImagePreviewUrl({
      thumbnail_url: "https://example.com/thumb.jpg",
      url: "https://example.com/display.jpg",
      original_url: "https://example.com/original.jpg",
    })).toBe("https://example.com/thumb.jpg");

    expect(getPhotographImagePreviewUrl({
      thumbnail_url: "https://example.com/thumb.jpg",
      url: null,
      original_url: "https://example.com/original.jpg",
    })).toBe("https://example.com/thumb.jpg");
  });

  it("falls back to a generic label when the filename is missing", () => {
    expect(formatPhotographImageLabel({ original_filename: "contact-sheet.jpg" })).toBe("contact-sheet.jpg");
    expect(formatPhotographImageLabel({ original_filename: null })).toBe("Reference image");
  });
});
