import { formatExposureStopError } from "../photoExposure";

interface MeteredExposureChoiceCardProps {
  title: string;
  idealLabel: string;
  idealValue: string;
  supportedLabel: string;
  supportedValue: string;
  stopError?: number | null;
  warnings?: string[];
}

export function MeteredExposureChoiceCard({
  title,
  idealLabel,
  idealValue,
  supportedLabel,
  supportedValue,
  stopError,
  warnings = [],
}: MeteredExposureChoiceCardProps) {
  const formattedStopError = formatExposureStopError(stopError);

  return (
    <div className="photo-exposure-preview photo-exposure-preview--metered">
      <div className="photo-exposure-choice-card-title">{title}</div>
      <div className="photo-exposure-preview-values">
        <div>
          <span>{idealLabel}</span>
          <strong>{idealValue}</strong>
        </div>
        <div>
          <span>{supportedLabel}</span>
          <strong>{supportedValue}</strong>
        </div>
      </div>
      {formattedStopError && (
        <div className="photo-exposure-choice-error">
          <span>Exposure error</span>
          <strong>{formattedStopError}</strong>
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="photo-exposure-warning-list">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
