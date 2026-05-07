import type { ChangeEvent } from "react";
import type { DevelopmentProfile } from "../../api/client";
import { AperturePicker } from "../../components/AperturePicker";
import { BellowsCorrectionControl } from "../../components/BellowsCorrectionControl";
import { BtzsZoneSelect } from "../../components/BtzsZoneSelect";
import { BulbTimerField } from "../../components/BulbTimerField";
import { ExposureHoldToggle } from "../../components/ExposureHoldToggle";
import type { ApertureChoice, ShutterChoice } from "../../optics";
import {
  formatDevelopmentTimeClock,
  formatBulbDurationInputValue,
  formatExposureEfs,
  formatExposureG,
  formatExposureSbr,
  type BtzsProfileSelection,
  type MeteredExposurePreview,
} from "../../photoExposure";
import {
  formatRawXdfPaperEsDisplay,
} from "../../btzs/xdf";
import {
  exposureModeTabs,
} from "../photoExposurePageUtils";
import type { PhotoLogFormState } from "./formState";

type ExposureModeAvailability = {
  zoneMeteringEnabled: boolean;
  zoneMeteringReason: string | null;
  btzsZoneMeteringEnabled: boolean;
  btzsZoneMeteringReason: string | null;
};

type BellowsCorrectionSummary = {
  stops: number;
  error?: string | null;
};

type PreviewCard = {
  label: string;
  value: string;
  tone?: "accent";
};

type ZoneMeteringPreview = {
  calculation: { warnings: string[]; error?: string | null };
  display: {
    shutterChoice?: { value?: string | null } | null;
    finalShutterSeconds?: number | null;
  } | null;
  preview: MeteredExposurePreview | null;
  profileDevelopment: {
    profile?: DevelopmentProfile | null;
    warnings?: string[];
    error?: string | null;
    developmentTimeMinutes?: number | null;
    sbr?: number | null;
    requiredG?: number | null;
    workingIso?: number | null;
  } | null;
} | null;

type BtzsPreview = {
  calculation: {
    developmentTimeMinutes?: number | null;
    developmentAdjustmentStops?: number | null;
    sbr?: number | null;
    requiredG?: number | null;
    effectiveFilmSpeed?: number | null;
    error?: string | null;
  };
  display: {
    shutterChoice?: { value?: string | null } | null;
    finalShutterSeconds?: number | null;
  } | null;
  preview: { cards: PreviewCard[]; warnings: string[] } | null;
} | null;

type FieldSetter = (
  key: keyof PhotoLogFormState,
) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;

type ExposureFieldsetProps = {
  form: PhotoLogFormState;
  onFormChange: (updater: (prev: PhotoLogFormState) => PhotoLogFormState) => void;
  setField: FieldSetter;
  submitting: boolean;
  lockedReason?: string | null;
  exposureModeAvailability: ExposureModeAvailability;
  cellCameraAvailable?: boolean;
  cellCameraEvLabel?: string | null;
  btzsProfiles: DevelopmentProfile[];
  btzsProfilesLoading: boolean;
  btzsProfilesError: string | null;
  selectedBtzsProfileSelection: BtzsProfileSelection;
  selectedBtzsProfile: DevelopmentProfile | null;
  selectedBtzsProfilePaperEsValue: number | null;
  selectedBtzsFlareFactorText: string;
  apertureChoices: ApertureChoice[];
  shutterSpeedChoices: ShutterChoice[];
  manualReciprocityWarning: string | null;
  isBulbShutter: boolean;
  bulbTimerRunning: boolean;
  onBulbTimerRunningChange: (running: boolean) => void;
  showBellowsCorrection: boolean;
  zoneBellowsCorrection: BellowsCorrectionSummary;
  btzsBellowsCorrection: BellowsCorrectionSummary;
  zoneMeteringPreview: ZoneMeteringPreview;
  btzsPreview: BtzsPreview;
  btzsReadingsReversed: boolean;
  btzsRangeWarning: string | null;
  btzsPriorityApertureValue: string;
  zoneCalculatedBulbDuration: string;
  btzsPriorityShutterValue: string;
  btzsCalculatedBulbDuration: string;
  hiddenBtzsPriorityPreviewCards: ReadonlySet<string>;
};

