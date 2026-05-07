import type { FilmHolder, FilmHolderLoad } from "./api/client";
import { formatDateTimeDisplay } from "./dateTime";
import { formatFilmStockTypeLabel } from "./film-stocks";

export type FilmHolderLoadTone = "idle" | "active" | "warn" | "done";

export function isActiveFilmHolderLoad(load: FilmHolderLoad | null | undefined) {
  return load?.status === "loaded" || load?.status === "exposed";
}

export function isUndoableFilmHolderLoad(load: FilmHolderLoad | null | undefined) {
  return load?.status === "exposed";
}

export function getFilmHolderLoadFilmId(load: FilmHolderLoad | null | undefined) {
  return load?.film?.id ?? load?.film_id ?? null;
}

export function getFilmHolderLoadFilmName(load: FilmHolderLoad | null | undefined) {
  return load?.film?.name?.trim() ?? "";
}

export function formatFilmHolderLoadFilmLabel(load: FilmHolderLoad | null | undefined) {
  const filmName = getFilmHolderLoadFilmName(load);
  const filmType = load?.film?.stock_type ? formatFilmStockTypeLabel(load.film.stock_type) : "";
  if (!filmName && !filmType) return "Film unavailable";
  if (!filmType) return filmName || "Film unavailable";
  return filmName ? `${filmName} · ${filmType}` : filmType;
}

