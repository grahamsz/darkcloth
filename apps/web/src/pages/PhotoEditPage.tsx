import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import type { Camera, Filter, FilmHolder, FilmStock, Lens, Photograph, PhotographImage, PhotographWritePayload, Roll } from "../api/client";
import { PhotoFilterFieldset } from "../components/PhotoFilterFieldset";
import { useAuth } from "../contexts/AuthContext";
import { useConnectivity } from "../contexts/ConnectivityContext";
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
  calculateBtzsExposure,
  calculateBellowsCorrectionStops,
  calculateSimpleZoneSystemExposure,
  calculateZoneMeteringExposure,
  buildPhotographExposureWritePayload,
  buildMeteredExposurePreview,
  formatBulbDurationInputValue,
  getManualReciprocityWarning,
  getPhotographExposureDraft,
  getPhotographExposureModeAvailability,
  getPhotographExposureModeDraft,
  inferPhotographExposureFilmStock,
  isBulbShutterValue,
  parseDevelopmentTimeTextMinutes,
  resolveBtzsProfileFlareFactor,
  resolveBtzsProfilePaperEs,
  resolveBtzsProfileSelection,
  resolveExposureChoiceDisplay,
  resolveSingleSpotProfileDevelopment,
} from "../photoExposure";
import { areFilterIdsEqual, getSelectedFiltersInOrder, pruneFilterIdsToCompatible } from "../photoFilters";
import {
  formatDateTimeLocalInputValue,
  sortByName,
  formatPhotographLocationDraft,
  setNullableNumberPayloadValue,
} from "./photoFormUtils";
import { normalizePhotographTitle } from "../photoIdentity";
import { getEnabledFilmSpectralResponseKey } from "../film-stocks";
import {
  getCameraFilmWorkflow,
  isLensCompatibleWithCamera,
} from "../photoMedia";
import { useBtzsDevelopmentProfiles } from "../hooks/useBtzsDevelopmentProfiles";
import { usePreferredTimeZone } from "../hooks/usePreferredTimeZone";
import { formatCameraDisplayName, formatRollSelectLabel } from "./GearFormFields";
import {
  formatFilmHolderLoadSummary,
  formatFilmHolderSelectorLabel,
  getFilmHolderLoadFilmId,
  isActiveFilmHolderLoad,
} from "../filmHolders";
import {
  formatRawXdfPaperEsInputValue,
} from "../btzs/xdf";
import {
  buildExposureWritePayloadInput,
  parsePositiveNumber,
  type PhotographPayloadValue,
} from "./photoExposurePageUtils";
import { ExposureFieldset } from "./photo-new/ExposureFieldset";
import {
  IdentityFieldset,
  LocationFieldset,
} from "./photo-new/FormSections";
import {
  formatPhotographImageLabel,
  getPhotographImageOriginalUrl,
} from "../photoReferenceImages";
import {
  readCachedCameras,
  readCachedFilmHolders,
  readCachedFilmStocks,
  readCachedFilters,
  readCachedLenses,
  readCachedPhotograph,
  readCachedPhotographImages,
  readCachedRolls,
} from "../offline/cache";
import { updatePhotographForConnectivity } from "../offline/actions";

// Route-level orchestration for editing a photo. Shared media/exposure rules live in src/photo*.ts.
function toFormState(p: Photograph) {
  return {
    camera_id: p.camera_id ?? "",
    lens_id: p.lens_id ?? "",
    film_id: p.film_id ?? "",
    film_holder_id: p.film_holder_id ?? "",
    filter_ids: p.filter_ids ?? [],
    roll_id: p.roll_id ?? "",
    frame_number: p.frame_number ?? "",
    taken_at: formatDateTimeLocalInputValue(p.taken_at),
    aperture: p.aperture ?? "",
    ...getPhotographExposureDraft(p),
    ...getPhotographExposureModeDraft(p),
    focal_length_mm: p.focal_length_mm != null ? String(p.focal_length_mm) : "",
    ...formatPhotographLocationDraft({
      latitude: p.latitude,
      longitude: p.longitude,
      altitude: p.altitude_m,
    }),
    title: p.title ?? "",
    notes: p.notes ?? "",
  };
}

