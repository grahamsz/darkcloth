import { FILTER_SPECTRAL_CURVE_DATA } from "./filterSpectralCurveData";

export type SpectralTransmissionPoint = {
  wavelengthNm: number;
  transmission: number;
};

export type FilterSpectralCurve = {
  key: string;
  label: string;
  sourceUrl: string;
  points: readonly SpectralTransmissionPoint[];
};

export const FILTER_SPECTRAL_CURVES = FILTER_SPECTRAL_CURVE_DATA satisfies Record<string, FilterSpectralCurve>;

export type FilterSpectralCurveKey = keyof typeof FILTER_SPECTRAL_CURVES;

const CODE_TO_CURVE_KEY: Record<string, FilterSpectralCurveKey> = {
  "3": "wratten_3",
  "8": "wratten_8",
  "9": "wratten_9",
  "12": "wratten_12",
  "15": "wratten_15",
  "16": "wratten_16",
  "21": "wratten_21",
  "22": "wratten_22",
  "24": "wratten_24",
  "25": "wratten_25",
  "25a": "wratten_29",
  "26": "wratten_26",
  "29": "wratten_29",
  "32": "wratten_32",
  "34a": "wratten_34a",
  "38a": "wratten_38a",
  "44": "wratten_44",
  "44a": "wratten_44a",
  "47": "wratten_47",
  "47a": "wratten_47a",
  "47b": "wratten_47",
  "47b+": "wratten_47",
  "58": "wratten_58",
  "61": "wratten_61",
  "70": "wratten_70",
  "87": "wratten_87",
  "87a": "wratten_87a",
  "87b": "wratten_87b",
  "87c": "wratten_87c",
  "89b": "wratten_89b",
  "90": "wratten_90",
  "92": "wratten_92",
  "98": "wratten_98",
  "99": "wratten_99",
  "102": "wratten_102",
  "106": "wratten_106",
};

const UV_FILTER_CURVE_KEYS = new Set<FilterSpectralCurveKey>([
  "wratten_2a",
  "wratten_2b",
  "wratten_2e",
]);

const normalizeCode = (code: string | null | undefined) => {
  const withoutPrefix = code?.toLowerCase()
    .replace(/^kodak\s+/i, "")
    .replace(/^wratten\s+/i, "")
    .replace(/^w\s*/i, "")
    .replace(/\bnd\b/gi, "")
    .trim() ?? "";
  return withoutPrefix.replace(/\s+/g, "");
};

export const getFilterSpectralCurveKey = (
  standardKey?: string | null,
  code?: string | null,
): FilterSpectralCurveKey | undefined => {
  if (standardKey && standardKey in FILTER_SPECTRAL_CURVES) {
    const key = standardKey as FilterSpectralCurveKey;
    return UV_FILTER_CURVE_KEYS.has(key) ? undefined : key;
  }
  if (standardKey === "wratten_25a") return "wratten_29";
  if (standardKey === "wratten_47b" || standardKey === "wratten_47b+") return "wratten_47";
  return CODE_TO_CURVE_KEY[normalizeCode(code)];
};

export const getFilterSpectralCurve = (key?: string | null): FilterSpectralCurve | undefined => {
  if (!key || !(key in FILTER_SPECTRAL_CURVES)) return undefined;
  return FILTER_SPECTRAL_CURVES[key as FilterSpectralCurveKey];
};