export function ExposureFieldset({
  form,
  onFormChange,
  setField,
  submitting,
  lockedReason,
  exposureModeAvailability,
  cellCameraAvailable = false,
  cellCameraEvLabel = null,
  btzsProfiles,
  btzsProfilesLoading,
  btzsProfilesError,
  selectedBtzsProfileSelection,
  selectedBtzsProfile,
  selectedBtzsProfilePaperEsValue,
  selectedBtzsFlareFactorText,
  apertureChoices,
  shutterSpeedChoices,
  manualReciprocityWarning,
  isBulbShutter,
  bulbTimerRunning,
  onBulbTimerRunningChange,
  showBellowsCorrection,
  zoneBellowsCorrection,
  btzsBellowsCorrection,
  zoneMeteringPreview,
  btzsPreview,
  btzsReadingsReversed,
  btzsRangeWarning,
  btzsPriorityApertureValue,
  zoneCalculatedBulbDuration,
  btzsPriorityShutterValue,
  btzsCalculatedBulbDuration,
  hiddenBtzsPriorityPreviewCards,
}: ExposureFieldsetProps) {
  const zonePreviewCardValue = (label: string) =>
    zoneMeteringPreview?.preview?.cards.find((card) => card.label === label)?.value ?? "—";
  const zonePriorityApertureValue = zonePreviewCardValue("Closest supported aperture");
  const zonePriorityShutterValue = zoneCalculatedBulbDuration
    ? `BULB · ${zoneCalculatedBulbDuration}s`
    : zonePreviewCardValue("Closest supported shutter");
  const zonePriorityShutterChoiceValue = zoneMeteringPreview?.display?.shutterChoice?.value ?? "";
  const btzsPriorityShutterChoiceValue = btzsPreview?.display?.shutterChoice?.value ?? "";
  const hiddenZonePriorityPreviewCards = new Set([
    "Held aperture",
    "Held shutter",
    "Closest supported shutter",
    "Closest supported aperture",
  ]);

  if (lockedReason) {
    return (
      <fieldset className="photo-exposure-locked" disabled>
        <legend>Exposure</legend>
        <p className="field-note photo-exposure-note">{lockedReason}</p>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend>Exposure</legend>
      <div className="photo-exposure-segmented photo-exposure-mode-segmented" role="tablist" aria-label="Exposure entry mode">
        {exposureModeTabs.map((tab) => {
          const active = form.exposure_entry_mode === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              id={`photo-exposure-tab-${tab.value}`}
              role="tab"
              aria-selected={active}
              aria-controls={`photo-exposure-panel-${tab.value}`}
              className={`photo-exposure-segmented-button photo-exposure-mode-segmented-button${active ? " photo-exposure-segmented-button--active" : ""}`}
              disabled={submitting}
              onClick={() => {
                if (submitting) return;
                onFormChange((prev) => ({ ...prev, exposure_entry_mode: tab.value }));
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {btzsProfilesError && (
        <p className="form-error photo-exposure-note">{btzsProfilesError}</p>
      )}

      <div className="field-row field-grid photo-exposure-basics">
        {form.exposure_entry_mode === "manual" && (
          <>
            <div className="field field-sm aperture-field field-aperture">
              <label htmlFor="aperture">Aperture</label>
              {apertureChoices.length > 0 ? (
                <AperturePicker
                  id="aperture"
                  value={form.aperture}
                  options={apertureChoices}
                  onChange={value => onFormChange((prev) => ({ ...prev, aperture: value }))}
                />
              ) : (
                <input id="aperture" value={form.aperture} onChange={setField("aperture")} placeholder="f/5.6" />
              )}
            </div>
            <div className="field field-sm">
              <label htmlFor="shutter_speed">Shutter</label>
              <input
                id="shutter_speed"
                value={form.shutter_speed}
                onChange={setField("shutter_speed")}
                list="photo-new-shutter-speed-options"
                disabled={submitting || (form.exposure_entry_mode === "manual" && bulbTimerRunning)}
              />
            </div>
          </>
        )}
      </div>

      <datalist id="photo-new-shutter-speed-options">
        {shutterSpeedChoices.map(option => <option key={option.value} value={option.value} />)}
      </datalist>

      {form.exposure_entry_mode === "manual" && (
        <div className="photo-exposure-panel photo-exposure-panel--manual">
          {manualReciprocityWarning && (
            <p className="field-note photo-exposure-warning">{manualReciprocityWarning}</p>
          )}
          {isBulbShutter && (
            <div className="field-row field-grid">
              <div className="field field-sm">
                <label htmlFor="bulb_duration_seconds">Bulb duration</label>
                <input
                  id="bulb_duration_seconds"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  value={form.bulb_duration_seconds}
                  onChange={setField("bulb_duration_seconds")}
                  placeholder="12.5"
                  disabled={submitting || bulbTimerRunning}
                />
              </div>
              <BulbTimerField
                duration={form.bulb_duration_seconds}
                onDurationChange={value => onFormChange((prev) => ({ ...prev, bulb_duration_seconds: value }))}
                onRunningChange={onBulbTimerRunningChange}
                disabled={submitting}
              />
            </div>
          )}
        </div>
      )}

      {form.exposure_entry_mode === "cell-camera" && !cellCameraAvailable && (
        <div
          id="photo-exposure-panel-cell-camera"
          className="photo-exposure-panel photo-exposure-panel--zone"
          role="tabpanel"
          aria-labelledby="photo-exposure-tab-cell-camera"
        >
          <div className="field-row field-grid btzs-readings-row">
            <p className="field-note photo-exposure-warning">
              Take a Reference Photo first.
            </p>
          </div>
        </div>
      )}

      {(form.exposure_entry_mode === "zone-metering" || (form.exposure_entry_mode === "cell-camera" && cellCameraAvailable)) && (
        <>
          {btzsProfiles.length > 0 && (
          <div className="field-row field-grid btzs-profile-row btzs-profile-row--outside">
            <div className="field field-wide btzs-profile-field">
              <label htmlFor="single_spot_profile_id">Profile</label>
              <select
                id="single_spot_profile_id"
                value={form.btzs_zone_metering.profile_id}
                onChange={(event) => onFormChange((prev) => ({
                  ...prev,
                  btzs_zone_metering: { ...prev.btzs_zone_metering, profile_id: event.target.value },
                }))}
                disabled={btzsProfilesLoading}
              >
                <option value="">No development profile</option>
                {selectedBtzsProfileSelection.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} ({profile.type === "simple" ? "Simple" : "BTZS"})
                  </option>
                ))}
              </select>
              <p className="field-note">Optional. Without a profile, Single Spot uses box speed and records no development time.</p>
            </div>
          </div>
          )}

          <div
            id={`photo-exposure-panel-${form.exposure_entry_mode}`}
            className="photo-exposure-panel photo-exposure-panel--zone"
            role="tabpanel"
            aria-labelledby={`photo-exposure-tab-${form.exposure_entry_mode}`}
          >
          <div className="field-row field-grid btzs-readings-row">
            {form.exposure_entry_mode === "cell-camera" ? (
              <>
                <div className="field">
                  <label htmlFor="cell_camera_ev">Cell camera EV</label>
                  <input
                    id="cell_camera_ev"
                    value={cellCameraEvLabel ?? "No image EV"}
                    disabled
                  />
                </div>
                <div className="field">
                  <label htmlFor="cell_camera_correction_stops">Phone correction</label>
                  <input
                    id="cell_camera_correction_stops"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={form.zone_metering.cell_camera_correction_stops}
                    onChange={(event) => onFormChange((prev) => ({
                      ...prev,
                      zone_metering: { ...prev.zone_metering, cell_camera_correction_stops: event.target.value },
                    }))}
                  />
                </div>
              </>
            ) : (
              <div className="field">
                <label htmlFor="zone_metering_meter_ev">Meter EV</label>
                <input
                  id="zone_metering_meter_ev"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form.zone_metering.meter_ev}
                  onChange={(event) => onFormChange((prev) => ({
                    ...prev,
                    zone_metering: { ...prev.zone_metering, meter_ev: event.target.value },
                  }))}
                />
              </div>
            )}
            <div className="field field-sm">
              <label htmlFor="zone_metering_target_zone">Target zone</label>
              <BtzsZoneSelect
                id="zone_metering_target_zone"
                value={form.zone_metering.target_zone}
                onChange={(value) => onFormChange((prev) => ({
                  ...prev,
                  zone_metering: { ...prev.zone_metering, target_zone: value },
                }))}
              />
            </div>
          </div>

          {showBellowsCorrection && (
            <div className="field-row field-grid btzs-bellows-row">
              <div className="field field-wide btzs-priority-field">
                <label>Bellows Correction</label>
                <BellowsCorrectionControl
                  mode={form.zone_metering.bellows_correction_mode}
                  extensionMm={form.zone_metering.bellows_extension_mm}
                  subjectDistanceM={form.zone_metering.bellows_subject_distance_m}
                  stops={zoneBellowsCorrection.stops}
                  onModeChange={(mode) => onFormChange((prev) => ({
                    ...prev,
                    zone_metering: { ...prev.zone_metering, bellows_correction_mode: mode },
                  }))}
                  onExtensionMmChange={(value) => onFormChange((prev) => ({
                    ...prev,
                    zone_metering: { ...prev.zone_metering, bellows_extension_mm: value },
                  }))}
                  onSubjectDistanceMChange={(value) => onFormChange((prev) => ({
                    ...prev,
                    zone_metering: { ...prev.zone_metering, bellows_subject_distance_m: value },
                  }))}
                />
              </div>
            </div>
          )}

          <div className="field-row field-grid btzs-priority-row">
            <div className="field field-wide btzs-priority-field">
              <label>Calculated Exposure</label>
              <ExposureHoldToggle
                value={form.zone_metering.precedence}
                onChange={(value) => onFormChange((prev) => ({
                  ...prev,
                  shutter_speed: value === "shutter" && zonePriorityShutterChoiceValue
                    ? zonePriorityShutterChoiceValue
                    : prev.shutter_speed,
                  zone_metering: { ...prev.zone_metering, precedence: value },
                }))}
              />
            </div>
            <div className="btzs-priority-values">
              <div className="field field-sm aperture-field">
                <label htmlFor="zone_metering_aperture">Aperture</label>
                {form.zone_metering.precedence === "aperture" ? (
                  apertureChoices.length > 0 ? (
                    <AperturePicker
                      id="zone_metering_aperture"
                      value={form.aperture}
                      options={apertureChoices}
                      onChange={value => onFormChange((prev) => ({ ...prev, aperture: value }))}
                    />
                  ) : (
                    <input
                      id="zone_metering_aperture"
                      value={form.aperture}
                      onChange={setField("aperture")}
                      placeholder="f/5.6"
                    />
                  )
                ) : (
                  <div className="btzs-priority-result">{zonePriorityApertureValue}</div>
                )}
              </div>
              <div className="field field-sm">
                <label htmlFor="zone_metering_shutter_speed">Shutter</label>
                {form.zone_metering.precedence === "shutter" ? (
                  shutterSpeedChoices.length > 0 ? (
                    <select
                      id="zone_metering_shutter_speed"
                      value={form.shutter_speed}
                      onChange={(event) => onFormChange((prev) => ({ ...prev, shutter_speed: event.target.value }))}
                    >
                      <option value="">Select shutter</option>
                      {shutterSpeedChoices.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="zone_metering_shutter_speed"
                      value={form.shutter_speed}
                      onChange={setField("shutter_speed")}
                    />
                  )
                ) : (
                  <>
                    <div className="btzs-priority-result">{zonePriorityShutterValue}</div>
                    {zoneCalculatedBulbDuration && (
                      <BulbTimerField
                        duration={zoneCalculatedBulbDuration}
                        onDurationChange={() => undefined}
                        onRunningChange={onBulbTimerRunningChange}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {zoneMeteringPreview && (
            <div className="photo-exposure-preview">
              {zoneMeteringPreview.calculation.error ? (
                <p className={zoneMeteringPreview.calculation.error.includes("outside the supported")
                  ? "field-note photo-exposure-warning"
                  : "form-error"}
                >
                  {zoneMeteringPreview.calculation.error}
                </p>
              ) : null}
              {zoneMeteringPreview.profileDevelopment?.profile && (
                <div className="photo-exposure-preview-values">
                  <div>
                    <span>Development time</span>
                    <strong>{formatDevelopmentTimeClock(zoneMeteringPreview.profileDevelopment.developmentTimeMinutes)}</strong>
                  </div>
                  <div>
                    <span>Assumed SBR</span>
                    <strong>{formatExposureSbr(zoneMeteringPreview.profileDevelopment.sbr)}</strong>
                  </div>
                  <div>
                    <span>Required G / Avg Gradient</span>
                    <strong>{formatExposureG(zoneMeteringPreview.profileDevelopment.requiredG)}</strong>
                  </div>
                  <div>
                    <span>EFS</span>
                    <strong>{formatExposureEfs(zoneMeteringPreview.profileDevelopment.workingIso)}</strong>
                  </div>
                </div>
              )}
              {zoneMeteringPreview.preview && (
                <div className="photo-exposure-preview-values">
                  {zoneMeteringPreview.preview.cards.filter((card) => !hiddenZonePriorityPreviewCards.has(card.label)).map((card) => (
                    <div
                      key={card.label}
                      className={card.tone === "accent" ? "photo-exposure-preview-value--calculated" : undefined}
                    >
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                    </div>
                  ))}
                </div>
              )}
              {zoneMeteringPreview.preview && zoneMeteringPreview.preview.warnings.length > 0 && (
                <ul className="photo-exposure-warning-list">
                  {zoneMeteringPreview.preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          </div>
        </>
      )}

      {form.exposure_entry_mode === "btzs-zone-metering" && !exposureModeAvailability.btzsZoneMeteringEnabled && (
        <div
          id="photo-exposure-panel-btzs-zone-metering"
          className="photo-exposure-panel photo-exposure-panel--btzs"
          role="tabpanel"
          aria-labelledby="photo-exposure-tab-btzs-zone-metering"
        >
          <div className="field-row field-grid btzs-profile-row">
            <p className="field-note photo-exposure-warning">
              {btzsProfilesLoading ? "Loading development profiles..." : exposureModeAvailability.btzsZoneMeteringReason}
            </p>
          </div>
        </div>
      )}

      {form.exposure_entry_mode === "btzs-zone-metering" && exposureModeAvailability.btzsZoneMeteringEnabled && (
        <>
          <div className="field-row field-grid btzs-profile-row btzs-profile-row--outside">
            <div className="field field-wide btzs-profile-field">
              <label htmlFor="btzs_profile_id">Profile</label>
              <select
                id="btzs_profile_id"
                value={selectedBtzsProfileSelection.selectedProfileId || form.btzs_zone_metering.profile_id}
                onChange={(event) => onFormChange((prev) => ({
                  ...prev,
                  btzs_zone_metering: { ...prev.btzs_zone_metering, profile_id: event.target.value },
                }))}
                disabled={btzsProfilesLoading || selectedBtzsProfileSelection.mode !== "multiple" || btzsProfiles.length === 0}
              >
                {selectedBtzsProfileSelection.mode !== "single" && (
                  <option value="">Select a profile</option>
                )}
                {(selectedBtzsProfileSelection.mode === "single"
                  ? selectedBtzsProfileSelection.profiles
                  : btzsProfiles
                ).map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} ({profile.type === "simple" ? "Simple" : "BTZS"})
                  </option>
                ))}
              </select>
              {btzsProfilesLoading && (
                <p className="field-note">Loading development profiles...</p>
              )}
              {btzsProfilesError && (
                <p className="form-error" style={{ margin: "6px 0 0" }}>{btzsProfilesError}</p>
              )}
            </div>
          </div>

          <div
            id="photo-exposure-panel-btzs-zone-metering"
            className="photo-exposure-panel photo-exposure-panel--btzs"
            role="tabpanel"
            aria-labelledby="photo-exposure-tab-btzs-zone-metering"
          >
            <div className="field-row field-grid btzs-readings-row">
              <div className="field field-sm">
                <label htmlFor="btzs_low_ev">Low EV</label>
                <input
                  id="btzs_low_ev"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form.btzs_zone_metering.low_ev}
                  onChange={(event) => onFormChange((prev) => ({
                    ...prev,
                    btzs_zone_metering: { ...prev.btzs_zone_metering, low_ev: event.target.value },
                  }))}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="btzs_low_zone">Low zone</label>
                <BtzsZoneSelect
                  id="btzs_low_zone"
                  value={form.btzs_zone_metering.low_zone}
                  onChange={(value) => onFormChange((prev) => ({
                    ...prev,
                    btzs_zone_metering: { ...prev.btzs_zone_metering, low_zone: value },
                  }))}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="btzs_high_ev">High EV</label>
                <input
                  id="btzs_high_ev"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form.btzs_zone_metering.high_ev}
                  onChange={(event) => onFormChange((prev) => ({
                    ...prev,
                    btzs_zone_metering: { ...prev.btzs_zone_metering, high_ev: event.target.value },
                  }))}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="btzs_high_zone">High zone</label>
                <BtzsZoneSelect
                  id="btzs_high_zone"
                  value={form.btzs_zone_metering.high_zone}
                  onChange={(value) => onFormChange((prev) => ({
                    ...prev,
                    btzs_zone_metering: { ...prev.btzs_zone_metering, high_zone: value },
                  }))}
                />
              </div>
            </div>

            {btzsRangeWarning && (
              <p className="field-note photo-exposure-warning btzs-range-warning">{btzsRangeWarning}</p>
            )}

            <div className="field-row field-grid btzs-paper-row">
              <div className="field field-sm">
                <label htmlFor="btzs_paper_es">Paper ES</label>
                <input
                  id="btzs_paper_es"
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  step="0.01"
                  value={form.btzs_zone_metering.paper_es}
                  onChange={(event) => onFormChange((prev) => ({
                    ...prev,
                    btzs_zone_metering: { ...prev.btzs_zone_metering, paper_es: event.target.value },
                  }))}
                  placeholder="1.0"
                />
                {selectedBtzsProfile?.type === "btzs" && (
                  <p className="field-note">
                    Selected profile Paper ES: {formatRawXdfPaperEsDisplay(selectedBtzsProfilePaperEsValue ?? 1)}
                  </p>
                )}
              </div>
              <div className="field field-sm">
                <label htmlFor="btzs_flare_factor">Flare factor</label>
                <input
                  id="btzs_flare_factor"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.btzs_zone_metering.flare_factor}
                  onChange={(event) => onFormChange((prev) => ({
                    ...prev,
                    btzs_zone_metering: { ...prev.btzs_zone_metering, flare_factor: event.target.value },
                  }))}
                  placeholder="0.02"
                />
                <p className="field-note">
                  Lens/profile default: {selectedBtzsFlareFactorText}
                </p>
              </div>
            </div>

            {showBellowsCorrection && (
              <div className="field-row field-grid btzs-bellows-row">
                <div className="field field-wide btzs-priority-field">
                  <label>Bellows Correction</label>
                  <BellowsCorrectionControl
                    mode={form.btzs_zone_metering.bellows_correction_mode}
                    extensionMm={form.btzs_zone_metering.bellows_extension_mm}
                    subjectDistanceM={form.btzs_zone_metering.bellows_subject_distance_m}
                    stops={btzsBellowsCorrection.stops}
                    onModeChange={(mode) => onFormChange((prev) => ({
                      ...prev,
                      btzs_zone_metering: { ...prev.btzs_zone_metering, bellows_correction_mode: mode },
                    }))}
                    onExtensionMmChange={(value) => onFormChange((prev) => ({
                      ...prev,
                      btzs_zone_metering: { ...prev.btzs_zone_metering, bellows_extension_mm: value },
                    }))}
                    onSubjectDistanceMChange={(value) => onFormChange((prev) => ({
                      ...prev,
                      btzs_zone_metering: { ...prev.btzs_zone_metering, bellows_subject_distance_m: value },
                    }))}
                  />
                </div>
              </div>
            )}

            <div className="field-row field-grid btzs-priority-row">
              <div className="field field-wide btzs-priority-field">
                <label>Calculated Exposure</label>
                <ExposureHoldToggle
                  value={form.btzs_zone_metering.precedence}
                  onChange={(value) => onFormChange((prev) => ({
                    ...prev,
                    shutter_speed: value === "shutter" && btzsPriorityShutterChoiceValue
                      ? btzsPriorityShutterChoiceValue
                      : prev.shutter_speed,
                    btzs_zone_metering: { ...prev.btzs_zone_metering, precedence: value },
                  }))}
                />
              </div>
              <div className="btzs-priority-values">
                <div className="field field-sm aperture-field">
                  <label htmlFor="btzs_aperture">Aperture</label>
                  {form.btzs_zone_metering.precedence === "aperture" ? (
                    apertureChoices.length > 0 ? (
                      <AperturePicker
                        id="btzs_aperture"
                        value={form.aperture}
                        options={apertureChoices}
                        onChange={value => onFormChange((prev) => ({ ...prev, aperture: value }))}
                      />
                    ) : (
                      <input
                        id="btzs_aperture"
                        value={form.aperture}
                        onChange={setField("aperture")}
                        placeholder="f/5.6"
                      />
                    )
                  ) : (
                    <div className="btzs-priority-result">{btzsPriorityApertureValue}</div>
                  )}
                </div>
                <div className="field field-sm">
                  <label htmlFor="btzs_shutter_speed">Shutter</label>
                  {form.btzs_zone_metering.precedence === "shutter" ? (
                    shutterSpeedChoices.length > 0 ? (
                      <select
                        id="btzs_shutter_speed"
                        value={form.shutter_speed}
                        onChange={(event) => onFormChange((prev) => ({ ...prev, shutter_speed: event.target.value }))}
                      >
                        <option value="">Select shutter</option>
                        {shutterSpeedChoices.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="btzs_shutter_speed"
                        value={form.shutter_speed}
                        onChange={setField("shutter_speed")}
                      />
                    )
                  ) : (
                    <>
                      <div className="btzs-priority-result">{btzsPriorityShutterValue}</div>
                      {btzsCalculatedBulbDuration && (
                        <BulbTimerField
                          duration={btzsCalculatedBulbDuration}
                          onDurationChange={() => undefined}
                          onRunningChange={onBulbTimerRunningChange}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {btzsReadingsReversed && (
              <p className="field-note photo-exposure-warning">
                Low/high BTZS readings are reversed. Enter the lower reading first.
              </p>
            )}

            {btzsPreview && (
              <div className="photo-exposure-preview">
                {btzsPreview.calculation.error && !btzsRangeWarning ? (
                  <p className="form-error">{btzsPreview.calculation.error}</p>
                ) : null}
                <div className="photo-exposure-preview-values">
                  <div>
                    <span>Development time</span>
                    <strong>{formatDevelopmentTimeClock(btzsPreview.calculation.developmentTimeMinutes)}</strong>
                  </div>
                  {btzsPreview.calculation.developmentAdjustmentStops != null && (
                    <div>
                      <span>Development adjustment</span>
                      <strong>
                        {btzsPreview.calculation.developmentAdjustmentStops === 0
                          ? "N"
                          : `N${btzsPreview.calculation.developmentAdjustmentStops > 0 ? "+" : ""}${Number.parseFloat(btzsPreview.calculation.developmentAdjustmentStops.toFixed(1))}`}
                      </strong>
                    </div>
                  )}
                  <div>
                    <span>SBR</span>
                    <strong>{formatExposureSbr(btzsPreview.calculation.sbr)}</strong>
                  </div>
                  <div>
                    <span>Required G / Avg Gradient</span>
                    <strong>{formatExposureG(btzsPreview.calculation.requiredG)}</strong>
                  </div>
                  <div>
                    <span>EFS</span>
                    <strong>{formatExposureEfs(btzsPreview.calculation.effectiveFilmSpeed)}</strong>
                  </div>
                </div>
                {btzsPreview.preview && (
                  <div className="photo-exposure-preview-values">
                    {btzsPreview.preview.cards.filter((card) => !hiddenBtzsPriorityPreviewCards.has(card.label)).map((card) => (
                      <div
                        key={card.label}
                        className={card.tone === "accent" ? "photo-exposure-preview-value--calculated" : undefined}
                      >
                        <span>{card.label}</span>
                        <strong>{card.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {btzsPreview.preview && btzsPreview.preview.warnings.length > 0 && (
                  <ul className="photo-exposure-warning-list">
                    {btzsPreview.preview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}
