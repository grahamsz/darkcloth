import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Photograph } from "../api/client";

export function PhotosPage() {
  const [photos, setPhotos] = useState<Photograph[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listPhotographs()
      .then(r => { setPhotos(r.items); setTotal(r.total); })
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
          {photos.map(photo => (
            <li key={photo.id}>
              <Link to={`/app/photos/${photo.id}`} className="photo-row">
                <span className="photo-frame">{photo.frame_number ?? "—"}</span>
                <span className="photo-exposure">
                  {[photo.aperture, photo.shutter_speed].filter(Boolean).join(" · ") || <span className="muted">—</span>}
                </span>
                {photo.iso && <span className="photo-iso">ISO {photo.iso}</span>}
                <span className="photo-date">
                  {photo.taken_at ? new Date(photo.taken_at).toLocaleDateString() : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
