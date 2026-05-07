interface ExposureHoldToggleProps {
  value: "aperture" | "shutter";
  onChange: (value: "aperture" | "shutter") => void;
  disabled?: boolean;
}

export function ExposureHoldToggle({
  value,
  onChange,
  disabled = false,
}: ExposureHoldToggleProps) {
  return (
    <div className="photo-exposure-hold-toggle" role="group" aria-label="Exposure hold">
      <button
        type="button"
        className={`photo-exposure-hold-toggle-button${value === "aperture" ? " photo-exposure-hold-toggle-button--active" : ""}`}
        aria-pressed={value === "aperture"}
        onClick={() => onChange("aperture")}
        disabled={disabled}
      >
        Aperture priority
      </button>
      <button
        type="button"
        className={`photo-exposure-hold-toggle-button${value === "shutter" ? " photo-exposure-hold-toggle-button--active" : ""}`}
        aria-pressed={value === "shutter"}
        onClick={() => onChange("shutter")}
        disabled={disabled}
      >
        Shutter priority
      </button>
    </div>
  );
}
