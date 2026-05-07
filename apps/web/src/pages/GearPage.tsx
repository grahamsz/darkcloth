import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Camera, Lens, FilmStock, Roll, FilmHolder, Filter } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useConnectivity } from "../contexts/ConnectivityContext";
import { formatFilmStockTypeLabel } from "../film-stocks";
import {
  readCachedCameras,
  readCachedFilmHolders,
  readCachedFilmStocks,
  readCachedFilters,
  readCachedLenses,
  readCachedRolls,
} from "../offline/cache";
import { queueOfflineRollAction } from "../offline/sync";
import { formatFilterDisplayLabel } from "../photoFilters";
import {
  APERTURE_INCREMENT_OPTIONS,
  DEFAULT_APERTURE_MAX_F_STOP,
  DEFAULT_APERTURE_MIN_F_STOP,
  formatShutterSpeedValue,
  getApertureIncrementLabel,
  getLensFocalDisplay,
  getStandardShutterChoiceOptions,
  isApertureIncrementAllowed,
  STANDARD_SHUTTER_SPEED_SECONDS,
  normalizeApertureIncrement,
  parseShutterSpeedInput,
} from "../optics";
import {
  formatCameraDisplayName,
  formatCameraFilmType,
  getCameraLensApplicabilityText,
  FilterFormDraft,
  FilterFormFields,
  buildFilterUpdatePayload,
  createEmptyFilterDraft,
  filterDraftFromFilter,
  formatRollLifecycleText,
  formatRollPushPullLabel,
  formatRollStatusLabel,
  getRollStatusClassName,
} from "./GearFormFields";
import {
  formatFilmHolderLoadStatusLabel,
  getFilmHolderLoadPhotographAlt,
  getFilmHolderLoadPhotographThumbnailUrl,
  getFilmHolderLoadTone,
  getFilmHolderLoadFilmName,
  getFilmHolderLoadTimestamp,
} from "../filmHolders";
import { usePreferredTimeZone } from "../hooks/usePreferredTimeZone";
import { sortGearItemsByDisplayName } from "./gearListUtils";
import { formatDateTimeDisplay } from "../dateTime";

type Section = "cameras" | "lenses" | "filters" | "film_stocks" | "rolls" | "film_holders";
type CameraFilmType = "unspecified" | "sheet" | "roll";

type ApertureIncrement = (typeof APERTURE_INCREMENT_OPTIONS)[number]["value"];
type LensType = "prime" | "zoom";
type ShutterState = {
  hasShutter: boolean;
  minShutterSpeed: string;
  maxShutterSpeed: string;
  supportsBulb: boolean;
};

const CAMERA_EDIT_PATH = (id: string) => `/app/gear/cameras/${id}/edit`;
const LENS_EDIT_PATH = (id: string) => `/app/gear/lenses/${id}/edit`;
const FILTER_EDIT_PATH = (id: string) => `/app/gear/filters/${id}/edit`;
const FILM_STOCK_LIST_PATH = "/app/film/stocks";
const FILM_STOCK_NEW_PATH = `${FILM_STOCK_LIST_PATH}/new`;
const FILM_STOCK_DETAIL_PATH = (id: string) => `${FILM_STOCK_LIST_PATH}/${id}`;
const ROLL_LIST_PATH = "/app/film/rolls";
const ROLL_NEW_PATH = `${ROLL_LIST_PATH}/new`;
const ROLL_DETAIL_PATH = (id: string) => `${ROLL_LIST_PATH}/${id}`;
const FILM_HOLDER_LIST_PATH = "/app/film/holders";
const FILM_HOLDER_NEW_PATH = `${FILM_HOLDER_LIST_PATH}/new`;
const FILM_HOLDER_EDIT_PATH = (id: string) => `${FILM_HOLDER_LIST_PATH}/${id}/edit`;
const SHUTTER_SPEED_FASTEST = formatShutterSpeedValue(STANDARD_SHUTTER_SPEED_SECONDS[0]);
const SHUTTER_SPEED_SLOWEST = formatShutterSpeedValue(STANDARD_SHUTTER_SPEED_SECONDS[STANDARD_SHUTTER_SPEED_SECONDS.length - 1]);

const normalizeLensIds = (ids?: string[] | null) => ids ?? [];

const shouldSuppressOfflineLoadError = (user: unknown) => Boolean(user);

const createDisabledShutterState = (): ShutterState => ({
  hasShutter: false,
  minShutterSpeed: "",
  maxShutterSpeed: "",
  supportsBulb: false,
});

const createEnabledShutterState = (
  minShutterSpeed?: number | null,
  maxShutterSpeed?: number | null,
  supportsBulb = false,
): ShutterState => ({
  hasShutter: true,
  minShutterSpeed: minShutterSpeed != null ? formatShutterSpeedValue(minShutterSpeed) : SHUTTER_SPEED_FASTEST,
  maxShutterSpeed: maxShutterSpeed != null ? formatShutterSpeedValue(maxShutterSpeed) : SHUTTER_SPEED_SLOWEST,
  supportsBulb,
});

const getShutterStateFromCamera = (camera?: Camera | null): ShutterState => (
  camera?.has_shutter
    ? createEnabledShutterState(
      camera.min_shutter_speed_seconds,
      camera.max_shutter_speed_seconds,
      camera.supports_bulb,
    )
    : createDisabledShutterState()
);