export function formatFilmHolderLoadDevelopmentLabel(load: FilmHolderLoad | null | undefined) {
  const summary = load?.development_summary;
  if (!summary) return null;

  const formatStoredDevelopmentMinutes = (minutes: number) => {
    const totalSeconds = Math.max(0, Math.round(minutes * 60));
    const wholeMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${wholeMinutes} min ${String(seconds).padStart(2, "0")} sec`;
  };

  if (summary.source === "stored-btzs-calculation") {
    if (summary.minutes != null && Number.isFinite(summary.minutes)) {
      return formatStoredDevelopmentMinutes(summary.minutes);
    }

    const timeText = summary.time_text?.trim() ?? "";
    if (timeText) return timeText;
    return null;
  }

  const timeText = summary.time_text?.trim() ?? "";
  if (timeText) return timeText;
  if (summary.minutes != null && Number.isFinite(summary.minutes)) {
    return formatStoredDevelopmentMinutes(summary.minutes);
  }
  return null;
}

export function getFilmHolderLoadTimestamp(load: FilmHolderLoad | null | undefined) {
  if (!load) return "";
  if (load.status === "processed") return load.processed_at ?? load.exposed_at ?? load.loaded_at;
  if (load.status === "exposed") return load.exposed_at ?? load.loaded_at;
  if (load.status === "discarded") return load.discarded_at ?? load.updated_at ?? load.loaded_at;
  return load.loaded_at;
}

export function getFilmHolderLoadTone(load: FilmHolderLoad | null | undefined): FilmHolderLoadTone {
  if (!load) return "idle";
  if (load.status === "loaded") return "active";
  if (load.status === "exposed") return "warn";
  return "done";
}

export function formatFilmHolderLoadStatusLabel(status: FilmHolderLoad["status"] | "empty") {
  if (status === "loaded") return "Loaded";
  if (status === "exposed") return "Exposed";
  if (status === "processed") return "Processed";
  if (status === "discarded") return "Discarded";
  return "Empty";
}

export function formatFilmHolderLoadSummary(load: FilmHolderLoad | null | undefined, timeZone?: string | null) {
  if (!load) return "Empty";
  const parts = [formatFilmHolderLoadStatusLabel(load.status)];
  const filmName = getFilmHolderLoadFilmName(load);
  if (filmName) parts.push(filmName);
  const timestamp = formatDateTimeDisplay(getFilmHolderLoadTimestamp(load), timeZone);
  if (timestamp) parts.push(timestamp);
  return parts.join(" · ");
}

export function getFilmHolderUndoExposureConfirmationText(load: FilmHolderLoad | null | undefined) {
  const base = "Undo this exposure? The holder will become loaded/unexposed again.";
  if (!load?.exposed_photograph_id) return base;
  return `${base} The linked photograph's holder reference will be cleared.`;
}

export function formatFilmHolderLoadDiscardReason(load: FilmHolderLoad | null | undefined) {
  if (!load || load.status !== "discarded") return null;
  const reason = load.discarded_reason?.trim() ?? "";
  return reason || "Discarded after holder was re-exposed";
}

export type FilmHolderDiscardConfirmationMode = "reexpose" | "reload";

export function getFilmHolderDiscardConfirmationText(
  holderName: string,
  load: FilmHolderLoad | null | undefined,
  timeZone?: string | null,
  mode: FilmHolderDiscardConfirmationMode = "reexpose",
) {
  if (load?.status !== "exposed") return null;

  const cleanHolderName = holderName.trim() || "this holder";
  const photographLabel = formatFilmHolderLoadPhotographLabel(load, timeZone);
  const lines = [
    mode === "reexpose"
      ? `Re-expose ${cleanHolderName}?`
      : `Discard exposed load for ${cleanHolderName}?`,
    `Current film: ${formatFilmHolderLoadFilmLabel(load)}`,
    photographLabel ? `Existing exposure: ${photographLabel}` : null,
    mode === "reexpose"
      ? "Proceeding will mark this exposed load discarded before recording the new exposure."
      : "Proceeding will mark this exposed load discarded before the holder is loaded again.",
    "Cancel leaves the current holder unchanged.",
  ].filter((line): line is string => line != null);

  return lines.join("\n");
}

export function formatFilmHolderLoadProfileLabel(load: FilmHolderLoad | null | undefined) {
  const profileName = load?.development_profile?.name?.trim() ?? "";
  if (profileName) return profileName;
  if (load?.development_profile_id) return "Development profile unavailable";
  return "No profile";
}

export function formatFilmHolderLoadPhotographLabel(
  load: FilmHolderLoad | null | undefined,
  timeZone?: string | null,
) {
  const photograph = load?.exposed_photograph ?? null;
  if (!photograph) {
    return load?.exposed_photograph_id ? "Photograph unavailable" : "";
  }

  const parts: string[] = [];
  if (photograph.frame_number?.trim()) parts.push(`Frame ${photograph.frame_number.trim()}`);
  if (photograph.camera_name?.trim()) parts.push(photograph.camera_name.trim());
  if (photograph.lens_name?.trim()) parts.push(photograph.lens_name.trim());
  const takenAt = formatDateTimeDisplay(photograph.taken_at, timeZone);
  if (takenAt) parts.push(`Taken ${takenAt}`);
  return parts.length > 0 ? parts.join(" · ") : "Photograph";
}

export function getFilmHolderLoadPhotographThumbnailUrl(load: FilmHolderLoad | null | undefined) {
  return load?.exposed_photograph?.reference_image?.thumbnail_url
    ?? load?.exposed_photograph?.reference_image?.url
    ?? null;
}

export function getFilmHolderLoadPhotographAlt(load: FilmHolderLoad | null | undefined) {
  const frameNumber = load?.exposed_photograph?.frame_number?.trim();
  if (frameNumber) return `Frame ${frameNumber} thumbnail`;
  return "Photograph thumbnail";
}

export function getFilmHolderHistoricalLoads(holder: Pick<FilmHolder, "current_load" | "load_history">) {
  const history = holder.load_history ?? [];
  const currentLoadId = holder.current_load?.id ?? null;
  if (!currentLoadId) return history;
  return history.filter((load) => load.id !== currentLoadId);
}

export function formatFilmHolderSelectorLabel(holder: Pick<FilmHolder, "name" | "current_load">) {
  const parts = [holder.name.trim()];
  if (!holder.current_load) {
    parts.push("Empty");
    return parts.join(" · ");
  }

  parts.push(formatFilmHolderLoadStatusLabel(holder.current_load.status));
  const filmName = getFilmHolderLoadFilmName(holder.current_load);
  if (filmName) parts.push(filmName);
  return parts.join(" · ");
}

export function formatFilmHolderDetailSummary(
  holder: Pick<FilmHolder, "current_load" | "load_history">,
  timeZone?: string | null,
) {
  const load = holder.current_load ?? holder.load_history?.[0] ?? null;
  if (!load) return "Empty";

  const summary = formatFilmHolderLoadSummary(load, timeZone);
  const developmentLabel = formatFilmHolderLoadDevelopmentLabel(load);
  if (!developmentLabel) return summary;
  const developmentPrefix = load.development_summary?.source === "stored-btzs-calculation"
    ? "BTZS development"
    : "Development";
  return `${summary} · ${developmentPrefix}: ${developmentLabel}`;
}
