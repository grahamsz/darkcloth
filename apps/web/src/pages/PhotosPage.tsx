import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Photo } from "../api/client";

export function PhotosPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listPhotos()
      .then(r => setPhotos(r.photographs))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Photographs</h1>
        <Link className="btn-primary" to="/app/photos/new">Log photograph</Link>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

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
                <span className="photo-meta">
                  {[photo.aperture, photo.shutter_speed].filter(Boolean).join(" · ") || "—"}
                </span>
                {photo.taken_at && (
                  <time className="photo-date" dateTime={photo.taken_at}>
                    {new Date(photo.taken_at).toLocaleDateString()}
                  </time>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
