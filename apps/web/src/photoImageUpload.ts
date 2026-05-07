import type { ReferenceImageProcessingOptions } from "./referenceImageProcessing";

export interface PreparedPhotographImageUpload {
  original: File;
  display?: File;
  thumbnail?: File;
  deferredDisplay?: ReferenceImageProcessingOptions;
}

export type PhotographImageUploadDraft = File | PreparedPhotographImageUpload;

export function getPhotographImageUploadSignature(upload: PhotographImageUploadDraft) {
  const file = upload instanceof File ? upload : upload.original;
  const display = upload instanceof File ? null : upload.display;
  return [
    file.name,
    file.size,
    file.lastModified,
    display?.name ?? "",
    display?.size ?? "",
    display?.lastModified ?? "",
    upload instanceof File ? "" : upload.thumbnail?.name ?? "",
    upload instanceof File ? "" : upload.thumbnail?.size ?? "",
    upload instanceof File ? "" : upload.thumbnail?.lastModified ?? "",
    upload instanceof File ? "" : JSON.stringify(upload.deferredDisplay ?? null),
  ].join(":");
}

export function getPhotographImageUploadPreviewFile(upload: PhotographImageUploadDraft) {
  return upload instanceof File ? upload : upload.thumbnail ?? upload.display ?? upload.original;
}

export function getPhotographImageUploadOriginalFile(upload: PhotographImageUploadDraft) {
  return upload instanceof File ? upload : upload.original;
}

export async function preparePhotographImageUpload(upload: PhotographImageUploadDraft): Promise<PreparedPhotographImageUpload> {
  return upload instanceof File ? { original: upload } : upload;
}

export function buildPhotographImageUploadFormData(upload: PreparedPhotographImageUpload) {
  const form = new FormData();
  form.append("original", upload.original, upload.original.name);
  if (upload.display) {
    form.append("display", upload.display, upload.display.name);
  } else if (upload.deferredDisplay && upload.thumbnail) {
    form.append("display", upload.thumbnail, upload.thumbnail.name);
  }
  if (upload.thumbnail) {
    form.append("thumbnail", upload.thumbnail, upload.thumbnail.name);
  }
  return form;
}