const getShutterStateFromLens = (lens?: Lens | null): ShutterState => (
  lens?.has_shutter
    ? createEnabledShutterState(
      lens.min_shutter_speed_seconds,
      lens.max_shutter_speed_seconds,
      lens.supports_bulb,
    )
    : createDisabledShutterState()
);

const getApplicableLensesMetaText = (
  itemIds: string[] | undefined,
  nameById: Map<string, string>,
  labels: { all: string; prefix: string },
) => {
  const ids = normalizeLensIds(itemIds);
  const names = ids
    .map((id) => nameById.get(id))
    .filter((name): name is string => Boolean(name));
  if (ids.length === 0) return labels.all;
  if (names.length === 0) return `${labels.prefix} ${ids.length} selected item${ids.length === 1 ? "" : "s"}`;
  if (names.length === ids.length) return `${labels.prefix} ${names.join(", ")}`;
  return `${labels.prefix} ${names.join(", ")} (+ unavailable)`;
};

type NamedItem = {
  id: string;
  name: string;
};

const getCameraPayloadForForm = (value: CameraFilmType) => (value === "unspecified" ? null : value);

const getLensCameraMetaText = (lens: Lens, cameraNameById: Map<string, string>) => {
  return getApplicableLensesMetaText(lens.applicable_camera_ids, cameraNameById, {
    all: "Applies to all cameras",
    prefix: "Applies to",
  });
};

const getFilterLensMetaText = (filter: Filter, lensNameById: Map<string, string>) => {
  return getApplicableLensesMetaText(filter.applicable_lens_ids, lensNameById, {
    all: "All lenses",
    prefix: "Applies to",
  });
};

function CameraCompatibilitySummary({
  camera,
  lensNameById,
}: {
  camera: Camera;
  lensNameById: ReadonlyMap<string, string>;
}) {
  const text = getCameraLensApplicabilityText(camera, lensNameById);
  if (!text) return null;

  return (
    <div className="camera-compatibility-summary">
      <p className="field-note muted camera-compatibility-text">{text}</p>
    </div>
  );
}

const formatShutterInput = (value: number | null | undefined) => (value == null ? "" : formatShutterSpeedValue(value));

const validateShutterRange = (state: ShutterState) => {
  if (!state.hasShutter) return null;
  const hasMin = state.minShutterSpeed.trim() !== "";
  const hasMax = state.maxShutterSpeed.trim() !== "";
  if (!hasMin || !hasMax) return "Provide both min and max shutter speeds.";
  const parsedMin = parseShutterSpeedInput(state.minShutterSpeed);
  const parsedMax = parseShutterSpeedInput(state.maxShutterSpeed);
  if (parsedMin == null) return "Invalid minimum shutter speed.";
  if (parsedMax == null) return "Invalid maximum shutter speed.";
  if (parsedMax < parsedMin) return "Max shutter speed must be greater than or equal to min shutter speed.";
  return null;
};

const getShutterCapabilityText = (
  hasShutter: boolean,
  minShutterSpeedSeconds: number | null,
  maxShutterSpeedSeconds: number | null,
  supportsBulb: boolean,
) => {
  const min = minShutterSpeedSeconds != null ? formatShutterInput(minShutterSpeedSeconds) : "";
  const max = maxShutterSpeedSeconds != null ? formatShutterInput(maxShutterSpeedSeconds) : "";
  const values = [min, max].filter((value) => Boolean(value));
  const chunks: string[] = [];
  if (values.length === 2) {
    chunks.push(min === max ? `Shutter ${min}` : `Shutter ${min} \u2013 ${max}`);
  } else if (values.length === 1) {
    chunks.push(`Shutter ${values[0]}`);
  }
  if (supportsBulb) {
    chunks.push("Bulb");
  }
  if (!hasShutter && chunks.length === 0) {
    return "";
  }
  if (hasShutter && chunks.length === 0) {
    return "Shutter";
  }
  return chunks.join(" · ");
};

const getShutterPayload = (state: ShutterState) => {
  if (!state.hasShutter) {
    return {
      has_shutter: false,
      min_shutter_speed_seconds: null,
      max_shutter_speed_seconds: null,
      supports_bulb: false,
    };
  }

  return {
    has_shutter: true,
    min_shutter_speed_seconds: parseShutterSpeedInput(state.minShutterSpeed),
    max_shutter_speed_seconds: parseShutterSpeedInput(state.maxShutterSpeed),
    supports_bulb: state.supportsBulb,
  };
};

type ShutterFieldsProps = {
  label: string;
  prefix: string;
  state: ShutterState;
  onToggle: (next: boolean) => void;
  onMinChange: (next: string) => void;
  onMaxChange: (next: string) => void;
  onSupportsBulbChange: (next: boolean) => void;
};

