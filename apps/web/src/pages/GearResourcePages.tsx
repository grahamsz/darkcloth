import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Camera, DevelopmentProfile, Filter, FilterPreset, FilmHolder, FilmHolderLoad, FilmStock, Lens, Photograph, PhotographImage, Roll } from "../api/client";
import { CollectionSwipeNavigator, type CollectionSwipeDestination } from "../components/CollectionSwipeNavigator";
import { getCollectionNavigationState } from "../components/collectionNavigation";
import {
  PhotographSummaryBlock,
  formatPhotographFilmMediaLabel,
} from "../components/PhotographSummaryBlock";
import { useAuth } from "../contexts/AuthContext";
import { useConnectivity } from "../contexts/ConnectivityContext";
import {
  formatTimerDuration,
  useDevelopmentTimerQueue,
} from "../developmentTimerQueue";
import { formatDateTimeDisplay } from "../dateTime";
import {
  formatFilmHolderLoadFilmLabel,
  formatFilmHolderLoadDevelopmentLabel,
  formatFilmHolderLoadDiscardReason,
  formatFilmHolderLoadPhotographLabel,
  formatFilmHolderLoadProfileLabel,
  formatFilmHolderLoadStatusLabel,
  formatFilmHolderDetailSummary,
  getFilmHolderHistoricalLoads,
  getFilmHolderLoadFilmName,
  getFilmHolderLoadFilmId,
  getFilmHolderLoadPhotographAlt,
  getFilmHolderLoadPhotographThumbnailUrl,
  getFilmHolderLoadTone,
  getFilmHolderUndoExposureConfirmationText,
  isActiveFilmHolderLoad,
  isUndoableFilmHolderLoad,
} from "../filmHolders";
import { FILM_STOCK_PRESETS, formatFilmStockTypeLabel } from "../film-stocks";
import { formatPhotographExposureDisplay } from "../photoDetail";
import { parseDevelopmentTimeTextMinutes } from "../photoExposure";
import {
  applyFilterPreset,
  applyFilmStockPreset,
  buildCameraPayload,
  buildFilmHolderPayload,
  buildFilmStockPayload,
  buildFilterCreatePayload,
  buildFilterUpdatePayload,
  buildLensPayload,
  buildRollPayload,
  cameraDraftFromCamera,
  createEmptyCameraDraft,
  createEmptyFilmHolderDraft,
  createEmptyFilmStockDraft,
  createEmptyFilterDraft,
  createEmptyLensDraft,
  createEmptyRollDraft,
  filmHolderDraftFromFilmHolder,
  filmStockDraftFromFilmStock,
  filterDraftFromFilter,
  lensDraftFromLens,
  rollDraftFromRoll,
  type CameraFormDraft,
  type FilterFormDraft,
  type FilmHolderFormDraft,
  type FilmStockFormDraft,
  type LensFormDraft,
  type NamedItem,
  type RollFormDraft,
  formatCameraDisplayName,
  formatRollLifecycleText,
  formatRollPushPullLabel,
  formatRollStatusLabel,
  getCameraCompatibilityText,
  getRollStatusClassName,
  CameraFormFields,
  FilterFormFields,
  FilmHolderFormFields,
  FilmStockFormFields,
  LensFormFields,
  RollFormFields,
  parseFilterFactorInput,
  parseReciprocityPFactorInput,
  validateApertureRange,
  validateFocalLengthRange,
  validateShutterRange,
} from "./GearFormFields";
import { formatFilterDisplayLabel } from "../photoFilters";
import { getPhotographSecondaryTitle } from "../photoIdentity";
import { formatRollFormatLabel } from "../photoMedia";
import { formatDateTimeLocalValue } from "./photoFormUtils";
import { sortGearItemsByDisplayName } from "./gearListUtils";
import { usePreferredTimeZone } from "../hooks/usePreferredTimeZone";
import {
  readCachedCameras,
  readCachedDevelopmentProfiles,
  readCachedFilmHolder,
  readCachedFilmHolderLoads,
  readCachedFilmHolders,
  readCachedFilmStocks,
  readCachedLenses,
  readCachedPhotographs,
  readCachedRoll,
  readCachedRolls,
} from "../offline/cache";
import { readCachedItemForLoader, readCachedItemsForLoader } from "../offline/resourceLoaders";
import {
  createRollForConnectivity,
  finishRollForConnectivity,
  loadFilmHolderForConnectivity,
  processFilmHolderLoadForConnectivity,
  processRollForConnectivity,
  reopenRollForConnectivity,
  undoFilmHolderExposureForConnectivity,
  unloadFilmHolderForConnectivity,
} from "../offline/actions";

const CAMERA_LIST_PATH = "/app/gear/cameras";
const LENS_LIST_PATH = "/app/gear/lenses";
const FILTER_LIST_PATH = "/app/gear/filters";
const FILM_STOCK_LIST_PATH = "/app/film/stocks";
const FILM_STOCK_DETAIL_PATH = (id: string) => `${FILM_STOCK_LIST_PATH}/${id}`;
const ROLL_LIST_PATH = "/app/film/rolls";
const ROLL_DETAIL_PATH = (id: string) => `${ROLL_LIST_PATH}/${id}`;
const ROLL_EDIT_PATH = (id: string) => `${ROLL_LIST_PATH}/${id}/edit`;
const FILM_HOLDER_LIST_PATH = "/app/film/holders";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function validateFilmStockDraft(draft: FilmStockFormDraft) {
  if (!draft.name.trim()) {
    return "Name is required.";
  }
  if (parseReciprocityPFactorInput(draft.reciprocityPFactor) == null) {
    return "Reciprocity P factor must be a positive number.";
  }
  return null;
}

function FormPageShell({
  eyebrow,
  title,
  collectionSwipe,
  children,
  pageClassName = "page form-page",
}: {
  eyebrow?: string;
  title: string;
  backTo: string;
  backLabel: string;
  collectionSwipe?: {
    collectionLabel: string;
    positionLabel: string | null;
    previous: CollectionSwipeDestination | null;
    next: CollectionSwipeDestination | null;
  };
  children: ReactNode;
  pageClassName?: string;
}) {
  const page = (
    <div className={pageClassName}>
      <div className="page-header">
        <div>
          {eyebrow && <p className="page-count">{eyebrow}</p>}
          <h1>{title}</h1>
        </div>
      </div>
      <div className="form-page-body">{children}</div>
    </div>
  );

  if (!collectionSwipe) {
    return page;
  }

  return (
    <CollectionSwipeNavigator
      collectionLabel={collectionSwipe.collectionLabel}
      positionLabel={collectionSwipe.positionLabel}
      previous={collectionSwipe.previous}
      next={collectionSwipe.next}
    >
      {page}
    </CollectionSwipeNavigator>
  );
}

type ResourceDeleteSectionProps = {
  label: string;
  deleting: boolean;
  error: string | null;
  onDelete: () => void;
};

function ResourceDeleteSection({ label, deleting, error, onDelete }: ResourceDeleteSectionProps) {
  const { state } = useConnectivity();
  const isOffline = state.transportStatus === "offline";

  return (
    <section className="resource-delete-section">
      {error && <p className="form-error">{error}</p>}
      {isOffline && <p className="form-error">Delete actions are disabled while offline.</p>}
      <div className="resource-delete-actions">
        <button type="button" className="btn-danger-ghost resource-delete-button" onClick={onDelete} disabled={deleting || isOffline}>
          {deleting ? "Deleting…" : label}
        </button>
      </div>
    </section>
  );
}

function useLoadedItems<T>(loadItems: () => Promise<{ items: T[] }>) {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    loadItems()
      .then((response) => {
        if (!active) return;
        setItems(response.items);
      })
      .catch((err) => {
        if (!active) return;
        (async () => {
          const cached = await readCachedItemsForLoader(loadItems, user);
          if (!active) return;
          if (cached.length > 0 || user) {
            setItems(cached as T[]);
            return;
          }
          setError(err instanceof Error ? err.message : "Failed to load options");
        })();
      });

    return () => {
      active = false;
    };
  }, [connectivityState.transportStatus, loadItems, user]);

  return { items, error };
}

