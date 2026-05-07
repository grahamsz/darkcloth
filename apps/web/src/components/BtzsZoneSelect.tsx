import { getBtzsZoneChoiceOptions } from "../photoExposure";

interface BtzsZoneSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function getZoneTone(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed / 10));
}

function getZoneSwatchColor(value: string) {
  const tone = getZoneTone(value);
  const channel = Math.round(tone * 255);
  return `rgb(${channel}, ${channel}, ${channel})`;
}

export function BtzsZoneSelect({
  id,
  value,
  onChange,
  disabled = false,
}: BtzsZoneSelectProps) {
  const choices = getBtzsZoneChoiceOptions(value);
  const swatchColor = getZoneSwatchColor(value);

  return (
    <div className="btzs-zone-select">
      <span
        className="btzs-zone-select-swatch"
        style={{ backgroundColor: swatchColor }}
        aria-hidden="true"
      />
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}