const ShutterFields = ({
  label,
  prefix,
  state,
  onToggle,
  onMinChange,
  onMaxChange,
  onSupportsBulbChange,
}: ShutterFieldsProps) => {
  const minChoices = useMemo(() => getStandardShutterChoiceOptions(state.minShutterSpeed), [state.minShutterSpeed]);
  const maxChoices = useMemo(() => getStandardShutterChoiceOptions(state.maxShutterSpeed), [state.maxShutterSpeed]);

  return (
    <div className="gear-shutter-group">
      <label className="gear-shutter-toggle" htmlFor={`${prefix}-has-shutter`}>
        <span>{label}</span>
        <input
          id={`${prefix}-has-shutter`}
          type="checkbox"
          checked={state.hasShutter}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </label>
      <fieldset className="gear-shutter-fieldset" disabled={!state.hasShutter}>
        <legend>Shutter</legend>
        <div className="lens-form-grid gear-shutter-grid">
          <label className="field" htmlFor={`${prefix}-min-shutter-speed`}>
            <span>Min shutter</span>
            <select
              id={`${prefix}-min-shutter-speed`}
              value={state.minShutterSpeed}
              onChange={(e) => onMinChange(e.target.value)}
            >
              <option value="">Select speed</option>
              {minChoices.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor={`${prefix}-max-shutter-speed`}>
            <span>Max shutter</span>
            <select
              id={`${prefix}-max-shutter-speed`}
              value={state.maxShutterSpeed}
              onChange={(e) => onMaxChange(e.target.value)}
            >
              <option value="">Select speed</option>
              {maxChoices.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="gear-shutter-option lens-form-field--stretch" htmlFor={`${prefix}-supports-bulb`}>
            <input
              id={`${prefix}-supports-bulb`}
              type="checkbox"
              checked={state.supportsBulb}
              onChange={(e) => onSupportsBulbChange(e.target.checked)}
            />
            <span>Supports bulb</span>
          </label>
        </div>
      </fieldset>
    </div>
  );
};

const formatFilterFactor = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "";
  const normalized = Number.parseFloat(value.toFixed(12));
  return Number.isInteger(normalized) ? String(normalized) : String(normalized);
};

const parseFilterFactorInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const factor = Number(trimmed);
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return factor;
};

const getAcceptsAllLensesState = (ids: string[]) => ids.length === 0;

type LensApplicabilityListProps = {
  allLabelText: string;
  allLabelId: string;
  labelText: string;
  selectedIds: string[];
  items: NamedItem[];
  onChange: (next: string[]) => void;
};

const LensApplicabilityList = ({
  allLabelText,
  allLabelId,
  labelText,
  selectedIds,
  items,
  onChange,
}: LensApplicabilityListProps) => {
  const acceptsAllLenses = getAcceptsAllLensesState(selectedIds);

  const handleAllToggle = () => {
    onChange([]);
  };

  const handleLensToggle = (lensId: string, enabled: boolean) => {
    if (enabled) {
      onChange([...(selectedIds.includes(lensId) ? selectedIds : [...selectedIds, lensId])]);
    } else {
      const next = selectedIds.filter(id => id !== lensId);
      onChange(next);
    }
  };

  return (
    <div className="field lens-checklist-wrap">
      <span className="lens-checklist-label">{labelText}</span>
      <div className="lens-checklist" role="group" aria-labelledby={allLabelId}>
        <label className="lens-checklist-item">
          <input
            type="checkbox"
            id={allLabelId}
            checked={acceptsAllLenses}
            onChange={handleAllToggle}
          />
          <span>{allLabelText}</span>
        </label>
        {items.map(item => {
          const checked = selectedIds.includes(item.id);
          return (
            <label key={item.id} className="lens-checklist-item">
              <input
                type="checkbox"
                checked={checked}
                disabled={acceptsAllLenses}
                onChange={e => handleLensToggle(item.id, e.target.checked)}
              />
              <span>{formatCameraDisplayName(item)}</span>
            </label>
          );
        })}
        {items.length === 0 && <span className="muted">No items configured.</span>}
      </div>
    </div>
  );
};

