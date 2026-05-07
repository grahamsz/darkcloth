import type { Camera, FilmHolder, Lens, Roll, RollFormat } from "./api/client";

export type CameraFilmWorkflow = "sheet" | "roll" | "fallback";

export interface MediaSelectionState {
  rollId: string;
  frameNumber: string;
  filmHolderId: string;
}

export interface RollCreateDraft {
  name: string;
  filmId: string;
  rollFormat: RollFormat | "";
}

export interface HolderLoadDraft {
  filmId: string;
  notes: string;
}

export const ROLL_FORMAT_OPTIONS: RollFormat[] = ["35mm", "120", "220", "127", "620"];

const normalizeIds = (ids?: string[] | null) => ids ?? [];

const isActiveFilmHolderLoad = (holder: FilmHolder | null | undefined) => {
  const status = holder?.current_load?.status;
  return status === "loaded" || status === "exposed";
};

export const isLensCompatibleWithCamera = (
  lens: Pick<Lens, "id" | "applicable_camera_ids">,
  camera: Pick<Camera, "id" | "acceptable_lens_ids">,
) => {
  const lensCompatibleCameras = normalizeIds(lens.applicable_camera_ids);
  if (lensCompatibleCameras.length > 0) {
    return lensCompatibleCameras.includes(camera.id);
  }
  const legacyCompatibleLenses = normalizeIds(camera.acceptable_lens_ids);
  if (legacyCompatibleLenses.length > 0) {
    return legacyCompatibleLenses.includes(lens.id);
  }
  return true;
};

export const getCameraFilmWorkflow = (camera?: Pick<Camera, "film_type"> | null): CameraFilmWorkflow => {
  if (camera?.film_type === "sheet") return "sheet";
  if (camera?.film_type === "roll") return "roll";
  return "fallback";
};

export const formatRollFormatLabel = (rollFormat: RollFormat | null | undefined) => {
  if (!rollFormat) return "Any roll format";
  return rollFormat;
};

export const getCameraRollFormatSummary = (camera?: Pick<Camera, "film_type" | "roll_format"> | null) => {
  if (camera?.film_type !== "roll") return "";
  return camera.roll_format ? `Roll format ${camera.roll_format}` : "Any roll format";
};

export const isRollCompatibleWithCamera = (
  roll: Pick<Roll, "film_id" | "roll_format">,
  camera?: Pick<Camera, "film_type" | "roll_format"> | null,
) => {
  if (camera?.film_type !== "roll") return true;
  if (!roll.film_id) return false;
  return camera.roll_format === null || roll.roll_format === camera.roll_format;
};

export const filterCompatibleRolls = (
  rolls: Roll[],
  camera?: Pick<Camera, "film_type" | "roll_format"> | null,
) => {
  if (camera?.film_type !== "roll") return rolls;
  return rolls.filter(roll => isRollCompatibleWithCamera(roll, camera));
};

export const isFilmHolderApplicableToCamera = (
  holder: Pick<FilmHolder, "applicable_camera_ids">,
  camera?: Pick<Camera, "id"> | null,
) => {
  const applicableCameraIds = normalizeIds(holder.applicable_camera_ids);
  if (applicableCameraIds.length === 0) return true;
  if (!camera?.id) return true;
  return applicableCameraIds.includes(camera.id);
};

export const filterApplicableFilmHolders = (
  holders: FilmHolder[],
  camera?: Pick<Camera, "id"> | null,
) => holders.filter(holder => isFilmHolderApplicableToCamera(holder, camera));

export const filterCompatibleLenses = (
  lenses: Lens[],
  camera?: Pick<Camera, "id" | "acceptable_lens_ids"> | null,
) => {
  if (!camera) return lenses;
  return lenses.filter(lens => isLensCompatibleWithCamera(lens, camera));
};

export const normalizeLensSelectionForCamera = (
  lensId: string,
  compatibleLenses: Pick<Lens, "id">[] = [],
) => {
  if (lensId && compatibleLenses.some(lens => lens.id === lensId)) {
    return lensId;
  }
  if (compatibleLenses.length === 1) {
    return compatibleLenses[0].id;
  }
  return "";
};

export const normalizeMediaSelectionForCamera = (
  selection: MediaSelectionState,
  camera?: Pick<Camera, "film_type" | "roll_format" | "id"> | null,
  rolls: Roll[] = [],
  holders: FilmHolder[] = [],
) => {
  const nextSelection: MediaSelectionState = { ...selection };

  if (!camera) {
    return nextSelection;
  }

  if (camera.film_type === "sheet") {
    nextSelection.rollId = "";
    nextSelection.frameNumber = "";
  }

  if (camera.film_type === "roll") {
    nextSelection.filmHolderId = "";
  }

  if (nextSelection.rollId) {
    const selectedRoll = rolls.find(roll => roll.id === nextSelection.rollId) ?? null;
    if (!selectedRoll || !isRollCompatibleWithCamera(selectedRoll, camera)) {
      nextSelection.rollId = "";
      nextSelection.frameNumber = "";
    }
  } else if (camera.film_type === "sheet") {
    nextSelection.frameNumber = "";
  }

  if (nextSelection.filmHolderId) {
    const selectedHolder = holders.find(holder => holder.id === nextSelection.filmHolderId) ?? null;
    if (!selectedHolder || !isActiveFilmHolderLoad(selectedHolder) || !isFilmHolderApplicableToCamera(selectedHolder, camera)) {
      nextSelection.filmHolderId = "";
    }
  }

  if (!nextSelection.rollId && camera.film_type === "roll") {
    nextSelection.frameNumber = "";
  }

  return nextSelection;
};

export const createEmptyRollCreateDraft = (
  camera?: Pick<Camera, "film_type" | "roll_format"> | null,
  filmId = "",
): RollCreateDraft => ({
  name: "",
  filmId,
  rollFormat: camera?.film_type === "roll" ? camera.roll_format ?? "" : "",
});

export const buildRollCreatePayload = (draft: RollCreateDraft) => ({
  name: draft.name.trim(),
  film_id: draft.filmId.trim() ? draft.filmId.trim() : null,
  roll_format: draft.rollFormat || null,
});

export const createEmptyHolderLoadDraft = (filmId = "", notes = ""): HolderLoadDraft => ({
  filmId,
  notes,
});

export const buildHolderLoadPayload = (draft: HolderLoadDraft) => ({
  film_id: draft.filmId.trim(),
  notes: draft.notes.trim() ? draft.notes.trim() : null,
});
