import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Photograph, PhotographImage } from "../api/client";

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export function PhotoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<Photograph | null>(null);
  const [images, setImages] = useState<PhotographImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getPhotograph(id),
      api.listPhotographImages(id).catch(() => ({ items: [] })),
    ])
      .then(([p, imgs]) => { setPhoto(p); setImages(imgs.items); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id || !confirm("Delete this photograph?")) return;
    await api.deletePhotograph(id);
    navigate("/app/photos", { replace: true });
  };

  const handleUpload = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      const img = await api.uploadPhotographImage(id, file);
      setImages(prev => [...prev, img]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!id || !confirm("Remove this image?")) return;
    await api.deletePhotographImage(id, imageId);
    setImages(prev => prev.filter(i => i.id !== imageId));
  };

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (!photo) return null;

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>Frame {photo.frame_number ?? "—"}</h1>
        <div className="page-header-actions">
          <Link to="/app/photos" className="link-btn">Back</Link>
          <Link to={`/app/photos/${photo.id}/edit`} className="btn-secondary">Edit</Link>
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
        <Row label="GPS accuracy" value={photo.gps_accuracy_m != null ? `±${photo.gps_accuracy_m}m` : null} />
        <Row label="Notes" value={photo.notes} />
      </dl>

      <div className="images-section">
        <div className="images-header">
          <h2>Reference images</h2>
          <button
            className="btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Add image"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
        </div>

        {images.length === 0 && <p className="muted">No reference images yet.</p>}

        <div className="image-grid">
          {images.map(img => (
            <div key={img.id} className="image-card">
              {img.url
                ? <img src={img.url} alt={img.original_filename ?? "Reference image"} />
                : <div className="image-placeholder" />
              }
              <button
                className="image-delete"
                onClick={() => handleDeleteImage(img.id)}
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
