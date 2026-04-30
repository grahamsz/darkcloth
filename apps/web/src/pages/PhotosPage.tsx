import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Photograph, Camera, Roll } from "../api/client";

export function PhotosPage() {
  const [photos, setPhotos] = useState<Photograph[]>([]);
  const [total, setTotal] = useState(0);
  const [cameras, setCameras] = useState<Map<string, Camera>>(new Map());
  const [rolls, setRolls] = useState<Map<string, Roll>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.listPhotographs(),
      api.listCameras().catch(() => ({ items: [] as Camera[] })),
      api.listRolls().catch(() => ({ items: [] as Roll[] })),
    ])
      .then(([photosRes, camerasRes, rollsRes]) => {
        setPhotos(photosRes.items);
        setTotal(photosRes.total);
        setCameras(new Map(camerasRes.items.map(c => [c.id, c])));
        setRolls(new Map(rollsRes.items.map(r => [r.id, r])));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Photographs</h1>
          {!loading && total > 0 && <p className="page-count">{total} frame{total !== 1 ? "s" : ""}</p>}
        </div>
        <Link className="btn-primary" to="/app/photos/new">Log photograph</Link>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && photos.length === 0 && (
        <div className="empty-state">
          <p>No photographs logged yet.</p>
          <Link className="btn-primary" to="/app/photos/new">Log your first frame</Link>
        </div>
      )}

      {photos.length > 0 && (
        <ul className="photo-list">
          {photos.map(photo => {
            const rollName = photo.roll_id ? rolls.get(photo.roll_id)?.name : null;
            const cameraName = photo.camera_id ? cameras.get(photo.camera_id)?.name : null;
            const context = [rollName, cameraName].filter(Boolean).join(" · ");
            return (
              <li key={photo.id}>
                <Link to={`/app/photos/${photo.id}`} className="photo-row">
                  <span className="photo-frame">{photo.frame_number ?? "—"}</span>
                  <span className="photo-exposure">
                    {[photo.aperture, photo.shutter_speed].filter(Boolean).join(" · ") || <span className="muted">—</span>}
                  </span>
                  {photo.iso && <span className="photo-iso">ISO {photo.iso}</span>}
                  {context && <span className="photo-context">{context}</span>}
                  <span className="photo-date">
                    {photo.taken_at ? new Date(photo.taken_at).toLocaleDateString() : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
