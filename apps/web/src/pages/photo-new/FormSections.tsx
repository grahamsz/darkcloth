import type { ChangeEvent, ReactNode } from "react";
import type { Camera, FilmHolder, Lens, Roll } from "../../api/client";
import { formatFilmHolderSelectorLabel } from "../../filmHolders";
import { formatCameraDisplayName, formatRollSelectLabel } from "../GearFormFields";
import type { PhotoLogFormState, PhotoNewFormState } from "./formState";

const ADD_NEW_ROLL_VALUE = "__add_new_roll__";

type FieldSetter = (
  key: keyof PhotoLogFormState,
) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;

export function IdentityFieldset({
  title,
  onFieldChange,
}: {
  title: string;
  onFieldChange: FieldSetter;
}) {
  return (
    <fieldset>
      <legend>Identity</legend>
      <div className="field-row field-grid">
        <div className="field field-wide">
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={onFieldChange("title")} placeholder="Optional title" />
        </div>
      </div>
    </fieldset>
  );
}

type GearMediaFieldsetsProps = {
  form: PhotoNewFormState;
  cameras: Camera[];
  compatibleRolls: Roll[];
  applicableFilmHolders: FilmHolder[];
  selectedCamera: Camera | undefined;
  submitting: boolean;
  mediaDialogOpen: boolean;
  shouldShowRollInput: boolean;
  shouldShowFrameInput: boolean;
  shouldShowFilmHolderInput: boolean;
  rollCreateSaving: boolean;
  holderLoadSaving: boolean;
  onFieldChange: FieldSetter;
  onCameraChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onRollChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onFilmHolderChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onNewRoll: () => void;
  children?: ReactNode;
};

