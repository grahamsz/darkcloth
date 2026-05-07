import type { FilmStock, FilmStockType } from "../types";

export const FILM_STOCK_TYPES = [
  "color_negative",
  "bw",
  "color_slide",
  "bw_slide",
  "color_infrared",
  "bw_infrared",
  "other",
] as const;
export const DEFAULT_FILM_STOCK_TYPE: FilmStockType = "other";
export const DEFAULT_FILM_STOCK_RECIPROCITY_P_FACTOR = 1;
export const FILM_SPECTRAL_RESPONSE_PRESETS = [
  "generic_panchromatic",
  "modern_panchromatic",
  "classic_panchromatic",
  "orthopanchromatic",
  "orthochromatic",
  "extended_red",
  "near_infrared",
] as const;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFilmStockType(value: unknown): value is FilmStockType {
  return typeof value === "string" && (FILM_STOCK_TYPES as readonly string[]).includes(value);
}

export function normalizeFilmStockType(value: unknown): FilmStockType {
  return isFilmStockType(value) ? value : DEFAULT_FILM_STOCK_TYPE;
}

export function parseFilmStockType(value: unknown, field = "stock_type"): FilmStockType {
  if (!isFilmStockType(value)) {
    throw new Error(`${field} must be one of: ${FILM_STOCK_TYPES.join(", ")}`);
  }

  return value;
}

export function resolveFilmStockType(value: unknown): FilmStockType {
  if (value === undefined) {
    return DEFAULT_FILM_STOCK_TYPE;
  }

  return parseFilmStockType(value);
}

export function parseReciprocityPFactor(value: unknown, field = "reciprocity_p_factor"): number {
  if (typeof value !== "number") {
    throw new Error(`${field} must be a number`);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite`);
  }
  if (value <= 0) {
    throw new Error(`${field} must be greater than 0`);
  }

  return value;
}

export function resolveReciprocityPFactor(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_FILM_STOCK_RECIPROCITY_P_FACTOR;
  }

  return parseReciprocityPFactor(value);
}

export function normalizeReciprocityPFactor(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  return DEFAULT_FILM_STOCK_RECIPROCITY_P_FACTOR;
}

export function parseFilmSpectralResponsePreset(value: unknown, field = "spectral_response_preset"): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !(FILM_SPECTRAL_RESPONSE_PRESETS as readonly string[]).includes(value)) {
    throw new Error(`${field} must be one of: ${FILM_SPECTRAL_RESPONSE_PRESETS.join(", ")}`);
  }

  return value;
}

export function parseFilmSpectralResponseEnabled(value: unknown, field = "simulate_spectral_response"): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

export function isBwFilmStockType(value: unknown): value is "bw" {
  return value === "bw";
}

export function toFilmStockResponse(row: FilmStock): FilmStock {
  const rawSimulateSpectralResponse = row.simulate_spectral_response as boolean | number | null | undefined;
  return {
    ...row,
    stock_type: normalizeFilmStockType(row.stock_type),
    reciprocity_p_factor: normalizeReciprocityPFactor(row.reciprocity_p_factor),
    spectral_response_preset: parseFilmSpectralResponsePreset(row.spectral_response_preset),
    simulate_spectral_response: rawSimulateSpectralResponse === true || rawSimulateSpectralResponse === 1,
  };
}
