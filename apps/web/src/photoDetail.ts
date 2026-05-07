import type {
  FilmHolder,
  FilmStock,
  Filter,
  Lens,
  Photograph,
  PhotographLifecycleSummary,
  Roll,
} from "./api/client";
import { formatDateTimeDisplayValue, formatDecimalInputValue } from "./pages/photoFormUtils";
import { formatPhotographShutterDisplay } from "./photoExposure";
import { getLensFocalDisplay, getLensFocalRange } from "./optics";

export interface PhotoDetailLocationLink {
  text: string;
  href: string;
}

export interface PhotoDetailLifecycleRow {
  label: string;
  value: string;
}

const FOCAL_LENGTH_DISPLAY_EPSILON = 0.5;

function formatRecordedFocalLength(value: number) {
  if (!Number.isFinite(value)) return "";
  const rounded = Number.parseFloat(value.toFixed(3));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0+$/u, "").replace(/(\.\d*?[1-9])0+$/u, "$1");
}

function formatLensLabel(lens: Pick<Lens, "name" | "min_focal_length_mm" | "max_focal_length_mm" | "focal_length_mm">) {
  const name = lens.name.trim();
  const range = getLensFocalDisplay(lens);
  if (!name) return range;
  if (!range) return name;
  return `${name} ${range}`;
}

export function formatPhotographLensDisplay(
  lens: Pick<Lens, "name" | "min_focal_length_mm" | "max_focal_length_mm" | "focal_length_mm"> | null | undefined,
  recordedFocalLengthMm: number | null | undefined,
): string | null {
  if (!lens) return null;

  const base = formatLensLabel(lens);
  if (!base) return null;

  const recorded = recordedFocalLengthMm;
  if (recorded == null || !Number.isFinite(recorded)) {
    return base;
  }

  const range = getLensFocalRange(lens);
  if (!range) {
    return `${base} @ ${formatRecordedFocalLength(recorded)}mm`;
  }

  if (range.isPrime && Math.abs(recorded - range.minFocalLengthMm) <= FOCAL_LENGTH_DISPLAY_EPSILON) {
    return base;
  }

  if (!range.isPrime) {
    return `${base} @ ${formatRecordedFocalLength(recorded)}mm`;
  }

  return `${base} @ ${formatRecordedFocalLength(recorded)}mm`;
}

export function formatPhotographFilmDisplay(
  film: Pick<FilmStock, "name"> | null | undefined,
  filmHolder: Pick<FilmHolder, "name"> | null | undefined,
): string | null {
  const parts = [
    film?.name?.trim() ?? "",
    filmHolder?.name?.trim() ?? "",
  ].filter((part) => part.length > 0);

  if (parts.length === 0) return null;
  return parts.join(" - ");
}

export function formatPhotographExposureDisplay(
  photo: Pick<Photograph, "aperture" | "shutter_speed" | "shutter_speed_seconds" | "shutter_mode" | "bulb_duration_seconds">,
): string | null {
  const aperture = photo.aperture?.trim() ?? "";
  const shutter = formatPhotographShutterDisplay(photo);
  if (shutter && aperture) return `${shutter} @ ${aperture}`;
  return shutter || aperture || null;
}

export function getPhotographLocationLink(
  photo: Pick<Photograph, "latitude" | "longitude">,
): PhotoDetailLocationLink | null {
  if (photo.latitude == null || photo.longitude == null) return null;

  return {
    text: `${formatDecimalInputValue(photo.latitude, 4)}, ${formatDecimalInputValue(photo.longitude, 4)}`,
    href: `https://www.openstreetmap.org/?mlat=${photo.latitude}&mlon=${photo.longitude}#map=16/${photo.latitude}/${photo.longitude}`,
  };
}

export function getPhotographLifecycleRows(
  summary: PhotographLifecycleSummary | null | undefined,
  timeZone?: string | null,
): PhotoDetailLifecycleRow[] {
  if (!summary) return [];

  const rows: PhotoDetailLifecycleRow[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const formatted = formatDateTimeDisplayValue(value ?? null, timeZone);
    if (formatted) rows.push({ label, value: formatted });
  };

  push("Loaded", summary.loaded_at);
  push("Exposed", summary.exposed_at);
  push("Processed", summary.processed_at ?? summary.developed_at);

  const profileName = summary.development_profile_name?.trim();
  if (profileName) {
    rows.push({ label: "Development profile", value: profileName });
  }

  return rows;
}

export function resolvePhotographSelectedFilters(
  photo: Pick<Photograph, "filter_ids" | "filters">,
  filtersById: Map<string, Filter>,
): Filter[] {
  if (photo.filters && photo.filters.length > 0) return photo.filters;

  const filterIds = photo.filter_ids ?? [];
  return filterIds
    .map((filterId) => filtersById.get(filterId))
    .filter((filter): filter is Filter => Boolean(filter));
}