export function GearMediaFieldsets({
  form,
  cameras,
  compatibleRolls,
  applicableFilmHolders,
  selectedCamera,
  submitting,
  mediaDialogOpen,
  shouldShowRollInput,
  shouldShowFrameInput,
  shouldShowFilmHolderInput,
  rollCreateSaving,
  holderLoadSaving,
  onFieldChange,
  onCameraChange,
  onRollChange,
  onFilmHolderChange,
  onNewRoll,
  children,
}: GearMediaFieldsetsProps) {
  return (
    <>
      <fieldset className="log-workflow-section log-workflow-section--gear">
        <legend>Gear</legend>
        <div className="gear-subsection">
          <h3>Camera</h3>
          <div className="field-row field-grid">
            <div className="field field-date">
              <label className="visually-hidden" htmlFor="camera_id">Camera</label>
              <select id="camera_id" value={form.camera_id} onChange={onCameraChange}>
                <option value="">None</option>
                {cameras.map(c => <option key={c.id} value={c.id}>{formatCameraDisplayName(c)}</option>)}
              </select>
            </div>
          </div>
        </div>
        {children}
      </fieldset>

      <fieldset className="media-fieldset log-workflow-section log-workflow-section--media" disabled={!selectedCamera || submitting || mediaDialogOpen}>
        <legend>Film</legend>
        {!selectedCamera && (
          <p className="field-note media-disabled-note">
            Choose a camera first. Film rolls and holders stay disabled until one is selected.
          </p>
        )}
        <div className="field-row field-grid media-grid">
          {shouldShowRollInput && (
            <div className="field media-field">
              <label htmlFor="roll_id">Roll</label>
              <select
                id="roll_id"
                value={form.roll_id}
                onChange={(event) => {
                  if (event.target.value === ADD_NEW_ROLL_VALUE) {
                    onNewRoll();
                    return;
                  }
                  onRollChange(event);
                }}
                required={selectedCamera?.film_type === "roll"}
              >
                <option value="">None</option>
                <option value={ADD_NEW_ROLL_VALUE} disabled={!selectedCamera || rollCreateSaving || holderLoadSaving}>
                  Add New Roll
                </option>
                <option disabled>────────</option>
                {compatibleRolls.map((r) => <option key={r.id} value={r.id}>{formatRollSelectLabel(r)}</option>)}
              </select>
              {selectedCamera?.film_type === "roll" && compatibleRolls.length === 0 && (
                <p className="form-error" style={{ margin: "6px 0 0" }}>No compatible rolls with a film stock yet.</p>
              )}
            </div>
          )}
          {shouldShowFrameInput && (
            <div className="field field-sm">
              <label htmlFor="frame_number">Frame</label>
              <input
                id="frame_number"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={form.frame_number}
                onChange={onFieldChange("frame_number")}
                required={selectedCamera?.film_type === "roll"}
              />
            </div>
          )}
          {shouldShowFilmHolderInput && (
        <div className="field media-field media-field--full">
          <label htmlFor="film_holder_id">Film holder</label>
              <select
                id="film_holder_id"
                value={form.film_holder_id}
                onChange={onFilmHolderChange}
              >
                <option value="">None</option>
                {applicableFilmHolders.map(h => (
                  <option key={h.id} value={h.id}>
                    {formatFilmHolderSelectorLabel(h)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field field-date">
            <label htmlFor="taken_at">Date &amp; time</label>
            <input id="taken_at" type="datetime-local" value={form.taken_at} onChange={onFieldChange("taken_at")} />
          </div>
        </div>
      </fieldset>
    </>
  );
}

type LensFieldsetProps = {
  form: PhotoLogFormState;
  selectedCamera: Camera | undefined;
  compatibleLenses: Lens[];
  selectedLensRange?: {
    isPrime: boolean;
    minFocalLengthMm: number | null;
    maxFocalLengthMm: number | null;
  } | null;
  focalLengthError: string | null;
  cameraSelectedLensWarning: string | null;
  onFieldChange: FieldSetter;
};

export function LensFieldset({
  form,
  selectedCamera,
  compatibleLenses,
  selectedLensRange,
  focalLengthError,
  cameraSelectedLensWarning,
  onFieldChange,
}: LensFieldsetProps) {
  return (
    <div className="gear-subsection gear-subsection--lens">
      <h3>Lens</h3>
      <div className="field-row field-grid lens-field-grid">
        <div className="field">
          <label className="visually-hidden" htmlFor="lens_id">Lens</label>
          <select id="lens_id" value={form.lens_id} onChange={onFieldChange("lens_id")}>
            <option value="">None</option>
            {compatibleLenses.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {cameraSelectedLensWarning && <p className="form-error" style={{ margin: "6px 0 0" }}>{cameraSelectedLensWarning}</p>}
          {selectedCamera && compatibleLenses.length === 0 && (
            <p className="form-error" style={{ margin: "6px 0 0" }}>No compatible lenses for selected camera.</p>
          )}
        </div>
        {selectedLensRange && !selectedLensRange.isPrime && (
          <div className="field field-sm">
            <label htmlFor="focal_length_mm">Focal length</label>
            <input
              id="focal_length_mm"
              type="number"
              value={form.focal_length_mm}
              onChange={onFieldChange("focal_length_mm")}
              placeholder="50"
              min={selectedLensRange.minFocalLengthMm ?? undefined}
              max={selectedLensRange.maxFocalLengthMm ?? undefined}
            />
            {focalLengthError && <p className="form-error" style={{ margin: "6px 0 0" }}>{focalLengthError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

type LocationFieldsetProps = {
  latitude: string;
  longitude: string;
  altitudeM: string;
  loading: boolean;
  message: string | null;
  error: string | null;
  onUseCurrentLocation: () => void;
  onFieldChange: FieldSetter;
};

export function LocationFieldset({
  latitude,
  longitude,
  altitudeM,
  loading,
  message,
  error,
  onUseCurrentLocation,
  onFieldChange,
}: LocationFieldsetProps) {
  return (
    <fieldset>
      <legend>Location</legend>
      <div className="field-row location-controls">
        <button
          type="button"
          className="btn-secondary location-fill-button"
          onClick={onUseCurrentLocation}
          disabled={loading}
        >
          {loading ? "Locating..." : "Use current location"}
        </button>
        <div className="field location-status">
          <div aria-live="polite" className={error ? "form-error" : "muted"}>
            {error ?? message ?? "Fill these manually or pull from the browser location API."}
          </div>
        </div>
      </div>
      <div className="field-row field-grid location-coordinate-grid">
        <div className="field">
          <label htmlFor="latitude">Latitude</label>
          <input id="latitude" type="number" step="0.0001" value={latitude} onChange={onFieldChange("latitude")} />
        </div>
        <div className="field">
          <label htmlFor="longitude">Longitude</label>
          <input id="longitude" type="number" step="0.0001" value={longitude} onChange={onFieldChange("longitude")} />
        </div>
        <div className="field field-sm">
          <label htmlFor="altitude_m">Altitude (m)</label>
          <input id="altitude_m" type="number" step="0.1" value={altitudeM} onChange={onFieldChange("altitude_m")} />
        </div>
      </div>
    </fieldset>
  );
}