function CamerasSection() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const [items, setItems] = useState<Camera[]>([]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMaker, setEditMaker] = useState("");
  const [editFilmType, setEditFilmType] = useState<CameraFilmType>("unspecified");
  const [editShutter, setEditShutter] = useState<ShutterState>(createDisabledShutterState());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lensNameById = useMemo(
    () => new Map(lenses.map((lens) => [lens.id, lens.name])),
    [lenses],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const [cameraRes, lensRes] = await Promise.all([
          api.listCameras(),
          api.listLenses().catch(async () => ({ items: await readCachedLenses(user) })),
        ]);
        if (!active) return;
        setItems(cameraRes.items);
        setLenses(lensRes.items);
      } catch (e) {
        if (!active) return;
        const [cachedCameras, cachedLenses] = await Promise.all([
          readCachedCameras(user),
          readCachedLenses(user),
        ]);
        if (!active) return;
        if (cachedCameras.length > 0 || shouldSuppressOfflineLoadError(user)) {
          setItems(cachedCameras);
          setLenses(cachedLenses);
          return;
        }
        setLoadError(e instanceof Error ? e.message : "Failed to load cameras");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [connectivityState.transportStatus, user]);

  const sortedItems = useMemo(
    () => sortGearItemsByDisplayName(items, (camera) => formatCameraDisplayName(camera)),
    [items],
  );

  const setCameraEditFilmType = (next: CameraFilmType) => {
    setEditFilmType(next);
    setEditShutter(next === "roll" ? createEnabledShutterState() : createDisabledShutterState());
  };

  const startEdit = (c: Camera) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditMaker(c.maker ?? "");
    setEditFilmType(c.film_type === "sheet" ? "sheet" : c.film_type === "roll" ? "roll" : "unspecified");
    setEditShutter(getShutterStateFromCamera(c));
    setSaveError(null);
  };

  const cancelEdit = () => { setEditingId(null); setSaveError(null); };

  const handleSave = async (e: FormEvent, id: string) => {
    e.preventDefault();
    setSaveError(null);
    const shutterError = validateShutterRange(editShutter);
    if (shutterError) {
      setSaveError(shutterError);
      return;
    }
    setSaving(true);
    try {
      const normalizedFilmType = getCameraPayloadForForm(editFilmType);
      const updated = await api.updateCamera(id, {
        name: editName,
        maker: editMaker || undefined,
        film_type: normalizedFilmType,
        ...getShutterPayload(editShutter),
      });
      setItems(cs => cs.map(c => c.id === id ? updated : c));
      setEditingId(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Cameras</h1>
        <Link className="btn-primary" to="/app/gear/cameras/new">Add camera</Link>
      </div>
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No cameras yet.</p>}
      <ul className="gear-list">
        {sortedItems.map((c) => (
          <li key={c.id} className="gear-row gear-row--linked">
            {editingId === c.id ? (
              <form onSubmit={e => handleSave(e, c.id)} className="inline-form" style={{ flex: 1 }}>
                {saveError && <p className="form-error" style={{ width: "100%", margin: 0 }}>{saveError}</p>}
                <input placeholder="Name" value={editName} onChange={e => setEditName(e.target.value)} required />
                <input placeholder="Maker (optional)" value={editMaker} onChange={e => setEditMaker(e.target.value)} />
                <select
                  value={editFilmType}
                  onChange={e => setCameraEditFilmType(e.target.value as CameraFilmType)}
                >
                  <option value="unspecified">Unspecified film</option>
                  <option value="sheet">Sheet film</option>
                  <option value="roll">Roll film</option>
                </select>
                <ShutterFields
                  label="Camera has shutter"
                  prefix={`camera-edit-${c.id}`}
                  state={editShutter}
                  onToggle={(next) => setEditShutter(next ? createEnabledShutterState() : createDisabledShutterState())}
                  onMinChange={(next) => setEditShutter(prev => ({ ...prev, minShutterSpeed: next }))}
                  onMaxChange={(next) => setEditShutter(prev => ({ ...prev, maxShutterSpeed: next }))}
                  onSupportsBulbChange={(next) => setEditShutter(prev => ({ ...prev, supportsBulb: next }))}
                />
                <CameraCompatibilitySummary camera={c} lensNameById={lensNameById} />
                <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                <button type="button" onClick={cancelEdit}>Cancel</button>
              </form>
            ) : (
              <>
                <Link className="gear-row-link" to={CAMERA_EDIT_PATH(c.id)}>
                  <span className="gear-name">{formatCameraDisplayName(c)}</span>
                  <span className="gear-meta">
                    {[
                      formatCameraFilmType(c.film_type),
                      getShutterCapabilityText(c.has_shutter, c.min_shutter_speed_seconds, c.max_shutter_speed_seconds, c.supports_bulb),
                    ]
                      .filter((value) => Boolean(value))
                      .join(" · ")}
                  </span>
                </Link>
                <CameraCompatibilitySummary camera={c} lensNameById={lensNameById} />
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LensesSection() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const [items, setItems] = useState<Lens[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLensType, setEditLensType] = useState<LensType>("prime");
  const [editMinFocalLength, setEditMinFocalLength] = useState("");
  const [editMaxFocalLength, setEditMaxFocalLength] = useState("");
  const [editMinFStop, setEditMinFStop] = useState("");
  const [editMaxFStop, setEditMaxFStop] = useState("");
  const [editApertureIncrement, setEditApertureIncrement] = useState<ApertureIncrement>("full");
  const [editApplicableCameraIds, setEditApplicableCameraIds] = useState<string[]>([]);
  const [editShutter, setEditShutter] = useState<ShutterState>(createDisabledShutterState());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const cameraNameById = useMemo(
    () => new Map(cameras.map((camera) => [camera.id, formatCameraDisplayName(camera)])),
    [cameras],
  );

  const parseNumeric = (value: string) => {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  };

  const formatFocalLength = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return "";
    return Number.isInteger(value) ? String(value) : String(Number.parseFloat(value.toFixed(3)));
  };

  const toNumericOrUndefined = (value: string) => {
    const n = parseNumeric(value);
    return n == null ? undefined : n;
  };

  const formatApertureFStop = (
    value: number | null | undefined,
    fallback: number | null | undefined,
  ) => {
    const normalized = value == null ? fallback : value;
    return normalized == null ? "" : `f/${normalized}`;
  };

  const validateFocalLengthRange = (localMin: string, localMax: string, type: LensType) => {
    const hasMin = localMin.trim() !== "";
    const hasMax = localMax.trim() !== "";
    if (!hasMin) return "Provide focal length.";
    const min = parseNumeric(localMin);
    if (min == null) return "Invalid focal length value.";
    if (min <= 0) return "Focal length values must be greater than zero.";
    if (type === "zoom") {
      if (!hasMax) return "Provide both min and max focal lengths.";
      const max = parseNumeric(localMax);
      if (max == null) return "Invalid focal length value.";
      if (max <= 0) return "Focal length values must be greater than zero.";
      if (max < min) return "Max focal length must be greater than or equal to min focal length.";
    }
    return null;
  };

  const validateApertureRange = (localMin: string, localMax: string, localIncrement: string) => {
    const hasMin = localMin.trim() !== "";
    const hasMax = localMax.trim() !== "";
    if (!hasMin && !hasMax) return null;
    if (!hasMin || !hasMax) return "Provide both min and max aperture values.";
    const minVal = parseNumeric(localMin);
    const maxVal = parseNumeric(localMax);
    if (minVal == null || maxVal == null) return "Invalid aperture value.";
    if (minVal <= 0 || maxVal <= 0) return "Aperture values must be greater than zero.";
    if (maxVal < minVal) return "Max aperture must be greater than or equal to min aperture.";
    if (!isApertureIncrementAllowed(localIncrement)) return "Aperture increment must be full, half, or third stop.";
    return null;
  };

  const getFocalRangePayload = (type: LensType, localMin: string, localMax: string) => {
    const min = parseNumeric(localMin);
    if (min == null) return null;
    if (type === "prime") return { minFocalLength: min, maxFocalLength: min };
    const max = parseNumeric(localMax);
    if (max == null) return null;
    return { minFocalLength: min, maxFocalLength: max };
  };

  useEffect(() => {
    Promise.all([
      api.listLenses(),
      api.listCameras().catch(async () => ({ items: await readCachedCameras(user) })),
    ])
      .then(([lensRes, cameraRes]) => {
        setItems(lensRes.items);
        setCameras(cameraRes.items);
      })
      .catch(async e => {
        const [cachedLenses, cachedCameras] = await Promise.all([
          readCachedLenses(user),
          readCachedCameras(user),
        ]);
        if (cachedLenses.length > 0 || shouldSuppressOfflineLoadError(user)) {
          setItems(cachedLenses);
          setCameras(cachedCameras);
          return;
        }
        setLoadError(e.message);
      })
      .finally(() => setLoading(false));
  }, [connectivityState.transportStatus, user]);

  const sortedItems = useMemo(
    () => sortGearItemsByDisplayName(items, (lens) => lens.name),
    [items],
  );

  const startEdit = (l: Lens) => {
    const minFocal = l.min_focal_length_mm ?? l.focal_length_mm;
    const maxFocal = l.max_focal_length_mm ?? l.focal_length_mm;
    setEditingId(l.id);
    setEditName(l.name);
    setEditMinFocalLength(formatFocalLength(minFocal));
    setEditMaxFocalLength(formatFocalLength(maxFocal));
    setEditLensType(
      minFocal != null && maxFocal != null && minFocal === maxFocal ? "prime" : "zoom",
    );
    setEditMinFStop(l.min_f_stop != null ? String(l.min_f_stop) : String(DEFAULT_APERTURE_MIN_F_STOP));
    setEditMaxFStop(l.max_f_stop != null ? String(l.max_f_stop) : String(DEFAULT_APERTURE_MAX_F_STOP));
    setEditApertureIncrement(normalizeApertureIncrement(l.aperture_increment));
    setEditApplicableCameraIds(normalizeLensIds(l.applicable_camera_ids));
    setEditShutter(getShutterStateFromLens(l));
    setSaveError(null);
  };

  const cancelEdit = () => { setEditingId(null); setSaveError(null); };

  const handleSave = async (e: FormEvent, id: string) => {
    e.preventDefault();
    setSaveError(null);
    const focalRangeError = validateFocalLengthRange(editMinFocalLength, editMaxFocalLength, editLensType);
    if (focalRangeError) {
      setSaveError(focalRangeError);
      return;
    }
    const rangeError = validateApertureRange(editMinFStop, editMaxFStop, editApertureIncrement);
    if (rangeError) {
      setSaveError(rangeError);
      return;
    }
    const shutterRangeError = validateShutterRange(editShutter);
    if (shutterRangeError) {
      setSaveError(shutterRangeError);
      return;
    }
    const focalPayload = getFocalRangePayload(editLensType, editMinFocalLength, editMaxFocalLength);
    if (!focalPayload) {
      setSaveError("Invalid focal length values.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateLens(id, {
        name: editName,
        min_focal_length_mm: focalPayload.minFocalLength,
        max_focal_length_mm: focalPayload.maxFocalLength,
        min_f_stop: toNumericOrUndefined(editMinFStop),
        max_f_stop: toNumericOrUndefined(editMaxFStop),
        aperture_increment: editApertureIncrement,
        ...getShutterPayload(editShutter),
        applicable_camera_ids: editApplicableCameraIds,
      });
      setItems(ls => ls.map(l => l.id === id ? updated : l));
      setEditingId(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Lenses</h1>
        <Link className="btn-primary" to="/app/gear/lenses/new">Add lens</Link>
      </div>
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No lenses yet.</p>}
      <ul className="gear-list">
        {sortedItems.map((l) => (
          <li key={l.id} className="gear-row gear-row--linked lens-row">
            {editingId === l.id ? (
              <form onSubmit={e => handleSave(e, l.id)} className="inline-form lens-form lens-form--editing">
                {saveError && <p className="form-error" style={{ width: "100%", margin: 0 }}>{saveError}</p>}
                <div className="lens-form-group">
                  <span className="lens-form-group-title">Lens</span>
                  <div className="lens-form-grid">
                    <label className="field lens-form-field--wide" htmlFor={`lens-edit-name-${l.id}`}>
                      <span>Name</span>
                      <input
                        id={`lens-edit-name-${l.id}`}
                        placeholder="Name"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        required
                      />
                    </label>
                    <label className="field lens-form-field--wide" htmlFor={`lens-edit-focal-type-${l.id}`}>
                      <span>Lens type</span>
                      <select
                        id={`lens-edit-focal-type-${l.id}`}
                        value={editLensType}
                        onChange={e => {
                          const nextType = e.target.value as LensType;
                          setEditLensType(nextType);
                          if (nextType === "prime") {
                            setEditMaxFocalLength(editMinFocalLength);
                          } else if (!editMaxFocalLength) {
                            setEditMaxFocalLength(editMinFocalLength);
                          }
                        }}
                      >
                        <option value="prime">Prime</option>
                        <option value="zoom">Zoom</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="lens-form-group">
                  <span className="lens-form-group-title">Focal range</span>
                  <div className="lens-form-grid">
                    <label className="field" htmlFor={`lens-edit-min-focal-length-mm-${l.id}`}>
                      <span>{editLensType === "prime" ? "Focal length" : "Min focal length"}</span>
                      <input
                        id={`lens-edit-min-focal-length-mm-${l.id}`}
                        placeholder="Focal length mm"
                        type="number"
                        value={editMinFocalLength}
                        onChange={e => {
                          const value = e.target.value;
                          setEditMinFocalLength(value);
                          if (editLensType === "prime") setEditMaxFocalLength(value);
                        }}
                      />
                    </label>
                    {editLensType === "zoom" && (
                      <label className="field" htmlFor={`lens-edit-max-focal-length-mm-${l.id}`}>
                        <span>Max focal length</span>
                        <input
                          id={`lens-edit-max-focal-length-mm-${l.id}`}
                          placeholder="Max focal length mm"
                          type="number"
                          value={editMaxFocalLength}
                          onChange={e => setEditMaxFocalLength(e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                </div>
                <div className="lens-form-group">
                  <span className="lens-form-group-title">Aperture</span>
                  <div className="lens-form-grid">
                    <label className="field" htmlFor={`lens-edit-min-f-stop-${l.id}`}>
                      <span>Min f-stop</span>
                      <input
                        id={`lens-edit-min-f-stop-${l.id}`}
                        placeholder="Min f-stop"
                        type="number"
                        step="any"
                        value={editMinFStop}
                        onChange={e => setEditMinFStop(e.target.value)}
                      />
                    </label>
                    <label className="field" htmlFor={`lens-edit-max-f-stop-${l.id}`}>
                      <span>Max f-stop</span>
                      <input
                        id={`lens-edit-max-f-stop-${l.id}`}
                        placeholder="Max f-stop"
                        type="number"
                        step="any"
                        value={editMaxFStop}
                        onChange={e => setEditMaxFStop(e.target.value)}
                      />
                    </label>
                    <label className="field lens-form-field--stretch" htmlFor={`lens-edit-aperture-increment-${l.id}`}>
                      <span>Aperture increment</span>
                      <select
                        id={`lens-edit-aperture-increment-${l.id}`}
                        value={editApertureIncrement}
                        onChange={e => setEditApertureIncrement(e.target.value as ApertureIncrement)}
                      >
                        {APERTURE_INCREMENT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                </label>
              </div>
            </div>
                <ShutterFields
                  label="Lens has shutter"
                  prefix={`lens-edit-${l.id}`}
                  state={editShutter}
                  onToggle={(next) => setEditShutter(next ? createEnabledShutterState() : createDisabledShutterState())}
                  onMinChange={(next) => setEditShutter(prev => ({ ...prev, minShutterSpeed: next }))}
                  onMaxChange={(next) => setEditShutter(prev => ({ ...prev, maxShutterSpeed: next }))}
                  onSupportsBulbChange={(next) => setEditShutter(prev => ({ ...prev, supportsBulb: next }))}
                />
            <LensApplicabilityList
              allLabelText="Applies to all cameras"
              allLabelId={`lens-edit-applicable-cameras-${l.id}-all`}
              labelText="Applicable cameras (optional)"
              selectedIds={editApplicableCameraIds}
              items={cameras}
                  onChange={setEditApplicableCameraIds}
                />
                <div className="form-actions lens-form-actions">
                  <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                  <button type="button" onClick={cancelEdit}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <Link className="gear-row-link" to={LENS_EDIT_PATH(l.id)}>
                  <span className="gear-name">{l.name}</span>
                  <span className="gear-meta lens-meta">
                    <span className="lens-meta-chip lens-meta-chip--primary">{getLensCameraMetaText(l, cameraNameById)}</span>
                    <span className="lens-meta-chip lens-meta-chip--primary">{getLensFocalDisplay(l)}</span>
                    {(formatApertureFStop(l.min_f_stop, DEFAULT_APERTURE_MIN_F_STOP) || formatApertureFStop(l.max_f_stop, DEFAULT_APERTURE_MAX_F_STOP)) && (
                      <span className="lens-meta-chip">
                        {[
                          formatApertureFStop(l.min_f_stop, DEFAULT_APERTURE_MIN_F_STOP),
                          formatApertureFStop(l.max_f_stop, DEFAULT_APERTURE_MAX_F_STOP),
                        ].filter(Boolean).join(" – ")}
                      </span>
                    )}
                    {getShutterCapabilityText(l.has_shutter, l.min_shutter_speed_seconds, l.max_shutter_speed_seconds, l.supports_bulb) && (
                      <span className="lens-meta-chip">
                        {getShutterCapabilityText(l.has_shutter, l.min_shutter_speed_seconds, l.max_shutter_speed_seconds, l.supports_bulb)}
                      </span>
                    )}
                    {l.aperture_increment ? (
                      <span className="lens-meta-chip">
                        {getApertureIncrementLabel(String(l.aperture_increment))}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FiltersSection() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const [items, setItems] = useState<Filter[]>([]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FilterFormDraft>(() => createEmptyFilterDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lensNameById = useMemo(() => new Map(lenses.map((lens) => [lens.id, lens.name])), [lenses]);
  const sortedItems = useMemo(
    () => sortGearItemsByDisplayName(items, (filter) => formatFilterDisplayLabel(filter)),
    [items],
  );

  useEffect(() => {
    Promise.all([
      api.listFilters(),
      api.listLenses().catch(async () => ({ items: await readCachedLenses(user) })),
    ])
      .then(([filterRes, lensRes]) => {
        setItems(filterRes.items);
        setLenses(lensRes.items);
      })
      .catch(async e => {
        const [cachedFilters, cachedLenses] = await Promise.all([
          readCachedFilters(user),
          readCachedLenses(user),
        ]);
        if (cachedFilters.length > 0 || shouldSuppressOfflineLoadError(user)) {
          setItems(cachedFilters);
          setLenses(cachedLenses);
          return;
        }
        setLoadError(e.message);
      })
      .finally(() => setLoading(false));
  }, [connectivityState.transportStatus, user]);

  const startEdit = (f: Filter) => {
    setEditingId(f.id);
    setEditDraft(filterDraftFromFilter(f));
    setSaveError(null);
  };

  const cancelEdit = () => { setEditingId(null); setSaveError(null); };

  const handleSave = async (e: FormEvent, id: string) => {
    e.preventDefault();
    setSaveError(null);
    const nextName = editDraft.name.trim();
    const nextFilterFactor = parseFilterFactorInput(editDraft.filterFactor);
    if (!nextName) {
      setSaveError("Name is required.");
      return;
    }
    if (nextFilterFactor === null) {
      setSaveError("Filter factor must be a positive number.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateFilter(id, buildFilterUpdatePayload(editDraft, lenses));
      setItems(fs => fs.map(f => f.id === id ? updated : f));
      setEditingId(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Filters</h1>
        <Link className="btn-primary" to="/app/gear/filters/new">Add filter</Link>
      </div>
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No filters yet.</p>}
      <ul className="gear-list">
        {sortedItems.map((f) => {
          const lensMeta = getFilterLensMetaText(f, lensNameById);
          return (
            <li key={f.id} className="gear-row gear-row--linked">
              {editingId === f.id ? (
                <form onSubmit={e => handleSave(e, f.id)} className="inline-form lens-form lens-form--editing" style={{ flex: 1 }}>
                  {saveError && <p className="form-error" style={{ width: "100%", margin: 0 }}>{saveError}</p>}
                  <FilterFormFields draft={editDraft} onChange={setEditDraft} lenses={lenses} />
                  <div className="form-actions lens-form-actions">
                    <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                    <button type="button" onClick={cancelEdit}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <Link className="gear-row-link" to={FILTER_EDIT_PATH(f.id)}>
                    <span className="gear-name">{formatFilterDisplayLabel(f)}</span>
                    <span className="gear-meta">
                      {[formatFilterFactor(f.filter_factor), lensMeta]
                        .filter((value): value is string => Boolean(value))
                        .join(" · ")}
                    </span>
                  </Link>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilmStocksSection() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const [items, setItems] = useState<FilmStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usingOfflineCache, setUsingOfflineCache] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setUsingOfflineCache(false);

    api.listFilmStocks()
      .then(r => {
        if (!active) return;
        setItems(r.items);
      })
      .catch(async e => {
        const cached = await readCachedFilmStocks(user);
        if (!active) return;
        if (cached.length > 0 || shouldSuppressOfflineLoadError(user)) {
          setItems(cached);
          setUsingOfflineCache(true);
          return;
        }
        setItems([]);
        setLoadError(e instanceof Error ? e.message : "Failed to load film stocks");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [connectivityState.transportStatus, user]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Film Stocks</h1>
          <p className="page-count">Select a stock to review details and development profiles.</p>
        </div>
        <Link className="btn-primary" to={FILM_STOCK_NEW_PATH}>Add film stock</Link>
      </div>
      {loading && <p className="muted">Loading…</p>}
      {usingOfflineCache && <p className="field-note">Showing cached film stocks because the API is unavailable.</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No film stocks yet.</p>}
      <ul className="gear-list">
        {items.map((f) => {
          const metaText = [f.iso != null ? `ISO ${f.iso}` : null, f.process].filter(Boolean).join(" · ");

          return (
            <li key={f.id} className="gear-row film-stock-row">
              <Link className="film-stock-row-link" to={FILM_STOCK_DETAIL_PATH(f.id)}>
                <span className="gear-name">{f.name}</span>
                <span className="gear-meta film-stock-row-meta">
                  <span className={`film-stock-type-badge film-stock-type-badge--${f.stock_type}`}>
                    {formatFilmStockTypeLabel(f.stock_type)}
                  </span>
                  {metaText && <span className="film-stock-row-meta-text">{metaText}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RollsSection() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const preferredTimeZone = usePreferredTimeZone();
  const [items, setItems] = useState<Roll[]>([]);
  const [films, setFilms] = useState<FilmStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.listRolls(),
      api.listFilmStocks().catch(async () => ({ items: await readCachedFilmStocks(user) })),
    ])
      .then(([rollsRes, filmsRes]) => {
        setItems(rollsRes.items);
        setFilms(filmsRes.items);
      })
      .catch(async e => {
        const [cachedRolls, cachedFilms] = await Promise.all([
          readCachedRolls(user),
          readCachedFilmStocks(user),
        ]);
        if (cachedRolls.length > 0 || shouldSuppressOfflineLoadError(user)) {
          setItems(cachedRolls);
          setFilms(cachedFilms);
          return;
        }
        setLoadError(e.message);
      })
      .finally(() => setLoading(false));
  }, [connectivityState.transportStatus, user]);

  const markFinished = async (roll: Roll) => {
    try {
      const payload = { finished_at: new Date().toISOString() };
      const updated = connectivityState.transportStatus === "offline" && user
        ? await queueOfflineRollAction(user, roll, "finish", payload)
        : await api.finishRoll(roll.id, payload);
      setItems((rs) => rs.map((r) => (r.id === roll.id ? updated : r)));
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to mark roll finished");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Rolls</h1>
        <Link className="btn-primary" to={ROLL_NEW_PATH}>Add roll</Link>
      </div>
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {actionError && <p className="form-error">{actionError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No rolls yet.</p>}
      <ul className="gear-list">
        {items.map(r => {
          const filmName = r.film_id ? films.find(f => f.id === r.film_id)?.name : null;
          return (
            <li key={r.id} className="gear-row roll-row">
              <Link className="roll-row-link" to={ROLL_DETAIL_PATH(r.id)}>
                <span className="gear-name">{r.name}</span>
                <span className="roll-row-meta">
                  {filmName && <span className="gear-meta roll-row-film">{filmName}</span>}
                  <span className={`gear-status gear-status--${getRollStatusClassName(r.status)}`}>
                    {formatRollStatusLabel(r.status)}
                  </span>
                  <span
                    className={`roll-push-pull-badge roll-push-pull-badge--${
                      r.push_pull_stops > 0 ? "push" : r.push_pull_stops < 0 ? "pull" : "normal"
                    }`}
                  >
                    {formatRollPushPullLabel(r.push_pull_stops)}
                  </span>
                </span>
                <span className="roll-row-lifecycle">{formatRollLifecycleText(r, preferredTimeZone)}</span>
              </Link>
              {r.status === "exposing" && !r.finished_at && (
                <button className="link-btn" onClick={() => markFinished(r)}>Mark finished</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilmHoldersSection() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const preferredTimeZone = usePreferredTimeZone();
  const [items, setItems] = useState<FilmHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.listFilmHolders()
      .then(r => setItems(r.items))
      .catch(async e => {
        const cached = await readCachedFilmHolders(user);
        if (cached.length > 0 || shouldSuppressOfflineLoadError(user)) {
          setItems(cached);
          return;
        }
        setLoadError(e.message);
      })
      .finally(() => setLoading(false));
  }, [connectivityState.transportStatus, user]);

  const sortedItems = useMemo(
    () => sortGearItemsByDisplayName(items, (holder) => holder.name),
    [items],
  );

  const formatFilmHolderListLoadSummary = (load: FilmHolder["current_load"]) => {
    if (!load) return "No active load";
    const filmName = getFilmHolderLoadFilmName(load);
    const timestamp = formatDateTimeDisplay(getFilmHolderLoadTimestamp(load), preferredTimeZone);
    return [filmName, timestamp].filter(Boolean).join(" · ") || "Active load";
  };

  return (
    <div>
      <div className="page-header">
        <h1>Film Holders</h1>
        <Link className="btn-primary" to={FILM_HOLDER_NEW_PATH}>Add film holder</Link>
      </div>
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No film holders yet.</p>}
      <ul className="gear-list">
        {sortedItems.map(h => {
          const load = h.current_load ?? null;
          const loadSummary = formatFilmHolderListLoadSummary(load);
          const thumbnailUrl = getFilmHolderLoadPhotographThumbnailUrl(load);
          const thumbnail = load?.exposed_photograph?.reference_image ?? null;
          return (
            <li key={h.id} className={`gear-row gear-row--linked film-holder-row${thumbnailUrl ? " film-holder-row--with-thumb" : ""}`}>
              <Link className="gear-row-link film-holder-row-link" to={FILM_HOLDER_EDIT_PATH(h.id)}>
                <span className="gear-name">{h.name}</span>
                <span className="gear-meta">
                  {[h.type, h.brand, h.capacity != null ? `${h.capacity} sheets` : null]
                    .filter(Boolean).join(" · ")}
                </span>
                <span className="film-holder-row-state">
                  <span className={`gear-status gear-status--${getFilmHolderLoadTone(load)}`}>
                    {formatFilmHolderLoadStatusLabel(load?.status ?? "empty")}
                  </span>
                  <span className="film-holder-row-state-text">{loadSummary}</span>
                </span>
              </Link>
              {thumbnailUrl && (
                <Link className="film-holder-row-thumb" to={FILM_HOLDER_EDIT_PATH(h.id)} aria-label={`Open ${h.name}`}>
                  <img
                    src={thumbnailUrl}
                    alt={getFilmHolderLoadPhotographAlt(load)}
                    width={thumbnail?.thumbnail_width ?? thumbnail?.width ?? undefined}
                    height={thumbnail?.thumbnail_height ?? thumbnail?.height ?? undefined}
                    loading="lazy"
                    decoding="async"
                  />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function GearPage({ section }: { section: Section }) {
  return (
    <div className="page">
      {section === "cameras" && <CamerasSection />}
      {section === "lenses" && <LensesSection />}
      {section === "filters" && <FiltersSection />}
      {section === "film_stocks" ? <FilmStocksSection /> : null}
      {section === "rolls" && <RollsSection />}
      {section === "film_holders" && <FilmHoldersSection />}
    </div>
  );
}
