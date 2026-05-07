import { buildPhotographImageUploadFormData, type PreparedPhotographImageUpload } from "../photoImageUpload";

const TOKEN_KEY = "pt_token";
const READ_REQUEST_TIMEOUT_MS = 2_500;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function downloadAuthenticatedBlob(path: string): Promise<Blob> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(
      new Error((body as { error?: string }).error ?? res.statusText),
      { status: res.status },
    );
  }

  return res.blob();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestWithAuth<T>(path, init, true);
}

async function requestPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestWithAuth<T>(path, init, false);
}

async function requestWithAuth<T>(path: string, init: RequestInit = {}, includeAuth = true): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (init.body != null && !(init.body instanceof FormData)) {
    headers["content-type"] = "application/json";
  }
  if (includeAuth && token) headers["authorization"] = `Bearer ${token}`;

  const res = await fetchWithReadTimeout(`/api${path}`, { ...init, headers });

  if (res.status === 204) return undefined as unknown as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = Object.assign(
      new Error((body as { error?: string }).error ?? res.statusText),
      { status: res.status },
    );
    throw err;
  }

  return res.json() as Promise<T>;
}

function isReadRequest(init: RequestInit) {
  return (init.method ?? "GET").toUpperCase() === "GET" && init.body == null;
}

async function fetchWithReadTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  if (!isReadRequest(init) || typeof AbortController === "undefined") {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const externalSignal = init.signal;
  let timeoutTriggered = false;
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  const timeout = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort(new Error("Request timed out"));
  }, READ_REQUEST_TIMEOUT_MS);

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timeoutTriggered) {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

// ── Domain types ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  default_timezone: string | null;
  auto_use_current_location: boolean;
  created_at: string;
  updated_at: string;
}

export interface HealthCheckResponse {
  ok: boolean;
  service: string;
}

export interface UpdateMePayload {
  email?: string;
  current_password?: string;
  default_timezone?: string | null;
  auto_use_current_location?: boolean;
}

export interface UpdatePasswordPayload {
  current_password: string;
  new_password: string;
}

export type ApertureIncrement = "full" | "half" | "third";
export type CameraFilmType = "sheet" | "roll" | null;
export type RollFormat = "35mm" | "120" | "220" | "127" | "620";
export type FilmStockType =
  | "color_negative"
  | "bw"
  | "color_slide"
  | "bw_slide"
  | "color_infrared"
  | "bw_infrared"
  | "other";
export type FilmSpectralResponseKey =
  | "generic_panchromatic"
  | "modern_panchromatic"
  | "classic_panchromatic"
  | "orthopanchromatic"
  | "orthochromatic"
  | "extended_red"
  | "near_infrared";

export interface Camera {
  id: string;
  user_id: string;
  name: string;
  maker: string | null;
  film_type: CameraFilmType;
  roll_format: RollFormat | null;
  frame_format?: string | null;
  frame_width_mm?: number | null;
  frame_height_mm?: number | null;
  has_bellows: boolean;
  has_shutter: boolean;
  min_shutter_speed_seconds: number | null;
  max_shutter_speed_seconds: number | null;
  supports_bulb: boolean;
  acceptable_lens_ids?: string[];
  created_at: string;
}

export interface CameraWritePayload {
  name?: string;
  maker?: string;
  film_type?: CameraFilmType;
  roll_format?: RollFormat | null;
  frame_format?: string | null;
  frame_width_mm?: number | null;
  frame_height_mm?: number | null;
  has_bellows?: boolean;
  has_shutter?: boolean;
  min_shutter_speed_seconds?: number | null;
  max_shutter_speed_seconds?: number | null;
  supports_bulb?: boolean;
}

export interface Lens {
  id: string;
  user_id: string;
  name: string;
  has_shutter: boolean;
  min_shutter_speed_seconds: number | null;
  max_shutter_speed_seconds: number | null;
  supports_bulb: boolean;
  min_focal_length_mm?: number | null;
  max_focal_length_mm?: number | null;
  focal_length_mm?: number | null;
  max_aperture: string | null;
  min_f_stop: number | null;
  max_f_stop: number | null;
  aperture_increment: ApertureIncrement | null;
  flare_factor: number;
  applicable_camera_ids?: string[];
  created_at: string;
}

