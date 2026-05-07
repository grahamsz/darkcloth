const DISPLAY_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function normalizeFormattedNumber(value: string) {
  return /^-0(?:\.0+)?$/.test(value) ? "0" : value;
}

export function formatBtzsDisplayNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return normalizeFormattedNumber(DISPLAY_NUMBER_FORMAT.format(value));
}

export function formatBtzsChartCell(value: unknown) {
  if (value == null || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return formatBtzsDisplayNumber(value);
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "—";
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return formatBtzsDisplayNumber(parsed);
    }

    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
