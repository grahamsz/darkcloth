import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Photo } from "../api/client";

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export function PhotoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getPhoto(id)
      .then(r => setPhoto(r.photograph))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id || !confirm("Delete this photograph?")) return;
    await api.deletePhoto(id);
    navigate("/app/photos", { replace: true });
  };

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!photo) return null;

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>Frame {photo.frame_number ?? "—"}</h1>
        <div className="page-header-actions">
          <Link to="/app/photos" className="link-btn">Back</Link>
          <button className="btn-danger-ghost" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <dl className="detail-grid">
        <Row label="Aperture" value={photo.aperture} />
        <Row label="Shutter" value={photo.shutter_speed} />
        <Row label="ISO" value={photo.iso} />
        <Row label="EV" value={photo.exposure_compensation} />
        <Row label="Focal length" value={photo.focal_length_mm != null ? `${photo.focal_length_mm}mm` : null} />
        <Row label="Date" value={photo.taken_at ? new Date(photo.taken_at).toLocaleString() : null} />
        <Row label="Latitude" value={photo.latitude} />
        <Row label="Longitude" value={photo.longitude} />
        <Row label="Altitude" value={photo.altitude_m != null ? `${photo.altitude_m}m` : null} />
        <Row label="Notes" value={photo.notes} />
      </dl>
    </div>
  );
}
