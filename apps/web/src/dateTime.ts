import { getBrowserTimeZone } from "./timezones";

const DATE_TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

export function formatDateTimeDisplay(value: string | null | undefined, timeZone?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const preferredTimeZone = timeZone ?? getBrowserTimeZone();

  try {
    return new Intl.DateTimeFormat(undefined, {
      ...DATE_TIME_FORMAT_OPTIONS,
      timeZone: preferredTimeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, DATE_TIME_FORMAT_OPTIONS).format(date);
  }
}