export function PhotoEditPage() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const preferredTimeZone = usePreferredTimeZone();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [films, setFilms] = useState<FilmStock[]>([]);
  const [filmHolders, setFilmHolders] = useState<FilmHolder[]>([]);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [photo, setPhoto] = useState<Photograph | null>(null);
  const [form, setForm] = useState<ReturnType<typeof toFormState> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraSelectedLensWarning, setCameraSelectedLensWarning] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [bulbTimerRunning, setBulbTimerRunning] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [referenceImages, setReferenceImages] = useState<PhotographImage[]>([]);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [filtersLoadError, setFiltersLoadError] = useState<string | null>(null);
  const initialLensIdRef = useRef<string | null>(null);
  const initialCameraIdRef = useRef<string | null>(null);
  const initialFilmIdRef = useRef<string | null>(null);
  const initialFilmHolderIdRef = useRef<string | null>(null);
  const initialRollIdRef = useRef<string | null>(null);
  const initialFrameNumberRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id) return;
    if (connectivityState.transportStatus === "offline" && user) {
      Promise.all([
        readCachedPhotograph(user, id),
        readCachedPhotographImages(user, id),
        readCachedCameras(user),
        readCachedLenses(user),
        readCachedFilters(user),
        readCachedFilmStocks(user),
        readCachedFilmHolders(user),
        readCachedRolls(user),
      ]).then(([cachedPhoto, images, cachedCameras, cachedLenses, cachedFilters, cachedFilms, cachedFilmHolders, cachedRolls]) => {
        if (!cachedPhoto) {
          setError("This photograph is not cached for offline editing.");
          return;
        }
        setCameras(cachedCameras);
        setLenses(cachedLenses);
        setFilters(cachedFilters);
        setFiltersLoaded(true);
        setFiltersLoadError(null);
        setFilms(cachedFilms);
        setFilmHolders(cachedFilmHolders);
        setRolls(cachedRolls);
        setPhoto(cachedPhoto);
        initialLensIdRef.current = cachedPhoto.lens_id;
        initialCameraIdRef.current = cachedPhoto.camera_id;
        initialFilmIdRef.current = cachedPhoto.film_id;
        initialFilmHolderIdRef.current = cachedPhoto.film_holder_id;
        initialRollIdRef.current = cachedPhoto.roll_id;
        initialFrameNumberRef.current = cachedPhoto.frame_number;
        setForm(toFormState(cachedPhoto));
        setReferenceImages(images.length > 0 ? images : cachedPhoto.images?.items ?? []);
      }).catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load cached photograph.");
      });
      return;
    }
    Promise.all([
      api.getPhotograph(id),
      api.listPhotographImages(id).catch(() => ({ items: [] as PhotographImage[] })),
      api.listCameras().then(r => setCameras(r.items)).catch(() => null),
      api.listLenses().then(r => setLenses(r.items)).catch(() => null),
      api.listFilters({ limit: 200 })
        .then((r) => {
          setFilters(r.items);
          setFiltersLoaded(true);
          setFiltersLoadError(null);
        })
        .catch((err) => {
          setFilters([]);
          setFiltersLoaded(false);
          setFiltersLoadError(err instanceof Error ? err.message : "Failed to load filters.");
        }),
      api.listFilmStocks().then(r => setFilms(r.items)).catch(() => null),
      api.listFilmHolders().then(r => setFilmHolders(r.items)).catch(() => null),
      api.listRolls().then(r => setRolls(r.items)).catch(() => null),
    ]).then(([photo, images]) => {
      setPhoto(photo);
      initialLensIdRef.current = photo.lens_id;
      initialCameraIdRef.current = photo.camera_id;
      initialFilmIdRef.current = photo.film_id;
      initialFilmHolderIdRef.current = photo.film_holder_id;
      initialRollIdRef.current = photo.roll_id;
      initialFrameNumberRef.current = photo.frame_number;
      setForm(toFormState(photo));
      setReferenceImages(images.items.length > 0 ? images.items : photo.images?.items ?? []);
    });
  }, [connectivityState.transportStatus, id, user]);

  const sortedFilmHolders = useMemo(() => sortByName(filmHolders), [filmHolders]);
  const selectedFilmHolder = useMemo(
    () => sortedFilmHolders.find(holder => holder.id === form?.film_holder_id) ?? null,
    [form?.film_holder_id, sortedFilmHolders],
  );
  const selectedFilmHolderLoad = selectedFilmHolder?.current_load ?? null;
  const selectedFilmHolderHasActiveLoad = isActiveFilmHolderLoad(selectedFilmHolderLoad);
  const selectedFilmHolderFilmId = getFilmHolderLoadFilmId(selectedFilmHolderLoad);
  const selectedFilmHolderFilmName = selectedFilmHolderLoad?.film?.name?.trim() ?? "";
  const selectedRoll = useMemo(
    () => rolls.find((roll) => roll.id === form?.roll_id) ?? null,
    [form?.roll_id, rolls],
  );
  const selectedRollFilmId = selectedRoll?.film_id ?? null;
  const selectedFilmStock = useMemo(
    () => inferPhotographExposureFilmStock(films, {
      rollFilmId: selectedRollFilmId,
      filmHolderFilmId: selectedFilmHolderFilmId,
      filmId: form?.film_id,
    }),
    [films, form?.film_id, selectedFilmHolderFilmId, selectedRollFilmId],
  );
  const selectedFilmSpectralResponseKey = getEnabledFilmSpectralResponseKey(selectedFilmStock);
  const filterPreviewReferenceImage = referenceImages[0] ?? null;
  const filterPreviewReferenceImageUrl = filterPreviewReferenceImage
    ? getPhotographImageOriginalUrl(filterPreviewReferenceImage)
    : null;
  const filterPreviewReferenceImageLabel = filterPreviewReferenceImage
    ? formatPhotographImageLabel(filterPreviewReferenceImage)
    : null;
  const {
    profiles: btzsProfiles,
    loading: btzsProfilesLoading,
    error: btzsProfilesError,
  } = useBtzsDevelopmentProfiles(selectedFilmStock?.id, selectedFilmStock?.stock_type);
  const exposureModeAvailability = useMemo(
    () => getPhotographExposureModeAvailability(selectedFilmStock, btzsProfiles),
    [btzsProfiles, selectedFilmStock],
  );
  const selectedBtzsProfileSelection = useMemo(
    () => resolveBtzsProfileSelection(btzsProfiles, form?.btzs_zone_metering.profile_id),
    [btzsProfiles, form?.btzs_zone_metering.profile_id],
  );
  const selectedBtzsProfile = selectedBtzsProfileSelection.selectedProfile;
  const selectedBtzsProfilePaperEsValue = selectedBtzsProfile?.type === "btzs"
    ? resolveBtzsProfilePaperEs(selectedBtzsProfile)
    : null;
  const selectedBtzsProfilePaperEsText = selectedBtzsProfilePaperEsValue != null
    ? formatRawXdfPaperEsInputValue(selectedBtzsProfilePaperEsValue)
    : "1.0";
  const filmIdForPayload = selectedRollFilmId
    ?? (selectedFilmHolderHasActiveLoad && selectedFilmHolderFilmId ? selectedFilmHolderFilmId : null)
    ?? form?.film_id
    ?? "";
  const shouldLockFilmField = selectedFilmHolderHasActiveLoad && Boolean(selectedFilmHolderFilmId);

  const set =
    (key: string) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => f ? { ...f, [key]: e.target.value } : f);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not available in this browser.");
      setLocationMessage(null);
      return;
    }

    setLocationLoading(true);
    setLocationError(null);
    setLocationMessage("Locating...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm(prev => (prev ? {
          ...prev,
          ...formatPhotographLocationDraft(position.coords),
        } : prev));
        setLocationMessage("Location captured.");
        setLocationLoading(false);
      },
      (positionError) => {
        setLocationError(positionError.message || "Unable to read your location.");
        setLocationMessage(null);
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    );
  };

  const selectedCamera = useMemo(
    () => cameras.find(camera => camera.id === form?.camera_id),
    [cameras, form?.camera_id],
  );
  const cameraFilmWorkflow = getCameraFilmWorkflow(selectedCamera);
  const shouldShowRollInput = cameraFilmWorkflow !== "sheet";
  const shouldShowFrameInput = cameraFilmWorkflow !== "sheet";
  const shouldShowFilmHolderInput = cameraFilmWorkflow !== "roll";

  const handleCameraChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextCameraId = e.target.value;
    setForm((prevForm) => {
      if (!prevForm) return prevForm;
      const selected = cameras.find(camera => camera.id === nextCameraId);
      const nextForm = { ...prevForm, camera_id: nextCameraId };
      if (selected?.film_type === "sheet") {
        nextForm.roll_id = "";
        nextForm.frame_number = "";
      } else if (selected?.film_type === "roll") {
        nextForm.film_holder_id = "";
      }
      return nextForm;
    });
  };

  const compatibleLenses = useMemo(() => {
    if (!selectedCamera) return lenses;
    return lenses.filter(lens => isLensCompatibleWithCamera(lens, selectedCamera));
  }, [lenses, selectedCamera]);

  const selectedLens = useMemo(() => {
    if (!form?.lens_id) return undefined;
    return lenses.find(lens => lens.id === form.lens_id);
  }, [form?.lens_id, lenses]);
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

  const selectedLensRange = useMemo(() => getLensFocalRange(selectedLens), [selectedLens]);

  const focalLengthError = useMemo(
    () => getFocalLengthError(selectedLensRange, form?.focal_length_mm ?? ""),
    [selectedLensRange, form?.focal_length_mm],
  );

  useEffect(() => {
    if (!filtersLoaded || !form) return;
    const { nextFilterIds } = pruneFilterIdsToCompatible(form.filter_ids, filters, form.lens_id, selectedFilmStock?.stock_type);
    if (!areFilterIdsEqual(nextFilterIds, form.filter_ids)) {
      setForm(prev => prev ? { ...prev, filter_ids: nextFilterIds } : prev);
    }
  }, [filters, filtersLoaded, form?.filter_ids, form?.lens_id, selectedFilmStock?.stock_type]);

  const apertureChoices = useMemo(() => {
    return getApertureChoiceOptions(selectedLens, form?.aperture ?? "");
  }, [selectedLens, form?.aperture]);

  const apertureValues = useMemo(() => apertureChoices.map(option => option.value), [apertureChoices]);
  const shutterSpeedChoices = useMemo(
    () => getShutterChoiceOptions(shutterSource, form?.shutter_speed),
    [shutterSource, form?.shutter_speed],
  );
  const isBulbShutter = isBulbShutterValue(form?.shutter_speed);
  const manualReciprocityWarning = useMemo(
    () => form
      ? getManualReciprocityWarning(selectedFilmStock, {
          shutter_speed: form.shutter_speed,
          bulb_duration_seconds: form.bulb_duration_seconds,
        })
      : null,
    [form?.bulb_duration_seconds, form?.shutter_speed, selectedFilmStock],
  );

  useEffect(() => {
    if (!form || !selectedCamera || !form.lens_id) {
      setCameraSelectedLensWarning(null);
      return;
    }
    if (!selectedLens) {
      setCameraSelectedLensWarning(null);
      return;
    }
    if (!isLensCompatibleWithCamera(selectedLens, selectedCamera)) {
      setCameraSelectedLensWarning("Selected lens is not compatible with this camera and was cleared.");
      setForm(f => f ? { ...f, lens_id: "" } : f);
      return;
    }
    setCameraSelectedLensWarning(null);
  }, [form?.camera_id, form?.lens_id, selectedCamera, selectedLens]);

  useEffect(() => {
    if (!form) return;
    if (apertureValues.length === 0) return;
    if (form.aperture !== "" && !apertureValues.includes(form.aperture)) {
      setForm(f => f ? { ...f, aperture: apertureValues[0] } : f);
    }
  }, [apertureValues, selectedLens?.id, form?.aperture, form]);

  useEffect(() => {
    if (!form) return;
    const focalLength = getPrimeLensFocalLengthValue(selectedLensRange);
    if (focalLength == null) return;
    if (form.focal_length_mm !== focalLength) {
      setForm(f => f ? { ...f, focal_length_mm: focalLength } : f);
    }
  }, [form?.focal_length_mm, selectedLensRange?.isPrime, selectedLensRange?.minFocalLengthMm]);

  useEffect(() => {
    if (!form || !selectedCamera) return;
    setForm((prevForm) => {
      if (!prevForm) return prevForm;
      const nextForm = { ...prevForm };
      if (selectedCamera.film_type === "sheet" && prevForm.roll_id) {
        nextForm.roll_id = "";
      }
      if (selectedCamera.film_type === "sheet" && prevForm.frame_number) {
        nextForm.frame_number = "";
      }
      if (selectedCamera.film_type === "roll" && prevForm.film_holder_id) {
        nextForm.film_holder_id = "";
      }
      if (
        nextForm.roll_id === prevForm.roll_id
        && nextForm.frame_number === prevForm.frame_number
        && nextForm.film_holder_id === prevForm.film_holder_id
      ) {
        return prevForm;
      }
      return nextForm;
    });
  }, [selectedCamera?.id, selectedCamera?.film_type, form?.camera_id]);

  useEffect(() => {
    if (!form || selectedCamera?.has_bellows) return;
    setForm((prev) => prev ? ({
      ...prev,
      zone_metering: { ...prev.zone_metering, bellows_correction_mode: "none" },
      btzs_zone_metering: { ...prev.btzs_zone_metering, bellows_correction_mode: "none" },
    }) : prev);
  }, [form?.camera_id, selectedCamera?.has_bellows]);

  useEffect(() => {
    if (!form || btzsProfilesLoading) return;
    setForm((prev) => {
      if (!prev) return prev;
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
  }, [btzsProfiles, btzsProfilesLoading, form?.btzs_zone_metering.profile_id]);

  const paperEsAutoRef = useRef("1.0");
  const flareFactorAutoRef = useRef("0.02");
  useEffect(() => {
    if (!selectedBtzsProfile) {
      return;
    }

    const nextAutoValue = selectedBtzsProfilePaperEsText;
    setForm((prev) => {
      if (!prev) return prev;
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
      if (!prev) return prev;
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

  const exposureWritePayloadInput = useMemo(
    () => (form
      ? buildExposureWritePayloadInput(
          form,
          selectedFilmStock,
          selectedLensCapabilities,
          shutterSource,
          filters,
          btzsProfiles,
        )
      : null),
    [btzsProfiles, filters, form, selectedFilmStock, selectedLensCapabilities, shutterSource],
  );

  const zoneMeteringPreview = useMemo(() => {
    if (!form || form.exposure_entry_mode !== "zone-metering") {
      return null;
    }

    const meterEv = parsePositiveNumber(form.zone_metering.meter_ev);
    const meterIso = parsePositiveNumber(form.zone_metering.meter_iso) ?? 100;
    const workingIso = parsePositiveNumber(form.zone_metering.working_iso) ?? Number(selectedFilmStock?.iso ?? 100);
    const targetZone = parsePositiveNumber(form.zone_metering.target_zone) ?? 5;
    const compensationStops = parsePositiveNumber(form.zone_metering.compensation_stops) ?? 0;
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
      meterIso,
      workingIso: profileDevelopment.profile ? profileDevelopment.workingIso : workingIso,
      targetZone,
      compensationStops,
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
    form,
    btzsProfiles,
    selectedFilmStock,
    selectedFilmStock?.iso,
    selectedFilmStock?.reciprocity_p_factor,
    selectedLensCapabilities,
    shutterSource,
  ]);

  const btzsPreview = useMemo(() => {
    if (!form || form.exposure_entry_mode !== "btzs-zone-metering" || selectedBtzsProfile == null) {
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
          const workingIso = selectedFilmStock?.iso != null && selectedFilmStock.iso > 0 ? selectedFilmStock.iso : 100;
          return calculateSimpleZoneSystemExposure({
            lowEv,
            highEv,
            lowZone,
            highZone,
            paperEs,
            flareFactor,
            meterIso: 100,
            workingIso,
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
    form,
    selectedBtzsProfile,
    selectedBtzsFlareFactorValue,
    selectedBtzsProfilePaperEsValue,
    selectedFilmStock?.iso,
    selectedFilmStock?.reciprocity_p_factor,
    selectedLensCapabilities,
    shutterSource,
  ]);

  const btzsReadingsReversed = useMemo(() => {
    if (!form) return false;
    const lowEv = parsePositiveNumber(form.btzs_zone_metering.low_ev);
    const highEv = parsePositiveNumber(form.btzs_zone_metering.high_ev);
    const lowZone = parsePositiveNumber(form.btzs_zone_metering.low_zone);
    const highZone = parsePositiveNumber(form.btzs_zone_metering.high_zone);
    return (lowEv != null && highEv != null && lowEv > highEv)
      || (lowZone != null && highZone != null && lowZone > highZone);
  }, [form]);
  const btzsRangeWarning = btzsPreview?.calculation.error?.includes("outside the supported")
    ? btzsPreview.calculation.error
    : null;
  const zoneBellowsCorrection = form
    ? calculateBellowsCorrectionStops(
      form.zone_metering.bellows_correction_mode,
      form.focal_length_mm,
      form.zone_metering.bellows_correction_mode === "measurement"
        ? form.zone_metering.bellows_extension_mm
        : form.zone_metering.bellows_subject_distance_m,
    )
    : { stops: 0, error: null };
  const btzsBellowsCorrection = form
    ? calculateBellowsCorrectionStops(
      form.btzs_zone_metering.bellows_correction_mode,
      form.focal_length_mm,
      form.btzs_zone_metering.bellows_correction_mode === "measurement"
        ? form.btzs_zone_metering.bellows_extension_mm
        : form.btzs_zone_metering.bellows_subject_distance_m,
    )
    : { stops: 0, error: null };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !form) return;
    if (focalLengthError) {
      setError(focalLengthError);
      return;
    }
    if (!form.camera_id) {
      setError("Choose a camera before saving the photograph.");
      return;
    }
    if (!form.lens_id) {
      setError("Choose a lens before saving the photograph.");
      return;
    }
    if (selectedCamera && selectedLens && form.lens_id) {
      if (!isLensCompatibleWithCamera(selectedLens, selectedCamera)) {
        setError("Selected lens is not allowed for this camera.");
        return;
      }
    }
    if (selectedCamera?.film_type === "roll") {
      if (!form.roll_id) {
        setError("Please select a roll for a roll film camera.");
        return;
      }
      if (!form.frame_number) {
        setError("Please enter a frame number for a roll film camera.");
        return;
      }
    }
    if (form.film_holder_id && !selectedFilmHolderHasActiveLoad) {
      setError("Selected film holder does not have an active load. Clear it or choose another holder.");
      return;
    }
    if (!filmIdForPayload.trim()) {
      setError("Please choose film before saving the photograph.");
      return;
    }
    if (isBulbShutter && bulbTimerRunning) {
      setError("Stop or finish the bulb timer before saving.");
      return;
    }
    if (!exposureWritePayloadInput) {
      setError("Exposure settings are not ready.");
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
    if (form.exposure_entry_mode === "cell-camera") {
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

    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, PhotographPayloadValue> = { ...exposure.payload };
      const addString = (key: string, value: string) => {
        const trimmed = value.trim();
        payload[key] = trimmed === "" ? null : trimmed;
      };
      const addChangedString = (key: string, value: string, initialValue: string | null) => {
        if (value.trim() === (initialValue ?? "")) return;
        addString(key, value);
      };

      addChangedString("camera_id", form.camera_id, initialCameraIdRef.current);
      addString("lens_id", form.lens_id);
      addChangedString("film_id", filmIdForPayload, initialFilmIdRef.current);
      addString("taken_at", form.taken_at);
      if (form.exposure_entry_mode === "manual") {
        addString("aperture", form.aperture);
      }
      payload.title = normalizePhotographTitle(form.title);
      payload.notes = form.notes === "" ? null : form.notes;
      setNullableNumberPayloadValue(payload, "focal_length_mm", form.focal_length_mm);
      setNullableNumberPayloadValue(payload, "latitude", form.latitude);
      setNullableNumberPayloadValue(payload, "longitude", form.longitude);
      setNullableNumberPayloadValue(payload, "altitude_m", form.altitude_m);

      if (selectedCamera?.film_type === "sheet") {
        addChangedString("film_holder_id", form.film_holder_id, initialFilmHolderIdRef.current);
      } else if (selectedCamera?.film_type === "roll") {
        addChangedString("roll_id", form.roll_id, initialRollIdRef.current);
        addChangedString("frame_number", form.frame_number, initialFrameNumberRef.current);
      } else {
        addChangedString("film_holder_id", form.film_holder_id, initialFilmHolderIdRef.current);
        addChangedString("roll_id", form.roll_id, initialRollIdRef.current);
        addChangedString("frame_number", form.frame_number, initialFrameNumberRef.current);
      }
      payload.filter_ids = filtersLoaded
        ? pruneFilterIdsToCompatible(form.filter_ids, filters, form.lens_id, selectedFilmStock?.stock_type).nextFilterIds
        : form.lens_id === initialLensIdRef.current
          ? [...form.filter_ids]
          : [];

      await updatePhotographForConnectivity(
        { transportStatus: connectivityState.transportStatus, user },
        photo,
        id,
        payload as PhotographWritePayload,
      );
      navigate(`/app/photos/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  if (!form) return <div className="page">{error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>}</div>;

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

  return (
    <div className="page page-narrow photo-page photo-page--edit">
      <div className="page-header photo-page-header">
        <div className="photo-page-header-main">
          <h1>Edit photograph</h1>
        </div>
        <div className="page-header-actions photo-page-header-actions">
          <Link to="/app/photos" className="link-btn">Back</Link>
          <Link to={`/app/photos/${id}`} className="btn-secondary" replace>Cancel</Link>
          <button type="submit" form="photo-edit-form" className="btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <form id="photo-edit-form" onSubmit={handleSubmit} className="log-form">
        {error && <p className="form-error">{error}</p>}

        <IdentityFieldset title={form.title} onFieldChange={set} />

        <fieldset>
          <legend>Film / media</legend>
          <div className="field-row field-grid">
            <div className="field">
              <label htmlFor="film_id">Film</label>
              <select id="film_id" value={form.film_id} onChange={set("film_id")} disabled={shouldLockFilmField}>
                <option value="">None</option>
                {films.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              {shouldLockFilmField && (
                <p className="field-note">
                  Film is inferred from the selected holder.
                </p>
              )}
            </div>
            {shouldShowRollInput && (
              <div className="field">
                <label htmlFor="roll_id">Roll</label>
                <select id="roll_id" value={form.roll_id} onChange={set("roll_id")}>
                  <option value="">No roll</option>
                  {rolls.map((r) => <option key={r.id} value={r.id}>{formatRollSelectLabel(r)}</option>)}
                </select>
              </div>
            )}
            {shouldShowFrameInput && (
              <div className="field field-sm">
                <label htmlFor="frame_number">Frame</label>
                <input id="frame_number" value={form.frame_number} onChange={set("frame_number")} placeholder="12" />
              </div>
            )}
            {shouldShowFilmHolderInput && (
              <div className="field">
                <label htmlFor="film_holder_id">Film holder</label>
                <select
                  id="film_holder_id"
                  value={form.film_holder_id}
                  onChange={set("film_holder_id")}
                >
                  <option value="">None</option>
                  {sortedFilmHolders.map(h => (
                    <option key={h.id} value={h.id} disabled={!isActiveFilmHolderLoad(h.current_load)}>
                      {formatFilmHolderSelectorLabel(h)}
                    </option>
                  ))}
                </select>
                {selectedFilmHolder && (
                  <p className="field-note">
                    {selectedFilmHolderHasActiveLoad
                      ? `Film is inferred from the selected holder${selectedFilmHolderFilmName ? `: ${selectedFilmHolderFilmName}` : ""}. ${formatFilmHolderLoadSummary(selectedFilmHolderLoad, preferredTimeZone)}.`
                      : "This holder has no active load. Clear it or choose another holder."
                    }
                  </p>
                )}
              </div>
            )}
            <div className="field field-date">
              <label htmlFor="taken_at">Date &amp; time</label>
              <input id="taken_at" type="datetime-local" value={form.taken_at} onChange={set("taken_at")} />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Gear</legend>
          <div className="field-row field-grid">
            <div className="field">
              <label htmlFor="camera_id">Camera</label>
              <select id="camera_id" value={form.camera_id} onChange={handleCameraChange}>
                <option value="">None</option>
                {cameras.map(c => <option key={c.id} value={c.id}>{formatCameraDisplayName(c)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lens_id">Lens</label>
              <select id="lens_id" value={form.lens_id} onChange={set("lens_id")}>
                <option value="">None</option>
                {compatibleLenses.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {cameraSelectedLensWarning && (
                <p className="form-error" style={{ margin: "6px 0 0" }}>{cameraSelectedLensWarning}</p>
              )}
              {selectedCamera && compatibleLenses.length === 0 && (
                <p className="form-error" style={{ margin: "6px 0 0" }}>No compatible lenses for selected camera.</p>
              )}
            </div>
          </div>
          <div className="field-row field-grid">
            <div className="field field-sm">
              <label htmlFor="focal_length_mm">Focal length</label>
              <input
                id="focal_length_mm"
                type="number"
                value={form.focal_length_mm}
                onChange={set("focal_length_mm")}
                placeholder="50"
                disabled={Boolean(selectedLensRange?.isPrime)}
                min={selectedLensRange?.isPrime ? undefined : selectedLensRange?.minFocalLengthMm}
                max={selectedLensRange?.isPrime ? undefined : selectedLensRange?.maxFocalLengthMm}
              />
              {focalLengthError && <p className="form-error" style={{ margin: "6px 0 0" }}>{focalLengthError}</p>}
            </div>
          </div>
        </fieldset>

        <PhotoFilterFieldset
          filters={filters}
          filtersLoaded={filtersLoaded}
          filtersLoadError={filtersLoadError}
          selectedLensId={form.lens_id}
          selectedFilmStockType={selectedFilmStock?.stock_type}
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
          onFormChange={(updater) => setForm((prev) => prev ? { ...prev, ...updater(prev) } : prev)}
          setField={set}
          submitting={submitting}
          exposureModeAvailability={exposureModeAvailability}
          cellCameraAvailable={false}
          cellCameraEvLabel={null}
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

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={form.notes} onChange={set("notes")} rows={3} />
        </div>

      </form>
    </div>
  );
}
