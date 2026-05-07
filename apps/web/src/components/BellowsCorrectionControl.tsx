import type { BellowsCorrectionMode } from "../photoExposure";

interface BellowsCorrectionControlProps {
  mode: BellowsCorrectionMode;
  extensionMm: string;
  subjectDistanceM: string;
  onModeChange: (mode: BellowsCorrectionMode) => void;
  onExtensionMmChange: (value: string) => void;
  onSubjectDistanceMChange: (value: string) => void;
  stops: number;
}

const modeOptions: Array<{ value: BellowsCorrectionMode; label: string }> = [
  { value: "none", label: "None" },
  { value: "measurement", label: "Measurement" },
  { value: "distance", label: "Distance" },
];

export function BellowsCorrectionControl({
  mode,
  extensionMm,
  subjectDistanceM,
  onModeChange,
  onExtensionMmChange,
  onSubjectDistanceMChange,
  stops,
}: BellowsCorrectionControlProps) {
  return (
    <div className="bellows-correction">
      <div className="photo-exposure-segmented" role="group" aria-label="Bellows correction">
        {modeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`photo-exposure-segmented-button${mode === option.value ? " photo-exposure-segmented-button--active" : ""}`}
            aria-pressed={mode === option.value}
            onClick={() => onModeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {mode === "measurement" && (
        <div className="field field-sm bellows-correction-field">
          <label htmlFor="bellows_extension_mm">Bellows length (mm)</label>
          <input
            id="bellows_extension_mm"
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={extensionMm}
            onChange={(event) => onExtensionMmChange(event.target.value)}
          />
        </div>
      )}
      {mode === "distance" && (
        <div className="field field-sm bellows-correction-field">
          <label htmlFor="bellows_subject_distance_m">Subject distance (m)</label>
          <input
            id="bellows_subject_distance_m"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={subjectDistanceM}
            onChange={(event) => onSubjectDistanceMChange(event.target.value)}
          />
        </div>
      )}
      {mode !== "none" && (
        <p className="field-note bellows-correction-note">
          Bellows correction: {Number.isFinite(stops) ? `${stops.toFixed(2)} stops` : "—"}
        </p>
      )}
    </div>
  );
}