function useRemoteItem<T>(loadItem: (id: string) => Promise<T>, id: string | undefined, missingMessage: string) {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const [item, setItem] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let active = true;
    setLoading(true);
    setError(null);
    setItem(null);

    loadItem(id)
      .then((response) => {
        if (!active) return;
        setItem(response);
      })
      .catch(async (err) => {
        if (!active) return;
        const cached = await readCachedItemForLoader(loadItem, user, id);
        if (!active) return;
        if (cached) {
          setItem(cached as T);
          return;
        }
        setError(user ? missingMessage : err instanceof Error ? err.message : missingMessage);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [connectivityState.transportStatus, id, loadItem, missingMessage, user]);

  return { item, loading, error };
}

function buildCollectionSwipe<T extends { id: string }>(
  items: readonly T[],
  currentId: string | null | undefined,
  collectionLabel: string,
  pathForItem: (item: T) => string,
  labelForItem: (item: T) => string,
) {
  const state = getCollectionNavigationState(items, currentId);
  const positionLabel = state.currentIndex != null ? `${state.currentIndex + 1} of ${state.total}` : null;

  return {
    collectionLabel,
    positionLabel,
    previous: state.previous ? {
      to: pathForItem(state.previous.item),
      label: labelForItem(state.previous.item),
    } : null,
    next: state.next ? {
      to: pathForItem(state.next.item),
      label: labelForItem(state.next.item),
    } : null,
  };
}

function useStructuralWriteGuard() {
  const { state } = useConnectivity();
  const isOffline = state.transportStatus === "offline";
  const message = "Editing gear and film stock records is disabled while offline. You can still log photographs and manage film media lifecycle actions.";

  const guardSubmit = (onSubmit: (event: FormEvent<HTMLFormElement>) => void) => (event: FormEvent<HTMLFormElement>) => {
    if (isOffline) {
      event.preventDefault();
      return;
    }

    onSubmit(event);
  };

  return { isOffline, message, guardSubmit };
}

function CameraFormPageBody({
  draft,
  error,
  saving,
  submitLabel,
  onSubmit,
  onChange,
}: {
  draft: CameraFormDraft;
  error: string | null;
  saving: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (next: CameraFormDraft) => void;
}) {
  const writeGuard = useStructuralWriteGuard();
  return (
    <form onSubmit={writeGuard.guardSubmit(onSubmit)} className="resource-form resource-form--compact">
      {writeGuard.isOffline && <p className="form-error">{writeGuard.message}</p>}
      {error && <p className="form-error">{error}</p>}
      <CameraFormFields draft={draft} onChange={onChange} />
      <div className="form-actions resource-form-actions">
        <button className="btn-primary" type="submit" disabled={saving || writeGuard.isOffline}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function CameraCompatibilitySummary({ camera }: { camera: Camera }) {
  const text = getCameraCompatibilityText(camera);
  if (!text) return null;

  return (
    <section className="resource-summary">
      <p className="page-count">Lens compatibility</p>
      <p className="muted">{text}</p>
      <Link className="link-btn" to={LENS_LIST_PATH}>
        Manage lens compatibility
      </Link>
    </section>
  );
}

function LensFormPageBody({
  draft,
  cameras,
  error,
  optionsError,
  saving,
  submitLabel,
  onSubmit,
  onChange,
}: {
  draft: LensFormDraft;
  cameras: NamedItem[];
  error: string | null;
  optionsError: string | null;
  saving: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (next: LensFormDraft) => void;
}) {
  const writeGuard = useStructuralWriteGuard();
  return (
    <form onSubmit={writeGuard.guardSubmit(onSubmit)} className="resource-form resource-form--lens">
      {writeGuard.isOffline && <p className="form-error">{writeGuard.message}</p>}
      {error && <p className="form-error">{error}</p>}
      {optionsError && <p className="form-error">{optionsError}</p>}
      <LensFormFields draft={draft} onChange={onChange} cameras={cameras} />
      <div className="form-actions lens-form-actions">
        <button className="btn-primary" type="submit" disabled={saving || writeGuard.isOffline}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function FilterFormPageBody({
  draft,
  lenses,
  presets,
  error,
  optionsError,
  saving,
  submitLabel,
  onSubmit,
  onChange,
  onPresetChange,
}: {
  draft: FilterFormDraft;
  lenses: NamedItem[];
  presets: FilterPreset[];
  error: string | null;
  optionsError: string | null;
  saving: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (next: FilterFormDraft) => void;
  onPresetChange: (next: string) => void;
}) {
  const writeGuard = useStructuralWriteGuard();
  return (
    <form onSubmit={writeGuard.guardSubmit(onSubmit)} className="resource-form resource-form--compact">
      {writeGuard.isOffline && <p className="form-error">{writeGuard.message}</p>}
      {error && <p className="form-error">{error}</p>}
      {optionsError && <p className="form-error">{optionsError}</p>}
      <FilterFormFields
        draft={draft}
        onChange={onChange}
        lenses={lenses}
        presets={presets}
        onPresetChange={onPresetChange}
        actions={(
          <div className="form-actions resource-form-actions filter-form-actions-inline">
            <button className="btn-primary" type="submit" disabled={saving || writeGuard.isOffline}>
              {saving ? "Saving…" : submitLabel}
            </button>
          </div>
        )}
      />
    </form>
  );
}

function FilmStockFormPageBody({
  draft,
  presets,
  error,
  saving,
  submitLabel,
  onSubmit,
  onChange,
  onPresetChange,
}: {
  draft: FilmStockFormDraft;
  presets?: typeof FILM_STOCK_PRESETS;
  error: string | null;
  saving: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (next: FilmStockFormDraft) => void;
  onPresetChange?: (next: string) => void;
}) {
  const writeGuard = useStructuralWriteGuard();
  return (
    <form onSubmit={writeGuard.guardSubmit(onSubmit)} className="resource-form resource-form--compact" noValidate>
      {writeGuard.isOffline && <p className="form-error">{writeGuard.message}</p>}
      {error && <p className="form-error">{error}</p>}
      <FilmStockFormFields
        draft={draft}
        onChange={onChange}
        presets={presets}
        onPresetChange={onPresetChange}
      />
      <div className="form-actions resource-form-actions">
        <button className="btn-primary" type="submit" disabled={saving || writeGuard.isOffline}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function RollFormPageBody({
  draft,
  films,
  error,
  optionsError,
  saving,
  submitLabel,
  showProcessedAt,
  onSubmit,
  onChange,
}: {
  draft: RollFormDraft;
  films: NamedItem[];
  error: string | null;
  optionsError: string | null;
  saving: boolean;
  submitLabel: string;
  showProcessedAt?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (next: RollFormDraft) => void;
}) {
  const writeGuard = useStructuralWriteGuard();
  return (
    <form onSubmit={writeGuard.guardSubmit(onSubmit)} className="resource-form resource-form--compact">
      {writeGuard.isOffline && <p className="form-error">{writeGuard.message}</p>}
      {error && <p className="form-error">{error}</p>}
      {optionsError && <p className="form-error">{optionsError}</p>}
      <RollFormFields draft={draft} onChange={onChange} films={films} showProcessedAt={showProcessedAt} />
      <div className="form-actions resource-form-actions">
        <button className="btn-primary" type="submit" disabled={saving || writeGuard.isOffline}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function FilmHolderFormPageBody({
  draft,
  error,
  saving,
  submitLabel,
  onSubmit,
  onChange,
}: {
  draft: FilmHolderFormDraft;
  error: string | null;
  saving: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (next: FilmHolderFormDraft) => void;
}) {
  const writeGuard = useStructuralWriteGuard();
  return (
    <form onSubmit={writeGuard.guardSubmit(onSubmit)} className="resource-form resource-form--compact">
      {writeGuard.isOffline && <p className="form-error">{writeGuard.message}</p>}
      {error && <p className="form-error">{error}</p>}
      <FilmHolderFormFields draft={draft} onChange={onChange} />
      <div className="form-actions resource-form-actions">
        <button className="btn-primary" type="submit" disabled={saving || writeGuard.isOffline}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function formatDevelopmentProfileLabel(profile: DevelopmentProfile) {
  if (profile.type === "simple") {
    return [profile.name, profile.developerName, profile.timeText].filter(Boolean).join(" · ");
  }

  return [
    profile.name,
    profile.developerName,
    profile.dilution,
    profile.temperatureText,
    profile.filmIso ? `ISO ${profile.filmIso}` : null,
    profile.testDate ? `Tested ${profile.testDate}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function getDevelopmentProfileTimerTarget(profile: DevelopmentProfile | null) {
  if (!profile) return null;

  if (profile.type === "simple") {
    const minutes = parseDevelopmentTimeTextMinutes(profile.timeText);
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
    return {
      minutes,
      label: profile.timeText.trim() || formatTimerDuration(minutes * 60),
    };
  }

  const candidates = (profile.chartData ?? []).flatMap((chart) => {
    const chartTitle = [
      typeof chart.title === "string" ? chart.title : "",
      typeof chart.xAxisLabel === "string" ? chart.xAxisLabel : "",
      typeof chart.yAxisLabel === "string" ? chart.yAxisLabel : "",
    ].join(" ").toLowerCase();
    if (!chartTitle.includes("development")) return [];
    return (chart.points ?? []).flatMap((point) => {
      const developmentTime = typeof point.developmentTime === "number" ? point.developmentTime : null;
      const averageG = typeof point.averageG === "number" ? point.averageG : null;
      if (developmentTime == null || !Number.isFinite(developmentTime) || developmentTime <= 0) return [];
      return [{ developmentTime, averageG }];
    });
  });

  if (candidates.length === 0) return null;
  const normalCandidate = [...candidates].sort((left, right) => {
    const leftDistance = left.averageG == null ? Number.MAX_SAFE_INTEGER : Math.abs(left.averageG - 0.5);
    const rightDistance = right.averageG == null ? Number.MAX_SAFE_INTEGER : Math.abs(right.averageG - 0.5);
    return leftDistance - rightDistance;
  })[0];

  return {
    minutes: normalCandidate.developmentTime,
    label: `${formatTimerDuration(normalCandidate.developmentTime * 60)} BTZS normal`,
  };
}

function FilmHolderPhotographSubview({
  load,
  filmHolderName,
  timeZone,
}: {
  load: FilmHolderLoad;
  filmHolderName: string;
  timeZone?: string | null;
}) {
  const photograph = load.exposed_photograph ?? null;
  if (!photograph) {
    if (!load.exposed_photograph_id) return null;
    return (
      <section className="film-holder-photograph-subview">
        <div className="film-holder-photograph-subview-main">
          <h5>Photograph unavailable</h5>
          <Link className="link-btn" to={`/app/photos/${load.exposed_photograph_id}`}>
            Open photograph
          </Link>
        </div>
      </section>
    );
  }

  const thumbnailUrl = getFilmHolderLoadPhotographThumbnailUrl(load);
  const title = photograph.title?.trim()
    || (photograph.frame_number?.trim() ? `Frame ${photograph.frame_number.trim()}` : "Sheet photograph");
  const takenAt = formatDateTimeDisplay(photograph.taken_at, timeZone);
  const exposureDisplay = formatPhotographExposureDisplay(photograph);
  const filmLabel = formatPhotographFilmMediaLabel({
    filmName: load.film?.name ?? getFilmHolderLoadFilmName(load),
    filmHolderName,
  });

  return (
    <section className="film-holder-photograph-subview">
      <Link to={`/app/photos/${photograph.id}`} className={`photo-row photo-row--embedded${thumbnailUrl ? "" : " photo-row--no-thumb"}`}>
        <PhotographSummaryBlock
          title={title}
          dateTime={takenAt}
          cameraName={photograph.camera_name}
          lensName={photograph.lens_name}
          filmLabel={filmLabel}
          exposureDisplay={exposureDisplay}
          thumbnailUrl={thumbnailUrl}
          thumbnailAlt={getFilmHolderLoadPhotographAlt(load)}
          thumbnailWidth={load.exposed_photograph?.reference_image?.thumbnail_width ?? load.exposed_photograph?.reference_image?.width ?? null}
          thumbnailHeight={load.exposed_photograph?.reference_image?.thumbnail_height ?? load.exposed_photograph?.reference_image?.height ?? null}
        />
      </Link>
    </section>
  );
}

function FilmHolderLifecyclePanel({
  filmHolder,
  onChange,
}: {
  filmHolder: FilmHolder;
  onChange: (next: FilmHolder) => void;
}) {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const preferredTimeZone = usePreferredTimeZone();
  const currentLoad = filmHolder.current_load ?? null;
  const loadHistory = getFilmHolderHistoricalLoads(filmHolder);
  const activeLoadFilmId = getFilmHolderLoadFilmId(currentLoad);
  const isExposedLoad = isUndoableFilmHolderLoad(currentLoad);
  const lifecycleSummary = !currentLoad ? formatFilmHolderDetailSummary(filmHolder, preferredTimeZone) : "";
  const [filmStocks, setFilmStocks] = useState<FilmStock[]>([]);
  const [developmentProfiles, setDevelopmentProfiles] = useState<DevelopmentProfile[]>([]);
  const [loadFilmId, setLoadFilmId] = useState("");
  const [loadNotes, setLoadNotes] = useState("");
  const [processProfileId, setProcessProfileId] = useState("");
  const [processNotes, setProcessNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [timerMessage, setTimerMessage] = useState<string | null>(null);
  const [timerActionPending, setTimerActionPending] = useState(false);
  const [savingAction, setSavingAction] = useState<"load" | "unload" | "process" | "undo" | "unprocess" | null>(null);
  const { items: timerQueueItems, addItem: addTimerItem, removeItem: removeTimerItem } = useDevelopmentTimerQueue(user?.id);

  useEffect(() => {
    if (connectivityState.transportStatus !== "offline" || !user) return undefined;
    let active = true;
    void readCachedFilmHolder(user, filmHolder.id).then((cached) => {
      if (active && cached) onChange(cached);
    });
    return () => {
      active = false;
    };
  }, [connectivityState.transportStatus, filmHolder.id, user]);

  const sortedFilmStocks = useMemo(
    () => [...filmStocks].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [filmStocks],
  );

  useEffect(() => {
    let active = true;
    api.listFilmStocks()
      .then((response) => {
        if (active) setFilmStocks(response.items);
      })
      .catch(async () => {
        const cached = await readCachedFilmStocks(user);
        if (active) setFilmStocks(cached);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isActiveFilmHolderLoad(currentLoad) || !activeLoadFilmId) {
      setDevelopmentProfiles([]);
      setProcessProfileId("");
      return;
    }

    let active = true;
    api.listDevelopmentProfiles(activeLoadFilmId)
      .then((response) => {
        if (active) setDevelopmentProfiles(response.items);
      })
      .catch(() => {
        if (active) setDevelopmentProfiles([]);
      });

    return () => {
      active = false;
    };
  }, [activeLoadFilmId, currentLoad?.id, currentLoad?.status]);

  useEffect(() => {
    setActionError(null);
    setLoadFilmId("");
    setLoadNotes("");
    setProcessProfileId("");
    setProcessNotes("");
  }, [filmHolder.id, currentLoad?.id, currentLoad?.status]);

  const handleLoad = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loadFilmId) {
      setActionError("Select a film stock to load.");
      return;
    }

    setActionError(null);
    setSavingAction("load");
    try {
      const payload = {
        film_id: loadFilmId,
        notes: loadNotes.trim() ? loadNotes.trim() : null,
      };
      const updated = await loadFilmHolderForConnectivity(
        { transportStatus: connectivityState.transportStatus, user },
        filmHolder,
        filmHolder.id,
        payload,
      );
      onChange(updated);
    } catch (err) {
      setActionError(errorMessage(err, "Failed to load film holder"));
    } finally {
      setSavingAction(null);
    }
  };

  const handleUnload = async () => {
    if (!currentLoad) return;
    if (!confirm("Discard the unexposed load from this film holder?")) return;

    setActionError(null);
    setSavingAction("unload");
    try {
      const updated = await unloadFilmHolderForConnectivity(
        { transportStatus: connectivityState.transportStatus, user },
        filmHolder,
      );
      onChange(updated);
    } catch (err) {
      setActionError(errorMessage(err, "Failed to unload film holder"));
    } finally {
      setSavingAction(null);
    }
  };

  const handleProcess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentLoad || !isExposedLoad) return;

    setActionError(null);
    setSavingAction("process");
    try {
      const payload = {
        development_profile_id: currentLoadHasStoredBtzsTarget ? null : processProfileId || null,
        notes: processNotes.trim() ? processNotes.trim() : null,
      };
      const updated = await processFilmHolderLoadForConnectivity(
        { transportStatus: connectivityState.transportStatus, user },
        filmHolder,
        payload,
      );
      onChange(updated);
    } catch (err) {
      setActionError(errorMessage(err, "Failed to mark the load processed"));
    } finally {
      setSavingAction(null);
    }
  };

  const handleUndoExposure = async () => {
    if (!currentLoad || !isExposedLoad) return;

    const confirmation = getFilmHolderUndoExposureConfirmationText(currentLoad);
    if (!confirm(confirmation)) return;

    setActionError(null);
    setSavingAction("undo");
    try {
      const payload = currentLoad.exposed_photograph_id ? { clear_photograph_holder: true } : undefined;
      const updated = await undoFilmHolderExposureForConnectivity(
        { transportStatus: connectivityState.transportStatus, user },
        filmHolder,
        payload,
      );
      onChange(updated);
    } catch (err) {
      setActionError(errorMessage(err, "Failed to undo exposure"));
    } finally {
      setSavingAction(null);
    }
  };

  const handleUnprocessLoad = async (load: FilmHolderLoad) => {
    if (currentLoad || load.status !== "processed") return;
    if (connectivityState.transportStatus === "offline") {
      setActionError("Restoring a processed holder requires a network connection.");
      return;
    }
    if (!confirm("Restore this processed load as exposed? The holder must be empty, and the processing profile will be cleared.")) {
      return;
    }

    setActionError(null);
    setSavingAction("unprocess");
    try {
      const updated = await api.unprocessFilmHolderLoad(filmHolder.id, load.id);
      onChange(updated);
    } catch (err) {
      setActionError(errorMessage(err, "Failed to restore processed load"));
    } finally {
      setSavingAction(null);
    }
  };

  const handleAddToDevelopmentTimer = () => {
    if (!user) {
      setTimerMessage("Sign in is required to use the development timer.");
      return;
    }
    if (!currentLoad || !isExposedLoad) {
      setTimerMessage("Only exposed film holders can be added to the development timer.");
      return;
    }
    const minutes = currentLoad.development_summary?.minutes;
    const selectedProcessProfile = processProfileId
      ? developmentProfiles.find((profile) => profile.id === processProfileId) ?? null
      : null;
    const selectedSimpleProfile = selectedProcessProfile?.type === "simple" ? selectedProcessProfile : null;
    const selectedProfileMinutes = selectedSimpleProfile
      ? parseDevelopmentTimeTextMinutes(selectedSimpleProfile.timeText)
      : null;
    const parsedMinutes = typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
      ? minutes
      : parseDevelopmentTimeTextMinutes(currentLoad.development_summary?.time_text) ?? selectedProfileMinutes;
    if (typeof parsedMinutes !== "number" || !Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
      setTimerMessage(
        processProfileId
          ? "The selected development profile needs a parseable time before it can be added to the timer."
          : "Choose a development profile with a time before adding this holder to the timer.",
      );
      return;
    }

    setTimerActionPending(true);
    const photo = currentLoad.exposed_photograph;
    const exposureSummary = photo
      ? [photo.camera_name, photo.lens_name, photo.aperture, photo.shutter_speed].filter(Boolean).join(" · ")
      : null;
    try {
      const result = addTimerItem({
        id: currentLoad.id,
        filmHolderId: filmHolder.id,
        filmHolderName: filmHolder.name,
        filmName: getFilmHolderLoadFilmName(currentLoad) || "Film unavailable",
        photographId: currentLoad.exposed_photograph_id,
        photographTitle: photo?.title?.trim() || formatFilmHolderLoadPhotographLabel(currentLoad),
        exposureSummary,
        developmentSeconds: parsedMinutes * 60,
        developmentLabel: currentLoadDevelopmentLabel
          ?? selectedSimpleProfile?.timeText?.trim()
          ?? formatTimerDuration(parsedMinutes * 60),
        addedAt: new Date().toISOString(),
      });
      setTimerMessage(result.message);
    } catch (err) {
      setTimerMessage(err instanceof Error ? err.message : "Could not add this holder to the development timer.");
    } finally {
      setTimerActionPending(false);
    }
  };

  const handleRemoveFromDevelopmentTimer = () => {
    if (!currentLoad) return;
    setTimerActionPending(true);
    removeTimerItem(currentLoad.id);
    setTimerMessage("Removed from development timer.");
    setTimerActionPending(false);
  };

  const formatLoadDate = (value: string | null | undefined) => formatDateTimeDisplay(value, preferredTimeZone) || "—";
  const currentLoadDevelopmentLabel = formatFilmHolderLoadDevelopmentLabel(currentLoad);
  const currentLoadDevelopmentMinutes = currentLoad?.development_summary?.minutes;
  const currentLoadIsInTimer = currentLoad
    ? timerQueueItems.some((item) => item.id === currentLoad.id)
    : false;
  const currentLoadDevelopmentRowLabel = currentLoad?.development_summary?.source === "stored-btzs-calculation"
    ? "BTZS development"
    : "Development";
  const currentLoadHasStoredBtzsTarget = currentLoad?.development_summary?.source === "stored-btzs-calculation";
  const currentLoadHasProfile = Boolean(
    currentLoad?.status === "processed"
      || currentLoad?.processed_at
      || currentLoad?.development_profile_id
      || currentLoad?.development_profile?.name?.trim(),
  );
  const renderDevelopmentTimerButton = () => {
    if (!isExposedLoad) return null;

    return currentLoadIsInTimer ? (
      <button
        type="button"
        className="btn-secondary"
        onClick={handleRemoveFromDevelopmentTimer}
        disabled={timerActionPending}
      >
        {timerActionPending ? "Updating…" : "Remove from timer"}
      </button>
    ) : (
      <button
        type="button"
        className="btn-secondary"
        onClick={handleAddToDevelopmentTimer}
        disabled={timerActionPending}
      >
        {timerActionPending ? "Adding…" : "Add to timer"}
      </button>
    );
  };

  return (
    <div className="film-holder-lifecycle-stack">
      {actionError && <p className="form-error">{actionError}</p>}

      <section className="film-holder-current-section">
        <div className="film-holder-current-section-header">
          <h3>Current Load</h3>
        </div>

        {currentLoad ? (
          <div className="film-holder-current-load">
            <div className="film-holder-current-load-header">
              <div className="film-holder-current-load-title">
                <span className="film-holder-current-load-kicker">Active film stock</span>
                <h4>{getFilmHolderLoadFilmName(currentLoad) || "Film unavailable"}</h4>
                <div className="film-holder-current-load-type-row">
                  <span className="film-holder-current-load-type">
                    {currentLoad.film?.stock_type
                      ? formatFilmStockTypeLabel(currentLoad.film.stock_type)
                      : "Film stock unavailable"}
                  </span>
                  <span className={`gear-status gear-status--${getFilmHolderLoadTone(currentLoad)}`}>
                    {formatFilmHolderLoadStatusLabel(currentLoad.status)}
                  </span>
                </div>
              </div>
              <div className="film-holder-current-load-actions">
                {isExposedLoad && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleUndoExposure}
                    disabled={savingAction === "undo"}
                  >
                    {savingAction === "undo" ? "Undoing…" : "Undo exposure"}
                  </button>
                )}
              </div>
            </div>

            <div className="film-holder-current-load-meta">
              <div className="film-holder-current-load-field">
                <span className="film-holder-current-load-field-label">Loaded</span>
                <span className="film-holder-current-load-field-value">{formatLoadDate(currentLoad.loaded_at)}</span>
              </div>
              {currentLoad.exposed_at && (
                <div className="film-holder-current-load-field">
                  <span className="film-holder-current-load-field-label">Exposed</span>
                  <span className="film-holder-current-load-field-value">{formatLoadDate(currentLoad.exposed_at)}</span>
                </div>
              )}
              {(currentLoad.processed_at || currentLoad.status === "processed") && (
                <div className="film-holder-current-load-field">
                  <span className="film-holder-current-load-field-label">Processed</span>
                  <span className="film-holder-current-load-field-value">{formatLoadDate(currentLoad.processed_at)}</span>
                </div>
              )}
              {currentLoadHasProfile && (
                <div className="film-holder-current-load-field">
                  <span className="film-holder-current-load-field-label">Profile</span>
                  <span className="film-holder-current-load-field-value">{formatFilmHolderLoadProfileLabel(currentLoad)}</span>
                </div>
              )}
              {currentLoadDevelopmentLabel && (
                <div className="film-holder-current-load-field">
                  <span className="film-holder-current-load-field-label">{currentLoadDevelopmentRowLabel}</span>
                  <div className="film-holder-development-time-row">
                    <span className="film-holder-current-load-field-value">{currentLoadDevelopmentLabel}</span>
                    {currentLoadHasStoredBtzsTarget && (
                      <div className="film-holder-development-timer-inline film-holder-development-timer-inline--meta">
                        {renderDevelopmentTimerButton()}
                        {timerMessage && <p className="field-note film-holder-timer-message">{timerMessage}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {currentLoad.notes && <p className="film-holder-load-notes">{currentLoad.notes}</p>}
            </div>

            {currentLoad.exposed_photograph_id && (
              <FilmHolderPhotographSubview
                load={currentLoad}
                filmHolderName={filmHolder.name}
                timeZone={preferredTimeZone}
              />
            )}

            {currentLoad.status === "loaded" && (
              <div className="film-holder-action-row">
                <button
                  type="button"
                  className="btn-danger-ghost"
                  onClick={handleUnload}
                  disabled={savingAction === "unload"}
                >
                  {savingAction === "unload" ? "Discarding…" : "Discard unexposed load"}
                </button>
                <p className="field-note">Discard is only available before the holder has an exposure.</p>
              </div>
            )}

            {isExposedLoad && (
              <form className="film-holder-action-form" onSubmit={handleProcess}>
                <div className={`film-holder-action-grid${currentLoadHasStoredBtzsTarget ? " film-holder-action-grid--btzs" : ""}`}>
                  {!currentLoadHasStoredBtzsTarget && (
                    <div className="field film-holder-action-field film-holder-action-field--profile">
                      <>
                        <label htmlFor={`film-holder-development-profile-${filmHolder.id}`}>Development profile</label>
                        <select
                          id={`film-holder-development-profile-${filmHolder.id}`}
                          value={processProfileId}
                          onChange={event => setProcessProfileId(event.target.value)}
                        >
                          <option value="">No profile</option>
                          {developmentProfiles.map(profile => (
                            <option key={profile.id} value={profile.id}>
                              {formatDevelopmentProfileLabel(profile)}
                            </option>
                          ))}
                        </select>
                        <div className="film-holder-development-timer-inline">
                          {renderDevelopmentTimerButton()}
                          {timerMessage && <p className="field-note film-holder-timer-message">{timerMessage}</p>}
                        </div>
                      </>
                    </div>
                  )}
                  <div className="field film-holder-action-field film-holder-action-field--notes">
                    <label htmlFor={`film-holder-process-notes-${filmHolder.id}`}>Processed notes</label>
                    <textarea
                      id={`film-holder-process-notes-${filmHolder.id}`}
                      value={processNotes}
                      onChange={event => setProcessNotes(event.target.value)}
                      rows={3}
                      placeholder="Optional notes"
                    />
                  </div>
                  <div className="form-actions film-holder-action-row film-holder-action-row--process">
                    <button className="btn-primary" type="submit" disabled={savingAction === "process"}>
                      {savingAction === "process" ? "Processing…" : "Mark processed"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        ) : (
          <form className="film-holder-action-form" onSubmit={handleLoad}>
            <p className="muted">No active load.</p>
            <div className="field-row field-grid">
              <div className="field">
                <label htmlFor={`film-holder-load-film-${filmHolder.id}`}>Film stock</label>
                <select
                  id={`film-holder-load-film-${filmHolder.id}`}
                  value={loadFilmId}
                  onChange={event => setLoadFilmId(event.target.value)}
                >
                  <option value="">Choose film</option>
                  {sortedFilmStocks.map(filmStock => (
                    <option key={filmStock.id} value={filmStock.id}>
                      {filmStock.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`film-holder-load-notes-${filmHolder.id}`}>Load notes</label>
                <textarea
                  id={`film-holder-load-notes-${filmHolder.id}`}
                  value={loadNotes}
                  onChange={event => setLoadNotes(event.target.value)}
                  rows={3}
                  placeholder="Optional notes"
                />
              </div>
            </div>
            <div className="form-actions film-holder-action-row">
              <button className="btn-primary" type="submit" disabled={savingAction === "load"}>
                {savingAction === "load" ? "Loading…" : "Load holder"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="film-holder-lifecycle">
        <div className="film-holder-lifecycle-header">
          <div>
            <h2>Lifecycle</h2>
            {lifecycleSummary && lifecycleSummary !== "Empty" && <p className="muted">{lifecycleSummary}</p>}
          </div>
        </div>

        <section className="film-holder-history">
        <div className="film-holder-history-header">
          <h3>Load history</h3>
          <p className="page-count">
            {loadHistory.length} load{loadHistory.length === 1 ? "" : "s"}
          </p>
        </div>
        {loadHistory.length === 0 ? (
          <p className="muted">No loads yet.</p>
        ) : (
          <div className="film-holder-history-list">
            {loadHistory.map((load) => {
              const thumbnailUrl = getFilmHolderLoadPhotographThumbnailUrl(load);
              const photographLabel = formatFilmHolderLoadPhotographLabel(load, preferredTimeZone);
              const profileLabel = formatFilmHolderLoadProfileLabel(load);
              const developmentLabel = formatFilmHolderLoadDevelopmentLabel(load);
              const discardedReason = formatFilmHolderLoadDiscardReason(load);
              const developmentRowLabel = load.development_summary?.source === "stored-btzs-calculation"
                ? "BTZS development"
                : "Development";
              const loadHasProfile = Boolean(
                load.status === "processed"
                  || load.processed_at
                  || load.development_profile_id
                  || load.development_profile?.name?.trim(),
              );
              const canRestoreProcessedLoad = !currentLoad && load.status === "processed";

              return (
                <article
                  key={load.id}
                  className={`film-holder-history-card${thumbnailUrl ? " film-holder-history-card--with-thumb" : ""}`}
                >
                  <div className="film-holder-history-card-main">
                    <div className="film-holder-history-card-lines">
                      <div className="film-holder-history-card-line">
                        <span className="film-holder-history-card-line-label">Status</span>
                        <span className="film-holder-history-card-line-value">
                          <span className={`gear-status gear-status--${getFilmHolderLoadTone(load)}`}>
                            {formatFilmHolderLoadStatusLabel(load.status)}
                          </span>
                        </span>
                      </div>
                      <div className="film-holder-history-card-line">
                        <span className="film-holder-history-card-line-label">Loaded</span>
                        <span className="film-holder-history-card-line-value">{formatLoadDate(load.loaded_at)}</span>
                      </div>
                      <div className="film-holder-history-card-line">
                        <span className="film-holder-history-card-line-label">Film</span>
                        <span className="film-holder-history-card-line-value">{formatFilmHolderLoadFilmLabel(load)}</span>
                      </div>
                      <div className="film-holder-history-card-line">
                        <span className="film-holder-history-card-line-label">Exposed</span>
                        <span className="film-holder-history-card-line-value">
                          {load.exposed_at ? formatLoadDate(load.exposed_at) : "—"}
                        </span>
                      </div>
                      {photographLabel && (
                        <div className="film-holder-history-card-line">
                          <span className="film-holder-history-card-line-label">Photograph</span>
                          <span className="film-holder-history-card-line-value">{photographLabel}</span>
                        </div>
                      )}
                      {load.status === "discarded" && (
                        <>
                          <div className="film-holder-history-card-line">
                            <span className="film-holder-history-card-line-label">Discarded</span>
                            <span className="film-holder-history-card-line-value">
                              {load.discarded_at ? formatLoadDate(load.discarded_at) : "—"}
                            </span>
                          </div>
                          <div className="film-holder-history-card-line">
                            <span className="film-holder-history-card-line-label">Reason</span>
                            <span className="film-holder-history-card-line-value">{discardedReason ?? "—"}</span>
                          </div>
                        </>
                      )}
                      <div className="film-holder-history-card-line">
                        <span className="film-holder-history-card-line-label">Processed</span>
                        <span className="film-holder-history-card-line-value">
                          {load.processed_at ? formatLoadDate(load.processed_at) : "—"}
                        </span>
                      </div>
                      {loadHasProfile && (
                        <div className="film-holder-history-card-line">
                          <span className="film-holder-history-card-line-label">Profile</span>
                          <span className="film-holder-history-card-line-value">{profileLabel}</span>
                        </div>
                      )}
                      {developmentLabel && (
                        <div className="film-holder-history-card-line">
                          <span className="film-holder-history-card-line-label">{developmentRowLabel}</span>
                          <span className="film-holder-history-card-line-value">{developmentLabel}</span>
                        </div>
                      )}
                    </div>
                    {load.exposed_photograph_id && (
                      <div className="film-holder-history-card-actions">
                        <Link className="link-btn" to={`/app/photos/${load.exposed_photograph_id}`}>
                          Open photograph
                        </Link>
                        {canRestoreProcessedLoad && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleUnprocessLoad(load)}
                            disabled={savingAction != null}
                          >
                            {savingAction === "unprocess" ? "Restoring…" : "Mark unprocessed"}
                          </button>
                        )}
                      </div>
                    )}
                    {load.notes && <p className="film-holder-history-card-notes">{load.notes}</p>}
                  </div>
                  {thumbnailUrl && (
                    <div className="film-holder-history-card-thumb">
                      <img src={thumbnailUrl} alt={getFilmHolderLoadPhotographAlt(load)} loading="lazy" decoding="async" />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        </section>
      </section>
    </div>
  );
}

const formatRollDateTime = (value: string | null | undefined, timeZone?: string | null) => {
  const formatted = formatDateTimeDisplay(value, timeZone);
  return formatted || null;
};

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type RollPageGearMaps = {
  cameras: Map<string, Camera>;
  lenses: Map<string, Lens>;
  filmStocks: Map<string, FilmStock>;
  filmHolders: Map<string, FilmHolder>;
};

type RollPageData = {
  roll: Roll | null;
  photos: Photograph[];
  photoCount: number;
  gear: RollPageGearMaps;
  developmentProfiles: DevelopmentProfile[];
  loading: boolean;
  error: string | null;
  updateRoll: (next: Roll | null) => void;
};

const EMPTY_ROLL_PAGE_GEAR: RollPageGearMaps = {
  cameras: new Map(),
  lenses: new Map(),
  filmStocks: new Map(),
  filmHolders: new Map(),
};

function useRollPageData(id: string | undefined): RollPageData {
  const { user } = useAuth();
  const [roll, setRoll] = useState<Roll | null>(null);
  const [photos, setPhotos] = useState<Photograph[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [gear, setGear] = useState<RollPageGearMaps>(EMPTY_ROLL_PAGE_GEAR);
  const [developmentProfiles, setDevelopmentProfiles] = useState<DevelopmentProfile[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let active = true;
    setLoading(true);
    setError(null);
    setRoll(null);
    setPhotos([]);
    setPhotoCount(0);
    setGear(EMPTY_ROLL_PAGE_GEAR);
    setDevelopmentProfiles([]);

    (async () => {
      try {
        const rollResponse = await api.getRoll(id);
        const [photosResponse, camerasResponse, lensesResponse, filmsResponse, filmHoldersResponse, developmentProfilesResponse] = await Promise.all([
          api.listPhotographs({ roll_id: id, limit: 200 }),
          api.listCameras().catch(async () => ({ items: await readCachedCameras(user) })),
          api.listLenses().catch(async () => ({ items: await readCachedLenses(user) })),
          api.listFilmStocks().catch(async () => ({ items: await readCachedFilmStocks(user) })),
          api.listFilmHolders().catch(async () => ({ items: await readCachedFilmHolders(user) })),
          rollResponse.film_id
            ? api.listDevelopmentProfiles(rollResponse.film_id, { limit: 200 }).catch(async () => ({ items: await readCachedDevelopmentProfiles(user, rollResponse.film_id ?? "") }))
            : Promise.resolve({ items: [] as DevelopmentProfile[] }),
        ]);

        if (!active) return;

        setRoll(rollResponse);
        setPhotos(photosResponse.items);
        setPhotoCount(photosResponse.total);
        setGear({
          cameras: new Map(camerasResponse.items.map((camera) => [camera.id, camera])),
          lenses: new Map(lensesResponse.items.map((lens) => [lens.id, lens])),
          filmStocks: new Map(filmsResponse.items.map((filmStock) => [filmStock.id, filmStock])),
          filmHolders: new Map(filmHoldersResponse.items.map((filmHolder) => [filmHolder.id, filmHolder])),
        });
        setDevelopmentProfiles(developmentProfilesResponse.items);
      } catch (err) {
        if (!active) return;
        const [cachedRoll, cachedPhotos, cachedCameras, cachedLenses, cachedFilms, cachedFilmHolders] = await Promise.all([
          readCachedRoll(user, id),
          readCachedPhotographs(user),
          readCachedCameras(user),
          readCachedLenses(user),
          readCachedFilmStocks(user),
          readCachedFilmHolders(user),
        ]);
        if (!active) return;
        if (cachedRoll) {
          const rollPhotos = cachedPhotos.filter((photo) => photo.roll_id === id);
          const cachedDevelopmentProfiles = cachedRoll.film_id
            ? await readCachedDevelopmentProfiles(user, cachedRoll.film_id)
            : [];
          if (!active) return;
          setRoll(cachedRoll);
          setPhotos(rollPhotos);
          setPhotoCount(rollPhotos.length);
          setGear({
            cameras: new Map(cachedCameras.map((camera) => [camera.id, camera])),
            lenses: new Map(cachedLenses.map((lens) => [lens.id, lens])),
            filmStocks: new Map(cachedFilms.map((filmStock) => [filmStock.id, filmStock])),
            filmHolders: new Map(cachedFilmHolders.map((filmHolder) => [filmHolder.id, filmHolder])),
          });
          setDevelopmentProfiles(cachedDevelopmentProfiles);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load roll");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [id, user]);

  return { roll, photos, photoCount, gear, developmentProfiles, loading, error, updateRoll: setRoll };
}

function RollStatusBadge({ status }: { status: Roll["status"] }) {
  return (
    <span className={`gear-status gear-status--${getRollStatusClassName(status)}`}>
      {formatRollStatusLabel(status)}
    </span>
  );
}

function RollPushPullBadge({ stops }: { stops: number }) {
  const tone = stops > 0 ? "push" : stops < 0 ? "pull" : "normal";
  return (
    <span className={`roll-push-pull-badge roll-push-pull-badge--${tone}`}>
      {formatRollPushPullLabel(stops)}
    </span>
  );
}

type RollProcessDraft = {
  processedAt: string;
  developmentProfileId: string;
  developmentNotes: string;
};

function getPhotographImages(photo: Photograph): PhotographImage[] {
  const images = photo.images as unknown;
  if (Array.isArray(images)) {
    return images;
  }
  if (images && typeof images === "object" && Array.isArray((images as { items?: unknown }).items)) {
    return (images as { items: PhotographImage[] }).items;
  }
  return [];
}

function RollCurrentField({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="roll-current-field">
      <span className="roll-current-field-label">{label}</span>
      <div className="roll-current-field-value">{value}</div>
    </div>
  );
}

function RollProcessingDialog({
  developmentProfiles,
  open,
  saving,
  error,
  draft,
  timerControl,
  onChange,
  onClose,
  onSubmit,
}: {
  developmentProfiles: DevelopmentProfile[];
  open: boolean;
  saving: boolean;
  error: string | null;
  draft: RollProcessDraft;
  timerControl?: ReactNode;
  onChange: (next: RollProcessDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="media-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (!saving && event.target === event.currentTarget) onClose();
      }}
    >
      <section className="media-dialog" role="dialog" aria-modal="true" aria-labelledby="roll-process-dialog-title">
        <div className="media-dialog-header">
          <div>
            <p className="page-count">Roll</p>
            <h2 id="roll-process-dialog-title">Mark processed</h2>
          </div>
          <button type="button" className="link-btn" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        <form onSubmit={onSubmit}>
          <div className="media-dialog-grid">
            <label className="field media-dialog-field" htmlFor="roll-process-processed-at">
              <span>Processed at</span>
              <input
                id="roll-process-processed-at"
                type="datetime-local"
                value={draft.processedAt}
                onChange={(event) => onChange({ ...draft, processedAt: event.target.value })}
                required
                disabled={saving}
              />
            </label>
            <label className="field media-dialog-field" htmlFor="roll-process-profile">
              <span>Development profile</span>
              <select
                id="roll-process-profile"
                value={draft.developmentProfileId}
                onChange={(event) => onChange({ ...draft, developmentProfileId: event.target.value })}
                disabled={saving}
              >
                <option value="">No profile</option>
                {developmentProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {formatDevelopmentProfileLabel(profile)}
                  </option>
                ))}
              </select>
              {timerControl}
            </label>
            <label className="field media-dialog-field media-dialog-field--wide" htmlFor="roll-process-notes">
              <span>Notes</span>
              <textarea
                id="roll-process-notes"
                rows={3}
                value={draft.developmentNotes}
                onChange={(event) => onChange({ ...draft, developmentNotes: event.target.value })}
                placeholder="Optional development notes"
                disabled={saving}
              />
            </label>
            <p className="field-note media-dialog-note media-dialog-note--wide">
              Profiles are filtered to this roll&apos;s film stock. The processed date defaults to now.
            </p>
          </div>
          <div className="form-actions media-dialog-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Processing…" : "Mark processed"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RollCurrentSection({
  roll,
  photoCount,
  filmName,
  developmentProfiles,
  timeZone,
  onRollChange,
}: {
  roll: Roll;
  photoCount: number;
  filmName: string | null;
  developmentProfiles: DevelopmentProfile[];
  timeZone?: string | null;
  onRollChange: (next: Roll) => void;
}) {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const [savingAction, setSavingAction] = useState<"finish" | "process" | "reopen" | null>(null);
  const [processOpen, setProcessOpen] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [timerMessage, setTimerMessage] = useState<string | null>(null);
  const [timerActionPending, setTimerActionPending] = useState(false);
  const [processDraft, setProcessDraft] = useState<RollProcessDraft>(() => ({
    processedAt: formatDateTimeLocalValue(),
    developmentProfileId: "",
    developmentNotes: "",
  }));
  const { items: timerQueueItems, addItem: addTimerItem, removeItem: removeTimerItem } = useDevelopmentTimerQueue(user?.id);

  const selectedDevelopmentProfile = roll.development_profile_id
    ? developmentProfiles.find((profile) => profile.id === roll.development_profile_id) ?? null
    : null;
  const defaultDevelopmentProfile = developmentProfiles.find((profile) => getDevelopmentProfileTimerTarget(profile) != null) ?? null;
  const effectiveRollDevelopmentProfile = selectedDevelopmentProfile ?? defaultDevelopmentProfile;
  const selectedProcessDevelopmentProfile = processDraft.developmentProfileId
    ? developmentProfiles.find((profile) => profile.id === processDraft.developmentProfileId) ?? null
    : null;
  const rollTimerId = `roll:${roll.id}`;
  const rollIsInTimer = timerQueueItems.some((item) => item.id === rollTimerId);

  const handleAddRollToDevelopmentTimer = (profile: DevelopmentProfile | null) => {
    const timerTarget = getDevelopmentProfileTimerTarget(profile);
    if (!user) {
      setTimerMessage("Sign in is required to use the development timer.");
      return;
    }
    if (!timerTarget) {
      setTimerMessage("Choose a development profile with a timer target before adding this roll to the timer.");
      return;
    }

    setTimerActionPending(true);
    try {
      const result = addTimerItem({
        id: rollTimerId,
        filmHolderId: rollTimerId,
        filmHolderName: `Roll: ${roll.name}`,
        filmName: filmName ?? "Film unavailable",
        photographId: null,
        photographTitle: `${photoCount} photo${photoCount === 1 ? "" : "s"}`,
        exposureSummary: null,
        developmentSeconds: timerTarget.minutes * 60,
        developmentLabel: timerTarget.label,
        addedAt: new Date().toISOString(),
      });
      setTimerMessage(result.message);
    } catch (err) {
      setTimerMessage(err instanceof Error ? err.message : "Could not add this roll to the development timer.");
    } finally {
      setTimerActionPending(false);
    }
  };

  const handleRemoveRollFromDevelopmentTimer = () => {
    setTimerActionPending(true);
    removeTimerItem(rollTimerId);
    setTimerMessage("Removed from development timer.");
    setTimerActionPending(false);
  };

  const renderRollTimerControl = (profile: DevelopmentProfile | null) => {
    const timerTarget = getDevelopmentProfileTimerTarget(profile);
    if (!timerTarget) return null;

    return (
      <div className="roll-development-timer-inline">
        <span className="roll-development-time">{timerTarget.label}</span>
        {rollIsInTimer ? (
          <button type="button" className="btn-secondary" onClick={handleRemoveRollFromDevelopmentTimer} disabled={timerActionPending}>
            {timerActionPending ? "Updating…" : "Remove from timer"}
          </button>
        ) : (
          <button type="button" className="btn-secondary" onClick={() => handleAddRollToDevelopmentTimer(profile)} disabled={timerActionPending}>
            {timerActionPending ? "Adding…" : "Add to timer"}
          </button>
        )}
        {timerMessage && <p className="field-note film-holder-timer-message">{timerMessage}</p>}
      </div>
    );
  };

  const openProcessDialog = () => {
    setProcessDraft({
      processedAt: formatDateTimeLocalValue(),
      developmentProfileId: selectedDevelopmentProfile?.id ?? "",
      developmentNotes: roll.development_notes ?? "",
    });
    setProcessError(null);
    setProcessOpen(true);
  };

  const closeProcessDialog = () => {
    if (savingAction === "process") return;
    setProcessOpen(false);
    setProcessError(null);
  };

  const handleFinish = async () => {
    setSavingAction("finish");
    setProcessError(null);
    try {
      const payload = { finished_at: new Date().toISOString() };
      const updated = await finishRollForConnectivity(
        { transportStatus: connectivityState.transportStatus, user },
        roll,
        payload,
      );
      onRollChange(updated);
    } catch (error) {
      setProcessError(errorMessage(error, "Failed to mark the roll finished"));
    } finally {
      setSavingAction(null);
    }
  };

  const handleProcess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingAction("process");
    setProcessError(null);
    try {
      const processedAt = processDraft.processedAt ? new Date(processDraft.processedAt).toISOString() : new Date().toISOString();
      const payload = {
        processed_at: processedAt,
        development_profile_id: processDraft.developmentProfileId || null,
        development_notes: processDraft.developmentNotes.trim() || null,
      };
      const updated = await processRollForConnectivity(
        { transportStatus: connectivityState.transportStatus, user },
        roll,
        payload,
      );
      onRollChange(updated);
      setProcessOpen(false);
    } catch (error) {
      setProcessError(errorMessage(error, "Failed to mark the roll processed"));
    } finally {
      setSavingAction(null);
    }
  };

  const handleReopen = async () => {
    if (!confirm("Reopen this roll? This clears the finished timestamp and returns it to the active state. Processed metadata stays attached if present.")) {
      return;
    }

    setSavingAction("reopen");
    setProcessError(null);
    try {
      const updated = await reopenRollForConnectivity(
        { transportStatus: connectivityState.transportStatus, user },
        roll,
      );
      onRollChange(updated);
    } catch (error) {
      setProcessError(errorMessage(error, "Failed to reopen the roll"));
    } finally {
      setSavingAction(null);
    }
  };

  const lifecycleText = formatRollLifecycleText(roll, timeZone);
  const statusLabel = formatRollStatusLabel(roll.status);
  const photoLabel = `${photoCount} photo${photoCount === 1 ? "" : "s"}`;
  const rollFormatLabel = formatRollFormatLabel(roll.roll_format);
  const processButtonDisabled = savingAction != null || roll.status !== "finished";
  const canFinish = roll.status === "unexposed" || roll.status === "exposing";
  const canProcess = roll.status === "finished";
  const canReopen = roll.status === "finished" || roll.status === "processed" || roll.status === "developed";

  return (
    <section className="roll-current-section" aria-labelledby={`current-roll-${roll.id}`}>
      <div className="roll-current-header">
        <div>
          <p className="page-count">Current Roll</p>
          <h2 id={`current-roll-${roll.id}`}>Lifecycle</h2>
          {lifecycleText && <p className="muted roll-current-subtitle">{lifecycleText}</p>}
        </div>
        <div className="roll-current-badges">
          <RollStatusBadge status={roll.status} />
          <RollPushPullBadge stops={roll.push_pull_stops} />
          <span className="gear-status gear-status--idle">{photoLabel}</span>
        </div>
      </div>

      {processError && <p className="form-error">{processError}</p>}

      <div className="roll-current-grid">
        <RollCurrentField label="Film stock" value={filmName ?? "No film stock selected"} />
        <RollCurrentField label="Roll format" value={rollFormatLabel} />
        <RollCurrentField label="Status" value={statusLabel} />
        <RollCurrentField label="Push/pull" value={<RollPushPullBadge stops={roll.push_pull_stops} />} />
        <RollCurrentField label="Photo count" value={photoLabel} />
        <RollCurrentField label="Loaded at" value={formatRollDateTime(roll.loaded_at, timeZone) ?? "—"} />
        <RollCurrentField label="Finished at" value={formatRollDateTime(roll.finished_at, timeZone) ?? "—"} />
        <RollCurrentField label="Processed at" value={formatRollDateTime(roll.processed_at ?? roll.developed_at, timeZone) ?? "—"} />
        {roll.development_profile_id && (
          <RollCurrentField
            label="Development profile"
            value={selectedDevelopmentProfile
              ? formatDevelopmentProfileLabel(selectedDevelopmentProfile)
              : roll.development_profile_id}
          />
        )}
        {!roll.development_profile_id && effectiveRollDevelopmentProfile && (
          <RollCurrentField
            label="Available profile"
            value={formatDevelopmentProfileLabel(effectiveRollDevelopmentProfile)}
          />
        )}
        {getDevelopmentProfileTimerTarget(effectiveRollDevelopmentProfile) && (
          <RollCurrentField
            label="Development time"
            value={renderRollTimerControl(effectiveRollDevelopmentProfile)}
          />
        )}
        {roll.development_notes && (
          <RollCurrentField
            label="Development notes"
            value={<p className="roll-current-notes">{roll.development_notes}</p>}
          />
        )}
      </div>

      <div className="roll-current-actions">
        {canFinish && (
          <button
            type="button"
            className="btn-primary"
            onClick={handleFinish}
            disabled={savingAction != null}
          >
            {savingAction === "finish" ? "Marking finished…" : "Mark finished"}
          </button>
        )}
        {canProcess && (
          <button
            type="button"
            className="btn-primary"
            onClick={openProcessDialog}
            disabled={processButtonDisabled}
          >
            Mark processed
          </button>
        )}
        {canReopen && (
          <button
            type="button"
            className="btn-danger-ghost"
            onClick={handleReopen}
            disabled={savingAction != null}
          >
            {savingAction === "reopen" ? "Reopening…" : "Reopen roll"}
          </button>
        )}
      </div>

      <RollProcessingDialog
        developmentProfiles={developmentProfiles}
        open={processOpen}
        saving={savingAction === "process"}
        error={processError}
        draft={processDraft}
        timerControl={renderRollTimerControl(selectedProcessDevelopmentProfile)}
        onChange={setProcessDraft}
        onClose={closeProcessDialog}
        onSubmit={handleProcess}
      />
    </section>
  );
}

function RollPhotographCard({
  photo,
  cameras,
  lenses,
  filmHolders,
  filmName,
  rollName,
  timeZone,
}: {
  photo: Photograph;
  cameras: Map<string, Camera>;
  lenses: Map<string, Lens>;
  filmHolders: Map<string, FilmHolder>;
  filmName?: string | null;
  rollName?: string | null;
  timeZone?: string | null;
}) {
  const camera = photo.camera_id ? cameras.get(photo.camera_id) ?? null : null;
  const lens = photo.lens_id ? lenses.get(photo.lens_id) ?? null : null;
  const filmHolder = photo.film_holder_id ? filmHolders.get(photo.film_holder_id) ?? null : null;
  const takenAt = formatRollDateTime(photo.taken_at ?? photo.created_at, timeZone);
  const title = getPhotographSecondaryTitle(photo) ?? (photo.frame_number ? `Frame ${photo.frame_number}` : "Photograph");
  const images = getPhotographImages(photo);
  const thumbnail = images.find((image) => image.thumbnail_url || image.url) ?? null;
  const thumbnailUrl = thumbnail?.thumbnail_url ?? thumbnail?.url ?? null;
  const filters = photo.filters ?? [];
  const filterSummary = filters.length > 0 ? filters.map((filter) => formatFilterDisplayLabel(filter)).join(" · ") : "";
  const filmLabel = formatPhotographFilmMediaLabel({
    filmName,
    filmHolderName: filmHolder?.name ?? null,
    rollName,
    frameNumber: photo.frame_number,
  });
  const exposureDisplay = formatPhotographExposureDisplay(photo);

  return (
    <li>
      <Link to={`/app/photos/${photo.id}`} className={`photo-row photo-row--embedded${thumbnailUrl ? "" : " photo-row--no-thumb"}`}>
        <PhotographSummaryBlock
          title={title}
          dateTime={takenAt}
          cameraName={camera ? formatCameraDisplayName(camera) : photo.camera_id}
          lensName={lens?.name ?? photo.lens_id}
          filmLabel={filmLabel}
          exposureDisplay={exposureDisplay}
          filterSummary={filterSummary}
          thumbnailUrl={thumbnailUrl}
          thumbnailAlt={`${title} thumbnail`}
          thumbnailWidth={thumbnail?.thumbnail_width ?? thumbnail?.width ?? null}
          thumbnailHeight={thumbnail?.thumbnail_height ?? thumbnail?.height ?? null}
        />
      </Link>
    </li>
  );
}

function RollPhotographsSection({
  photos,
  photoCount,
  cameras,
  lenses,
  filmHolders,
  filmName,
  rollName,
  timeZone,
}: {
  photos: Photograph[];
  photoCount: number;
  cameras: Map<string, Camera>;
  lenses: Map<string, Lens>;
  filmHolders: Map<string, FilmHolder>;
  filmName?: string | null;
  rollName?: string | null;
  timeZone?: string | null;
}) {
  return (
    <section className="roll-photos-section">
      <div className="profiles-section-header">
        <div>
          <h2>Photographs</h2>
          <p className="page-count">
            {photoCount} photo{photoCount === 1 ? "" : "s"} on this roll
          </p>
        </div>
      </div>
      {photos.length === 0 ? (
        <p className="roll-empty-state">No photographs on this roll yet.</p>
      ) : (
        <ul className="roll-photo-list">
          {photos.map((photo) => (
            <RollPhotographCard
              key={photo.id}
              photo={photo}
              cameras={cameras}
              lenses={lenses}
              filmHolders={filmHolders}
              filmName={filmName}
              rollName={rollName}
              timeZone={timeZone}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function RollDetailPage() {
  const preferredTimeZone = usePreferredTimeZone();
  const { id } = useParams<{ id: string }>();
  const { roll, photos, photoCount, gear, developmentProfiles, loading, error, updateRoll } = useRollPageData(id);
  const { items: rolls } = useLoadedItems(api.listRolls);
  const rollCollectionItems = useMemo(
    () => sortGearItemsByDisplayName(rolls, (item) => item.name),
    [rolls],
  );

  if (!id) {
    return <Navigate to={ROLL_LIST_PATH} replace />;
  }

  if (loading) {
    return (
      <div className="page page-wide roll-page">
        <div className="roll-page-state">
          <p className="muted">Loading roll…</p>
        </div>
      </div>
    );
  }

  if (error || !roll) {
    return (
      <div className="page page-wide roll-page">
        <div className="page-header">
          <div>
            <p className="page-count">Roll</p>
            <h1>Roll details</h1>
          </div>
          <div className="page-header-actions">
            <Link className="btn-secondary" to={ROLL_LIST_PATH}>
              Back to rolls
            </Link>
          </div>
        </div>
        <div className="roll-page-state roll-page-state--error">
          <p className="error">{error ?? "Roll not found."}</p>
        </div>
      </div>
    );
  }

  const filmName = roll.film_id ? gear.filmStocks.get(roll.film_id)?.name ?? roll.film_id : null;
  const collectionSwipe = buildCollectionSwipe(
    rollCollectionItems,
    roll.id,
    "roll",
    (item) => ROLL_DETAIL_PATH(item.id),
    (item) => item.name,
  );

  return (
    <CollectionSwipeNavigator {...collectionSwipe}>
    <div className="page page-wide roll-page roll-detail-page">
      <div className="page-header">
        <div>
          <p className="page-count">Roll</p>
          <h1>{roll.name}</h1>
          <p className="page-count">{formatRollLifecycleText(roll, preferredTimeZone)}</p>
        </div>
        <div className="page-header-actions">
          <Link className="btn-secondary" to={ROLL_LIST_PATH}>
            Back to rolls
          </Link>
          <Link className="btn-secondary" to={ROLL_EDIT_PATH(roll.id)}>
            Edit roll
          </Link>
        </div>
      </div>

      <RollCurrentSection
        roll={roll}
        photoCount={photoCount}
        filmName={filmName}
        developmentProfiles={developmentProfiles}
        timeZone={preferredTimeZone}
        onRollChange={updateRoll}
      />

      <RollPhotographsSection
        photos={photos}
        photoCount={photoCount}
        cameras={gear.cameras}
        lenses={gear.lenses}
        filmHolders={gear.filmHolders}
        filmName={filmName}
        rollName={roll.name}
        timeZone={preferredTimeZone}
      />
    </div>
    </CollectionSwipeNavigator>
  );
}

export function RollEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const preferredTimeZone = usePreferredTimeZone();
  const { roll, photos, photoCount, gear, developmentProfiles, loading, error, updateRoll } = useRollPageData(id);
  const { items: rolls } = useLoadedItems(api.listRolls);
  const rollCollectionItems = useMemo(
    () => sortGearItemsByDisplayName(rolls, (item) => item.name),
    [rolls],
  );
  const { items: films, error: filmError } = useLoadedItems(api.listFilmStocks);
  const [draft, setDraft] = useState<RollFormDraft>(() => createEmptyRollDraft());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const initializedRollIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (roll && initializedRollIdRef.current !== roll.id) {
      setDraft(rollDraftFromRoll(roll));
      initializedRollIdRef.current = roll.id;
    }
  }, [roll]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    const nextName = draft.name.trim();
    if (!nextName) {
      setSaveError("Roll name is required.");
      return;
    }

    setSaveError(null);
    setSaving(true);
    try {
      const payload = buildRollPayload(draft);
      if (roll && draft.filmId !== (roll.film_id ?? "")) {
        payload.development_profile_id = null;
      }
      await api.updateRoll(id, payload);
      navigate(ROLL_DETAIL_PATH(id), { replace: true });
    } catch (err) {
      setSaveError(errorMessage(err, "Failed to save roll"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!roll) return;
    if (!confirm(`Delete ${roll.name}?`)) return;

    setDeleteError(null);
    setDeleting(true);
    try {
      await api.deleteRoll(roll.id);
      navigate(ROLL_LIST_PATH, { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err, "Failed to delete roll"));
    } finally {
      setDeleting(false);
    }
  };

  const handleRollChange = (nextRoll: Roll) => {
    updateRoll(nextRoll);
    setDraft((prev) => ({
      ...prev,
      finishedAt: nextRoll.finished_at ?? "",
      processedAt: nextRoll.processed_at ?? nextRoll.developed_at ?? "",
      developmentProfileId: nextRoll.development_profile_id ?? "",
      developmentNotes: nextRoll.development_notes ?? "",
    }));
  };

  if (!id) {
    return <Navigate to={ROLL_LIST_PATH} replace />;
  }

  if (loading) {
    return (
      <div className="page page-wide roll-page">
        <div className="roll-page-state">
          <p className="muted">Loading roll…</p>
        </div>
      </div>
    );
  }

  if (error || !roll) {
    return (
      <FormPageShell eyebrow="Roll" title="Roll not found" backTo={ROLL_LIST_PATH} backLabel="Back to rolls" pageClassName="page page-wide roll-page">
        <div className="roll-page-state roll-page-state--error">
          <p className="error">{error ?? "Roll not found."}</p>
        </div>
      </FormPageShell>
    );
  }

  return (
    <FormPageShell
      eyebrow="Roll"
      title={roll.name}
      backTo={ROLL_DETAIL_PATH(roll.id)}
      backLabel="Back to roll"
      pageClassName="page page-wide roll-page"
      collectionSwipe={buildCollectionSwipe(
        rollCollectionItems,
        roll.id,
        "roll",
        (item) => ROLL_EDIT_PATH(item.id),
        (item) => item.name,
      )}
    >
      <RollCurrentSection
        roll={roll}
        photoCount={photoCount}
        filmName={roll.film_id ? gear.filmStocks.get(roll.film_id)?.name ?? roll.film_id : null}
        developmentProfiles={developmentProfiles}
        timeZone={preferredTimeZone}
        onRollChange={handleRollChange}
      />
      <RollFormPageBody
        draft={draft}
        films={films}
        error={saveError}
        optionsError={filmError}
        saving={saving}
        submitLabel="Save changes"
        showProcessedAt
        onSubmit={handleSubmit}
        onChange={setDraft}
      />
      <ResourceDeleteSection label="Delete roll" deleting={deleting} error={deleteError} onDelete={handleDelete} />
      <RollPhotographsSection
        photos={photos}
        photoCount={photoCount}
        cameras={gear.cameras}
        lenses={gear.lenses}
        filmHolders={gear.filmHolders}
        filmName={roll.film_id ? gear.filmStocks.get(roll.film_id)?.name ?? roll.film_id : null}
        rollName={roll.name}
        timeZone={preferredTimeZone}
      />
    </FormPageShell>
  );
}

export function CameraCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CameraFormDraft>(() => createEmptyCameraDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const shutterError = validateShutterRange(draft.shutter);
    if (shutterError) {
      setError(shutterError);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await api.createCamera(buildCameraPayload(draft));
      navigate(CAMERA_LIST_PATH, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to create camera"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPageShell eyebrow="Camera" title="Add camera" backTo={CAMERA_LIST_PATH} backLabel="Cancel">
      <CameraFormPageBody
        draft={draft}
        error={error}
        saving={saving}
        submitLabel="Create camera"
        onSubmit={handleSubmit}
        onChange={setDraft}
      />
    </FormPageShell>
  );
}

export function CameraEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item: camera, loading, error: loadError } = useRemoteItem(api.getCamera, id, "Camera not found.");
  const { items: cameras } = useLoadedItems(api.listCameras);
  const cameraCollectionItems = useMemo(
    () => sortGearItemsByDisplayName(cameras, formatCameraDisplayName),
    [cameras],
  );
  const [draft, setDraft] = useState<CameraFormDraft>(() => createEmptyCameraDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (camera) {
      setDraft(cameraDraftFromCamera(camera));
    }
  }, [camera]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    const shutterError = validateShutterRange(draft.shutter);
    if (shutterError) {
      setError(shutterError);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await api.updateCamera(id, buildCameraPayload(draft));
      navigate(CAMERA_LIST_PATH, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to save camera"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!camera) return;
    if (!confirm(`Delete ${camera.name}?`)) return;

    setDeleteError(null);
    setDeleting(true);
    try {
      await api.deleteCamera(camera.id);
      navigate(CAMERA_LIST_PATH, { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err, "Failed to delete camera"));
    } finally {
      setDeleting(false);
    }
  };

  if (!id) {
    return <Navigate to={CAMERA_LIST_PATH} replace />;
  }

  if (loading) {
    return <div className="page page-wide"><p className="muted">Loading camera…</p></div>;
  }

  if (loadError || !camera) {
    return (
      <FormPageShell eyebrow="Camera" title="Camera not found" backTo={CAMERA_LIST_PATH} backLabel="Back to cameras">
        <p className="form-error">{loadError ?? "Camera not found."}</p>
      </FormPageShell>
    );
  }

  return (
    <FormPageShell
      eyebrow="Camera"
      title={formatCameraDisplayName(camera)}
      backTo={CAMERA_LIST_PATH}
      backLabel="Back to cameras"
      collectionSwipe={buildCollectionSwipe(
        cameraCollectionItems,
        camera.id,
        "camera",
        (item) => `${CAMERA_LIST_PATH}/${item.id}/edit`,
        formatCameraDisplayName,
      )}
    >
      <CameraFormPageBody
        draft={draft}
        error={error}
        saving={saving}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onChange={setDraft}
      />
      <CameraCompatibilitySummary camera={camera} />
      <ResourceDeleteSection label="Delete camera" deleting={deleting} error={deleteError} onDelete={handleDelete} />
    </FormPageShell>
  );
}

export function LensCreatePage() {
  const navigate = useNavigate();
  const { items: cameras, error: cameraError } = useLoadedItems(api.listCameras);
  const [draft, setDraft] = useState<LensFormDraft>(() => createEmptyLensDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const focalError = validateFocalLengthRange(draft.minFocalLength, draft.maxFocalLength, draft.lensType);
    if (focalError) {
      setError(focalError);
      return;
    }
    const apertureError = validateApertureRange(draft.minFStop, draft.maxFStop, String(draft.apertureIncrement));
    if (apertureError) {
      setError(apertureError);
      return;
    }
    const shutterError = validateShutterRange(draft.shutter);
    if (shutterError) {
      setError(shutterError);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await api.createLens(buildLensPayload(draft, cameras));
      navigate(LENS_LIST_PATH, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to create lens"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPageShell eyebrow="Lens" title="Add lens" backTo={LENS_LIST_PATH} backLabel="Cancel">
      <LensFormPageBody
        draft={draft}
        cameras={cameras}
        error={error}
        optionsError={cameraError}
        saving={saving}
        submitLabel="Create lens"
        onSubmit={handleSubmit}
        onChange={setDraft}
      />
    </FormPageShell>
  );
}

export function LensEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item: lens, loading, error: loadError } = useRemoteItem(api.getLens, id, "Lens not found.");
  const { items: lenses } = useLoadedItems(api.listLenses);
  const lensCollectionItems = useMemo(
    () => sortGearItemsByDisplayName(lenses, (item) => item.name),
    [lenses],
  );
  const { items: cameras, error: cameraError } = useLoadedItems(api.listCameras);
  const [draft, setDraft] = useState<LensFormDraft>(() => createEmptyLensDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (lens) {
      setDraft(lensDraftFromLens(lens));
    }
  }, [lens]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    const focalError = validateFocalLengthRange(draft.minFocalLength, draft.maxFocalLength, draft.lensType);
    if (focalError) {
      setError(focalError);
      return;
    }
    const apertureError = validateApertureRange(draft.minFStop, draft.maxFStop, String(draft.apertureIncrement));
    if (apertureError) {
      setError(apertureError);
      return;
    }
    const shutterError = validateShutterRange(draft.shutter);
    if (shutterError) {
      setError(shutterError);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await api.updateLens(id, buildLensPayload(draft, cameras));
      navigate(LENS_LIST_PATH, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to save lens"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!lens) return;
    if (!confirm(`Delete ${lens.name}?`)) return;

    setDeleteError(null);
    setDeleting(true);
    try {
      await api.deleteLens(lens.id);
      navigate(LENS_LIST_PATH, { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err, "Failed to delete lens"));
    } finally {
      setDeleting(false);
    }
  };

  if (!id) {
    return <Navigate to={LENS_LIST_PATH} replace />;
  }

  if (loading) {
    return <div className="page page-wide"><p className="muted">Loading lens…</p></div>;
  }

  if (loadError || !lens) {
    return (
      <FormPageShell eyebrow="Lens" title="Lens not found" backTo={LENS_LIST_PATH} backLabel="Back to lenses">
        <p className="form-error">{loadError ?? "Lens not found."}</p>
      </FormPageShell>
    );
  }

  return (
    <FormPageShell
      eyebrow="Lens"
      title={lens.name}
      backTo={LENS_LIST_PATH}
      backLabel="Back to lenses"
      collectionSwipe={buildCollectionSwipe(
        lensCollectionItems,
        lens.id,
        "lens",
        (item) => `${LENS_LIST_PATH}/${item.id}/edit`,
        (item) => item.name,
      )}
    >
      <LensFormPageBody
        draft={draft}
        cameras={cameras}
        error={error}
        optionsError={cameraError}
        saving={saving}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onChange={setDraft}
      />
      <ResourceDeleteSection label="Delete lens" deleting={deleting} error={deleteError} onDelete={handleDelete} />
    </FormPageShell>
  );
}

export function FilterCreatePage() {
  const navigate = useNavigate();
  const { items: lenses, error: lensError } = useLoadedItems(api.listLenses);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [draft, setDraft] = useState<FilterFormDraft>(() => createEmptyFilterDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const presetByKey = useMemo(() => new Map(presets.map((preset) => [preset.key, preset])), [presets]);

  useEffect(() => {
    let active = true;
    api.listFilterPresets()
      .then((response) => {
        if (!active) return;
        setPresets(response.items);
      })
      .catch(() => {
        if (!active) return;
        setPresets([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const handlePresetChange = (next: string) => {
    setDraft((current) => {
      const preset = presetByKey.get(next) ?? null;
      return {
        ...applyFilterPreset({ ...current, standardKey: next }, preset),
        standardKey: next,
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = draft.name.trim();
    if (!nextName) {
      setError("Name is required.");
      return;
    }
    const payload = buildFilterCreatePayload(draft, lenses);
    if (parseFilterFactorInput(draft.filterFactor) == null || payload.filter_factor == null) {
      setError("Filter factor must be a positive number.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.createFilter(payload);
      navigate(FILTER_LIST_PATH, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to create filter"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPageShell eyebrow="Filter" title="Add filter" backTo={FILTER_LIST_PATH} backLabel="Cancel">
      <FilterFormPageBody
        draft={draft}
        lenses={lenses}
        presets={presets}
        error={error}
        optionsError={lensError}
        saving={saving}
        submitLabel="Create filter"
        onSubmit={handleSubmit}
        onChange={setDraft}
        onPresetChange={handlePresetChange}
      />
    </FormPageShell>
  );
}

export function FilterEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item: filter, loading, error: loadError } = useRemoteItem(api.getFilter, id, "Filter not found.");
  const { items: filters } = useLoadedItems(api.listFilters);
  const filterCollectionItems = useMemo(
    () => sortGearItemsByDisplayName(filters, formatFilterDisplayLabel),
    [filters],
  );
  const { items: lenses, error: lensError } = useLoadedItems(api.listLenses);
  const [draft, setDraft] = useState<FilterFormDraft>(() => createEmptyFilterDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (filter) {
      setDraft(filterDraftFromFilter(filter));
    }
  }, [filter]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    const nextName = draft.name.trim();
    if (!nextName) {
      setError("Name is required.");
      return;
    }
    const payload = buildFilterUpdatePayload(draft, lenses);
    if (parseFilterFactorInput(draft.filterFactor) == null || payload.filter_factor == null) {
      setError("Filter factor must be a positive number.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.updateFilter(id, payload);
      navigate(FILTER_LIST_PATH, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to save filter"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!filter) return;
    if (!confirm(`Delete ${filter.name}?`)) return;

    setDeleteError(null);
    setDeleting(true);
    try {
      await api.deleteFilter(filter.id);
      navigate(FILTER_LIST_PATH, { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err, "Failed to delete filter"));
    } finally {
      setDeleting(false);
    }
  };

  if (!id) {
    return <Navigate to={FILTER_LIST_PATH} replace />;
  }

  if (loading) {
    return <div className="page page-wide"><p className="muted">Loading filter…</p></div>;
  }

  if (loadError || !filter) {
    return (
      <FormPageShell eyebrow="Filter" title="Filter not found" backTo={FILTER_LIST_PATH} backLabel="Back to filters">
        <p className="form-error">{loadError ?? "Filter not found."}</p>
      </FormPageShell>
    );
  }

  return (
    <FormPageShell
      eyebrow="Filter"
      title={filter.name}
      backTo={FILTER_LIST_PATH}
      backLabel="Back to filters"
      collectionSwipe={buildCollectionSwipe(
        filterCollectionItems,
        filter.id,
        "filter",
        (item) => `${FILTER_LIST_PATH}/${item.id}/edit`,
        (item) => item.name,
      )}
    >
      <FilterFormPageBody
        draft={draft}
        lenses={lenses}
        presets={[]}
        error={error}
        optionsError={lensError}
        saving={saving}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onChange={setDraft}
        onPresetChange={() => undefined}
      />
      <ResourceDeleteSection label="Delete filter" deleting={deleting} error={deleteError} onDelete={handleDelete} />
    </FormPageShell>
  );
}

export function FilmStockCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<FilmStockFormDraft>(() => createEmptyFilmStockDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const presetByKey = useMemo(() => new Map(FILM_STOCK_PRESETS.map((preset) => [preset.key, preset])), []);

  const handlePresetChange = (next: string) => {
    setDraft((current) => applyFilmStockPreset({ ...current, presetKey: next }, presetByKey.get(next) ?? null));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateFilmStockDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const film = await api.createFilmStock(buildFilmStockPayload(draft));
      navigate(FILM_STOCK_DETAIL_PATH(film.id), { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to create film stock"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPageShell eyebrow="Film stocks" title="Add film stock" backTo={FILM_STOCK_LIST_PATH} backLabel="Cancel">
      <FilmStockFormPageBody
        draft={draft}
        presets={FILM_STOCK_PRESETS}
        error={error}
        saving={saving}
        submitLabel="Create film stock"
        onSubmit={handleSubmit}
        onChange={setDraft}
        onPresetChange={handlePresetChange}
      />
    </FormPageShell>
  );
}

export function FilmStockEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item: filmStock, loading, error: loadError } = useRemoteItem(api.getFilmStock, id, "Film stock not found.");
  const { items: filmStocks } = useLoadedItems(api.listFilmStocks);
  const filmStockCollectionItems = useMemo(
    () => sortGearItemsByDisplayName(filmStocks, (item) => item.name),
    [filmStocks],
  );
  const [draft, setDraft] = useState<FilmStockFormDraft>(() => createEmptyFilmStockDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (filmStock) {
      setDraft(filmStockDraftFromFilmStock(filmStock));
    }
  }, [filmStock]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    const validationError = validateFilmStockDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await api.updateFilmStock(id, buildFilmStockPayload(draft));
      navigate(FILM_STOCK_DETAIL_PATH(id), { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to save film stock"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!filmStock) return;
    if (!confirm(`Delete ${filmStock.name}?`)) return;

    setDeleteError(null);
    setDeleting(true);
    try {
      await api.deleteFilmStock(filmStock.id);
      navigate(FILM_STOCK_LIST_PATH, { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err, "Failed to delete film stock"));
    } finally {
      setDeleting(false);
    }
  };

  if (!id) {
    return <Navigate to={FILM_STOCK_LIST_PATH} replace />;
  }

  if (loading) {
    return <div className="page page-wide"><p className="muted">Loading film stock…</p></div>;
  }

  if (loadError || !filmStock) {
    return (
      <FormPageShell eyebrow="Film Stock" title="Film stock not found" backTo={FILM_STOCK_LIST_PATH} backLabel="Back to film stocks">
        <p className="form-error">{loadError ?? "Film stock not found."}</p>
      </FormPageShell>
    );
  }

  return (
    <FormPageShell
      eyebrow="Film Stock"
      title={filmStock.name}
      backTo={FILM_STOCK_DETAIL_PATH(filmStock.id)}
      backLabel="Back to stock"
      collectionSwipe={buildCollectionSwipe(
        filmStockCollectionItems,
        filmStock.id,
        "film stock",
        (item) => `${FILM_STOCK_LIST_PATH}/${item.id}/edit`,
        (item) => item.name,
      )}
    >
      <FilmStockFormPageBody
        draft={draft}
        error={error}
        saving={saving}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onChange={setDraft}
      />
      <ResourceDeleteSection
        label="Delete film stock"
        deleting={deleting}
        error={deleteError}
        onDelete={handleDelete}
      />
    </FormPageShell>
  );
}

export function RollCreatePage() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const navigate = useNavigate();
  const { items: films, error: filmError } = useLoadedItems(api.listFilmStocks);
  const [draft, setDraft] = useState<RollFormDraft>(() => createEmptyRollDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = draft.name.trim();
    if (!nextName) {
      setError("Roll name is required.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const payload = buildRollPayload(draft);
      await createRollForConnectivity(
        { transportStatus: connectivityState.transportStatus, user },
        { ...payload, name: nextName },
      );
      navigate(ROLL_LIST_PATH, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to create roll"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPageShell eyebrow="Film" title="Add roll" backTo={ROLL_LIST_PATH} backLabel="Cancel">
      <RollFormPageBody
        draft={draft}
        films={films}
        error={error}
        optionsError={filmError}
        saving={saving}
        submitLabel="Create roll"
        onSubmit={handleSubmit}
        onChange={setDraft}
      />
    </FormPageShell>
  );
}

export function FilmHolderCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<FilmHolderFormDraft>(() => createEmptyFilmHolderDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = draft.name.trim();
    if (!nextName) {
      setError("Name is required.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await api.createFilmHolder(buildFilmHolderPayload(draft));
      navigate(FILM_HOLDER_LIST_PATH, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to create film holder"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPageShell eyebrow="Film" title="Add film holder" backTo={FILM_HOLDER_LIST_PATH} backLabel="Cancel">
      <FilmHolderFormPageBody
        draft={draft}
        error={error}
        saving={saving}
        submitLabel="Create film holder"
        onSubmit={handleSubmit}
        onChange={setDraft}
      />
    </FormPageShell>
  );
}

export function FilmHolderEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item: filmHolder, loading, error: loadError } = useRemoteItem(
    api.getFilmHolder,
    id,
    "Film holder not found.",
  );
  const { items: filmHolders } = useLoadedItems(api.listFilmHolders);
  const filmHolderCollectionItems = useMemo(
    () => sortGearItemsByDisplayName(filmHolders, (item) => item.name),
    [filmHolders],
  );
  const [draft, setDraft] = useState<FilmHolderFormDraft>(() => createEmptyFilmHolderDraft());
  const [lifecycleFilmHolder, setLifecycleFilmHolder] = useState<FilmHolder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (filmHolder) {
      setDraft(filmHolderDraftFromFilmHolder(filmHolder));
      setLifecycleFilmHolder(filmHolder);
    }
  }, [filmHolder]);

  const displayedFilmHolder = lifecycleFilmHolder ?? filmHolder;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    const nextName = draft.name.trim();
    if (!nextName) {
      setError("Name is required.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await api.updateFilmHolder(id, buildFilmHolderPayload(draft));
      navigate(FILM_HOLDER_LIST_PATH, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Failed to save film holder"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!displayedFilmHolder) return;
    if (!confirm(`Delete ${displayedFilmHolder.name}?`)) return;

    setDeleteError(null);
    setDeleting(true);
    try {
      await api.deleteFilmHolder(displayedFilmHolder.id);
      navigate(FILM_HOLDER_LIST_PATH, { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err, "Failed to delete film holder"));
    } finally {
      setDeleting(false);
    }
  };

  if (!id) {
    return <Navigate to={FILM_HOLDER_LIST_PATH} replace />;
  }

  const filmHolderCollectionSwipe = buildCollectionSwipe(
    filmHolderCollectionItems,
    id,
    "film holder",
    (item) => `${FILM_HOLDER_LIST_PATH}/${item.id}/edit`,
    (item) => item.name,
  );

  if (loading) {
    return (
      <CollectionSwipeNavigator {...filmHolderCollectionSwipe}>
        <div className="page page-wide"><p className="muted">Loading film holder…</p></div>
      </CollectionSwipeNavigator>
    );
  }

  if (loadError || !displayedFilmHolder) {
    return (
      <FormPageShell
        eyebrow="Film Holder"
        title="Film holder not found"
        backTo={FILM_HOLDER_LIST_PATH}
        backLabel="Back to film holders"
      >
        <p className="form-error">{loadError ?? "Film holder not found."}</p>
      </FormPageShell>
    );
  }

  return (
    <FormPageShell
      eyebrow="Film Holder"
      title={displayedFilmHolder.name}
      backTo={FILM_HOLDER_LIST_PATH}
      backLabel="Back to film holders"
      collectionSwipe={buildCollectionSwipe(
        filmHolderCollectionItems,
        displayedFilmHolder.id,
        "film holder",
        (item) => `${FILM_HOLDER_LIST_PATH}/${item.id}/edit`,
        (item) => item.name,
      )}
    >
      <FilmHolderLifecyclePanel filmHolder={displayedFilmHolder} onChange={setLifecycleFilmHolder} />
      <FilmHolderFormPageBody
        draft={draft}
        error={error}
        saving={saving}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onChange={setDraft}
      />
      <ResourceDeleteSection
        label="Delete film holder"
        deleting={deleting}
        error={deleteError}
        onDelete={handleDelete}
      />
    </FormPageShell>
  );
}
