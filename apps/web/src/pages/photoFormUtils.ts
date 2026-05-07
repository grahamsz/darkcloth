import { formatDateTimeDisplay } from "../dateTime";

const UTC_TIME_ZONE = "UTC";

export const formatDateTimeLocalValue = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
};

export const formatDateTimeLocalInputValue = (value: string | null | undefined) => {
  if (!value) return "";
  return value.slice(0, 16);
};

export const formatDateTimeDisplayValue = (value: string | null | undefined, timeZone?: string | null) => {
  if (!value) return null;
  const formatted = formatDateTimeDisplay(value, timeZone);
  if (formatted && timeZone === UTC_TIME_ZONE && !formatted.endsWith(` ${UTC_TIME_ZONE}`)) {
    return `${formatted} ${UTC_TIME_ZONE}`;
  }
  return formatted || null;
};

export const formatDecimalInputValue = (value: number | null | undefined, digits: number) => {
  if (value == null) return "";
  return value.toFixed(digits);
};

export interface PhotographLocationDraft {
  latitude: string;
  longitude: string;
  altitude_m: string;
}

export interface PhotographLocationSource {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  altitude: number | null | undefined;
}

export const createEmptyPhotographLocationDraft = (): PhotographLocationDraft => ({
  latitude: "",
  longitude: "",
  altitude_m: "",
});

export const formatPhotographLocationDraft = (source: PhotographLocationSource): PhotographLocationDraft => ({
  latitude: formatDecimalInputValue(source.latitude, 4),
  longitude: formatDecimalInputValue(source.longitude, 4),
  altitude_m: formatDecimalInputValue(source.altitude, 1),
});

export function setOptionalNumberPayloadValue<T extends Record<string, unknown>, K extends keyof T & string>(
  payload: T,
  key: K,
  value: string,
) {
  const trimmed = value.trim();
  if (trimmed === "") return;
  const parsed = Number.parseFloat(trimmed);
  if (Number.isFinite(parsed)) {
    payload[key] = parsed as T[K];
  }
}

export function setNullableNumberPayloadValue<T extends Record<string, unknown>, K extends keyof T & string>(
  payload: T,
  key: K,
  value: string,
) {
  const trimmed = value.trim();
  payload[key] = (trimmed === "" ? null : Number.parseFloat(trimmed)) as T[K];
}

export const sortByName = <T extends { name: string }>(items: readonly T[]) => {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
};
