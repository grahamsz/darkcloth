import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ApertureChoice } from "../optics";

interface AperturePickerProps {
  id: string;
  value: string;
  options: ApertureChoice[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function AperturePicker({
  id,
  value,
  options,
  onChange,
  placeholder = "None",
  disabled = false,
}: AperturePickerProps) {
  const [open, setOpen] = useState(false);
  const [sliderIndex, setSliderIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const sliderId = useId();
  const rangeId = useId();
  const panelId = useId();

  const normalizedOptions = useMemo(() => {
    if (options.length > 0) return options;
    const fallback = value || placeholder;
    return [{ value: fallback, label: fallback }];
  }, [options, value, placeholder]);

  const selectedIndex = useMemo(() => {
    const match = normalizedOptions.findIndex(option => option.value === value);
    return match >= 0 ? match : 0;
  }, [normalizedOptions, value]);

  useEffect(() => {
    setSliderIndex(selectedIndex);
  }, [selectedIndex]);

  const selectedLabel = value
    ? normalizedOptions[selectedIndex]?.label ?? value
    : placeholder;
  const sliderLabel = normalizedOptions[sliderIndex]?.label ?? selectedLabel;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const stepSelection = (delta: -1 | 1) => {
    if (disabled || normalizedOptions.length <= 1) return;
    const nextIndex = Math.min(Math.max(selectedIndex + delta, 0), normalizedOptions.length - 1);
    if (nextIndex === selectedIndex) return;
    const choice = normalizedOptions[nextIndex];
    setSliderIndex(nextIndex);
    if (choice) onChange(choice.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement | HTMLInputElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    stepSelection(event.key === "ArrowLeft" ? -1 : 1);
  };

  const handleRangeChange = (nextValue: string) => {
    const index = Number.parseInt(nextValue, 10);
    if (!Number.isFinite(index)) return;
    if (index === sliderIndex) return;
    setSliderIndex(index);

    const choice = normalizedOptions[index];
    if (choice) onChange(choice.value);
  };

  const panelMax = Math.max(0, normalizedOptions.length - 1);

  return (
    <div className="fstop-picker" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="fstop-picker-trigger"
        onClick={() => setOpen(v => !v)}
        onKeyDown={handleKeyDown}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        disabled={disabled}
      >
        <span className="fstop-picker-trigger-label" title={selectedLabel}>
          {selectedLabel}
        </span>
        <span aria-hidden className="fstop-picker-trigger-caret">▾</span>
      </button>

      {open && (
        <div id={panelId} className="fstop-picker-popover" role="dialog" aria-label="Aperture picker">
          <input
            id={sliderId}
            type="range"
            className="fstop-picker-slider"
            min={0}
            max={panelMax}
            step={1}
            value={sliderIndex}
            onChange={(event) => handleRangeChange(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-valuetext={sliderLabel}
            list={`${rangeId}-ticks`}
          />
          <div className="fstop-picker-value" title={sliderLabel}>
            {sliderLabel}
          </div>
          <datalist id={`${rangeId}-ticks`}>
            {normalizedOptions.map((option, index) => (
              <option key={`${option.value}-${index}`} value={index} label={option.label} />
            ))}
          </datalist>
        </div>
      )}
    </div>
  );
}
