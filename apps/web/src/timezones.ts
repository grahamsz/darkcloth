const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

function dedupeTimeZones(timeZones: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const timeZone of timeZones) {
    const normalized = timeZone.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function buildTimezoneOptions(browserTimeZone: string, supportedTimeZones?: readonly string[] | null) {
  const source = supportedTimeZones ?? FALLBACK_TIME_ZONES;
  return dedupeTimeZones([browserTimeZone, ...source]);
}

function getSupportedTimeZones() {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };

  if (typeof intl.supportedValuesOf !== "function") return null;

  try {
    return intl.supportedValuesOf("timeZone");
  } catch {
    return null;
  }
}

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
}

export function getTimezoneOptions(browserTimeZone = getBrowserTimeZone()) {
  const supportedTimeZones = getSupportedTimeZones();
  return buildTimezoneOptions(browserTimeZone, supportedTimeZones);
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}
