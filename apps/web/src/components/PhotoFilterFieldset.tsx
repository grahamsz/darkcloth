import { useMemo, type ReactNode } from "react";
import type { FilmStockType, Filter } from "../api/client";
import { FilterSimulationImage } from "./FilterSimulationImage";
import { PreviewResultLink } from "./PreviewResultLink";
import type { FilmSpectralResponseKey } from "../filmSpectralResponse";
import {
  formatFilterDisplayLabel,
  formatFilterFactorLabel,
  formatFilterSelectionSummary,
  getCompatibleFilters,
  getFilterSimulationOptions,
  getTotalFilterFactor,
} from "../photoFilters";

const isMonochromePreviewFilmStockType = (stockType: FilmStockType | null | undefined) => (
  stockType === "bw" || stockType === "bw_slide" || stockType === "bw_infrared"
);

export interface PhotoFilterFieldsetProps {
  filters: Filter[];
  filtersLoaded: boolean;
  filtersLoadError: string | null;
  selectedLensId: string;
  selectedFilmStockType?: FilmStockType | null;
  selectedFilmStockName?: string | null;
  filmSpectralResponseKey?: FilmSpectralResponseKey | null;
  selectedFilterIds: string[];
  previewImageUrl?: string | null;
  previewImageLabel?: string | null;
  onChange: (next: string[]) => void;
  readingThroughSelectedFilters?: boolean;
  onReadingThroughSelectedFiltersChange?: (value: boolean) => void;
}

export function PhotoFilterFieldset({
  filters,
  filtersLoaded,
  filtersLoadError,
  selectedLensId,
  selectedFilmStockType = null,
  selectedFilmStockName = null,
  filmSpectralResponseKey = null,
  selectedFilterIds,
  previewImageUrl = null,
  previewImageLabel = null,
  onChange,
  readingThroughSelectedFilters = false,
  onReadingThroughSelectedFiltersChange,
}: PhotoFilterFieldsetProps) {
  const compatibleFilters = useMemo(
    () => getCompatibleFilters(filters, selectedLensId, selectedFilmStockType),
    [filters, selectedFilmStockType, selectedLensId],
  );
  const filterById = useMemo(
    () => new Map(filters.map((filter) => [filter.id, filter])),
    [filters],
  );
  const selectedFilterIdSet = useMemo(
    () => new Set(selectedFilterIds),
    [selectedFilterIds],
  );
  const selectedFilters = useMemo(
    () => selectedFilterIds.map((filterId) => filterById.get(filterId)).filter((filter): filter is Filter => Boolean(filter)),
    [filterById, selectedFilterIds],
  );
  const totalFilterFactor = useMemo(
    () => getTotalFilterFactor(selectedFilters),
    [selectedFilters],
  );
  const selectedFilterSimulationStack = useMemo(
    () => getFilterSimulationOptions(selectedFilters),
    [selectedFilters],
  );
  const selectedFilterSummary = useMemo(
    () => formatFilterSelectionSummary(selectedFilters),
    [selectedFilters],
  );
  const dropdownSummary = selectedFilters.length > 0 ? selectedFilterSummary : "(No Filters)";
  const previewContextText = useMemo(
    () => [
      selectedFilters.length === 1 ? `Selected filter: ${selectedFilterSummary}` : `Selected filters: ${selectedFilterSummary}`,
      selectedFilmStockName ? `Film stock: ${selectedFilmStockName}` : null,
    ].filter(Boolean).join(" · "),
    [selectedFilmStockName, selectedFilterSummary, selectedFilters.length],
  );
  const previewMonochrome = isMonochromePreviewFilmStockType(selectedFilmStockType);
  const fieldsetStateClassName = !selectedLensId
    ? "photo-filter-fieldset--inactive"
    : filtersLoadError
      ? "photo-filter-fieldset--error"
      : !filtersLoaded
        ? "photo-filter-fieldset--loading"
        : compatibleFilters.length === 0
          ? "photo-filter-fieldset--empty"
          : "photo-filter-fieldset--ready";

  const handleToggle = (filterId: string, enabled: boolean) => {
    if (enabled) {
      onChange(selectedFilterIds.includes(filterId) ? selectedFilterIds : [...selectedFilterIds, filterId]);
      return;
    }
    onChange(selectedFilterIds.filter((currentId) => currentId !== filterId));
  };

  let body: ReactNode;
  if (!selectedLensId) {
    body = <p className="muted">Choose a lens to see compatible filters.</p>;
  } else if (filtersLoadError) {
    body = <p className="muted">Filter options are unavailable right now.</p>;
  } else if (!filtersLoaded) {
    body = <p className="muted">Loading filter options…</p>;
  } else if (compatibleFilters.length === 0) {
    body = <p className="muted">No filters are compatible with this lens and film type yet.</p>;
  } else {
    body = (
      <>
        <details className="photo-filter-dropdown">
          <summary className="photo-filter-dropdown-summary">
            <span className="photo-filter-dropdown-summary-label">Selected filters</span>
            <span className="photo-filter-dropdown-summary-value">{dropdownSummary}</span>
          </summary>
          <div className="photo-filter-checklist" role="group" aria-label="Compatible filters">
            {compatibleFilters.map((filter) => {
              const checked = selectedFilterIdSet.has(filter.id);
              return (
                <label key={filter.id} className="photo-filter-checklist-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => handleToggle(filter.id, event.target.checked)}
                  />
                  <span className="photo-filter-checklist-copy">
                    <span className="photo-filter-checklist-name">{formatFilterDisplayLabel(filter)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </details>

        <div className="photo-filter-summary">
          {selectedFilters.length > 0 && (
            <div className="photo-filter-summary-row">
              <span className="photo-filter-summary-label">Combined filter factor</span>
              <strong>{formatFilterFactorLabel(totalFilterFactor)}</strong>
            </div>
          )}
          {selectedFilters.length > 0 && onReadingThroughSelectedFiltersChange && (
            <label className="photo-filter-meter-toggle">
              <input
                type="checkbox"
                checked={readingThroughSelectedFilters}
                onChange={(event) => onReadingThroughSelectedFiltersChange(event.target.checked)}
              />
              <span>Meter through selected filters</span>
            </label>
          )}
          {previewImageUrl && (
            <PreviewResultLink
              title="Preview selected filters"
              description="Preview the selected filter stack on this photo's reference image."
              initialPreviewUrl={previewImageUrl}
              initialPreviewName={previewImageLabel ?? "Reference image"}
              contextText={previewContextText}
              renderPreview={(previewUrl) => (
                <FilterSimulationImage
                  src={previewUrl}
                  alt="Local selected filter stack preview"
                  settings={null}
                  settingsStack={selectedFilterSimulationStack}
                  monochrome={previewMonochrome}
                  filmSpectralResponseKey={previewMonochrome ? filmSpectralResponseKey : null}
                  beforeLabel={previewMonochrome ? "Plain B&W" : undefined}
                  afterLabel={selectedFilters.length === 0 ? previewMonochrome && filmSpectralResponseKey ? "Film" : "Preview" : previewMonochrome && filmSpectralResponseKey ? "Filters + Film" : "Filters"}
                />
              )}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <fieldset className={`photo-filter-fieldset ${fieldsetStateClassName}`}>
      <legend>Filters</legend>
      {body}
    </fieldset>
  );
}
