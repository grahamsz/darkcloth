import type { FilmStock, FilmStockType } from "./api/client";
import {
  FILM_SPECTRAL_RESPONSE_PRESETS,
  getFilmSpectralResponsePreset,
  isFilmSpectralResponseKey,
  type FilmSpectralResponseKey,
} from "./filmSpectralResponse";

export const FILM_STOCK_TYPE_OPTIONS: Array<{ value: FilmStockType; label: string }> = [
  { value: "color_negative", label: "Color Negative" },
  { value: "bw", label: "B&W Negative" },
  { value: "color_slide", label: "Color Slide" },
  { value: "bw_slide", label: "B&W Slide" },
  { value: "color_infrared", label: "Color Infrared" },
  { value: "bw_infrared", label: "B&W Infrared" },
  { value: "other", label: "Other" },
];

export const FILM_STOCK_BTZS_ONLY_REASON = "BTZS profiles are only available for B&W negative stocks.";
export const FILM_STOCK_SPECTRAL_RESPONSE_OPTIONS = FILM_SPECTRAL_RESPONSE_PRESETS.map((preset) => ({
  value: preset.key,
  label: preset.label,
}));

export type FilmStockPreset = {
  key: string;
  brand: string;
  name: string;
  iso: number;
  stock_type: FilmStockType;
  process: string;
  reciprocity_p_factor: number;
  spectral_response_preset: FilmSpectralResponseKey;
  simulate_spectral_response: boolean;
  notes?: string;
};

export const FILM_STOCK_PRESETS: FilmStockPreset[] = [
  {
    key: "ilford_hp5_plus",
    brand: "Ilford",
    name: "HP5 Plus",
    iso: 400,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.31,
    spectral_response_preset: "modern_panchromatic",
    simulate_spectral_response: true,
  },
  {
    key: "ilford_fp4_plus",
    brand: "Ilford",
    name: "FP4 Plus",
    iso: 125,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.26,
    spectral_response_preset: "classic_panchromatic",
    simulate_spectral_response: true,
  },
  {
    key: "ilford_delta_100",
    brand: "Ilford",
    name: "Delta 100 Professional",
    iso: 100,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.26,
    spectral_response_preset: "modern_panchromatic",
    simulate_spectral_response: true,
  },
  {
    key: "ilford_delta_400",
    brand: "Ilford",
    name: "Delta 400 Professional",
    iso: 400,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.41,
    spectral_response_preset: "modern_panchromatic",
    simulate_spectral_response: true,
  },
  {
    key: "ilford_pan_f_plus",
    brand: "Ilford",
    name: "Pan F Plus",
    iso: 50,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.33,
    spectral_response_preset: "classic_panchromatic",
    simulate_spectral_response: true,
  },
  {
    key: "ilford_ortho_plus",
    brand: "Ilford",
    name: "Ortho Plus",
    iso: 80,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.25,
    spectral_response_preset: "orthochromatic",
    simulate_spectral_response: true,
  },
  {
    key: "ilford_sfx_200",
    brand: "Ilford",
    name: "SFX 200",
    iso: 200,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.43,
    spectral_response_preset: "extended_red",
    simulate_spectral_response: true,
    notes: "Extended red sensitivity, not true infrared.",
  },
  {
    key: "harman_kentmere_100",
    brand: "Harman Kentmere",
    name: "Pan 100",
    iso: 100,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.26,
    spectral_response_preset: "classic_panchromatic",
    simulate_spectral_response: true,
  },
  {
    key: "harman_kentmere_400",
    brand: "Harman Kentmere",
    name: "Pan 400",
    iso: 400,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.3,
    spectral_response_preset: "modern_panchromatic",
    simulate_spectral_response: true,
  },
  {
    key: "kodak_tri_x_400",
    brand: "Kodak",
    name: "Tri-X 400",
    iso: 400,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.31,
    spectral_response_preset: "modern_panchromatic",
    simulate_spectral_response: true,
    notes: "Practical p-factor default; Kodak publishes reciprocity guidance as correction tables rather than this app's p-factor model.",
  },
  {
    key: "kodak_tmax_100",
    brand: "Kodak",
    name: "T-MAX 100",
    iso: 100,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.15,
    spectral_response_preset: "modern_panchromatic",
    simulate_spectral_response: true,
    notes: "Practical p-factor default.",
  },
  {
    key: "kodak_tmax_400",
    brand: "Kodak",
    name: "T-MAX 400",
    iso: 400,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.24,
    spectral_response_preset: "modern_panchromatic",
    simulate_spectral_response: true,
    notes: "Practical p-factor default.",
  },
  {
    key: "fujifilm_acros_ii",
    brand: "Fujifilm",
    name: "Neopan 100 Acros II",
    iso: 100,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1,
    spectral_response_preset: "orthopanchromatic",
    simulate_spectral_response: true,
    notes: "Acros II has unusually strong reciprocity behavior; p=1 keeps short and moderate long exposures effectively uncorrected.",
  },
  {
    key: "foma_fomapan_100",
    brand: "Foma",
    name: "Fomapan 100 Classic",
    iso: 100,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.35,
    spectral_response_preset: "classic_panchromatic",
    simulate_spectral_response: true,
  },
  {
    key: "foma_fomapan_200",
    brand: "Foma",
    name: "Fomapan 200 Creative",
    iso: 200,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.35,
    spectral_response_preset: "classic_panchromatic",
    simulate_spectral_response: true,
  },
  {
    key: "foma_fomapan_400",
    brand: "Foma",
    name: "Fomapan 400 Action",
    iso: 400,
    stock_type: "bw",
    process: "B&W",
    reciprocity_p_factor: 1.35,
    spectral_response_preset: "modern_panchromatic",
    simulate_spectral_response: true,
  },
];

