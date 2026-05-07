import type { PhotographImage } from "./api/client";

type PhotographImageDisplaySource = Pick<PhotographImage, "thumbnail_url" | "url" | "original_url">;
type PhotographImageLabelSource = Pick<PhotographImage, "original_filename">;

export function getPhotographImageDisplayUrl(image: PhotographImageDisplaySource) {
  return image.thumbnail_url ?? image.url ?? image.original_url ?? null;
}

export function getPhotographImagePreviewUrl(image: PhotographImageDisplaySource) {
  return getPhotographImageDisplayUrl(image);
}

export function getPhotographImageOpenUrl(image: PhotographImageDisplaySource) {
  return image.url ?? image.original_url ?? image.thumbnail_url ?? null;
}

export function getPhotographImageOriginalUrl(image: PhotographImageDisplaySource) {
  return image.original_url ?? image.url ?? image.thumbnail_url ?? null;
}

export function formatPhotographImageLabel(image: PhotographImageLabelSource) {
  return image.original_filename ?? "Reference image";
}