export interface FilmStock {
  id: string;
  user_id: string;
  name: string;
  stock_type: FilmStockType;
  reciprocity_p_factor: number;
  spectral_response_preset?: FilmSpectralResponseKey | null;
  simulate_spectral_response?: boolean;
  iso: number | null;
  process: string | null;
  created_at: string;
}

export type DevelopmentProfileType = "simple" | "btzs";
export type BTZSChartPoint = Record<string, unknown>;

export interface BTZSChartData {
  title?: string | null;
  xAxisLabel?: string | null;
  yAxisLabel?: string | null;
  effectiveFilmSpeed?: number | null;
  effectiveFilmSpeedLabel?: string | null;
  points?: BTZSChartPoint[] | null;
  [key: string]: unknown;
}

export interface BTZSSourceFile {
  [key: string]: unknown;
}

export interface RawXdfMetadata {
  versionOrType: string | number;
  displayName: string;
  processLabel: string;
  paperES: number;
  reciprocityExpIndex: number;
  reciprocityGIndex: number;
  useReciprocity: number;
  filmISO?: string | number;
  unknownOrReciprocityFields?: [number, number, number];
  [key: string]: unknown;
}

export interface DevelopmentProfileBase {
  id: string;
  userId: string;
  filmStockId: string;
  type: DevelopmentProfileType;
  name: string;
  developerName: string;
  dilution: string | null;
  temperatureText: string;
  agitation: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimpleDevelopmentProfile extends DevelopmentProfileBase {
  type: "simple";
  timeText: string;
  nMinusTwoPercent: number;
  nMinusOnePercent: number;
  nPlusOnePercent: number;
  nPlusTwoPercent: number;
}

export interface BTZSDevelopmentProfile extends DevelopmentProfileBase {
  type: "btzs";
  filmIso: string | null;
  testDate: string | null;
  curvesText: string | null;
  flareDensityText: string | null;
  paperEsText: string | null;
  methodText: string | null;
  keyValuesText: string | null;
  rawXdf: RawXdfMetadata | null;
  chartData: BTZSChartData[] | null;
  sourceFiles: BTZSSourceFile[] | null;
}

export type DevelopmentProfile = SimpleDevelopmentProfile | BTZSDevelopmentProfile;

export interface SimpleDevelopmentProfileCreate {
  type: "simple";
  name: string;
  developerName: string;
  dilution?: string | null;
  temperatureText: string;
  agitation?: string | null;
  notes?: string | null;
  timeText: string;
  nMinusTwoPercent?: number | null;
  nMinusOnePercent?: number | null;
  nPlusOnePercent?: number | null;
  nPlusTwoPercent?: number | null;
}

export interface BTZSDevelopmentProfileCreate {
  type: "btzs";
  name: string;
  developerName: string;
  dilution?: string | null;
  temperatureText: string;
  agitation?: string | null;
  notes?: string | null;
  filmIso?: string | null;
  testDate?: string | null;
  curvesText?: string | null;
  flareDensityText?: string | null;
  paperEsText?: string | null;
  methodText?: string | null;
  keyValuesText?: string | null;
  rawXdf?: RawXdfMetadata | null;
  chartData?: BTZSChartData[] | null;
  sourceFiles?: BTZSSourceFile[] | null;
}

export type DevelopmentProfileCreate = SimpleDevelopmentProfileCreate | BTZSDevelopmentProfileCreate;

export interface DevelopmentProfileUpdate {
  name?: string;
  developerName?: string;
  dilution?: string | null;
  temperatureText?: string | null;
  agitation?: string | null;
  notes?: string | null;
  timeText?: string | null;
  nMinusTwoPercent?: number | null;
  nMinusOnePercent?: number | null;
  nPlusOnePercent?: number | null;
  nPlusTwoPercent?: number | null;
  filmIso?: string | null;
  testDate?: string | null;
  curvesText?: string | null;
  flareDensityText?: string | null;
  paperEsText?: string | null;
  methodText?: string | null;
  keyValuesText?: string | null;
  rawXdf?: RawXdfMetadata | null;
  chartData?: BTZSChartData[] | null;
  sourceFiles?: BTZSSourceFile[] | null;
}

export type RollStatus = "unexposed" | "exposing" | "finished" | "processed" | "developed";

export interface Roll {
  id: string;
  user_id: string;
  film_id: string | null;
  roll_format: RollFormat | null;
  name: string;
  loaded_at: string | null;
  finished_at: string | null;
  status: RollStatus;
  push_pull_stops: number;
  processed_at: string | null;
  developed_at: string | null;
  development_profile_id: string | null;
  development_notes: string | null;
  created_at: string;
}

export interface RollLifecycleWritePayload {
  finished_at?: string | null;
  processed_at?: string | null;
  developed_at?: string | null;
  development_profile_id?: string | null;
  development_notes?: string | null;
}

export interface RollWritePayload extends RollLifecycleWritePayload {
  name?: string;
  film_id?: string | null;
  roll_format?: RollFormat | null;
  loaded_at?: string | null;
  push_pull_stops?: number;
}

export type FilmHolderLoadStatus = "loaded" | "exposed" | "processed" | "discarded";

export interface DevelopmentProfileSummary {
  id: string;
  name: string | null;
}

export type FilmHolderLoadDevelopmentSummarySource = "stored-btzs-calculation" | "development-profile-time";

export interface FilmHolderLoadDevelopmentSummary {
  label: string;
  source: FilmHolderLoadDevelopmentSummarySource;
  minutes: number | null;
  time_text: string | null;
}

export interface FilmHolderLoadReferenceImageSummary {
  id: string;
  content_type: string;
  width: number | null;
  height: number | null;
  thumbnail_content_type: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  thumbnail_url: string | null;
  url: string | null;
}

export interface FilmHolderLoadPhotographSummary {
  id: string;
  title: string | null;
  frame_number: string | null;
  taken_at: string | null;
  camera_id: string | null;
  camera_name: string | null;
  lens_id: string | null;
  lens_name: string | null;
  aperture: string | null;
  shutter_speed: string | null;
  shutter_speed_seconds: number | null;
  shutter_mode: PhotographShutterMode;
  bulb_duration_seconds: number | null;
  exposure_entry_mode: ExposureEntryMode;
  reference_image: FilmHolderLoadReferenceImageSummary | null;
}

export interface PhotographLifecycleSummary {
  loaded_at: string | null;
  exposed_at: string | null;
  processed_at: string | null;
  developed_at: string | null;
  development_profile_name: string | null;
}

export interface FilmHolderLoad {
  id: string;
  user_id: string;
  film_holder_id: string;
  film_id: string | null;
  status: FilmHolderLoadStatus;
  loaded_at: string;
  exposed_at: string | null;
  exposed_photograph_id: string | null;
  processed_at: string | null;
  discarded_at: string | null;
  discarded_reason: string | null;
  development_profile_id: string | null;
  development_profile: DevelopmentProfileSummary | null;
  development_summary: FilmHolderLoadDevelopmentSummary | null;
  exposed_photograph: FilmHolderLoadPhotographSummary | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  film: FilmStock | null;
}

export interface FilmHolder {
  id: string;
  user_id: string;
  name: string;
  type: string;
  width_mm: number | null;
  height_mm: number | null;
  brand: string | null;
  capacity: number | null;
  applicable_camera_ids?: string[];
  created_at: string;
  current_load?: FilmHolderLoad | null;
  load_history?: FilmHolderLoad[];
}

export interface FilmHolderWritePayload {
  name?: string;
  type?: string;
  width_mm?: number | null;
  height_mm?: number | null;
  applicable_camera_ids?: string[];
}

export interface FilmHolderLoadDiscardPayload {
  reason?: string | null;
  notes?: string | null;
}

export interface FilterPreset {
  key: string;
  name: string;
  code?: string;
  filter_factor: number;
  category?: string;
  notes?: string | null;
}

export interface Filter {
  id: string;
  user_id: string;
  name: string;
  code: string | null;
  filter_factor: number;
  source: string | null;
  standard_key: string | null;
  notes: string | null;
  can_simulate_bw: boolean;
  simulation_rgb: string;
  simulation_strength: number;
  simulation_brightness_boost: number;
  applies_to_bw: boolean;
  applies_to_color: boolean;
  applies_to_infrared: boolean;
  applicable_lens_ids: string[];
  created_at: string;
  updated_at: string;
}

export type ExposureEntryMode = "manual" | "zone-metering" | "btzs-zone-metering" | "cell-camera";
export type PhotographShutterMode = "fixed" | "bulb";
export type ExposurePrecedence = "aperture" | "shutter";

export interface PhotographZoneMeteringCalculation {
  meteringSource?: "spot-meter" | "cell-camera" | string | null;
  cellCameraEV?: number | null;
  cellCameraCorrectionStops?: number | null;
  holdSide?: ExposurePrecedence;
  heldAperture?: string | null;
  heldShutterSpeed?: string | null;
  calculatedAperture?: number | null;
  calculatedShutterSeconds?: number | null;
  idealAperture?: number | null;
  idealShutterSeconds?: number | null;
  apertureChoice?: PhotographBtzsZoneMeteringApertureChoice | null;
  shutterChoice?: PhotographBtzsZoneMeteringShutterChoice | null;
  apertureStopError?: number | null;
  shutterStopError?: number | null;
  meterEV: number;
  meterISO: number;
  workingISO: number;
  profileId?: string | null;
  profileName?: string | null;
  profileType?: DevelopmentProfileType | null;
  sbr?: number | null;
  requiredG?: number | null;
  effectiveFilmSpeed?: number | null;
  developmentTimeMinutes?: number | null;
  developmentTimeSource?: string | null;
  simpleDevelopmentBaseMinutes?: number | null;
  simpleDevelopmentPercent?: number | null;
  targetZone: number;
  zoneAdjustedEV: number;
  targetEV: number;
  totalCompensationStops: number;
  bellowsCorrectionStops?: number;
  bellowsCorrection?: {
    mode?: string;
    extensionMm?: number | null;
    subjectDistanceM?: number | null;
    focalLengthMm?: number | null;
    stops?: number;
  } | null;
  aperture: string | null;
  shutterSpeed: string | null;
  rawShutterSpeedSeconds: number | null;
  finalShutterSpeedSeconds: number | null;
  shutterMode: PhotographShutterMode;
  bulbDurationSeconds: number | null;
  reciprocityApplied: boolean;
  warnings: string[];
  [key: string]: unknown;
}

export interface PhotographZoneMeteringDetails {
  zoneMetering: PhotographZoneMeteringCalculation;
}

export interface PhotographBtzsZoneMeteringApertureChoice {
  value: string;
  label: string;
  aperture: number;
  stopError: number;
  warning: string | null;
}

export interface PhotographBtzsZoneMeteringShutterChoice {
  value: string;
  label: string;
  seconds: number | null;
  stopError: number | null;
  warning: string | null;
}

export interface PhotographBtzsZoneMeteringCalculation {
  holdSide?: ExposurePrecedence;
  heldAperture?: string | null;
  heldShutterSpeed?: string | null;
  calculatedAperture?: number | null;
  calculatedShutterSeconds?: number | null;
  idealAperture?: number | null;
  idealShutterSeconds?: number | null;
  apertureStopError?: number | null;
  shutterStopError?: number | null;
  profileId: string | null;
  profileName: string | null;
  profileType?: DevelopmentProfileType | null;
  meterEV?: number;
  meterISO?: number;
  workingISO?: number;
  compensationStops?: number;
  bellowsCorrectionStops?: number;
  bellowsCorrection?: {
    mode?: string;
    extensionMm?: number | null;
    subjectDistanceM?: number | null;
    focalLengthMm?: number | null;
    stops?: number;
  } | null;
  filterStops?: number;
  filterIds?: string[];
  filterFactors?: number[];
  precedence?: ExposurePrecedence;
  readingThroughSelectedFilters?: boolean;
  lowEV: number;
  lowZone: number;
  highEV: number;
  highZone: number;
  evRange: number;
  zoneRange: number;
  sbr: number;
  paperEs: number;
  flareFactor?: number | null;
  requiredG: number;
  effectiveFilmSpeed: number;
  developmentTimeMinutes: number;
  developmentAdjustmentStops?: number | null;
  developmentTimeSource?: string | null;
  simpleDevelopmentBaseMinutes?: number | null;
  simpleDevelopmentPercent?: number | null;
  targetEVBeforeCompensation: number;
  targetEVAfterCompensation: number;
  aperture: string | null;
  shutterSpeed: string | null;
  rawShutterSpeedSeconds: number | null;
  finalShutterSpeedSeconds: number | null;
  shutterMode: PhotographShutterMode;
  bulbDurationSeconds: number | null;
  reciprocityApplied: boolean;
  warnings: string[];
  apertureChoice?: PhotographBtzsZoneMeteringApertureChoice | null;
  shutterChoice?: PhotographBtzsZoneMeteringShutterChoice | null;
  [key: string]: unknown;
}

export interface PhotographBtzsZoneMeteringDetails {
  btzsZoneMetering: PhotographBtzsZoneMeteringCalculation;
}

export type PhotographExposureDetails =
  | PhotographZoneMeteringDetails
  | PhotographBtzsZoneMeteringDetails;

export type PhotographExposureDetailsWrite =
  | PhotographExposureDetails
  | Record<string, never>
  | null;

export interface Photograph {
  id: string;
  user_id: string;
  roll_id: string | null;
  camera_id: string | null;
  lens_id: string | null;
  film_id: string | null;
  exposure_entry_mode: ExposureEntryMode;
  frame_number: string | null;
  taken_at: string | null;
  aperture: string | null;
  shutter_speed: string | null;
  shutter_speed_seconds: number | null;
  shutter_mode: PhotographShutterMode;
  bulb_duration_seconds: number | null;
  focal_length_mm: number | null;
  latitude: number | null;
  longitude: number | null;
  altitude_m: number | null;
  gps_accuracy_m: number | null;
  notes: string | null;
  title: string | null;
  film_holder_id: string | null;
  lifecycle_summary?: PhotographLifecycleSummary | null;
  filter_ids?: string[];
  filters?: Filter[];
  exposure_details: PhotographExposureDetails | null;
  created_at: string;
  updated_at: string;
  images?: { items: PhotographImage[] };
}

export interface PhotographWritePayload {
  roll_id?: string | null;
  camera_id?: string | null;
  lens_id?: string | null;
  film_id?: string | null;
  filter_ids?: string[];
  frame_number?: string | null;
  taken_at?: string | null;
  aperture?: string | null;
  shutter_speed?: string | null;
  shutter_speed_seconds?: number | null;
  shutter_mode?: PhotographShutterMode;
  bulb_duration_seconds?: number | null;
  exposure_entry_mode?: ExposureEntryMode;
  exposure_details?: PhotographExposureDetailsWrite;
  focal_length_mm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude_m?: number | null;
  gps_accuracy_m?: number | null;
  notes?: string | null;
  title?: string | null;
  film_holder_id?: string | null;
  confirm_reexposure?: boolean;
}

export interface FilterWritePayload {
  name?: string;
  filter_factor?: number;
  code?: string | null;
  standard_key?: string | null;
  notes?: string | null;
  applies_to_bw?: boolean;
  applies_to_color?: boolean;
  applies_to_infrared?: boolean;
  applicable_lens_ids?: string[];
}

export interface PhotographImage {
  id: string;
  photograph_id: string;
  content_type: string;
  width: number | null;
  height: number | null;
  thumbnail_content_type: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  thumbnail_url: string | null;
  original_content_type: string | null;
  original_width: number | null;
  original_height: number | null;
  original_filename: string | null;
  original_url: string | null;
  url: string | null;
  created_at: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  camera_count: number;
  lens_count: number;
  filter_count: number;
  film_stock_count: number;
  development_profile_count: number;
  film_holder_count: number;
  film_holder_load_count: number;
  roll_count: number;
  photograph_count: number;
  reference_image_count: number;
  last_photograph_at: string | null;
}

export interface AdminPhotographPreviewImage {
  id: string;
  content_type: string;
  width: number | null;
  height: number | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  thumbnail_url: string | null;
  url: string | null;
  created_at: string;
}

export interface AdminPhotographSummary {
  id: string;
  user_id: string;
  title: string | null;
  frame_number: string | null;
  taken_at: string | null;
  created_at: string;
  camera_id: string | null;
  camera_name: string | null;
  camera_maker: string | null;
  lens_id: string | null;
  lens_name: string | null;
  film_id: string | null;
  film_name: string | null;
  film_holder_id: string | null;
  film_holder_name: string | null;
  roll_id: string | null;
  roll_name: string | null;
  aperture: string | null;
  shutter_speed: string | null;
  shutter_mode: PhotographShutterMode | string | null;
  bulb_duration_seconds: number | null;
  notes: string | null;
  preview_image: AdminPhotographPreviewImage | null;
}

interface ListResponse<T> {
  items: T[];
  total: number;
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {
  health: () => requestPublic<HealthCheckResponse>("/health", { cache: "no-store" }),

  // Auth
  register: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>("/auth/me"),
  updateMe: (data: UpdateMePayload) =>
    request<User>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  updatePassword: (data: UpdatePasswordPayload) =>
    request<User>("/auth/password", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Gear — cameras
  listCameras: () => request<ListResponse<Camera>>("/gear/cameras"),
  getCamera: (id: string) => request<Camera>(`/gear/cameras/${id}`),
  createCamera: (data: CameraWritePayload & { name: string }) =>
    request<Camera>("/gear/cameras", { method: "POST", body: JSON.stringify(data) }),
  updateCamera: (id: string, data: CameraWritePayload) =>
    request<Camera>(`/gear/cameras/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCamera: (id: string) =>
    request<void>(`/gear/cameras/${id}`, { method: "DELETE" }),

  // Gear — film holders
  listFilmHolders: () => request<ListResponse<FilmHolder>>("/film/holders"),
  createFilmHolder: (data: FilmHolderWritePayload & { name: string }) =>
    request<FilmHolder>("/film/holders", { method: "POST", body: JSON.stringify(data) }),
  getFilmHolder: (id: string) => request<FilmHolder>(`/film/holders/${id}`),
  updateFilmHolder: (id: string, data: FilmHolderWritePayload) =>
    request<FilmHolder>(`/film/holders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  listFilmHolderLoads: (id: string) => request<ListResponse<FilmHolderLoad>>(`/film/holders/${id}/loads`),
  loadFilmHolder: (id: string, data: { film_id: string; notes?: string | null }) =>
    request<FilmHolder>(`/film/holders/${id}/loads`, { method: "POST", body: JSON.stringify(data) }),
  unloadFilmHolder: (id: string) =>
    request<FilmHolder>(`/film/holders/${id}/loads/current`, { method: "DELETE" }),
  discardFilmHolderLoad: (id: string, data?: FilmHolderLoadDiscardPayload) =>
    request<FilmHolder>(`/film/holders/${id}/loads/current/discard`, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),
  processFilmHolderLoad: (id: string, data?: { development_profile_id?: string | null; notes?: string | null }) =>
    request<FilmHolder>(`/film/holders/${id}/loads/current/process`, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),
  undoFilmHolderExposure: (id: string, data?: { clear_photograph_holder?: boolean }) =>
    request<FilmHolder>(`/film/holders/${id}/loads/current/undo-exposure`, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),
  unprocessFilmHolderLoad: (id: string, loadId: string) =>
    request<FilmHolder>(`/film/holders/${id}/loads/${loadId}/unprocess`, { method: "POST" }),
  deleteFilmHolder: (id: string) =>
    request<void>(`/film/holders/${id}`, { method: "DELETE" }),

  // Gear — lenses
  listLenses: () => request<ListResponse<Lens>>("/gear/lenses"),
  getLens: (id: string) => request<Lens>(`/gear/lenses/${id}`),
  createLens: (data: { name: string; focal_length_mm?: number; min_focal_length_mm?: number; max_focal_length_mm?: number; min_f_stop?: number; max_f_stop?: number; aperture_increment?: ApertureIncrement; flare_factor?: number; has_shutter?: boolean; min_shutter_speed_seconds?: number | null; max_shutter_speed_seconds?: number | null; supports_bulb?: boolean; applicable_camera_ids?: string[] }) =>
    request<Lens>("/gear/lenses", { method: "POST", body: JSON.stringify(data) }),
  updateLens: (id: string, data: { name?: string; focal_length_mm?: number; min_focal_length_mm?: number; max_focal_length_mm?: number; min_f_stop?: number; max_f_stop?: number; aperture_increment?: ApertureIncrement; flare_factor?: number; has_shutter?: boolean; min_shutter_speed_seconds?: number | null; max_shutter_speed_seconds?: number | null; supports_bulb?: boolean; applicable_camera_ids?: string[] }) =>
    request<Lens>(`/gear/lenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteLens: (id: string) =>
    request<void>(`/gear/lenses/${id}`, { method: "DELETE" }),

  // Gear — filters and presets
  listFilterPresets: () => request<{ items: FilterPreset[] }>("/gear/filter_presets"),
  listFilters: (params?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (params) {
      if (typeof params.limit === "number") p.set("limit", String(params.limit));
      if (typeof params.offset === "number") p.set("offset", String(params.offset));
    }
    const qs = p.toString() ? `?${p}` : "";
    return request<ListResponse<Filter>>(`/gear/filters${qs}`);
  },
  getFilter: (id: string) => request<Filter>(`/gear/filters/${id}`),
  createFilter: (data: FilterWritePayload) =>
    request<Filter>("/gear/filters", { method: "POST", body: JSON.stringify(data) }),
  updateFilter: (id: string, data: FilterWritePayload) =>
    request<Filter>(`/gear/filters/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteFilter: (id: string) =>
    request<void>(`/gear/filters/${id}`, { method: "DELETE" }),

  // Film stocks
  listFilmStocks: () => request<ListResponse<FilmStock>>("/film/stocks"),
  getFilmStock: (id: string) => request<FilmStock>(`/film/stocks/${id}`),
  createFilmStock: (data: { name: string; iso?: number; process?: string; stock_type?: FilmStockType; reciprocity_p_factor?: number; spectral_response_preset?: FilmSpectralResponseKey | null; simulate_spectral_response?: boolean }) =>
    request<FilmStock>("/film/stocks", { method: "POST", body: JSON.stringify(data) }),
  updateFilmStock: (id: string, data: { name?: string; iso?: number; process?: string; stock_type?: FilmStockType; reciprocity_p_factor?: number; spectral_response_preset?: FilmSpectralResponseKey | null; simulate_spectral_response?: boolean }) =>
    request<FilmStock>(`/film/stocks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteFilmStock: (id: string) =>
    request<void>(`/film/stocks/${id}`, { method: "DELETE" }),

  // Film stocks — development profiles
  listDevelopmentProfiles: (filmStockId: string, params?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (params) {
      if (typeof params.limit === "number") p.set("limit", String(params.limit));
      if (typeof params.offset === "number") p.set("offset", String(params.offset));
    }
    const qs = p.toString() ? `?${p}` : "";
    return request<ListResponse<DevelopmentProfile>>(`/film/stocks/${filmStockId}/development-profiles${qs}`);
  },
  createDevelopmentProfile: (filmStockId: string, data: DevelopmentProfileCreate) =>
    request<DevelopmentProfile>(`/film/stocks/${filmStockId}/development-profiles`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateDevelopmentProfile: (filmStockId: string, profileId: string, data: DevelopmentProfileUpdate) =>
    request<DevelopmentProfile>(`/film/stocks/${filmStockId}/development-profiles/${profileId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteDevelopmentProfile: (filmStockId: string, profileId: string) =>
    request<void>(`/film/stocks/${filmStockId}/development-profiles/${profileId}`, { method: "DELETE" }),

  // Backwards-compatible aliases
  listFilms: () => api.listFilmStocks(),
  createFilm: (data: { name: string; iso?: number; process?: string; stock_type?: FilmStockType; reciprocity_p_factor?: number; spectral_response_preset?: FilmSpectralResponseKey | null; simulate_spectral_response?: boolean }) => api.createFilmStock(data),
  updateFilm: (id: string, data: { name?: string; iso?: number; process?: string; stock_type?: FilmStockType; reciprocity_p_factor?: number; spectral_response_preset?: FilmSpectralResponseKey | null; simulate_spectral_response?: boolean }) => api.updateFilmStock(id, data),
  deleteFilm: (id: string) => api.deleteFilmStock(id),

  // Rolls
  listRolls: (params?: { film_id?: string; roll_format?: RollFormat }) => {
    const p = new URLSearchParams();
    if (params?.film_id) p.set("film_id", params.film_id);
    if (params?.roll_format) p.set("roll_format", params.roll_format);
    const qs = p.toString() ? `?${p}` : "";
    return request<ListResponse<Roll>>(`/film/rolls${qs}`);
  },
  getRoll: (id: string) => request<Roll>(`/film/rolls/${id}`),
  createRoll: (data: RollWritePayload & { name: string }) =>
    request<Roll>("/film/rolls", { method: "POST", body: JSON.stringify(data) }),
  updateRoll: (id: string, data: RollWritePayload) =>
    request<Roll>(`/film/rolls/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  finishRoll: (id: string, data?: { finished_at?: string | null }) =>
    request<Roll>(`/film/rolls/${id}/finish`, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),
  processRoll: (id: string, data?: {
    processed_at?: string | null;
    developed_at?: string | null;
    development_profile_id?: string | null;
    development_notes?: string | null;
  }) =>
    request<Roll>(`/film/rolls/${id}/process`, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),
  reopenRoll: (id: string) =>
    request<Roll>(`/film/rolls/${id}/reopen`, {
      method: "POST",
    }),
  deleteRoll: (id: string) =>
    request<void>(`/film/rolls/${id}`, { method: "DELETE" }),

  // Photographs
  listPhotographs: (params?: {
    roll_id?: string;
    camera_id?: string;
    lens_id?: string;
    film_id?: string;
    film_holder_id?: string;
    limit?: number;
    offset?: number;
  }) => {
    const p = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (typeof v === "number") {
          p.set(k, String(v));
        } else if (v) {
          p.set(k, v);
        }
      }
    }
    const qs = p.toString() ? `?${p}` : "";
    return request<ListResponse<Photograph>>(`/photographs${qs}`);
  },
  createPhotograph: (data: PhotographWritePayload) =>
    request<Photograph>("/photographs", { method: "POST", body: JSON.stringify(data) }),
  getPhotograph: (id: string) => request<Photograph>(`/photographs/${id}`),
  updatePhotograph: (id: string, data: PhotographWritePayload) =>
    request<Photograph>(`/photographs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePhotograph: (id: string) =>
    request<void>(`/photographs/${id}`, { method: "DELETE" }),

  // Photograph images
  listPhotographImages: (photoId: string) =>
    request<{ items: PhotographImage[] }>(`/photographs/${photoId}/images`),
  uploadPhotographImage: (photoId: string, upload: PreparedPhotographImageUpload) => {
    const form = buildPhotographImageUploadFormData(upload);
    return request<PhotographImage>(`/photographs/${photoId}/images`, {
      method: "POST",
      body: form,
    });
  },
  updatePhotographImageDisplay: (photoId: string, imageId: string, display: File) => {
    const form = new FormData();
    form.append("display", display, display.name);
    return request<PhotographImage>(`/photographs/${photoId}/images/${imageId}/display`, {
      method: "POST",
      body: form,
    });
  },
  deletePhotographImage: (photoId: string, imageId: string) =>
    request<void>(`/photographs/${photoId}/images/${imageId}`, { method: "DELETE" }),

  exportDataWorkbook: () => downloadAuthenticatedBlob("/export/xlsx"),

  // Admin
  adminListUsers: () => request<ListResponse<AdminUserSummary>>("/admin/users"),
  adminListUserPhotographs: (userId: string, params?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (typeof params?.limit === "number") p.set("limit", String(params.limit));
    if (typeof params?.offset === "number") p.set("offset", String(params.offset));
    const qs = p.toString() ? `?${p}` : "";
    return request<ListResponse<AdminPhotographSummary> & {
      user: Pick<User, "id" | "email">;
      limit: number;
      offset: number;
    }>(`/admin/users/${userId}/photos${qs}`);
  },
};
