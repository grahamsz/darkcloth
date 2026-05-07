import { useEffect, useMemo, useState } from "react";
import { api, type AdminPhotographSummary, type AdminUserSummary } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { formatDateTimeDisplay } from "../dateTime";

const ADMIN_EMAIL = "graha.ms@graha.ms";
const PAGE_SIZE = 30;

function isAdminEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === ADMIN_EMAIL;
}

function formatCameraName(photo: AdminPhotographSummary) {
  if (!photo.camera_name) return "No camera";
  return photo.camera_maker ? `${photo.camera_maker} ${photo.camera_name}` : photo.camera_name;
}

function formatExposure(photo: AdminPhotographSummary) {
  const shutter = photo.shutter_mode === "bulb" && photo.bulb_duration_seconds
    ? `Bulb ${photo.bulb_duration_seconds.toFixed(1)}s`
    : photo.shutter_speed;
  if (shutter && photo.aperture) return `${shutter} @ ${photo.aperture}`;
  return shutter ?? photo.aperture ?? "";
}

function formatObjectCounts(user: AdminUserSummary) {
  return [
    `${user.photograph_count} photos`,
    `${user.reference_image_count} images`,
    `${user.camera_count} cameras`,
    `${user.lens_count} lenses`,
    `${user.filter_count} filters`,
    `${user.film_stock_count} stocks`,
    `${user.development_profile_count} profiles`,
    `${user.film_holder_count} holders`,
    `${user.roll_count} rolls`,
  ].join(" · ");
}

export function AdminPage() {
  const { user } = useAuth();
  const preferredTimeZone = user?.default_timezone ?? null;
  const isAdmin = isAdminEmail(user?.email);

  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<AdminPhotographSummary[]>([]);
  const [photoTotal, setPhotoTotal] = useState(0);
  const [photoOffset, setPhotoOffset] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  useEffect(() => {
    if (!isAdmin) return;

    setLoadingUsers(true);
    setError(null);
    api.adminListUsers()
      .then((result) => {
        setUsers(result.items);
        setSelectedUserId((current) => current ?? result.items[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load admin dashboard."))
      .finally(() => setLoadingUsers(false));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !selectedUserId) {
      setPhotos([]);
      setPhotoTotal(0);
      return;
    }

    setLoadingPhotos(true);
    setError(null);
    api.adminListUserPhotographs(selectedUserId, { limit: PAGE_SIZE, offset: photoOffset })
      .then((result) => {
        setPhotos(result.items);
        setPhotoTotal(result.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load user photographs."))
      .finally(() => setLoadingPhotos(false));
  }, [isAdmin, photoOffset, selectedUserId]);

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="empty-state">
          <p>Not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-wide admin-page">
      <div className="page-header">
        <div>
          <p className="page-count">Admin</p>
          <h1>Users</h1>
          <p className="muted">Object counts and photo review for non-admin accounts.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <section className="admin-layout">
        <div className="admin-user-panel">
          <h2>Accounts</h2>
          {loadingUsers && <p className="muted">Loading users…</p>}
          {!loadingUsers && users.length === 0 && <p className="muted">No other users yet.</p>}
          {users.length > 0 && (
            <ul className="admin-user-list">
              {users.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.id === selectedUserId ? "admin-user-card admin-user-card--active" : "admin-user-card"}
                    onClick={() => {
                      setSelectedUserId(item.id);
                      setPhotoOffset(0);
                    }}
                  >
                    <span className="admin-user-email">{item.email}</span>
                    <span>{formatObjectCounts(item)}</span>
                    <span>
                      Last photo: {formatDateTimeDisplay(item.last_photograph_at, preferredTimeZone) || "Never"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="admin-photo-panel">
          <div className="admin-photo-panel-header">
            <div>
              <h2>{selectedUser ? selectedUser.email : "Photos"}</h2>
              {selectedUser && (
                <p className="muted">
                  {photoTotal} photograph{photoTotal === 1 ? "" : "s"} · {selectedUser.reference_image_count} reference image{selectedUser.reference_image_count === 1 ? "" : "s"}
                </p>
              )}
            </div>
            {photoTotal > PAGE_SIZE && (
              <div className="admin-pagination">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={photoOffset === 0 || loadingPhotos}
                  onClick={() => setPhotoOffset((value) => Math.max(0, value - PAGE_SIZE))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={photoOffset + PAGE_SIZE >= photoTotal || loadingPhotos}
                  onClick={() => setPhotoOffset((value) => value + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {loadingPhotos && <p className="muted">Loading photos…</p>}
          {!loadingPhotos && selectedUser && photos.length === 0 && <p className="muted">No photographs for this user.</p>}

          {photos.length > 0 && (
            <ul className="admin-photo-list">
              {photos.map((photo) => {
                const previewUrl = photo.preview_image?.thumbnail_url ?? photo.preview_image?.url ?? null;
                const fullUrl = photo.preview_image?.url ?? photo.preview_image?.thumbnail_url ?? null;
                return (
                  <li key={photo.id} className="admin-photo-row">
                    <div className="admin-photo-main">
                      <p className="admin-photo-title">{photo.title || photo.frame_number || "Untitled photograph"}</p>
                      <p className="muted">
                        {formatDateTimeDisplay(photo.taken_at ?? photo.created_at, preferredTimeZone)}
                      </p>
                      <p>
                        {formatCameraName(photo)}
                        {photo.lens_name ? ` · ${photo.lens_name}` : ""}
                        {photo.film_name ? ` · ${photo.film_name}` : ""}
                        {photo.film_holder_name ? ` · FH: ${photo.film_holder_name}` : ""}
                        {photo.roll_name ? ` · Roll: ${photo.roll_name}` : ""}
                      </p>
                      {formatExposure(photo) && <p>{formatExposure(photo)}</p>}
                      {photo.notes && <p className="admin-photo-notes">{photo.notes}</p>}
                      {fullUrl && (
                        <a href={fullUrl} target="_blank" rel="noreferrer">
                          Open image
                        </a>
                      )}
                    </div>
                    {previewUrl && (
                      <a className="admin-photo-thumb" href={fullUrl ?? previewUrl} target="_blank" rel="noreferrer">
                        <img src={previewUrl} alt="" loading="lazy" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
