import type { Photograph } from "./api/client";

export function normalizePhotographTitle(title: string | null | undefined): string | null {
  const normalized = title?.trim() ?? "";
  return normalized || null;
}

export function getPhotographFallbackLabel(photo: Pick<Photograph, "frame_number" | "film_holder_id">) {
  const frameNumber = photo.frame_number?.trim();
  if (frameNumber) return `Frame ${frameNumber}`;
  if (photo.film_holder_id) return "Sheet photograph";
  return "Photograph";
}

export function getPhotographListLabel(
  photo: Pick<Photograph, "title" | "frame_number" | "film_holder_id">,
) {
  return normalizePhotographTitle(photo.title) ?? getPhotographFallbackLabel(photo);
}

export function getPhotographSecondaryTitle(
  photo: Pick<Photograph, "title" | "frame_number" | "film_holder_id">,
) {
  const title = normalizePhotographTitle(photo.title);
  if (!title) return null;

  const fallback = getPhotographFallbackLabel(photo);
  return title.toLowerCase() === fallback.toLowerCase() ? null : title;
}
