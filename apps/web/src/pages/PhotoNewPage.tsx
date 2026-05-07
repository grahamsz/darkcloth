import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/client";
import type { Camera, Filter, FilmStock, Roll, FilmHolder, Lens, Photograph, PhotographWritePayload } from "../api/client";
import { PhotoFilterFieldset } from "../components/PhotoFilterFieldset";
import { useAuth } from "../contexts/AuthContext";
import { useConnectivity } from "../contexts/ConnectivityContext";
import { schedulePhotographImageDisplayUpdate } from "../deferredPhotographImageDisplay";
import {
  readCachedCameras,
  readCachedFilmHolders,
  readCachedFilmStocks,
  readCachedFilters,
  readCachedLenses,
  readCachedPhotographs,
  readCachedRolls,
} from "../offline/cache";
import {
  queueOfflineFilmHolderAction,
  queueOfflinePhotographCreate,
  queueOfflinePhotographImageUpload,
  queueOfflineRollCreate,
} from "../offline/sync";
import {
  getApertureChoiceOptions,
  getCameraShutterCapability,
  getLensFocalRange,
  getShutterChoiceOptions,
} from "../optics";
import {
  getFocalLengthError,
  getPrimeLensFocalLengthValue,
} from "../photoFocalLength";
import {
  buildPhotographExposureWritePayload,
  calculateBellowsCorrectionStops,
  calculateBtzsExposure,
  calculateSimpleZoneSystemExposure,
  calculateZoneMeteringExposure,
  buildMeteredExposurePreview,
  formatBulbDurationInputValue,
  getManualReciprocityWarning,
  getPhotographExposureModeAvailability,
  inferPhotographExposureFilmStock,
  isBulbShutterValue,
  parseDevelopmentTimeTextMinutes,
  resolveBtzsProfileFlareFactor,
  resolveBtzsProfilePaperEs,
  resolveBtzsProfileSelection,
  resolveExposureChoiceDisplay,
  resolveSingleSpotProfileDevelopment,
} from "../photoExposure";
import { resolvePhotographFrameFormat } from "../filmFormats";
import { getEnabledFilmSpectralResponseKey, isMonochromeFilmStockType } from "../film-stocks";
import { areFilterIdsEqual, getReferenceImagePreviewFilters, getSelectedFiltersInOrder, normalizeFilterSimulationSettings, pruneFilterIdsToCompatible } from "../photoFilters";
import {
  getPhotographImageUploadSignature,
  getPhotographImageUploadOriginalFile,
  preparePhotographImageUpload,
  type PreparedPhotographImageUpload,
  type PhotographImageUploadDraft,
} from "../photoImageUpload";
import {
  processReferenceImageForDisplay,
  type ReferenceImageProcessingOptions,
} from "../referenceImageProcessing";
import {
  extractReferenceImageExifExposureEstimate,
  formatExifEv100,
  type ReferenceImageExifExposureEstimate,
} from "../photoExif";
import {
  buildHolderLoadPayload,
  buildRollCreatePayload,
  createEmptyHolderLoadDraft,
  createEmptyRollCreateDraft,
  filterApplicableFilmHolders,
  filterCompatibleLenses,
  filterCompatibleRolls,
  getCameraFilmWorkflow,
  isFilmHolderApplicableToCamera,
  normalizeMediaSelectionForCamera,
  normalizeLensSelectionForCamera,
  type HolderLoadDraft,
  type RollCreateDraft,
} from "../photoMedia";
import {
  formatDateTimeLocalValue,
  sortByName,
  formatPhotographLocationDraft,
  setOptionalNumberPayloadValue,
} from "./photoFormUtils";
import {
  buildExposureWritePayloadInput,
  parsePositiveNumber,
  type PhotographPayloadValue,
} from "./photoExposurePageUtils";
import { useBtzsDevelopmentProfiles } from "../hooks/useBtzsDevelopmentProfiles";
import { usePreferredTimeZone } from "../hooks/usePreferredTimeZone";
import { normalizePhotographTitle } from "../photoIdentity";
import {
  getFilmHolderDiscardConfirmationText,
  getFilmHolderLoadFilmId,
  isActiveFilmHolderLoad,
} from "../filmHolders";
import { formatRawXdfPaperEsInputValue } from "../btzs/xdf";
import {
  createEmptyPhotoNewFormState,
  getFileSignature,
  type MediaDialogState,
  type PhotoNewFormState,
} from "./photo-new/formState";
import { ExposureFieldset } from "./photo-new/ExposureFieldset";
import {
  GearMediaFieldsets,
  IdentityFieldset,
  LensFieldset,
  LocationFieldset,
} from "./photo-new/FormSections";
import { MediaDialogs } from "./photo-new/MediaDialogs";
import { ReferenceImagesFieldset } from "./photo-new/ReferenceImagesFieldset";
import { ReferenceImageImportDialog } from "./photo-new/ReferenceImageImportDialog";
import {
  clearPhotoLogReferenceImageDraft,
  readPhotoLogReferenceImageDraft,
  writePhotoLogReferenceImageDraft,
} from "./photo-new/photoLogReferenceImageDraft";

const getPhotographRecencyTimestamp = (photo: Photograph) => {
  const takenAtTime = photo.taken_at ? Date.parse(photo.taken_at) : Number.NaN;
  if (Number.isFinite(takenAtTime)) return takenAtTime;
  const createdAtTime = Date.parse(photo.created_at);
  return Number.isFinite(createdAtTime) ? createdAtTime : 0;
};

const sortPhotographsByRecency = (photos: Photograph[]) =>
  [...photos].sort((left, right) => getPhotographRecencyTimestamp(right) - getPhotographRecencyTimestamp(left));

const REFERENCE_THUMBNAIL_MAX_LONG_EDGE = 256;
const REFERENCE_FAST_DISPLAY_MAX_LONG_EDGE = 768;
const REFERENCE_FINAL_DISPLAY_MAX_LONG_EDGE = 2048;
const PHOTO_LOG_DRAFT_STORAGE_KEY = "darkcloth:photo-log-draft:v1";
const PHOTO_LOG_DRAFT_FRESHNESS_MS = 5 * 60 * 1000;

type PhotoLogDraft = {
  form: PhotoNewFormState;
  startedAt: string;
  autoLocationSet: boolean;
};

const normalizePhotoLogDraftForm = (draft: Partial<PhotoNewFormState> | null | undefined): PhotoNewFormState => ({
  ...createEmptyPhotoNewFormState(),
  ...draft,
  filter_ids: Array.isArray(draft?.filter_ids) ? draft.filter_ids.filter((id): id is string => typeof id === "string") : [],
});

const readPhotoLogDraft = (): PhotoLogDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PHOTO_LOG_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as (Partial<PhotoNewFormState> & Partial<PhotoLogDraft>) | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.form && typeof parsed.form === "object") {
      return {
        form: normalizePhotoLogDraftForm(parsed.form),
        startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : new Date().toISOString(),
        autoLocationSet: parsed.autoLocationSet === true,
      };
    }
    return {
      form: normalizePhotoLogDraftForm(parsed),
      startedAt: typeof parsed.taken_at === "string" ? parsed.taken_at : new Date().toISOString(),
      autoLocationSet: false,
    };
  } catch {
    return null;
  }
};

const writePhotoLogDraft = (draft: PhotoLogDraft) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PHOTO_LOG_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage failures; the form remains usable in memory.
  }
};

const clearPhotoLogDraft = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PHOTO_LOG_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
};

const clearPhotoLogDrafts = () => {
  clearPhotoLogDraft();
  void clearPhotoLogReferenceImageDraft();
};

