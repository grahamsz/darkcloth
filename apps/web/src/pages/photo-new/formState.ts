import {
  createEmptyPhotographExposureDraft,
  createEmptyPhotographExposureModeDraft,
  type PhotographExposureDraft,
  type PhotographExposureModeDraft,
} from "../../photoExposure";
import {
  createEmptyPhotographLocationDraft,
  formatDateTimeLocalValue,
} from "../photoFormUtils";

export interface PhotoLogFormState extends PhotographExposureDraft, PhotographExposureModeDraft {
  camera_id: string;
  lens_id: string;
  film_holder_id: string;
  filter_ids: string[];
  roll_id: string;
  frame_number: string;
  taken_at: string;
  aperture: string;
  shutter_speed: string;
  focal_length_mm: string;
  latitude: string;
  longitude: string;
  altitude_m: string;
  title: string;
  notes: string;
}

export interface PhotoNewFormState extends PhotoLogFormState {}

export const createEmptyPhotoNewFormState = (): PhotoNewFormState => ({
  ...createEmptyPhotographExposureDraft(),
  ...createEmptyPhotographExposureModeDraft(),
  camera_id: "",
  lens_id: "",
  film_holder_id: "",
  filter_ids: [],
  roll_id: "",
  frame_number: "",
  taken_at: formatDateTimeLocalValue(),
  aperture: "",
  shutter_speed: "",
  focal_length_mm: "",
  ...createEmptyPhotographLocationDraft(),
  title: "",
  notes: "",
});

export const getFileSignature = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

export type MediaDialogState =
  | { kind: "roll" }
  | { kind: "holder"; holderId: string; holderName: string };
