import type { FilmStockType, Filter } from "./api/client";
import { getFilterSpectralCurveKey, type FilterSpectralCurveKey } from "./filterSpectralCurves";

export const normalizeFilterIds = (ids?: string[] | null) => ids ?? [];

export const areFilterIdsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((filterId, index) => filterId === right[index]);
};

export type FilterFilmTypeCategory = "bw" | "color" | "infrared";

export const getFilmStockFilterCategory = (
  stockType: FilmStockType | null | undefined,
): FilterFilmTypeCategory | "other" | null => {
  if (stockType === "bw" || stockType === "bw_slide") return "bw";
  if (stockType === "color_negative" || stockType === "color_slide") return "color";
  if (stockType === "color_infrared" || stockType === "bw_infrared") return "infrared";
  if (stockType === "other") return "other";
  return null;
};

export const filterAppliesToFilmStockType = (
  filter: Pick<Filter, "applies_to_bw" | "applies_to_color" | "applies_to_infrared">,
  stockType: FilmStockType | null | undefined,
) => {
  const category = getFilmStockFilterCategory(stockType);
  if (!category) return true;
  const appliesToBw = filter.applies_to_bw !== false;
  const appliesToColor = filter.applies_to_color !== false;
  const appliesToInfrared = filter.applies_to_infrared !== false;
  if (category === "bw") return appliesToBw;
  if (category === "color") return appliesToColor;
  if (category === "infrared") return appliesToInfrared;
  return appliesToBw && appliesToColor && appliesToInfrared;
};

export const isFilterCompatibleWithLens = (
  filter: Pick<Filter, "applicable_lens_ids" | "applies_to_bw" | "applies_to_color" | "applies_to_infrared">,
  lensId: string | null | undefined,
  stockType?: FilmStockType | null,
) => {
  if (!lensId) return false;
  if (!filterAppliesToFilmStockType(filter, stockType)) return false;
  const applicableLensIds = normalizeFilterIds(filter.applicable_lens_ids);
  return applicableLensIds.length === 0 || applicableLensIds.includes(lensId);
};

export const getCompatibleFilters = (
  filters: Filter[],
  lensId: string | null | undefined,
  stockType?: FilmStockType | null,
) => {
  if (!lensId) return [];
  return filters.filter((filter) => isFilterCompatibleWithLens(filter, lensId, stockType));
};

export const getReferenceImagePreviewFilters = (
  filters: Filter[],
  lensId: string | null | undefined,
  stockType?: FilmStockType | null,
) => {
  if (lensId) return getCompatibleFilters(filters, lensId, stockType);
  return filters.filter((filter) => filterAppliesToFilmStockType(filter, stockType));
};

export const getSelectedFiltersInOrder = (filters: Filter[], selectedFilterIds: string[]) => {
  const filterById = new Map(filters.map((filter) => [filter.id, filter]));
  return selectedFilterIds
    .map((filterId) => filterById.get(filterId))
    .filter((filter): filter is Filter => Boolean(filter));
};

export const pruneFilterIdsToCompatible = (
  filterIds: string[],
  filters: Filter[],
  lensId: string | null | undefined,
  stockType?: FilmStockType | null,
) => {
  if (!lensId) {
    return {
      nextFilterIds: [],
      removedFilterIds: filterIds,
    };
  }

  const compatibleFilterIds = new Set(getCompatibleFilters(filters, lensId, stockType).map((filter) => filter.id));
  const nextFilterIds = filterIds.filter((filterId) => compatibleFilterIds.has(filterId));
  const removedFilterIds = filterIds.filter((filterId) => !compatibleFilterIds.has(filterId));
  return {
    nextFilterIds,
    removedFilterIds,
  };
};

export const formatFilterDisplayLabel = (filter: Pick<Filter, "name" | "code">) => {
  const code = filter.code?.trim();
  return code ? `${filter.name} (${code})` : filter.name;
};

export const getTotalFilterFactor = (filters: Array<Pick<Filter, "filter_factor">>) => {
  if (filters.length === 0) return 1;
  return filters.reduce((product, filter) => {
    const factor = Number(filter.filter_factor);
    return Number.isFinite(factor) && factor > 0 ? product * factor : product;
  }, 1);
};

export const formatFilterFactorLabel = (factor: number) => {
  if (!Number.isFinite(factor) || factor <= 0) return "—";
  const rounded = Number.parseFloat(factor.toFixed(2));
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}x`;
};

export const formatFilterSelectionSummary = (filters: Array<Pick<Filter, "name" | "code">>, maxItems = 3) => {
  if (filters.length === 0) return "";
  const labels = filters.map((filter) => formatFilterDisplayLabel(filter));
  if (labels.length <= maxItems) return labels.join(" · ");
  const shown = labels.slice(0, maxItems);
  return `${shown.join(" · ")} +${labels.length - maxItems} more`;
};

export type FilterSimulationSettings = {
  id: string;
  label: string;
  color: string;
  strength: number;
  spectralCurveKey?: FilterSpectralCurveKey;
};

const DEFAULT_SIMULATION_COLOR = "#f05a28";
const SPECTRAL_SIMULATION_STRENGTH = 1;

export const normalizeFilterSimulationColor = (value: string | null | undefined) => (
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toLowerCase()
    : DEFAULT_SIMULATION_COLOR
);

export const normalizeFilterSimulationSettings = (
  filter: Pick<Filter, "id" | "name" | "code" | "standard_key"> & Partial<Pick<Filter, "can_simulate_bw" | "simulation_rgb" | "simulation_strength">>,
): FilterSimulationSettings | null => {
  const spectralCurveKey = getFilterSpectralCurveKey(filter.standard_key, filter.code);
  if (!spectralCurveKey && filter.can_simulate_bw !== true) return null;
  return {
    id: filter.id,
    label: formatFilterDisplayLabel(filter),
    color: spectralCurveKey ? DEFAULT_SIMULATION_COLOR : normalizeFilterSimulationColor(filter.simulation_rgb),
    strength: spectralCurveKey ? SPECTRAL_SIMULATION_STRENGTH : Number.isFinite(filter.simulation_strength) ? Number(filter.simulation_strength) : SPECTRAL_SIMULATION_STRENGTH,
    ...(spectralCurveKey ? { spectralCurveKey } : {}),
  };
};

export const getFilterSimulationOptions = (
  filters: Array<Pick<Filter, "id" | "name" | "code" | "standard_key">>,
) => filters
  .map(normalizeFilterSimulationSettings)
  .filter((settings): settings is FilterSimulationSettings => Boolean(settings));