const parseFrameNumberForDefault = (frameNumber: string | null | undefined) => {
  const trimmed = frameNumber?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getNextFrameNumberFromPhotographs = (photos: Photograph[], rollId: string) => {
  const frameNumbers = photos
    .filter((photo) => photo.roll_id === rollId)
    .map((photo) => parseFrameNumberForDefault(photo.frame_number))
    .filter((frameNumber): frameNumber is number => frameNumber != null);
  if (frameNumbers.length === 0) return "";
  return String(Math.max(...frameNumbers) + 1);
};

export function PhotoNewPage() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const navigate = useNavigate();
  const preferredTimeZone = usePreferredTimeZone();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [films, setFilms] = useState<FilmStock[]>([]);
  const [filmHolders, setFilmHolders] = useState<FilmHolder[]>([]);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [recentCameraPhotographs, setRecentCameraPhotographs] = useState<Photograph[]>([]);
  const [recentCameraPhotographsCameraId, setRecentCameraPhotographsCameraId] = useState<string | null>(null);
  const initialFormSignatureRef = useRef<string | null>(null);
  const restoredPhotoLogDraftRef = useRef<PhotoLogDraft | null>(null);
  const draftRestoredRef = useRef(false);
  const [form, setForm] = useState<PhotoNewFormState>(() => {
    const emptyForm = createEmptyPhotoNewFormState();
    initialFormSignatureRef.current = JSON.stringify(emptyForm);
    const draft = readPhotoLogDraft();
    if (draft) {
      restoredPhotoLogDraftRef.current = draft;
      draftRestoredRef.current = true;
      return draft.form;
    }
    return emptyForm;
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraSelectedLensWarning, setCameraSelectedLensWarning] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [referenceImageUploads, setReferenceImageUploads] = useState<PhotographImageUploadDraft[]>([]);
  const [filterPreviewReferenceImageUrl, setFilterPreviewReferenceImageUrl] = useState<string | null>(null);
  const [filterPreviewReferenceImageLabel, setFilterPreviewReferenceImageLabel] = useState<string | null>(null);
  const [referenceImageReviewQueue, setReferenceImageReviewQueue] = useState<File[]>([]);
  const [referenceImageExifEstimates, setReferenceImageExifEstimates] = useState<ReferenceImageExifExposureEstimate[]>([]);
  const [, setReferenceImageExifMessage] = useState<string | null>(null);
  const [createdPhotoId, setCreatedPhotoId] = useState<string | null>(null);
  const [bulbTimerRunning, setBulbTimerRunning] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [filtersLoadError, setFiltersLoadError] = useState<string | null>(null);
  const [lensesLoaded, setLensesLoaded] = useState(false);
  const [filmHoldersLoaded, setFilmHoldersLoaded] = useState(false);
  const [rollsLoaded, setRollsLoaded] = useState(false);
  const [mediaDialog, setMediaDialog] = useState<MediaDialogState | null>(null);
  const autoLocationAttemptedRef = useRef(false);
  const allowUnsavedNavigationRef = useRef(false);
  const referenceImageDraftLoadedRef = useRef(false);
  const photoLogDraftStartedAtRef = useRef(restoredPhotoLogDraftRef.current?.startedAt ?? new Date().toISOString());
  const autoLocationSetRef = useRef(restoredPhotoLogDraftRef.current?.autoLocationSet ?? false);
  const [rollCreateDraft, setRollCreateDraft] = useState<RollCreateDraft>(() => createEmptyRollCreateDraft());
  const [rollCreateSaving, setRollCreateSaving] = useState(false);
  const [rollCreateError, setRollCreateError] = useState<string | null>(null);
  const [holderLoadDraft, setHolderLoadDraft] = useState<HolderLoadDraft>(() => createEmptyHolderLoadDraft());
  const [holderLoadSaving, setHolderLoadSaving] = useState(false);
  const [holderLoadError, setHolderLoadError] = useState<string | null>(null);
  const createdPhotoIdRef = useRef<string | null>(null);
  const incompatibleLensWarningCameraIdRef = useRef<string | null>(null);
  const autoRollDefaultCameraIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void readPhotoLogReferenceImageDraft().then((draft) => {
      if (!active) return;
      if (draft) {
        setReferenceImageUploads(draft.uploads);
        setReferenceImageReviewQueue(draft.reviewQueue);
        const originals = [
          ...draft.uploads.map(upload => upload instanceof File ? upload : upload.original),
          ...draft.reviewQueue,
        ];
        extractReferenceExifEstimates(originals);
      }
      referenceImageDraftLoadedRef.current = true;
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!referenceImageDraftLoadedRef.current || createdPhotoId) return;
    if (referenceImageUploads.length > 0 || referenceImageReviewQueue.length > 0) {
      void writePhotoLogReferenceImageDraft({
        uploads: referenceImageUploads,
        reviewQueue: referenceImageReviewQueue,
      });
      return;
    }
    void clearPhotoLogReferenceImageDraft();
  }, [createdPhotoId, referenceImageReviewQueue, referenceImageUploads]);

  useEffect(() => {
    Promise.all([
      api.listCameras().then(r => setCameras(r.items)).catch(async () => setCameras(await readCachedCameras(user))),
      api.listLenses()
        .then((r) => setLenses(r.items))
        .catch(async () => setLenses(await readCachedLenses(user)))
        .finally(() => setLensesLoaded(true)),
      api.listFilters({ limit: 200 })
        .then((r) => {
          setFilters(r.items);
          setFiltersLoaded(true);
          setFiltersLoadError(null);
        })
        .catch(async (err) => {
          const cached = await readCachedFilters(user);
          setFilters(cached);
          setFiltersLoaded(cached.length > 0);
          setFiltersLoadError(cached.length > 0 ? null : err instanceof Error ? err.message : "Failed to load filters.");
        }),
      api.listFilmStocks().then(r => setFilms(r.items)).catch(async () => setFilms(await readCachedFilmStocks(user))),
      api.listFilmHolders()
        .then((r) => setFilmHolders(r.items))
        .catch(async () => setFilmHolders(await readCachedFilmHolders(user)))
        .finally(() => setFilmHoldersLoaded(true)),
      api.listRolls()
        .then((r) => setRolls(r.items))
        .catch(async () => setRolls(await readCachedRolls(user)))
        .finally(() => setRollsLoaded(true)),
    ]);
  }, [connectivityState.transportStatus, user]);

  const sortedFilmHolders = useMemo(() => sortByName(filmHolders), [filmHolders]);
  const selectedCamera = useMemo(
    () => cameras.find(camera => camera.id === form.camera_id),
    [cameras, form.camera_id],
  );
  const cameraFilmWorkflow = getCameraFilmWorkflow(selectedCamera);
  const shouldShowRollInput = cameraFilmWorkflow !== "sheet";
  const shouldShowFrameInput = cameraFilmWorkflow !== "sheet";
  const shouldShowFilmHolderInput = cameraFilmWorkflow !== "roll";
  const compatibleRolls = useMemo(
    () => filterCompatibleRolls(rolls, selectedCamera)
      .filter(roll => roll.status === "unexposed" || roll.status === "exposing"),
    [rolls, selectedCamera],
  );
  const getNextFrameNumberForRoll = useCallback(
    (rollId: string) => getNextFrameNumberFromPhotographs(recentCameraPhotographs, rollId),
    [recentCameraPhotographs],
  );
  useEffect(() => {
    autoRollDefaultCameraIdRef.current = null;
  }, [selectedCamera?.id]);
  useEffect(() => {
    const cameraId = selectedCamera?.id ?? null;
    if (!cameraId) {
      setRecentCameraPhotographs([]);
      setRecentCameraPhotographsCameraId(null);
      return;
    }

    let active = true;
    setRecentCameraPhotographsCameraId(null);
    api.listPhotographs({ camera_id: cameraId, limit: 100 })
      .then((response) => {
        if (!active) return;
        setRecentCameraPhotographs(sortPhotographsByRecency(response.items));
        setRecentCameraPhotographsCameraId(cameraId);
      })
      .catch(async () => {
        const cached = await readCachedPhotographs(user);
        if (!active) return;
        setRecentCameraPhotographs(sortPhotographsByRecency(cached.filter((photo) => photo.camera_id === cameraId)));
        setRecentCameraPhotographsCameraId(cameraId);
      });

    return () => {
      active = false;
    };
  }, [selectedCamera?.id, user]);
  useEffect(() => {
    const cameraId = selectedCamera?.id ?? null;
    if (!cameraId || selectedCamera?.film_type !== "roll") return;
    if (recentCameraPhotographsCameraId !== cameraId) return;
    if (autoRollDefaultCameraIdRef.current === cameraId) return;
    if (form.roll_id || form.frame_number) {
      autoRollDefaultCameraIdRef.current = cameraId;
      return;
    }
    if (compatibleRolls.length === 0) return;

    const compatibleRollIds = new Set(compatibleRolls.map((roll) => roll.id));
    const lastPhotoWithCompatibleRoll = recentCameraPhotographs.find((photo) => (
      photo.roll_id != null && compatibleRollIds.has(photo.roll_id)
    ));
    if (!lastPhotoWithCompatibleRoll?.roll_id) {
      autoRollDefaultCameraIdRef.current = cameraId;
      return;
    }

    const nextRollId = lastPhotoWithCompatibleRoll.roll_id;
    const nextFrameNumber = getNextFrameNumberForRoll(nextRollId);
    setForm((prev) => {
      if (prev.camera_id !== cameraId || prev.roll_id || prev.frame_number) return prev;
      return {
        ...prev,
        roll_id: nextRollId,
        frame_number: nextFrameNumber,
      };
    });
    autoRollDefaultCameraIdRef.current = cameraId;
  }, [
    compatibleRolls,
    form.frame_number,
    form.roll_id,
    getNextFrameNumberForRoll,
    recentCameraPhotographs,
    recentCameraPhotographsCameraId,
    selectedCamera?.film_type,
    selectedCamera?.id,
  ]);
  const applicableFilmHolders = useMemo(
    () => filterApplicableFilmHolders(sortedFilmHolders, selectedCamera),
    [selectedCamera, sortedFilmHolders],
  );
  const selectedRoll = useMemo(
    () => rolls.find(roll => roll.id === form.roll_id) ?? null,
    [form.roll_id, rolls],
  );
  const selectedRollFilmId = selectedRoll?.film_id ?? null;
  const selectedFilmHolder = useMemo(
    () => applicableFilmHolders.find(holder => holder.id === form.film_holder_id) ?? null,
    [applicableFilmHolders, form.film_holder_id],
  );
  const selectedFilmHolderLoad = selectedFilmHolder?.current_load ?? null;
  const selectedFilmHolderHasActiveLoad = isActiveFilmHolderLoad(selectedFilmHolderLoad);
  const selectedFilmHolderFilmId = getFilmHolderLoadFilmId(selectedFilmHolderLoad);
  const selectedMediaFilmId = selectedRollFilmId ?? selectedFilmHolderFilmId;
  const selectedFilmStock = useMemo(
    () => inferPhotographExposureFilmStock(films, {
      rollFilmId: selectedRollFilmId,
      filmHolderFilmId: selectedFilmHolderFilmId,
    }),
    [films, selectedRollFilmId, selectedFilmHolderFilmId],
  );
  const latestReferenceImageUpload = referenceImageUploads[referenceImageUploads.length - 1] ?? null;
  const latestReferenceImageDeferredDisplay = latestReferenceImageUpload && !(latestReferenceImageUpload instanceof File)
    ? latestReferenceImageUpload.deferredDisplay ?? null
    : null;
  const selectedFilmPreviewStockType = selectedFilmStock?.stock_type
    ?? (latestReferenceImageDeferredDisplay?.monochrome ? "bw" : null);
  const selectedReferenceFrameFormat = useMemo(
    () => resolvePhotographFrameFormat({
      camera: selectedCamera,
      roll: selectedRoll,
      filmHolder: selectedFilmHolder,
    }),
    [selectedCamera, selectedFilmHolder, selectedRoll],
  );
  const compatibleFiltersForReferenceImage = useMemo(
    () => getReferenceImagePreviewFilters(filters, form.lens_id, selectedFilmPreviewStockType),
    [filters, form.lens_id, selectedFilmPreviewStockType],
  );
  const selectedReferenceImageSimulationStack = useMemo(
    () => getSelectedFiltersInOrder(filters, form.filter_ids)
      .map(normalizeFilterSimulationSettings)
      .filter((settings): settings is NonNullable<ReturnType<typeof normalizeFilterSimulationSettings>> => Boolean(settings)),
    [filters, form.filter_ids],
  );
  const selectedFilmIsMonochrome = isMonochromeFilmStockType(selectedFilmPreviewStockType);
  const selectedFilmSpectralResponseKey = getEnabledFilmSpectralResponseKey(selectedFilmStock)
    ?? latestReferenceImageDeferredDisplay?.filmSpectralResponseKey
    ?? null;
  const {
    profiles: btzsProfiles,
    loading: btzsProfilesLoading,
    error: btzsProfilesError,
  } = useBtzsDevelopmentProfiles(selectedFilmStock?.id, selectedFilmStock?.stock_type);
  const exposureModeAvailability = useMemo(
    () => getPhotographExposureModeAvailability(selectedFilmStock, btzsProfiles),
    [btzsProfiles, selectedFilmStock],
  );
  const latestReferenceImageExifEstimate = referenceImageExifEstimates.length > 0
    ? referenceImageExifEstimates[referenceImageExifEstimates.length - 1]
    : null;

  useEffect(() => {
    const upload = referenceImageUploads[referenceImageUploads.length - 1] ?? null;
    if (!upload) {
      setFilterPreviewReferenceImageUrl(null);
      setFilterPreviewReferenceImageLabel(null);
      return;
    }
    const file = getPhotographImageUploadOriginalFile(upload);
    const url = URL.createObjectURL(file);
    setFilterPreviewReferenceImageUrl(url);
    setFilterPreviewReferenceImageLabel(file.name || "Reference image");
    return () => URL.revokeObjectURL(url);
  }, [referenceImageUploads]);
  const cellCameraMeteringAvailable = latestReferenceImageExifEstimate != null;
  const cellCameraEvLabel = latestReferenceImageExifEstimate
    ? formatExifEv100(latestReferenceImageExifEstimate.ev100)
    : null;
  const selectedBtzsProfileSelection = useMemo(
    () => resolveBtzsProfileSelection(btzsProfiles, form.btzs_zone_metering.profile_id),
    [btzsProfiles, form.btzs_zone_metering.profile_id],
  );
  const selectedBtzsProfile = selectedBtzsProfileSelection.selectedProfile;
  const selectedBtzsProfilePaperEsValue = selectedBtzsProfile?.type === "btzs"
    ? resolveBtzsProfilePaperEs(selectedBtzsProfile)
    : null;
  const selectedBtzsProfilePaperEsText = selectedBtzsProfilePaperEsValue != null
    ? formatRawXdfPaperEsInputValue(selectedBtzsProfilePaperEsValue)
    : "1.0";
  const selectedLens = useMemo(() => {
    if (!form.lens_id) return undefined;
    return lenses.find((lens) => lens.id === form.lens_id);
  }, [form.lens_id, lenses]);
  const selectedLensCapabilities = useMemo(() => (
    selectedLens
      ? {
          min_f_stop: selectedLens.min_f_stop,
          max_f_stop: selectedLens.max_f_stop,
          aperture_increment: selectedLens.aperture_increment,
          flare_factor: selectedLens.flare_factor,
        }
      : null
  ), [selectedLens]);
  const selectedBtzsFlareFactorValue = selectedLensCapabilities?.flare_factor
    ?? (selectedBtzsProfile?.type === "btzs" ? resolveBtzsProfileFlareFactor(selectedBtzsProfile) : 0.02);
  const selectedBtzsFlareFactorText = String(selectedBtzsFlareFactorValue);
  const shutterSource = useMemo(
    () => selectedCamera && getCameraShutterCapability(selectedCamera)
      ? selectedCamera
      : selectedLens && getCameraShutterCapability(selectedLens)
      ? selectedLens
      : null,
    [selectedCamera, selectedLens],
  );
  const selectedFilmIso = selectedFilmStock?.iso != null && selectedFilmStock.iso > 0
    ? selectedFilmStock.iso
    : 100;
  const manualReciprocityWarning = useMemo(
    () => getManualReciprocityWarning(selectedFilmStock, {
      shutter_speed: form.shutter_speed,
      bulb_duration_seconds: form.bulb_duration_seconds,
    }),
    [form.bulb_duration_seconds, form.shutter_speed, selectedFilmStock],
  );
  const workingIsoAutoRef = useRef("100");
  const paperEsAutoRef = useRef("1.0");
  const flareFactorAutoRef = useRef("0.02");
  useEffect(() => {
    const nextAutoValue = String(selectedFilmIso);
    setForm((prev) => {
      const shouldUpdateZone = prev.zone_metering.working_iso.trim().length === 0
        || prev.zone_metering.working_iso === workingIsoAutoRef.current;

      if (!shouldUpdateZone) {
        return prev;
      }

      return {
        ...prev,
        zone_metering: shouldUpdateZone
          ? { ...prev.zone_metering, working_iso: nextAutoValue }
          : prev.zone_metering,
      };
    });
    workingIsoAutoRef.current = nextAutoValue;
  }, [selectedFilmIso]);

  useEffect(() => {
    if (!selectedBtzsProfile) {
      return;
    }

    const nextAutoValue = selectedBtzsProfilePaperEsText;
    setForm((prev) => {
      const currentPaperEs = prev.btzs_zone_metering.paper_es.trim();
      const shouldUpdatePaperEs = currentPaperEs.length === 0 || currentPaperEs === paperEsAutoRef.current;
      if (!shouldUpdatePaperEs) {
        return prev;
      }

      if (currentPaperEs === nextAutoValue) {
        return prev;
      }

      return {
        ...prev,
        btzs_zone_metering: {
          ...prev.btzs_zone_metering,
          paper_es: nextAutoValue,
        },
      };
    });
    paperEsAutoRef.current = nextAutoValue;
  }, [selectedBtzsProfile, selectedBtzsProfilePaperEsText]);

  useEffect(() => {
    const nextAutoValue = selectedBtzsFlareFactorText;
    setForm((prev) => {
      const currentFlareFactor = prev.btzs_zone_metering.flare_factor.trim();
      const shouldUpdateFlareFactor = currentFlareFactor.length === 0
        || currentFlareFactor === flareFactorAutoRef.current;
      if (!shouldUpdateFlareFactor || currentFlareFactor === nextAutoValue) {
        return prev;
      }

      return {
        ...prev,
        btzs_zone_metering: {
          ...prev.btzs_zone_metering,
          flare_factor: nextAutoValue,
        },
      };
    });
    flareFactorAutoRef.current = nextAutoValue;
  }, [selectedBtzsFlareFactorText]);

  useEffect(() => {
    if (btzsProfilesLoading) return;
    setForm((prev) => {
      const currentProfileId = prev.btzs_zone_metering.profile_id.trim();
      if (!currentProfileId || btzsProfiles.some((profile) => profile.id === currentProfileId)) return prev;
      return {
        ...prev,
        btzs_zone_metering: {
          ...prev.btzs_zone_metering,
          profile_id: "",
        },
      };
    });
  }, [btzsProfiles, btzsProfilesLoading]);

  useEffect(() => {
    if (!latestReferenceImageExifEstimate) return;
    const nextEv = latestReferenceImageExifEstimate.ev100.toFixed(2);
    setForm((prev) => prev.zone_metering.cell_camera_ev === nextEv
      ? prev
      : {
          ...prev,
          zone_metering: {
            ...prev.zone_metering,
            cell_camera_ev: nextEv,
          },
        });
  }, [latestReferenceImageExifEstimate]);

  const exposureWritePayloadInput = useMemo(
    () => buildExposureWritePayloadInput(
      form,
      selectedFilmStock,
      selectedLensCapabilities,
      selectedCamera && getCameraShutterCapability(selectedCamera)
        ? {
            min_shutter_speed_seconds: selectedCamera.min_shutter_speed_seconds,
            max_shutter_speed_seconds: selectedCamera.max_shutter_speed_seconds,
            supports_bulb: selectedCamera.supports_bulb,
          }
        : selectedLens && getCameraShutterCapability(selectedLens)
          ? {
              min_shutter_speed_seconds: selectedLens.min_shutter_speed_seconds,
              max_shutter_speed_seconds: selectedLens.max_shutter_speed_seconds,
              supports_bulb: selectedLens.supports_bulb,
            }
          : null,
      filters,
      btzsProfiles,
    ),
    [btzsProfiles, filters, form, selectedFilmStock, selectedLensCapabilities, selectedCamera, selectedLens],
  );

  const zoneMeteringPreview = useMemo(() => {
    if (form.exposure_entry_mode !== "zone-metering" && form.exposure_entry_mode !== "cell-camera") {
      return null;
    }

    const cellCameraEv = parsePositiveNumber(form.zone_metering.cell_camera_ev);
    const cellCameraCorrection = parsePositiveNumber(form.zone_metering.cell_camera_correction_stops) ?? 0;
    const meterEv = form.exposure_entry_mode === "cell-camera"
      ? (cellCameraEv == null ? null : cellCameraEv - cellCameraCorrection)
      : parsePositiveNumber(form.zone_metering.meter_ev);
    const targetZone = parsePositiveNumber(form.zone_metering.target_zone) ?? 5;
    const bellowsCorrection = calculateBellowsCorrectionStops(
      form.zone_metering.bellows_correction_mode,
      form.focal_length_mm,
      form.zone_metering.bellows_correction_mode === "measurement"
        ? form.zone_metering.bellows_extension_mm
        : form.zone_metering.bellows_subject_distance_m,
    );
    if (meterEv == null) return null;
    if (bellowsCorrection.error) {
      return {
        calculation: { warnings: [], error: bellowsCorrection.error },
        display: null,
        preview: null,
        profileDevelopment: null,
      };
    }
    const profileDevelopment = resolveSingleSpotProfileDevelopment(
      btzsProfiles,
      form.btzs_zone_metering.profile_id,
      selectedFilmStock,
      selectedLensCapabilities,
    );
    if (profileDevelopment.error) {
      return {
        calculation: { warnings: profileDevelopment.warnings, error: profileDevelopment.error },
        display: null,
        preview: null,
        profileDevelopment,
      };
    }

    const calculation = calculateZoneMeteringExposure({
      meterEv,
      meterIso: 100,
      workingIso: profileDevelopment.profile ? profileDevelopment.workingIso : selectedFilmIso,
      targetZone,
      compensationStops: 0,
      bellowsCorrectionStops: bellowsCorrection.stops,
      filterFactors: getSelectedFiltersInOrder(filters, form.filter_ids),
      readingThroughSelectedFilters: form.zone_metering.reading_through_selected_filters,
      precedence: form.zone_metering.precedence,
      aperture: form.aperture,
      shutterSeconds: form.shutter_speed,
      lensMinFStop: selectedLensCapabilities?.min_f_stop,
      lensMaxFStop: selectedLensCapabilities?.max_f_stop,
      reciprocityPFactor: selectedFilmStock?.reciprocity_p_factor,
    });
    const display = calculation.error
      ? null
      : resolveExposureChoiceDisplay(calculation, selectedLensCapabilities, shutterSource);

    return {
      calculation,
      display,
      profileDevelopment,
      preview: display
        ? buildMeteredExposurePreview(
          form.zone_metering.precedence,
          display,
          form.zone_metering.precedence === "aperture" ? form.aperture : form.shutter_speed,
        )
        : null,
    };
  }, [
    filters,
    form.aperture,
    form.exposure_entry_mode,
    form.filter_ids,
    form.focal_length_mm,
    form.zone_metering.bellows_correction_mode,
    form.zone_metering.bellows_extension_mm,
    form.zone_metering.bellows_subject_distance_m,
    form.zone_metering.cell_camera_correction_stops,
    form.zone_metering.cell_camera_ev,
    form.shutter_speed,
    form.zone_metering.meter_ev,
    form.zone_metering.precedence,
    form.zone_metering.reading_through_selected_filters,
    form.zone_metering.target_zone,
    form.btzs_zone_metering.profile_id,
    btzsProfiles,
    selectedFilmIso,
    selectedFilmStock,
    selectedFilmStock?.reciprocity_p_factor,
    selectedLensCapabilities,
    shutterSource,
  ]);

  const btzsPreview = useMemo(() => {
    if (form.exposure_entry_mode !== "btzs-zone-metering" || selectedBtzsProfile == null) {
      return null;
    }

    const lowEv = parsePositiveNumber(form.btzs_zone_metering.low_ev);
    const highEv = parsePositiveNumber(form.btzs_zone_metering.high_ev);
    const lowZone = parsePositiveNumber(form.btzs_zone_metering.low_zone);
    const highZone = parsePositiveNumber(form.btzs_zone_metering.high_zone);
    if (lowEv == null || highEv == null || lowZone == null || highZone == null) {
      return null;
    }

    const paperEs = parsePositiveNumber(form.btzs_zone_metering.paper_es) ?? selectedBtzsProfilePaperEsValue ?? 1;
    const flareFactor = parsePositiveNumber(form.btzs_zone_metering.flare_factor) ?? selectedBtzsFlareFactorValue;
    const compensationStops = parsePositiveNumber(form.btzs_zone_metering.compensation_stops) ?? 0;
    const bellowsCorrection = calculateBellowsCorrectionStops(
      form.btzs_zone_metering.bellows_correction_mode,
      form.focal_length_mm,
      form.btzs_zone_metering.bellows_correction_mode === "measurement"
        ? form.btzs_zone_metering.bellows_extension_mm
        : form.btzs_zone_metering.bellows_subject_distance_m,
    );
    if (bellowsCorrection.error) {
      return {
        calculation: {
          supportedRange: { developmentTime: null, effectiveFilmSpeed: null },
          warnings: [],
          error: bellowsCorrection.error,
        },
        display: null,
        preview: null,
      };
    }
    const selectedFilters = getSelectedFiltersInOrder(filters, form.filter_ids);
    const calculation = selectedBtzsProfile.type === "simple"
      ? (() => {
          const baseDevelopmentMinutes = parseDevelopmentTimeTextMinutes(selectedBtzsProfile.timeText);
          if (baseDevelopmentMinutes == null) {
            return {
              warnings: [],
              exposure: null,
              error: "Simple development profile time must be parseable as minutes or mm:ss for zone-system development adjustment.",
            };
          }
          return calculateSimpleZoneSystemExposure({
            lowEv,
            highEv,
            lowZone,
            highZone,
            paperEs,
            flareFactor,
            meterIso: 100,
            workingIso: selectedFilmIso,
            baseDevelopmentMinutes,
            adjustmentCurve: {
              nMinusTwoPercent: selectedBtzsProfile.nMinusTwoPercent,
              nMinusOnePercent: selectedBtzsProfile.nMinusOnePercent,
              nPlusOnePercent: selectedBtzsProfile.nPlusOnePercent,
              nPlusTwoPercent: selectedBtzsProfile.nPlusTwoPercent,
            },
            compensationStops,
            bellowsCorrectionStops: bellowsCorrection.stops,
            filterFactors: selectedFilters,
            readingThroughSelectedFilters: form.btzs_zone_metering.reading_through_selected_filters,
            precedence: form.btzs_zone_metering.precedence,
            aperture: form.aperture,
            shutterSeconds: form.shutter_speed,
            lensMinFStop: selectedLensCapabilities?.min_f_stop,
            lensMaxFStop: selectedLensCapabilities?.max_f_stop,
            reciprocityPFactor: selectedFilmStock?.reciprocity_p_factor,
          });
        })()
      : calculateBtzsExposure({
          lowEv,
          highEv,
          lowZone,
          highZone,
          paperEs,
          flareFactor,
          meterIso: 100,
          chartData: selectedBtzsProfile.chartData,
          compensationStops,
          bellowsCorrectionStops: bellowsCorrection.stops,
          filterFactors: selectedFilters,
          readingThroughSelectedFilters: form.btzs_zone_metering.reading_through_selected_filters,
          precedence: form.btzs_zone_metering.precedence,
          aperture: form.aperture,
          shutterSeconds: form.shutter_speed,
          lensMinFStop: selectedLensCapabilities?.min_f_stop,
          lensMaxFStop: selectedLensCapabilities?.max_f_stop,
          reciprocityPFactor: selectedFilmStock?.reciprocity_p_factor,
        });
    const display = calculation.exposure
      ? resolveExposureChoiceDisplay(
        {
          aperture: calculation.exposure.aperture,
          finalShutterSeconds: calculation.exposure.finalShutterSeconds,
          warnings: calculation.warnings,
        },
        selectedLensCapabilities,
        shutterSource,
      )
      : null;

    return {
      calculation,
      display,
      preview: display
        ? buildMeteredExposurePreview(
          form.btzs_zone_metering.precedence,
          display,
          form.btzs_zone_metering.precedence === "aperture" ? form.aperture : form.shutter_speed,
        )
        : null,
    };
  }, [
    filters,
    form.aperture,
    form.btzs_zone_metering.compensation_stops,
    form.btzs_zone_metering.bellows_correction_mode,
    form.btzs_zone_metering.bellows_extension_mm,
    form.btzs_zone_metering.bellows_subject_distance_m,
    form.btzs_zone_metering.high_ev,
    form.btzs_zone_metering.high_zone,
    form.btzs_zone_metering.low_ev,
    form.btzs_zone_metering.low_zone,
    form.btzs_zone_metering.flare_factor,
    form.btzs_zone_metering.paper_es,
    form.btzs_zone_metering.precedence,
    form.btzs_zone_metering.reading_through_selected_filters,
    form.exposure_entry_mode,
    form.filter_ids,
    form.focal_length_mm,
    form.shutter_speed,
    selectedBtzsProfile,
    selectedBtzsFlareFactorValue,
    selectedBtzsProfilePaperEsValue,
    selectedFilmIso,
    selectedFilmStock?.reciprocity_p_factor,
    selectedLensCapabilities,
    shutterSource,
  ]);

  const btzsReadingsReversed = useMemo(() => {
    const lowEv = parsePositiveNumber(form.btzs_zone_metering.low_ev);
    const highEv = parsePositiveNumber(form.btzs_zone_metering.high_ev);
    const lowZone = parsePositiveNumber(form.btzs_zone_metering.low_zone);
    const highZone = parsePositiveNumber(form.btzs_zone_metering.high_zone);
    return (lowEv != null && highEv != null && lowEv > highEv)
      || (lowZone != null && highZone != null && lowZone > highZone);
  }, [
    form.btzs_zone_metering.high_ev,
    form.btzs_zone_metering.high_zone,
    form.btzs_zone_metering.low_ev,
    form.btzs_zone_metering.low_zone,
  ]);
  const btzsRangeWarning = btzsPreview?.calculation.error?.includes("outside the supported")
    ? btzsPreview.calculation.error
    : null;
  const zoneBellowsCorrection = calculateBellowsCorrectionStops(
    form.zone_metering.bellows_correction_mode,
    form.focal_length_mm,
    form.zone_metering.bellows_correction_mode === "measurement"
      ? form.zone_metering.bellows_extension_mm
      : form.zone_metering.bellows_subject_distance_m,
  );
  const btzsBellowsCorrection = calculateBellowsCorrectionStops(
    form.btzs_zone_metering.bellows_correction_mode,
    form.focal_length_mm,
    form.btzs_zone_metering.bellows_correction_mode === "measurement"
      ? form.btzs_zone_metering.bellows_extension_mm
      : form.btzs_zone_metering.bellows_subject_distance_m,
  );

  const set =
    (key: keyof PhotoNewFormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const readCurrentLocationDraft = useCallback(() => (
    new Promise<ReturnType<typeof formatPhotographLocationDraft>>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not available in this browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(formatPhotographLocationDraft(position.coords)),
        (positionError) => reject(positionError),
        {
          enableHighAccuracy: true,
          maximumAge: 60_000,
          timeout: 10_000,
        },
      );
    })
  ), []);

  const handleUseCurrentLocation = useCallback((source: "manual" | "auto" = "manual") => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not available in this browser.");
      setLocationMessage(null);
      return;
    }

    setLocationLoading(true);
    setLocationError(null);
    setLocationMessage("Locating...");
    readCurrentLocationDraft()
      .then((locationDraft) => {
        if (source === "auto") {
          autoLocationSetRef.current = true;
        }
        setForm(prev => ({
          ...prev,
          ...locationDraft,
        }));
        setLocationMessage("Location captured.");
        setLocationLoading(false);
      })
      .catch((positionError) => {
        setLocationError(positionError.message || "Unable to read your location.");
        setLocationMessage(null);
        setLocationLoading(false);
      });
  }, [readCurrentLocationDraft]);

  useEffect(() => {
    if (!user?.auto_use_current_location || autoLocationAttemptedRef.current) return;
    autoLocationAttemptedRef.current = true;
    handleUseCurrentLocation("auto");
  }, [handleUseCurrentLocation, user?.auto_use_current_location]);

  const handleReferenceImagesSelected = (files: File[]) => {
    if (files.length === 0) return;
    setReferenceImageReviewQueue(prev => {
      const seen = new Set([
        ...referenceImageUploads.map(getPhotographImageUploadSignature),
        ...prev.map(getFileSignature),
      ]);
      const next = [...prev];
      for (const file of files) {
        const signature = getFileSignature(file);
        if (seen.has(signature)) continue;
        seen.add(signature);
        next.push(file);
      }
      return next;
    });
  };

  const extractReferenceExifEstimates = (files: File[]) => {
    if (files.length === 0) return;
    setReferenceImageExifMessage(null);
    void Promise.all(files.map(async (file) => {
        const signature = getFileSignature(file);
        try {
          return await extractReferenceImageExifExposureEstimate(file, signature);
        } catch (err) {
          console.warn("Unable to read reference image EXIF", err);
          return null;
        }
      })).then((estimates) => {
        const usableEstimates = estimates.filter((estimate): estimate is ReferenceImageExifExposureEstimate => estimate != null);
        if (usableEstimates.length === 0) {
          setReferenceImageExifMessage("No usable exposure EXIF found in the selected image.");
          return;
        }
        setReferenceImageExifEstimates(prev => {
          const seen = new Set(prev.map(estimate => estimate.fileSignature));
          return [
            ...prev,
            ...usableEstimates.filter(estimate => !seen.has(estimate.fileSignature)),
          ];
        });
      });
  };

  const handleRemoveReferenceImage = (index: number) => {
    setReferenceImageUploads(prev => {
      const uploadToRemove = prev[index];
      const fileToRemove = uploadToRemove instanceof File ? uploadToRemove : uploadToRemove?.original;
      const signatureToRemove = fileToRemove ? getFileSignature(fileToRemove) : null;
      if (signatureToRemove) {
        setReferenceImageExifEstimates(estimates => estimates.filter(estimate => estimate.fileSignature !== signatureToRemove));
      }
      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const closeReferenceImageReview = () => {
    setReferenceImageReviewQueue(prev => prev.slice(1));
  };

  const handleConfirmReferenceImageReview = (upload: PhotographImageUploadDraft) => {
    setReferenceImageUploads(prev => [...prev, upload]);
    const original = upload instanceof File ? upload : upload.original;
    extractReferenceExifEstimates([original]);
    setReferenceImageReviewQueue(prev => prev.slice(1));
  };

  const handleCameraChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextCameraId = e.target.value;
    autoRollDefaultCameraIdRef.current = null;
    setForm((prevForm) => {
      const nextCamera = cameras.find(camera => camera.id === nextCameraId) ?? null;
      if (!nextCameraId || !nextCamera) {
        return {
          ...prevForm,
          camera_id: nextCameraId,
          roll_id: "",
          frame_number: "",
          film_holder_id: "",
        };
      }
      const normalized = normalizeMediaSelectionForCamera(
        {
          rollId: prevForm.roll_id,
          frameNumber: prevForm.frame_number,
          filmHolderId: prevForm.film_holder_id,
        },
        nextCamera,
        rolls,
        filmHolders,
      );
      return {
        ...prevForm,
        camera_id: nextCameraId,
        roll_id: prevForm.camera_id !== nextCameraId && nextCamera.film_type === "roll" ? "" : normalized.rollId,
        frame_number: prevForm.camera_id !== nextCameraId && nextCamera.film_type === "roll" ? "" : normalized.frameNumber,
        film_holder_id: normalized.filmHolderId,
      };
    });
  };

  const handleRollChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextRollId = e.target.value;
    setForm(prev => {
      if (!prev) return prev;
      if (!nextRollId) {
        return {
          ...prev,
          roll_id: "",
          frame_number: "",
        };
      }
      return {
        ...prev,
        roll_id: nextRollId,
        frame_number: getNextFrameNumberForRoll(nextRollId),
        film_holder_id: "",
      };
    });
  };

  const handleFilmHolderChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextHolderId = e.target.value;
    if (!nextHolderId) {
      setForm(prev => prev ? { ...prev, film_holder_id: "" } : prev);
      return;
    }

    const nextHolder = filmHolders.find(holder => holder.id === nextHolderId) ?? null;
    if (!nextHolder) return;
    if (!isFilmHolderApplicableToCamera(nextHolder, selectedCamera)) return;

    if (!selectedCamera || nextHolder.current_load == null || !isActiveFilmHolderLoad(nextHolder.current_load)) {
      setRollCreateError(null);
      setHolderLoadError(null);
      setHolderLoadDraft(createEmptyHolderLoadDraft(selectedMediaFilmId ?? "", ""));
      setMediaDialog({
        kind: "holder",
        holderId: nextHolder.id,
        holderName: nextHolder.name,
      });
      return;
    }

    setForm(prev => prev ? {
      ...prev,
      film_holder_id: nextHolderId,
      roll_id: "",
      frame_number: "",
    } : prev);
  };

  const compatibleLenses = useMemo(() => filterCompatibleLenses(lenses, selectedCamera), [lenses, selectedCamera]);

  // Keep the lens selection synced to the selected camera without losing the
  // incompatibility warning that gets shown when a manual choice is cleared.
  useEffect(() => {
    if (!lensesLoaded) return;
    if (!selectedCamera) {
      incompatibleLensWarningCameraIdRef.current = null;
      setCameraSelectedLensWarning(null);
      return;
    }

    const currentLensId = form.lens_id;
    const nextLensId = normalizeLensSelectionForCamera(currentLensId, compatibleLenses);

    if (nextLensId !== currentLensId) {
      setForm(prev => prev ? { ...prev, lens_id: nextLensId } : prev);
      if (nextLensId) {
        incompatibleLensWarningCameraIdRef.current = null;
        setCameraSelectedLensWarning(null);
      } else {
        incompatibleLensWarningCameraIdRef.current = selectedCamera.id;
        setCameraSelectedLensWarning("Selected lens is not compatible with this camera and was cleared.");
      }
      return;
    }

    if (currentLensId && compatibleLenses.some(lens => lens.id === currentLensId)) {
      incompatibleLensWarningCameraIdRef.current = null;
      setCameraSelectedLensWarning(null);
      return;
    }

    if (currentLensId === "") {
      if (incompatibleLensWarningCameraIdRef.current !== selectedCamera.id) {
        incompatibleLensWarningCameraIdRef.current = null;
        setCameraSelectedLensWarning(null);
      }
    }
  }, [compatibleLenses, form.lens_id, lensesLoaded, selectedCamera]);

  const selectedLensRange = useMemo(() => getLensFocalRange(selectedLens), [selectedLens]);

  const focalLengthError = useMemo(
    () => getFocalLengthError(selectedLensRange, form.focal_length_mm),
    [selectedLensRange, form.focal_length_mm],
  );

  useEffect(() => {
    if (!filtersLoaded) return;
    const { nextFilterIds } = pruneFilterIdsToCompatible(form.filter_ids, filters, form.lens_id, selectedFilmStock?.stock_type);
    if (!areFilterIdsEqual(nextFilterIds, form.filter_ids)) {
      setForm(prev => prev ? { ...prev, filter_ids: nextFilterIds } : prev);
    }
  }, [filters, filtersLoaded, form.filter_ids, form.lens_id, selectedFilmStock?.stock_type]);

  useEffect(() => {
    if (selectedCamera?.has_bellows) return;
    setForm(prev => ({
      ...prev,
      zone_metering: { ...prev.zone_metering, bellows_correction_mode: "none" },
      btzs_zone_metering: { ...prev.btzs_zone_metering, bellows_correction_mode: "none" },
    }));
  }, [selectedCamera?.has_bellows]);

  const apertureChoices = useMemo(() => {
    return getApertureChoiceOptions(selectedLens, form.aperture);
  }, [selectedLens, form.aperture]);

  const apertureValues = useMemo(() => apertureChoices.map(option => option.value), [apertureChoices]);
  const normalizedAperture = useMemo(() => {
    if (apertureValues.length === 0) return "";
    return form.aperture && apertureValues.includes(form.aperture)
      ? form.aperture
      : apertureValues[0] ?? "";
  }, [apertureValues, form.aperture]);
  const apertureDiagnosticsEnabled = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  const apertureDiagnosticsSignature = useMemo(() => {
    const selectedAperture = form.aperture.trim() || null;
    const options = apertureChoices.map(({ label, value }) => ({ label, value }));
    return JSON.stringify({
      lensId: selectedLens?.id ?? null,
      lensName: selectedLens?.name ?? null,
      minFStop: selectedLens?.min_f_stop ?? null,
      maxFStop: selectedLens?.max_f_stop ?? null,
      apertureIncrement: selectedLens?.aperture_increment ?? null,
      selectedAperture,
      normalizedAperture: normalizedAperture || null,
      options,
    });
  }, [
    apertureChoices,
    form.aperture,
    normalizedAperture,
    selectedLens?.aperture_increment,
    selectedLens?.id,
    selectedLens?.max_f_stop,
    selectedLens?.min_f_stop,
    selectedLens?.name,
  ]);
  const lastApertureDiagnosticSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!apertureDiagnosticsEnabled) return;
    if (lastApertureDiagnosticSignatureRef.current === apertureDiagnosticsSignature) return;
    lastApertureDiagnosticSignatureRef.current = apertureDiagnosticsSignature;

    const options = apertureChoices.map(({ label, value }) => ({ label, value }));
    console.groupCollapsed("Darkcloth aperture options");
    console.log({
      lens: {
        id: selectedLens?.id ?? null,
        name: selectedLens?.name ?? null,
        min_f_stop: selectedLens?.min_f_stop ?? null,
        max_f_stop: selectedLens?.max_f_stop ?? null,
        aperture_increment: selectedLens?.aperture_increment ?? null,
      },
      selected_aperture: form.aperture || "",
      normalized_default_aperture: normalizedAperture || "",
      options,
    });
    console.groupEnd();
  }, [
    apertureChoices,
    apertureDiagnosticsEnabled,
    apertureDiagnosticsSignature,
    form.aperture,
    normalizedAperture,
    selectedLens?.aperture_increment,
    selectedLens?.id,
    selectedLens?.max_f_stop,
    selectedLens?.min_f_stop,
    selectedLens?.name,
  ]);

  const shutterSpeedChoices = useMemo(
    () => getShutterChoiceOptions(shutterSource, form.shutter_speed),
    [shutterSource, form.shutter_speed],
  );
  const isBulbShutter = isBulbShutterValue(form.shutter_speed);

  useEffect(() => {
    if (form.exposure_entry_mode === "manual" || !bulbTimerRunning) return;
    setBulbTimerRunning(false);
  }, [bulbTimerRunning, form.exposure_entry_mode]);

  useEffect(() => {
    const focalLength = getPrimeLensFocalLengthValue(selectedLensRange);
    if (focalLength == null) return;
    if (form.focal_length_mm !== focalLength) {
      setForm(f => ({ ...f, focal_length_mm: focalLength }));
    }
  }, [form?.focal_length_mm, selectedLensRange?.isPrime, selectedLensRange?.minFocalLengthMm]);

  useEffect(() => {
    if (!selectedCamera) return;
    if (!filmHoldersLoaded || !rollsLoaded) return;
    setForm((prevForm) => {
      const normalized = normalizeMediaSelectionForCamera(
        {
          rollId: prevForm.roll_id,
          frameNumber: prevForm.frame_number,
          filmHolderId: prevForm.film_holder_id,
        },
        selectedCamera,
        rolls,
        filmHolders,
      );
      if (
        normalized.rollId === prevForm.roll_id
        && normalized.frameNumber === prevForm.frame_number
        && normalized.filmHolderId === prevForm.film_holder_id
      ) {
        return prevForm;
      }
      return {
        ...prevForm,
        roll_id: normalized.rollId,
        frame_number: normalized.frameNumber,
        film_holder_id: normalized.filmHolderId,
      };
    });
  }, [filmHolders, filmHoldersLoaded, rolls, rollsLoaded, selectedCamera?.film_type, selectedCamera?.id, selectedCamera?.roll_format]);

  const rebuildReferenceImageUploadForCurrentFilters = useCallback(async (
    upload: PhotographImageUploadDraft,
  ): Promise<PreparedPhotographImageUpload> => {
    const prepared = await preparePhotographImageUpload(upload);
    if (!prepared.deferredDisplay) return prepared;

    const simulationStack = selectedReferenceImageSimulationStack;
    const processingOptions: ReferenceImageProcessingOptions = {
      ...prepared.deferredDisplay,
      simulation: simulationStack[0] ?? null,
      simulationStack,
      monochrome: selectedFilmIsMonochrome,
      filmSpectralResponseKey: selectedFilmSpectralResponseKey,
    };
    const thumbnail = await processReferenceImageForDisplay(prepared.original, {
      ...processingOptions,
      maxLongEdge: REFERENCE_THUMBNAIL_MAX_LONG_EDGE,
      simulationMethod: "lut",
      previewQuality: true,
    });
    const display = await processReferenceImageForDisplay(prepared.original, {
      ...processingOptions,
      maxLongEdge: REFERENCE_FAST_DISPLAY_MAX_LONG_EDGE,
      simulationMethod: "lut",
      previewQuality: true,
    });

    return {
      original: prepared.original,
      ...(display ? { display } : {}),
      ...(thumbnail ? { thumbnail } : {}),
      deferredDisplay: {
        ...processingOptions,
        maxLongEdge: REFERENCE_FINAL_DISPLAY_MAX_LONG_EDGE,
        simulationMethod: "lut",
        previewQuality: false,
      },
    };
  }, [selectedFilmIsMonochrome, selectedFilmSpectralResponseKey, selectedReferenceImageSimulationStack]);

  const queueReferenceImageUploadsForSync = async (
    photoId: string,
    uploads: PhotographImageUploadDraft[],
    removeFromDrafts: boolean,
  ) => {
    if (!user) throw new Error("Sign in is required to queue reference images.");
    let uploadedCount = 0;
    for (const upload of uploads) {
      const prepared = await rebuildReferenceImageUploadForCurrentFilters(upload);
      await queueOfflinePhotographImageUpload(user, photoId, prepared);
      uploadedCount += 1;
      if (removeFromDrafts) {
        const signature = getPhotographImageUploadSignature(upload);
        setReferenceImageUploads(prev => prev.filter(existing => getPhotographImageUploadSignature(existing) !== signature));
      }
    }
    if (uploadedCount > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("darkcloth:sync-request"));
    }
    return uploadedCount;
  };

  const uploadQueuedReferenceImages = async (photoId: string) =>
    uploadReferenceImagesToServer(photoId, [...referenceImageUploads], true);

  const uploadReferenceImagesToServer = async (
    photoId: string,
    uploads: PhotographImageUploadDraft[],
    removeFromDrafts: boolean,
  ) => {
    let uploadedCount = 0;
    for (const upload of uploads) {
      const prepared = await rebuildReferenceImageUploadForCurrentFilters(upload);
      const image = await api.uploadPhotographImage(photoId, prepared);
      uploadedCount += 1;
      if (prepared.deferredDisplay) {
        void schedulePhotographImageDisplayUpdate({
          photoId,
          imageId: image.id,
          original: prepared.original,
          options: prepared.deferredDisplay,
        }).catch((err) => {
          console.error("Failed to schedule deferred reference image display update", err);
        });
      }
      if (removeFromDrafts) {
        const signature = getPhotographImageUploadSignature(upload);
        setReferenceImageUploads(prev => prev.filter(existing => getPhotographImageUploadSignature(existing) !== signature));
      }
    }
    return uploadedCount;
  };

  const shouldQueueReferenceImagesOffline = (err: unknown) => {
    if (connectivityState.transportStatus === "offline") return true;
    if (err instanceof TypeError) return true;
    return err instanceof Error && /failed to fetch|network/i.test(err.message);
  };

  const queueRemainingReferenceImages = async (photoId: string) => {
    if (!user) throw new Error("Sign in is required to queue reference images.");
    let queuedCount = 0;
    const queuedUploads = [...referenceImageUploads];
    for (const upload of queuedUploads) {
      const prepared = await rebuildReferenceImageUploadForCurrentFilters(upload);
      await queueOfflinePhotographImageUpload(user, photoId, prepared);
      queuedCount += 1;
      const signature = getPhotographImageUploadSignature(upload);
      setReferenceImageUploads(prev => prev.filter(existing => getPhotographImageUploadSignature(existing) !== signature));
    }
    if (queuedCount > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("darkcloth:sync-request"));
    }
    return queuedCount;
  };

  const openRollCreateDialog = () => {
    const defaultFilmId = selectedMediaFilmId ?? "";
    setRollCreateDraft(createEmptyRollCreateDraft(selectedCamera, defaultFilmId));
    setRollCreateError(null);
    setMediaDialog({ kind: "roll" });
  };

  const closeRollCreateDialog = () => {
    setMediaDialog(null);
    setRollCreateSaving(false);
    setRollCreateError(null);
    setRollCreateDraft(createEmptyRollCreateDraft(selectedCamera, selectedMediaFilmId ?? ""));
  };

  const closeHolderLoadDialog = () => {
    setMediaDialog(null);
    setHolderLoadSaving(false);
    setHolderLoadError(null);
    setHolderLoadDraft(createEmptyHolderLoadDraft(selectedMediaFilmId ?? ""));
  };

  const handleCreateRoll = async () => {
    if (!selectedCamera) return;
    const nextDraft = rollCreateDraft;
    if (!nextDraft.name.trim()) {
      setRollCreateError("Roll name is required.");
      return;
    }
    if (!nextDraft.filmId.trim()) {
      setRollCreateError("Select a film stock for this roll.");
      return;
    }
    if (!nextDraft.rollFormat) {
      setRollCreateError("Select a roll format for this roll.");
      return;
    }
    if (selectedCamera.film_type === "roll" && selectedCamera.roll_format && nextDraft.rollFormat !== selectedCamera.roll_format) {
      setRollCreateError(`This camera requires ${selectedCamera.roll_format} rolls.`);
      return;
    }

    setRollCreateSaving(true);
    setRollCreateError(null);
    try {
      const createdRoll = connectivityState.transportStatus === "offline" && user
        ? await queueOfflineRollCreate(user, buildRollCreatePayload(nextDraft))
        : await api.createRoll(buildRollCreatePayload(nextDraft));
      setRolls(prev => [createdRoll, ...prev.filter(roll => roll.id !== createdRoll.id)]);
      setForm(prev => prev ? {
        ...prev,
        roll_id: createdRoll.id,
        film_holder_id: "",
        frame_number: "",
      } : prev);
      closeRollCreateDialog();
    } catch (err) {
      setRollCreateError(err instanceof Error ? err.message : "Failed to create roll");
    } finally {
      setRollCreateSaving(false);
    }
  };

  const handleLoadHolder = async () => {
    if (!mediaDialog || mediaDialog.kind !== "holder") return;
    if (!holderLoadDraft.filmId.trim()) {
      setHolderLoadError("Select a film stock to load this holder.");
      return;
    }

    setHolderLoadSaving(true);
    setHolderLoadError(null);
    try {
      const holder = filmHolders.find((item) => item.id === mediaDialog.holderId) ?? null;
      if (connectivityState.transportStatus === "offline" && !holder) {
        setHolderLoadError("This holder is not cached for offline loading.");
        return;
      }
      const updatedHolder = connectivityState.transportStatus === "offline" && user && holder
        ? await queueOfflineFilmHolderAction(user, holder, "load", buildHolderLoadPayload(holderLoadDraft))
        : await api.loadFilmHolder(mediaDialog.holderId, buildHolderLoadPayload(holderLoadDraft));
      setFilmHolders(prev => prev.map(holder => holder.id === updatedHolder.id ? updatedHolder : holder));
      setForm(prev => prev ? {
        ...prev,
        film_holder_id: updatedHolder.id,
        roll_id: "",
        frame_number: "",
      } : prev);
      closeHolderLoadDialog();
    } catch (err) {
      setHolderLoadError(err instanceof Error ? err.message : "Failed to load holder");
    } finally {
      setHolderLoadSaving(false);
    }
  };

  const refreshStaleDraftBeforeSave = async () => {
    const startedAtTime = Date.parse(photoLogDraftStartedAtRef.current);
    if (!Number.isFinite(startedAtTime) || Date.now() - startedAtTime <= PHOTO_LOG_DRAFT_FRESHNESS_MS) {
      return false;
    }
    const shouldUpdate = window.confirm(
      autoLocationSetRef.current
        ? "This photo log was started more than 5 minutes ago. Update the time and refresh the GPS location before saving?"
        : "This photo log was started more than 5 minutes ago. Update the time before saving?",
    );
    if (!shouldUpdate) return false;

    const now = new Date();
    let nextForm: PhotoNewFormState = {
      ...form,
      taken_at: formatDateTimeLocalValue(now),
    };
    if (autoLocationSetRef.current) {
      try {
        nextForm = {
          ...nextForm,
          ...await readCurrentLocationDraft(),
        };
        setLocationError(null);
        setLocationMessage("Time and location updated.");
      } catch (positionError) {
        setLocationError(positionError instanceof Error ? positionError.message : "Unable to refresh your location.");
        setLocationMessage("Time updated. Location was not refreshed.");
      }
    }
    setForm(nextForm);
    photoLogDraftStartedAtRef.current = now.toISOString();
    setError("Time updated. Review the values, then tap Save photograph again.");
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const createdPhotoId = createdPhotoIdRef.current;
    if (createdPhotoId) {
      setError(null);
      setSubmitting(true);
      let uploadedCount = 0;
      try {
        uploadedCount = await uploadQueuedReferenceImages(createdPhotoId);
        clearPhotoLogDrafts();
        allowUnsavedNavigationRef.current = true;
        navigate("/app/photos", { replace: true });
        return;
      } catch (err) {
        if (shouldQueueReferenceImagesOffline(err)) {
          try {
            const queuedCount = await queueRemainingReferenceImages(createdPhotoId);
            setError(
              queuedCount > 0
                ? `Photograph was created. ${queuedCount} reference image${queuedCount === 1 ? "" : "s"} queued for sync.`
                : "Photograph was created.",
            );
            clearPhotoLogDrafts();
            allowUnsavedNavigationRef.current = true;
            navigate("/app/photos", { replace: true });
            return;
          } catch (queueError) {
            setError(queueError instanceof Error ? queueError.message : "Failed to queue reference images.");
            return;
          }
        }
        const message = err instanceof Error ? err.message : "Failed to save";
        const prefix = uploadedCount > 0
          ? `Photograph was created. ${uploadedCount} reference image${uploadedCount === 1 ? "" : "s"} uploaded before the failure.`
          : "Photograph was created, but image preparation or uploads failed.";
        setError(`${prefix} ${message}`);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (await refreshStaleDraftBeforeSave()) {
      return;
    }

    if (focalLengthError) {
      setError(focalLengthError);
      return;
    }
    if (!selectedCamera) {
      setError("Choose a camera before saving the photograph.");
      return;
    }
    if (!selectedLens) {
      setError("Choose a lens before saving the photograph.");
      return;
    }
    if (selectedCamera && form.lens_id && !compatibleLenses.some(lens => lens.id === form.lens_id)) {
      setError("Selected lens is not allowed for this camera.");
      return;
    }
    if (isBulbShutter && bulbTimerRunning) {
      setError("Stop or finish the bulb timer before saving.");
      return;
    }
    if (form.roll_id && form.film_holder_id) {
      setError("Select either a roll or a holder, not both.");
      return;
    }
    if (!selectedCamera && (form.roll_id || form.film_holder_id || form.frame_number)) {
      setError("Select a camera before choosing film media.");
      return;
    }
    if (selectedCamera?.film_type === "sheet" && form.roll_id) {
      setError("Sheet cameras do not use rolls.");
      return;
    }
    if (selectedCamera?.film_type === "sheet" && !form.film_holder_id) {
      setError("Please select a film holder for a sheet film camera.");
      return;
    }
    if (selectedCamera?.film_type === "roll" && form.film_holder_id) {
      setError("Roll cameras do not use film holders.");
      return;
    }
    if (selectedCamera?.film_type === "roll") {
      if (!form.roll_id) {
        setError("Please select a roll for a roll film camera.");
        return;
      }
      if (!form.frame_number.trim()) {
        setError("Please enter a frame number for a roll film camera.");
        return;
      }
    }
    if (cameraFilmWorkflow === "fallback" && !form.roll_id && !form.film_holder_id) {
      setError("Please select either a roll or a film holder.");
      return;
    }
    if (form.roll_id && !form.frame_number.trim()) {
      setError("Please enter a frame number for the selected roll.");
      return;
    }
    if (form.film_holder_id && !selectedFilmHolderHasActiveLoad) {
      setError("Selected film holder does not have an active load. Clear it or choose another holder.");
      return;
    }
    if (!selectedMediaFilmId) {
      setError("Please choose film before saving the photograph.");
      return;
    }
    if (form.exposure_entry_mode === "manual") {
      if (!form.aperture.trim()) {
        setError("Please choose an aperture for manual exposure.");
        return;
      }
      if (!form.shutter_speed.trim()) {
        setError("Please choose a shutter speed for manual exposure.");
        return;
      }
    }
    if (form.exposure_entry_mode === "cell-camera" && !cellCameraMeteringAvailable) {
      setError("Take a Reference Photo first.");
      return;
    }
    if (form.exposure_entry_mode === "btzs-zone-metering" && !exposureModeAvailability.btzsZoneMeteringEnabled) {
      setError(exposureModeAvailability.btzsZoneMeteringReason ?? "Zone Metering requires a development profile for this film.");
      return;
    }
    const exposure = buildPhotographExposureWritePayload(exposureWritePayloadInput);
    if (exposure.error) {
      setError(exposure.error);
      return;
    }

    const payload: Record<string, PhotographPayloadValue> = { ...exposure.payload };
    const addString = (key: keyof PhotoNewFormState, value: string) => {
      const trimmed = value.trim();
      if (trimmed !== "") payload[key] = trimmed;
    };

    addString("camera_id", form.camera_id);
    addString("lens_id", form.lens_id);
    addString("taken_at", form.taken_at);
    if (form.exposure_entry_mode === "manual") {
      addString("aperture", form.aperture);
    }
    payload.title = normalizePhotographTitle(form.title);
    if (form.notes !== "") {
      payload.notes = form.notes;
    }
    setOptionalNumberPayloadValue(payload, "focal_length_mm", form.focal_length_mm);
    setOptionalNumberPayloadValue(payload, "latitude", form.latitude);
    setOptionalNumberPayloadValue(payload, "longitude", form.longitude);
    setOptionalNumberPayloadValue(payload, "altitude_m", form.altitude_m);

    if (form.film_holder_id) {
      addString("film_holder_id", form.film_holder_id);
    }
    if (form.roll_id) {
      addString("roll_id", form.roll_id);
    }
    if (form.frame_number && form.roll_id) {
      addString("frame_number", form.frame_number);
    }
    payload.filter_ids = filtersLoaded
      ? pruneFilterIdsToCompatible(form.filter_ids, filters, form.lens_id, selectedFilmStock?.stock_type).nextFilterIds
      : [...form.filter_ids];

    const reexposureConfirmation = selectedFilmHolderLoad?.status === "exposed"
      ? getFilmHolderDiscardConfirmationText(
          selectedFilmHolder?.name ?? "Selected holder",
          selectedFilmHolderLoad,
          preferredTimeZone,
          "reexpose",
        )
      : null;
    if (reexposureConfirmation && !confirm(reexposureConfirmation)) {
      return;
    }
    if (reexposureConfirmation) {
      payload.confirm_reexposure = true;
    }

    setError(null);
    setSubmitting(true);
    try {
      const photo = await api.createPhotograph(payload as PhotographWritePayload);
      const photoId = photo.id;
      createdPhotoIdRef.current = photoId;
      setCreatedPhotoId(photoId);

      const uploadsToSave = [...referenceImageUploads];
      if (uploadsToSave.length > 0) {
        try {
          await uploadReferenceImagesToServer(photoId, uploadsToSave, true);
        } catch (uploadError) {
          if (shouldQueueReferenceImagesOffline(uploadError)) {
            await queueReferenceImageUploadsForSync(photoId, uploadsToSave, true);
          } else {
            const message = uploadError instanceof Error ? uploadError.message : "Reference image upload failed.";
            setError(`Photograph was created, but reference image upload failed. ${message}`);
            return;
          }
        }
      }
      clearPhotoLogDrafts();
      allowUnsavedNavigationRef.current = true;
      navigate("/app/photos", { replace: true });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      if (createdPhotoIdRef.current) {
        if (shouldQueueReferenceImagesOffline(err)) {
          try {
            const queuedCount = await queueRemainingReferenceImages(createdPhotoIdRef.current);
            setError(
              queuedCount > 0
                ? `Photograph was created. ${queuedCount} reference image${queuedCount === 1 ? "" : "s"} queued for sync.`
                : "Photograph was created.",
            );
            clearPhotoLogDrafts();
            allowUnsavedNavigationRef.current = true;
            navigate("/app/photos", { replace: true });
            return;
          } catch (queueError) {
            setError(queueError instanceof Error ? queueError.message : "Failed to queue reference images.");
            return;
          }
        }
        setError(`Photograph was created, but reference image queueing failed. ${message}`);
      } else {
        if (user && shouldQueueReferenceImagesOffline(err)) {
          try {
            const offlineFiles = referenceImageUploads.map(upload => upload instanceof File ? upload : upload.display ?? upload.original);
            const photo = await queueOfflinePhotographCreate(user, payload as PhotographWritePayload, offlineFiles);
            setReferenceImageUploads([]);
            clearPhotoLogDrafts();
            allowUnsavedNavigationRef.current = true;
            navigate("/app/photos", { replace: true });
            return;
          } catch (offlineError) {
            setError(offlineError instanceof Error ? offlineError.message : "Failed to queue offline photograph.");
            return;
          }
        }
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = createdPhotoId
    ? (referenceImageUploads.length > 0 ? "Upload remaining images" : "Back to photos")
    : "Save photograph";
  const mediaLockedReason = !selectedCamera
    ? null
    : selectedCamera.film_type === "sheet"
      ? !form.film_holder_id
        ? "Choose a film holder before entering exposure settings."
        : !selectedFilmHolderHasActiveLoad
          ? "Selected film holder needs an active load before entering exposure settings."
          : !selectedMediaFilmId
            ? "Choose film before entering exposure settings."
          : null
      : selectedCamera.film_type === "roll"
      ? !form.roll_id
        ? "Choose a roll before entering exposure settings."
        : !form.frame_number.trim()
          ? "Enter the frame number before entering exposure settings."
          : !selectedMediaFilmId
            ? "Choose film before entering exposure settings."
          : null
        : !form.roll_id && !form.film_holder_id
          ? "Choose a roll or film holder before entering exposure settings."
          : form.roll_id && !form.frame_number.trim()
            ? "Enter the frame number before entering exposure settings."
          : form.film_holder_id && !selectedFilmHolderHasActiveLoad
            ? "Selected film holder needs an active load before entering exposure settings."
            : !selectedMediaFilmId
              ? "Choose film before entering exposure settings."
            : null;
  const exposureLockedReason = !selectedCamera
    ? "Choose a camera, lens, and film media before entering exposure settings."
    : !selectedLens
      ? "Choose a lens before entering exposure settings."
      : mediaLockedReason;
  const saveBlockedReason = !createdPhotoId ? exposureLockedReason : null;
  const btzsPreviewCardValue = (label: string) =>
    btzsPreview?.preview?.cards.find((card) => card.label === label)?.value ?? "—";
  const btzsCalculatedBulbDuration = btzsPreview?.display?.shutterChoice?.value === "bulb"
    ? formatBulbDurationInputValue(btzsPreview.display.finalShutterSeconds)
    : "";
  const zoneCalculatedBulbDuration = zoneMeteringPreview?.display?.shutterChoice?.value === "bulb"
    ? formatBulbDurationInputValue(zoneMeteringPreview.display.finalShutterSeconds)
    : "";
  const btzsPriorityShutterValue = btzsCalculatedBulbDuration
    ? `BULB · ${btzsCalculatedBulbDuration}s`
    : btzsPreviewCardValue("Closest supported shutter");
  const btzsPriorityApertureValue = btzsPreviewCardValue("Closest supported aperture");
  const hiddenBtzsPriorityPreviewCards = new Set([
    "Held aperture",
    "Held shutter",
    "Closest supported shutter",
    "Closest supported aperture",
  ]);
  const hasUnsavedPhotograph = useMemo(() => {
    if (createdPhotoId) return false;
    return draftRestoredRef.current
      || JSON.stringify(form) !== initialFormSignatureRef.current
      || referenceImageUploads.length > 0
      || referenceImageReviewQueue.length > 0;
  }, [createdPhotoId, form, referenceImageUploads.length, referenceImageReviewQueue.length]);
  const handleCancelLogPhotograph = (event: MouseEvent<HTMLAnchorElement>) => {
    if (allowUnsavedNavigationRef.current) return;
    if (!hasUnsavedPhotograph) return;
    if (window.confirm("Discard this unsaved photograph?")) {
      clearPhotoLogDrafts();
      allowUnsavedNavigationRef.current = true;
      return;
    }
    event.preventDefault();
  };

  useEffect(() => {
    if (createdPhotoId) return;
    if (hasUnsavedPhotograph) {
      writePhotoLogDraft({
        form,
        startedAt: photoLogDraftStartedAtRef.current,
        autoLocationSet: autoLocationSetRef.current,
      });
      return;
    }
    clearPhotoLogDrafts();
  }, [createdPhotoId, form, hasUnsavedPhotograph]);

  return (
    <div className="page form-page">
      <div className="page-header">
        <h1>Log photograph</h1>
        <Link to="/app/photos" className="link-btn" onClick={handleCancelLogPhotograph}>Cancel</Link>
      </div>

      <form onSubmit={handleSubmit} className="log-form">
        {error && <p className="form-error">{error}</p>}
        {createdPhotoId && error && (
          <p className="muted" style={{ margin: 0 }}>
            {referenceImageUploads.length > 0 ? (
              <>
                Retry the remaining files below or{" "}
                <Link to={`/app/photos/${createdPhotoId}`}>open the detail page</Link> to review the saved photograph.
              </>
            ) : (
              <>
                The photograph was created.{" "}
                <Link to={`/app/photos/${createdPhotoId}`}>Open the detail page</Link> to review it.
              </>
            )}
          </p>
        )}

        <IdentityFieldset title={form.title} onFieldChange={set} />

        <GearMediaFieldsets
          form={form}
          cameras={cameras}
          compatibleRolls={compatibleRolls}
          applicableFilmHolders={applicableFilmHolders}
          selectedCamera={selectedCamera}
          submitting={submitting}
          mediaDialogOpen={mediaDialog !== null}
          shouldShowRollInput={shouldShowRollInput}
          shouldShowFrameInput={shouldShowFrameInput}
          shouldShowFilmHolderInput={shouldShowFilmHolderInput}
          rollCreateSaving={rollCreateSaving}
          holderLoadSaving={holderLoadSaving}
          onFieldChange={set}
          onCameraChange={handleCameraChange}
          onRollChange={handleRollChange}
          onFilmHolderChange={handleFilmHolderChange}
          onNewRoll={openRollCreateDialog}
        >
          <LensFieldset
            form={form}
            selectedCamera={selectedCamera}
            compatibleLenses={compatibleLenses}
            selectedLensRange={selectedLensRange}
            focalLengthError={focalLengthError}
            cameraSelectedLensWarning={cameraSelectedLensWarning}
            onFieldChange={set}
          />
        </GearMediaFieldsets>

        <ReferenceImagesFieldset
          uploads={referenceImageUploads}
          disabled={submitting}
          onFilesSelected={handleReferenceImagesSelected}
          onRemove={handleRemoveReferenceImage}
        />

        <MediaDialogs
          dialog={mediaDialog}
          camera={selectedCamera}
          films={films}
          rollDraft={rollCreateDraft}
          rollSaving={rollCreateSaving}
          rollError={rollCreateError}
          onRollDraftChange={setRollCreateDraft}
          onCloseRoll={closeRollCreateDialog}
          onCreateRoll={handleCreateRoll}
          holderDraft={holderLoadDraft}
          holderSaving={holderLoadSaving}
          holderError={holderLoadError}
          onHolderDraftChange={setHolderLoadDraft}
          onCloseHolder={closeHolderLoadDialog}
          onLoadHolder={handleLoadHolder}
        />

        <PhotoFilterFieldset
          filters={filters}
          filtersLoaded={filtersLoaded}
          filtersLoadError={filtersLoadError}
          selectedLensId={form.lens_id}
          selectedFilmStockType={selectedFilmPreviewStockType}
          selectedFilmStockName={selectedFilmStock?.name}
          filmSpectralResponseKey={selectedFilmSpectralResponseKey}
          selectedFilterIds={form.filter_ids}
          previewImageUrl={filterPreviewReferenceImageUrl}
          previewImageLabel={filterPreviewReferenceImageLabel}
          onChange={(next) => setForm(prev => prev ? { ...prev, filter_ids: next } : prev)}
          readingThroughSelectedFilters={
            form.exposure_entry_mode === "btzs-zone-metering"
              ? form.btzs_zone_metering.reading_through_selected_filters
              : form.zone_metering.reading_through_selected_filters
          }
          onReadingThroughSelectedFiltersChange={(value) => setForm(prev => prev ? ({
            ...prev,
            zone_metering: { ...prev.zone_metering, reading_through_selected_filters: value },
            btzs_zone_metering: { ...prev.btzs_zone_metering, reading_through_selected_filters: value },
          }) : prev)}
        />

        <ExposureFieldset
          form={form}
          onFormChange={(updater) => setForm((prev) => updater(prev))}
          setField={set}
          submitting={submitting}
          lockedReason={exposureLockedReason}
          exposureModeAvailability={exposureModeAvailability}
          cellCameraAvailable={cellCameraMeteringAvailable}
          cellCameraEvLabel={cellCameraEvLabel}
          btzsProfiles={btzsProfiles}
          btzsProfilesLoading={btzsProfilesLoading}
          btzsProfilesError={btzsProfilesError}
          selectedBtzsProfileSelection={selectedBtzsProfileSelection}
          selectedBtzsProfile={selectedBtzsProfile}
          selectedBtzsProfilePaperEsValue={selectedBtzsProfilePaperEsValue}
          selectedBtzsFlareFactorText={selectedBtzsFlareFactorText}
          apertureChoices={apertureChoices}
          shutterSpeedChoices={shutterSpeedChoices}
          manualReciprocityWarning={manualReciprocityWarning}
          isBulbShutter={isBulbShutter}
          bulbTimerRunning={bulbTimerRunning}
          onBulbTimerRunningChange={setBulbTimerRunning}
          showBellowsCorrection={Boolean(selectedCamera?.has_bellows)}
          zoneBellowsCorrection={zoneBellowsCorrection}
          btzsBellowsCorrection={btzsBellowsCorrection}
          zoneMeteringPreview={zoneMeteringPreview}
          btzsPreview={btzsPreview}
          btzsReadingsReversed={btzsReadingsReversed}
          btzsRangeWarning={btzsRangeWarning}
          btzsPriorityApertureValue={btzsPriorityApertureValue}
          zoneCalculatedBulbDuration={zoneCalculatedBulbDuration}
          btzsPriorityShutterValue={btzsPriorityShutterValue}
          btzsCalculatedBulbDuration={btzsCalculatedBulbDuration}
          hiddenBtzsPriorityPreviewCards={hiddenBtzsPriorityPreviewCards}
        />

        <LocationFieldset
          latitude={form.latitude}
          longitude={form.longitude}
          altitudeM={form.altitude_m}
          loading={locationLoading}
          message={locationMessage}
          error={locationError}
          onUseCurrentLocation={handleUseCurrentLocation}
          onFieldChange={set}
        />

        {referenceImageReviewQueue[0] && (
          <ReferenceImageImportDialog
            file={referenceImageReviewQueue[0]}
            frameFormat={selectedReferenceFrameFormat}
            compatibleFilters={compatibleFiltersForReferenceImage}
            selectedFilterIds={form.filter_ids}
            monochrome={selectedFilmIsMonochrome}
            filmSpectralResponseKey={selectedFilmSpectralResponseKey}
            onCancel={closeReferenceImageReview}
            onFilterSelectionChange={(nextFilterIds) => setForm(prev => ({ ...prev, filter_ids: nextFilterIds }))}
            onConfirm={handleConfirmReferenceImageReview}
          />
        )}

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={form.notes} onChange={set("notes")} rows={3} />
        </div>

        <div className="form-actions log-form-submit">
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || mediaDialog !== null || Boolean(saveBlockedReason)}
            title={saveBlockedReason ?? undefined}
          >
            {submitting ? "Saving…" : submitLabel}
          </button>
          {saveBlockedReason && <p className="field-note form-action-note">{saveBlockedReason}</p>}
        </div>
      </form>
    </div>
  );
}
