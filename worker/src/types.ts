export interface User {
  id: string;
  email: string;
  email_verified_at: string | null;
  default_timezone: string | null;
  auto_use_current_location: boolean;
  created_at: string;
  updated_at: string;
}

export interface Camera {
  id: string;
  user_id: string;
  name: string;
  maker: string | null;
  film_type: 'sheet' | 'roll' | null;  // sheet for large format sheet film, roll for continuous film
  roll_format: RollFormat | null;  // optional roll media format for roll cameras
  frame_format: string | null;
  frame_width_mm: number | null;
  frame_height_mm: number | null;
  has_bellows: boolean;
  acceptable_lens_ids: string[];  // read-only compatibility summary; write through Lens.applicable_camera_ids
  has_shutter: boolean;
  min_shutter_speed_seconds: number | null;
  max_shutter_speed_seconds: number | null;
  supports_bulb: boolean;
  created_at: string;
}

export interface Lens {
  id: string;
  user_id: string;
  name: string;
  focal_length_mm: number | null;
  min_focal_length_mm: number | null;
  max_focal_length_mm: number | null;
  max_aperture: string | null;
  min_f_stop: number | null;
  max_f_stop: number | null;
  aperture_increment: string | null;
  flare_factor: number;
  has_shutter: boolean;
  min_shutter_speed_seconds: number | null;
  max_shutter_speed_seconds: number | null;
  supports_bulb: boolean;
  applicable_camera_ids?: string[];  // authoritative camera compatibility write surface
  created_at: string;
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
  applicable_lens_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface FilterLens {
  filter_id: string;
  lens_id: string;
  user_id: string;
  created_at: string;
}

export interface PhotographFilter {
  user_id: string;
  photograph_id: string;
  filter_id: string;
  position: number;
  created_at: string;
}

export interface CameraLens {
  camera_id: string;
  lens_id: string;
  user_id: string;
  created_at: string;
}

export type FilmStockType =
  | "color_negative"
  | "bw"
  | "color_slide"
  | "bw_slide"
  | "color_infrared"
  | "bw_infrared"
  | "other";

export interface FilmStock {
  id: string;
  user_id: string;
  name: string;
  iso: number | null;
  process: string | null;
  stock_type: FilmStockType;
  reciprocity_p_factor: number;
  spectral_response_preset: string | null;
  simulate_spectral_response: boolean;
  created_at: string;
}

export type BTZSChartData = Record<string, unknown>;
export type BTZSSourceFile = Record<string, unknown>;

export interface RawXdfMetadata {
  versionOrType: string | number;
  displayName: string;
  processLabel: string;
  paperES: number;
  reciprocityExpIndex: number;
  reciprocityGIndex: number;
  useReciprocity: number;
  [key: string]: unknown;
}

export interface DevelopmentProfileRow {
  id: string;
  user_id: string;
  film_id: string;
  profile_type: "simple" | "btzs";
  name: string | null;
  developer_name: string | null;
  dilution: string | null;
  temperature_text: string | null;
  agitation: string | null;
  notes: string | null;
  time_text: string | null;
  film_iso: string | null;
  test_date: string | null;
  curves_text: string | null;
  flare_density_text: string | null;
  paper_es_text: string | null;
  method_text: string | null;
  key_values_text: string | null;
  chart_data: string | null;
  source_files: string | null;
  raw_xdf: string | null;
  simple_n_minus_two_percent: number | null;
  simple_n_minus_one_percent: number | null;
  simple_n_plus_one_percent: number | null;
  simple_n_plus_two_percent: number | null;
  btzs_curve_interpolation_enabled?: number | null;
  btzs_extrapolation_stops?: number | null;
  created_at: string;
  updated_at: string;
}

export interface DevelopmentProfileBase {
  id: string;
  userId: string;
  filmStockId: string;
  type: "simple" | "btzs";
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
  chartData: BTZSChartData[] | null;
  sourceFiles: BTZSSourceFile[] | null;
  rawXdf: RawXdfMetadata | null;
  btzsCurveInterpolationEnabled?: boolean;
  btzsExtrapolationStops?: number;
}

export type DevelopmentProfile = SimpleDevelopmentProfile | BTZSDevelopmentProfile;

export type RollStatus = "unexposed" | "exposing" | "finished" | "processed" | "developed";
export type RollFormat = "35mm" | "120" | "220" | "127" | "620";
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

export interface Roll {
  id: string;
  user_id: string;
  film_id: string | null;
  name: string;
  roll_format: RollFormat | null;
  loaded_at: string | null;
  finished_at: string | null;
  status: RollStatus;
  push_pull_stops: number;
  developed_at: string | null;
  processed_at: string | null;
  development_profile_id: string | null;
  development_notes: string | null;
  created_at: string;
}

export interface FilmHolder {
  id: string;
  user_id: string;
  name: string;
  type: string;  // e.g., '127', '220', '4x5', '8x10'
  width_mm: number | null;
  height_mm: number | null;
  brand: string | null;
  capacity: number | null;  // number of sheets per pack
  applicable_camera_ids?: string[];
  created_at: string;
  current_load?: FilmHolderLoad | null;
  load_history?: FilmHolderLoad[];
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
  discarded_at?: string | null;
  discarded_reason?: string | null;
  development_profile_id: string | null;
  development_profile: DevelopmentProfileSummary | null;
  development_summary: FilmHolderLoadDevelopmentSummary | null;
  exposed_photograph: FilmHolderLoadPhotographSummary | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  film?: FilmStock | null;
}

export type ExposureEntryMode = "manual" | "zone-metering" | "btzs-zone-metering";
export type PhotographShutterMode = "fixed" | "bulb";
export type ExposurePrecedence = "aperture" | "shutter";

export interface PhotographZoneMeteringCalculation {
  meterEV: number;
  meterISO: number;
  workingISO: number;
  profileId?: string | null;
  profileName?: string | null;
  profileType?: "simple" | "btzs" | null;
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
  heldAperture?: string | null;
  heldShutterSpeed?: string | null;
  idealAperture?: number | null;
  idealShutterSeconds?: number | null;
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
  profileId: string | null;
  profileName: string | null;
  profileType?: "simple" | "btzs" | null;
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
  heldAperture?: string | null;
  heldShutterSpeed?: string | null;
  idealAperture?: number | null;
  idealShutterSeconds?: number | null;
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
  shutter_speed: string | null;  // compatibility/display field
  shutter_speed_seconds: number | null;  // calculation-friendly shutter value
  shutter_mode: PhotographShutterMode;  // structured exposure mode
  bulb_duration_seconds: number | null; // measured bulb duration in seconds
  exposure_details: PhotographExposureDetails | null; // persisted calculation details for zone/BTZS workflows
  // iso/exposure_compensation are intentionally removed from active rows;
  // historical values are preserved in photograph_exposure_legacy.
  focal_length_mm: number | null;
  latitude: number | null;
  longitude: number | null;
  altitude_m: number | null;
  gps_accuracy_m: number | null;
  notes: string | null;
  title: string | null;
  film_holder_id: string | null;  // For sheet film cameras, tracks which holder was used
  lifecycle_summary?: PhotographLifecycleSummary | null;
  filter_ids?: string[];
  filters?: Filter[];
  created_at: string;
  updated_at: string;
  images?: PhotographImage[];
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
