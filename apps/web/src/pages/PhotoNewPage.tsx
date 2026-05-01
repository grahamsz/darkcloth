import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/client";
import type { Camera, Lens, FilmStock, Roll, FilmHolder } from "../api/client";

interface FormState {
  camera_id: string;
  lens_id: string;
  film_id: string;
  film_holder_id: string;
  roll_id: string;
  frame_number: string;
  taken_at: string;
  aperture: string;
  shutter_speed: string;
  iso: string;
  exposure_compensation: string;
  focal_length_mm: string;
  latitude: string;
  longitude: string;
  altitude_m: string;
  gps_accuracy_m: string;
  notes: string;
}

const EMPTY: FormState = {
  camera_id: "", lens_id: "", film_id: "", film_holder_id: "", roll_id: "",
  frame_number: "", taken_at: "", aperture: "", shutter_speed: "",
  iso: "", exposure_compensation: "", focal_length_mm: "",
  latitude: "", longitude: "", altitude_m: "", gps_accuracy_m: "", notes: "",
};

const NUM_FIELDS = new Set(["iso", "focal_length_mm", "latitude", "longitude", "altitude_m", "gps_accuracy_m"]);

export function PhotoNewPage() {
  const navigate = useNavigate();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [films, setFilms] = useState<FilmStock[]>([]);
  const [filmHolders, setFilmHolders] = useState<FilmHolder[]>([]);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.listCameras().then(r => setCameras(r.items)).catch(() => null),
      api.listLenses().then(r => setLenses(r.items)).catch(() => null),
      api.listFilms().then(r => setFilms(r.items)).catch(() => null),
      api.listFilmHolders().then(r => setFilmHolders(r.items)).catch(() => null),
      api.listRolls().then(r => setRolls(r.items)).catch(() => null),
    ]);
  }, []);

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, string | number | null> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v === "") continue;
        payload[k] = NUM_FIELDS.has(k) ? parseFloat(v as string) : v;
      }
      const photo = await api.createPhotograph(payload);
      navigate(`/app/photos/${photo.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCamera = cameras.find(c => c.id === form.camera_id);
  const visibleLenses = selectedCamera?.compatible_lenses
    ? lenses.filter(l => selectedCamera.compatible_lenses!.includes(l.id))
    : lenses;

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>Log photograph</h1>
        <Link to="/app/photos" className="link-btn">Cancel</Link>
      </div>

      <form onSubmit={handleSubmit} className="log-form">
        {error && <p className="form-error">{error}</p>}

        <fieldset>
          <legend>Roll &amp; frame</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="roll_id">Roll</label>
              <select id="roll_id" value={form.roll_id} onChange={set("roll_id")}>
                <option value="">No roll</option>
                {rolls.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="field field-sm">
              <label htmlFor="frame_number">Frame</label>
              <input id="frame_number" value={form.frame_number} onChange={set("frame_number")} placeholder="12" />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Gear</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="camera_id">Camera</label>
              <select id="camera_id" value={form.camera_id} onChange={set("camera_id")}>
                <option value="">None</option>
                {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lens_id">Lens</label>
              <select id="lens_id" value={form.lens_id} onChange={set("lens_id")}>
                <option value="">None</option>
                {visibleLenses.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="film_id">Film</label>
              <select id="film_id" value={form.film_id} onChange={set("film_id")}>
                <option value="">None</option>
                {films.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            {filmHolders.length > 0 && (
              <div className="field">
                <label htmlFor="film_holder_id">Film holder</label>
                <select id="film_holder_id" value={form.film_holder_id} onChange={set("film_holder_id")}>
                  <option value="">None</option>
                  {filmHolders.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>Exposure</legend>
          <div className="field-row">
            <div className="field field-sm">
              <label htmlFor="aperture">Aperture</label>
              <input id="aperture" value={form.aperture} onChange={set("aperture")} placeholder="f/5.6" />
            </div>
            <div className="field field-sm">
              <label htmlFor="shutter_speed">Shutter</label>
              <input id="shutter_speed" value={form.shutter_speed} onChange={set("shutter_speed")} placeholder="1/250" />
            </div>
            <div className="field field-sm">
              <label htmlFor="iso">ISO</label>
              <input id="iso" type="number" value={form.iso} onChange={set("iso")} placeholder="400" />
            </div>
            <div className="field field-sm">
              <label htmlFor="exposure_compensation">EV comp</label>
              <input id="exposure_compensation" value={form.exposure_compensation} onChange={set("exposure_compensation")} placeholder="+1" />
            </div>
            <div className="field field-sm">
              <label htmlFor="focal_length_mm">Focal length</label>
              <input id="focal_length_mm" type="number" value={form.focal_length_mm} onChange={set("focal_length_mm")} placeholder="50" />
            </div>
          </div>
          <div className="field field-sm" style={{ marginTop: 12 }}>
            <label htmlFor="taken_at">Date &amp; time</label>
            <input id="taken_at" type="datetime-local" value={form.taken_at} onChange={set("taken_at")} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Location</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="latitude">Latitude</label>
              <input id="latitude" type="number" step="any" value={form.latitude} onChange={set("latitude")} placeholder="40.7608" />
            </div>
            <div className="field">
              <label htmlFor="longitude">Longitude</label>
              <input id="longitude" type="number" step="any" value={form.longitude} onChange={set("longitude")} placeholder="-111.8910" />
            </div>
            <div className="field field-sm">
              <label htmlFor="altitude_m">Altitude (m)</label>
              <input id="altitude_m" type="number" step="any" value={form.altitude_m} onChange={set("altitude_m")} />
            </div>
            <div className="field field-sm">
              <label htmlFor="gps_accuracy_m">Accuracy (m)</label>
              <input id="gps_accuracy_m" type="number" step="any" value={form.gps_accuracy_m} onChange={set("gps_accuracy_m")} />
            </div>
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={form.notes} onChange={set("notes")} rows={3} />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save photograph"}
          </button>
        </div>
      </form>
    </div>
  );
}