export function isBlackAndWhiteFilmStockType(stockType: FilmStockType | null | undefined) {
  return stockType === "bw";
}

export function isMonochromeFilmStockType(stockType: FilmStockType | null | undefined) {
  return stockType === "bw" || stockType === "bw_slide" || stockType === "bw_infrared";
}

export function supportsFilmSpectralResponse(stockType: FilmStockType | null | undefined) {
  return isMonochromeFilmStockType(stockType);
}

export function normalizeFilmSpectralResponsePreset(value: unknown): FilmSpectralResponseKey {
  return isFilmSpectralResponseKey(value) ? value : "generic_panchromatic";
}

export function getEnabledFilmSpectralResponseKey(
  filmStock: Pick<FilmStock, "stock_type" | "simulate_spectral_response" | "spectral_response_preset"> | null | undefined,
): FilmSpectralResponseKey | null {
  if (!filmStock?.simulate_spectral_response) return null;
  if (!supportsFilmSpectralResponse(filmStock.stock_type)) return null;
  return normalizeFilmSpectralResponsePreset(filmStock.spectral_response_preset);
}

export function formatFilmSpectralResponseLabel(value: unknown) {
  return getFilmSpectralResponsePreset(normalizeFilmSpectralResponsePreset(value))?.label ?? "Generic panchromatic";
}

export function isBlackAndWhiteFilmStock(stockStock: Pick<FilmStock, "stock_type"> | null | undefined) {
  return isBlackAndWhiteFilmStockType(stockStock?.stock_type);
}

export function getFilmStockTypeAvailabilityText(stockType: FilmStockType) {
  if (stockType === "bw") {
    return "BTZS / XDF import is available for this stock.";
  }

  return "Change stock type to B&W Negative to unlock BTZS / XDF import and BTZS profile cards.";
}

export function formatFilmStockTypeLabel(stockType: FilmStockType | null | undefined) {
  switch (stockType) {
    case "color_negative":
      return "Color Negative";
    case "bw":
      return "B&W Negative";
    case "color_slide":
      return "Color Slide";
    case "bw_slide":
      return "B&W Slide";
    case "color_infrared":
      return "Color Infrared";
    case "bw_infrared":
      return "B&W Infrared";
    case "other":
    default:
      return "Other";
  }
}
