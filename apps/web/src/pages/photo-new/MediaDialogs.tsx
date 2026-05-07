import type { Camera, FilmStock } from "../../api/client";
import { ROLL_FORMAT_OPTIONS, type HolderLoadDraft, type RollCreateDraft } from "../../photoMedia";
import type { MediaDialogState } from "./formState";

type RollCreateDialogProps = {
  camera: Camera | undefined;
  films: FilmStock[];
  draft: RollCreateDraft;
  saving: boolean;
  error: string | null;
  onChange: (next: RollCreateDraft) => void;
  onClose: () => void;
  onCreate: () => void;
};

function RollCreateDialog({
  camera,
  films,
  draft,
  saving,
  error,
  onChange,
  onClose,
  onCreate,
}: RollCreateDialogProps) {
  return (
    <div
      className="media-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (!saving && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="media-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="roll-create-dialog-title"
      >
        <div className="media-dialog-header">
          <div>
            <p className="page-count">Film</p>
            <h2 id="roll-create-dialog-title">Create roll</h2>
          </div>
          <button type="button" className="link-btn" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="media-dialog-grid">
          <label className="field media-dialog-field media-dialog-field--wide" htmlFor="roll-create-name">
            <span>Name</span>
            <input
              id="roll-create-name"
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              placeholder="Roll name"
              disabled={saving}
              required
            />
          </label>
          <label className="field media-dialog-field" htmlFor="roll-create-film">
            <span>Film stock</span>
            <select
              id="roll-create-film"
              value={draft.filmId}
              onChange={(event) => onChange({ ...draft, filmId: event.target.value })}
              disabled={saving}
              required
            >
              <option value="">Select film stock</option>
              {films.map((film) => (
                <option key={film.id} value={film.id}>{film.name}</option>
              ))}
            </select>
          </label>
          <label className="field media-dialog-field" htmlFor="roll-create-format">
            <span>Roll format</span>
            <select
              id="roll-create-format"
              value={draft.rollFormat}
              onChange={(event) => onChange({
                ...draft,
                rollFormat: event.target.value as RollCreateDraft["rollFormat"],
              })}
              disabled={saving || Boolean(camera?.film_type === "roll" && camera.roll_format)}
              required
            >
              <option value="">Select a format</option>
              {ROLL_FORMAT_OPTIONS.map((format) => (
                <option key={format} value={format}>{format}</option>
              ))}
            </select>
          </label>
          {camera?.film_type === "roll" && camera.roll_format && (
            <p className="field-note media-dialog-note media-dialog-note--wide">
              This camera requires {camera.roll_format} rolls.
            </p>
          )}
        </div>
        <div className="form-actions media-dialog-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onCreate} disabled={saving}>
            {saving ? "Creating..." : "Create roll"}
          </button>
        </div>
      </section>
    </div>
  );
}

type HolderLoadDialogProps = {
  holderName: string;
  films: FilmStock[];
  draft: HolderLoadDraft;
  saving: boolean;
  error: string | null;
  onChange: (next: HolderLoadDraft) => void;
  onClose: () => void;
  onLoad: () => void;
};

function HolderLoadDialog({
  holderName,
  films,
  draft,
  saving,
  error,
  onChange,
  onClose,
  onLoad,
}: HolderLoadDialogProps) {
  return (
    <div
      className="media-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (!saving && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="media-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="holder-load-dialog-title"
      >
        <div className="media-dialog-header">
          <div>
            <p className="page-count">Film holder</p>
            <h2 id="holder-load-dialog-title">Load {holderName}</h2>
          </div>
          <button type="button" className="link-btn" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="media-dialog-grid">
          <label className="field media-dialog-field media-dialog-field--wide" htmlFor="holder-load-film">
            <span>Film stock</span>
            <select
              id="holder-load-film"
              value={draft.filmId}
              onChange={(event) => onChange({ ...draft, filmId: event.target.value })}
              disabled={saving}
              required
            >
              <option value="">Select film stock</option>
              {films.map((film) => (
                <option key={film.id} value={film.id}>{film.name}</option>
              ))}
            </select>
          </label>
          <label className="field media-dialog-field media-dialog-field--wide" htmlFor="holder-load-notes">
            <span>Notes</span>
            <textarea
              id="holder-load-notes"
              value={draft.notes}
              onChange={(event) => onChange({ ...draft, notes: event.target.value })}
              rows={3}
              placeholder="Optional notes"
              disabled={saving}
            />
          </label>
          <p className="field-note media-dialog-note media-dialog-note--wide">
            Film will be inferred from the holder after loading.
          </p>
        </div>
        <div className="form-actions media-dialog-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onLoad} disabled={saving}>
            {saving ? "Loading..." : "Load holder"}
          </button>
        </div>
      </section>
    </div>
  );
}

type MediaDialogsProps = {
  dialog: MediaDialogState | null;
  camera: Camera | undefined;
  films: FilmStock[];
  rollDraft: RollCreateDraft;
  rollSaving: boolean;
  rollError: string | null;
  onRollDraftChange: (next: RollCreateDraft) => void;
  onCloseRoll: () => void;
  onCreateRoll: () => void;
  holderDraft: HolderLoadDraft;
  holderSaving: boolean;
  holderError: string | null;
  onHolderDraftChange: (next: HolderLoadDraft) => void;
  onCloseHolder: () => void;
  onLoadHolder: () => void;
};

export function MediaDialogs({
  dialog,
  camera,
  films,
  rollDraft,
  rollSaving,
  rollError,
  onRollDraftChange,
  onCloseRoll,
  onCreateRoll,
  holderDraft,
  holderSaving,
  holderError,
  onHolderDraftChange,
  onCloseHolder,
  onLoadHolder,
}: MediaDialogsProps) {
  if (dialog?.kind === "roll") {
    return (
      <RollCreateDialog
        camera={camera}
        films={films}
        draft={rollDraft}
        saving={rollSaving}
        error={rollError}
        onChange={onRollDraftChange}
        onClose={onCloseRoll}
        onCreate={onCreateRoll}
      />
    );
  }

  if (dialog?.kind === "holder") {
    return (
      <HolderLoadDialog
        holderName={dialog.holderName}
        films={films}
        draft={holderDraft}
        saving={holderSaving}
        error={holderError}
        onChange={onHolderDraftChange}
        onClose={onCloseHolder}
        onLoad={onLoadHolder}
      />
    );
  }

  return null;
}
