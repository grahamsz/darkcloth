import type {
  Camera,
  DevelopmentProfile,
  Filter,
  FilmStock,
  Lens,
  PhotographWritePayload,
} from "../api/client";
import {
  createPhotographExposureWritePayloadInput,
  type PhotographExposureDraft,
  type PhotographExposureModeDraft,
} from "../photoExposure";
import { getSelectedFiltersInOrder } from "../photoFilters";

// Shared page-level glue for the photo create/edit forms. Domain calculations live in photoExposure*;
// this file only adapts form state into payload-builder inputs and common UI constants.
export type PhotographPayloadValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | NonNullable<PhotographWritePayload["exposure_details"]>;

export interface PhotographExposureFormSlice extends PhotographExposureDraft, PhotographExposureModeDraft {
  aperture: string;
  shutter_speed: string;
  focal_length_mm: string;
  filter_ids: string[];
}

export const exposureModeTabs = [
  { value: "manual", label: "Manual" },
  { value: "cell-camera", label: "Cell" },
  { value: "zone-metering", label: "Single Spot" },
  { value: "btzs-zone-metering", label: "Zone" },
] as const;

export const hasTrimmedValue = (value: string) => value.trim().length > 0;

export const parsePositiveNumber = (value: string) => {
  const n = Number.parseFloat(value.trim());
  return Number.isFinite(n) ? n : null;
};

export function buildExposureWritePayloadInput(
  form: PhotographExposureFormSlice,
  selectedFilmStock: Pick<FilmStock, "stock_type" | "reciprocity_p_factor" | "iso"> | null,
  selectedLens: Pick<Lens, "min_f_stop" | "max_f_stop" | "aperture_increment" | "flare_factor"> | null,
  shutterSource: Pick<Camera | Lens, "min_shutter_speed_seconds" | "max_shutter_speed_seconds" | "supports_bulb"> | null,
  filters: Filter[],
  btzsProfiles: DevelopmentProfile[],
) {
  const selectedFilters = getSelectedFiltersInOrder(filters, form.filter_ids);
  return createPhotographExposureWritePayloadInput(
    {
      exposure_entry_mode: form.exposure_entry_mode,
      aperture: form.aperture,
      shutter_speed: form.shutter_speed,
      bulb_duration_seconds: form.bulb_duration_seconds,
      focal_length_mm: form.focal_length_mm,
      filter_ids: form.filter_ids,
      zone_metering: form.zone_metering,
      btzs_zone_metering: form.btzs_zone_metering,
      shutter_source: shutterSource,
    },
    {
      filters: selectedFilters,
      film_stock: selectedFilmStock,
      lens: selectedLens,
      btzs_profiles: btzsProfiles,
    },
  );
}
