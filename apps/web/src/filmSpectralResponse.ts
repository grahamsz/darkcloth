export type FilmSpectralResponseKey =
  | "generic_panchromatic"
  | "modern_panchromatic"
  | "classic_panchromatic"
  | "orthopanchromatic"
  | "orthochromatic"
  | "extended_red"
  | "near_infrared";

export interface FilmSpectralResponsePreset {
  key: FilmSpectralResponseKey;
  label: string;
  description: string;
  sourceExamples: string;
  points: Array<{ wavelengthNm: number; sensitivity: number }>;
}

export const FILM_SPECTRAL_RESPONSE_PRESETS: FilmSpectralResponsePreset[] = [
  {
    key: "generic_panchromatic",
    label: "Generic panchromatic",
    description: "Balanced B&W response across blue, green, and red. This is closest to Darkcloth's previous filtered B&W model.",
    sourceExamples: "General panchromatic B&W films",
    points: [
      { wavelengthNm: 400, sensitivity: 0.72 },
      { wavelengthNm: 450, sensitivity: 0.95 },
      { wavelengthNm: 500, sensitivity: 0.92 },
      { wavelengthNm: 550, sensitivity: 1.0 },
      { wavelengthNm: 600, sensitivity: 0.82 },
      { wavelengthNm: 650, sensitivity: 0.64 },
      { wavelengthNm: 700, sensitivity: 0.22 },
    ],
  },
  {
    key: "modern_panchromatic",
    label: "Modern panchromatic",
    description: "Broad, fairly even panchromatic response with usable red sensitivity.",
    sourceExamples: "Ilford HP5 Plus, Ilford Delta, Kodak Tri-X style stocks",
    points: [
      { wavelengthNm: 400, sensitivity: 0.78 },
      { wavelengthNm: 450, sensitivity: 1.0 },
      { wavelengthNm: 500, sensitivity: 0.96 },
      { wavelengthNm: 550, sensitivity: 0.98 },
      { wavelengthNm: 600, sensitivity: 0.88 },
      { wavelengthNm: 650, sensitivity: 0.72 },
      { wavelengthNm: 700, sensitivity: 0.28 },
    ],
  },
  {
    key: "classic_panchromatic",
    label: "Classic panchromatic",
    description: "Panchromatic response with stronger blue/green rendering and softer deep-red response.",
    sourceExamples: "Ilford FP4 Plus, Fomapan 100, traditional cubic-grain stocks",
    points: [
      { wavelengthNm: 400, sensitivity: 0.86 },
      { wavelengthNm: 450, sensitivity: 1.0 },
      { wavelengthNm: 500, sensitivity: 0.95 },
      { wavelengthNm: 550, sensitivity: 0.9 },
      { wavelengthNm: 600, sensitivity: 0.7 },
      { wavelengthNm: 650, sensitivity: 0.46 },
      { wavelengthNm: 700, sensitivity: 0.12 },
    ],
  },
  {
    key: "orthopanchromatic",
    label: "Orthopanchromatic",
    description: "Broad B&W response with restrained red sensitivity compared with fully panchromatic films.",
    sourceExamples: "Fujifilm Neopan 100 Acros II style stocks",
    points: [
      { wavelengthNm: 400, sensitivity: 0.9 },
      { wavelengthNm: 450, sensitivity: 1.0 },
      { wavelengthNm: 500, sensitivity: 0.96 },
      { wavelengthNm: 550, sensitivity: 0.84 },
      { wavelengthNm: 600, sensitivity: 0.5 },
      { wavelengthNm: 650, sensitivity: 0.22 },
      { wavelengthNm: 700, sensitivity: 0.04 },
    ],
  },
  {
    key: "orthochromatic",
    label: "Orthochromatic",
    description: "Blue/green-sensitive response with little red sensitivity; reds render dark and skies render bright unless filtered.",
    sourceExamples: "Ilford Ortho Plus style stocks",
    points: [
      { wavelengthNm: 380, sensitivity: 0.76 },
      { wavelengthNm: 420, sensitivity: 1.0 },
      { wavelengthNm: 470, sensitivity: 0.96 },
      { wavelengthNm: 520, sensitivity: 0.72 },
      { wavelengthNm: 560, sensitivity: 0.38 },
      { wavelengthNm: 600, sensitivity: 0.08 },
      { wavelengthNm: 650, sensitivity: 0.0 },
      { wavelengthNm: 700, sensitivity: 0.0 },
    ],
  },
  {
    key: "extended_red",
    label: "Extended red",
    description: "Panchromatic response extended toward deep red for dramatic red-filter and near-IR-adjacent behavior.",
    sourceExamples: "Ilford SFX 200 style stocks",
    points: [
      { wavelengthNm: 400, sensitivity: 0.7 },
      { wavelengthNm: 450, sensitivity: 0.9 },
      { wavelengthNm: 500, sensitivity: 0.88 },
      { wavelengthNm: 550, sensitivity: 0.92 },
      { wavelengthNm: 600, sensitivity: 1.0 },
      { wavelengthNm: 650, sensitivity: 0.96 },
      { wavelengthNm: 700, sensitivity: 0.68 },
      { wavelengthNm: 740, sensitivity: 0.36 },
    ],
  },
  {
    key: "near_infrared",
    label: "Near infrared",
    description: "Hyperpanchromatic/near-IR response. Phone RGB cannot see true IR, so this mainly changes deep-red weighting.",
    sourceExamples: "Rollei Infrared 400 style stocks",
    points: [
      { wavelengthNm: 400, sensitivity: 0.46 },
      { wavelengthNm: 450, sensitivity: 0.62 },
      { wavelengthNm: 500, sensitivity: 0.68 },
      { wavelengthNm: 550, sensitivity: 0.78 },
      { wavelengthNm: 600, sensitivity: 0.92 },
      { wavelengthNm: 650, sensitivity: 1.0 },
      { wavelengthNm: 700, sensitivity: 0.96 },
      { wavelengthNm: 750, sensitivity: 0.72 },
    ],
  },
];

const PRESET_BY_KEY = new Map(FILM_SPECTRAL_RESPONSE_PRESETS.map((preset) => [preset.key, preset]));

export function isFilmSpectralResponseKey(value: unknown): value is FilmSpectralResponseKey {
  return typeof value === "string" && PRESET_BY_KEY.has(value as FilmSpectralResponseKey);
}

export function getFilmSpectralResponsePreset(key: FilmSpectralResponseKey | null | undefined) {
  return key ? PRESET_BY_KEY.get(key) ?? null : null;
}
