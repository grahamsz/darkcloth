import { describe, expect, it } from "vitest";
import { isFilmSectionPath } from "./appNavPaths";

describe("isFilmSectionPath", () => {
  it("matches canonical film section routes", () => {
    expect(isFilmSectionPath("/app/film")).toBe(true);
    expect(isFilmSectionPath("/app/film/stocks")).toBe(true);
    expect(isFilmSectionPath("/app/film/stocks/123/edit")).toBe(true);
    expect(isFilmSectionPath("/app/film/rolls")).toBe(true);
    expect(isFilmSectionPath("/app/film/rolls/123/edit")).toBe(true);
    expect(isFilmSectionPath("/app/film/holders")).toBe(true);
    expect(isFilmSectionPath("/app/film/holders/123/edit")).toBe(true);
  });

  it("does not match legacy film routes", () => {
    expect(isFilmSectionPath("/app/film-stocks")).toBe(false);
    expect(isFilmSectionPath("/app/film-stocks/123/edit")).toBe(false);
    expect(isFilmSectionPath("/app/rolls")).toBe(false);
    expect(isFilmSectionPath("/app/rolls/123/edit")).toBe(false);
    expect(isFilmSectionPath("/app/film-holders")).toBe(false);
    expect(isFilmSectionPath("/app/film-holders/123/edit")).toBe(false);
    expect(isFilmSectionPath("/app/films")).toBe(false);
    expect(isFilmSectionPath("/app/films/123/edit")).toBe(false);
  });
});
