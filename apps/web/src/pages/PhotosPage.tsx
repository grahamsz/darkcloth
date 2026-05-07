import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Photograph, PhotographImage, Camera, FilmHolder, FilmStock, Lens, Roll, Filter } from "../api/client";
import {
  PhotographSummaryBlock,
  formatPhotographFilmMediaLabel,
} from "../components/PhotographSummaryBlock";
import { useAuth } from "../contexts/AuthContext";
import { useConnectivity } from "../contexts/ConnectivityContext";
import {
  readCachedCameras,
  readCachedFilmHolders,
  readCachedFilmStocks,
  readCachedFilters,
  readCachedLenses,
  readCachedPhotographs,
  readCachedRolls,
} from "../offline/cache";
import { formatPhotographExposureDisplay, resolvePhotographSelectedFilters } from "../photoDetail";
import { formatFilterSelectionSummary } from "../photoFilters";
import { usePreferredTimeZone } from "../hooks/usePreferredTimeZone";
import { getPhotographListLabel } from "../photoIdentity";
import {
  formatPhotographImageLabel,
  getPhotographImageDisplayUrl,
  getPhotographImagePreviewUrl,
} from "../photoReferenceImages";
import { formatCameraDisplayName } from "./GearFormFields";
import { formatDateTimeDisplayValue } from "./photoFormUtils";

function getPhotographImages(photo: Photograph): PhotographImage[] {
  const images = photo.images as unknown;
  if (Array.isArray(images)) return images;
  if (images && typeof images === "object" && Array.isArray((images as { items?: unknown }).items)) {
    return (images as { items: PhotographImage[] }).items;
  }
  return [];
}

function getPhotographThumbnail(photo: Photograph) {
  const images = getPhotographImages(photo);
  return images.find(image => getPhotographImageDisplayUrl(image)) ?? null;
}

export function PhotosPage() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const preferredTimeZone = usePreferredTimeZone();
  const [photos, setPhotos] = useState<Photograph[]>([]);
  const [total, setTotal] = useState(0);
  const [cameras, setCameras] = useState<Map<string, Camera>>(new Map());
  const [lenses, setLenses] = useState<Map<string, Lens>>(new Map());
  const [films, setFilms] = useState<Map<string, FilmStock>>(new Map());
  const [filmHolders, setFilmHolders] = useState<Map<string, FilmHolder>>(new Map());
  const [rolls, setRolls] = useState<Map<string, Roll>>(new Map());
  const [filters, setFilters] = useState<Map<string, Filter>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connectivityState.transportStatus === "offline" && user) {
      let active = true;
      setLoading(true);
      setError(null);
      Promise.all([
        readCachedPhotographs(user),
        readCachedCameras(user),
        readCachedLenses(user),
        readCachedFilmStocks(user),
        readCachedFilmHolders(user),
        readCachedRolls(user),
        readCachedFilters(user),
      ])
        .then(([cachedPhotos, cachedCameras, cachedLenses, cachedFilms, cachedFilmHolders, cachedRolls, cachedFilters]) => {
          if (!active) return;
          setPhotos(cachedPhotos);
          setTotal(cachedPhotos.length);
          setCameras(new Map(cachedCameras.map(c => [c.id, c])));
          setLenses(new Map(cachedLenses.map(lens => [lens.id, lens])));
          setFilms(new Map(cachedFilms.map(film => [film.id, film])));
          setFilmHolders(new Map(cachedFilmHolders.map(holder => [holder.id, holder])));
          setRolls(new Map(cachedRolls.map(r => [r.id, r])));
          setFilters(new Map(cachedFilters.map(filter => [filter.id, filter])));
        })
        .catch((err) => {
          if (active) setError(err instanceof Error ? err.message : "Failed to load cached photographs.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }

    Promise.all([
      api.listPhotographs(),
      api.listCameras().catch(async () => ({ items: await readCachedCameras(user) })),
      api.listLenses().catch(async () => ({ items: await readCachedLenses(user) })),
      api.listFilmStocks().catch(async () => ({ items: await readCachedFilmStocks(user) })),
      api.listFilmHolders().catch(async () => ({ items: await readCachedFilmHolders(user) })),
      api.listRolls().catch(async () => ({ items: await readCachedRolls(user) })),
      api.listFilters({ limit: 200 }).catch(async () => ({ items: await readCachedFilters(user), total: 0 })),
    ])
      .then(([photosRes, camerasRes, lensesRes, filmsRes, filmHoldersRes, rollsRes, filtersRes]) => {
        setPhotos(photosRes.items);
        setTotal(photosRes.total);
        setCameras(new Map(camerasRes.items.map(c => [c.id, c])));
        setLenses(new Map(lensesRes.items.map(lens => [lens.id, lens])));
        setFilms(new Map(filmsRes.items.map(film => [film.id, film])));
        setFilmHolders(new Map(filmHoldersRes.items.map(holder => [holder.id, holder])));
        setRolls(new Map(rollsRes.items.map(r => [r.id, r])));
        setFilters(new Map(filtersRes.items.map(filter => [filter.id, filter])));
      })
      .catch(async e => {
        const [cachedPhotos, cachedCameras, cachedLenses, cachedFilms, cachedFilmHolders, cachedRolls, cachedFilters] = await Promise.all([
          readCachedPhotographs(user),
          readCachedCameras(user),
          readCachedLenses(user),
          readCachedFilmStocks(user),
          readCachedFilmHolders(user),
          readCachedRolls(user),
          readCachedFilters(user),
        ]);
        if (user) {
          setPhotos(cachedPhotos);
          setTotal(cachedPhotos.length);
          setCameras(new Map(cachedCameras.map(c => [c.id, c])));
          setLenses(new Map(cachedLenses.map(lens => [lens.id, lens])));
          setFilms(new Map(cachedFilms.map(film => [film.id, film])));
          setFilmHolders(new Map(cachedFilmHolders.map(holder => [holder.id, holder])));
          setRolls(new Map(cachedRolls.map(r => [r.id, r])));
          setFilters(new Map(cachedFilters.map(filter => [filter.id, filter])));
          return;
        }
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [connectivityState.transportStatus, user]);

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
          {photos.map((photo, index) => {
            const roll = photo.roll_id ? rolls.get(photo.roll_id) ?? null : null;
            const camera = photo.camera_id ? cameras.get(photo.camera_id) : null;
            const lens = photo.lens_id ? lenses.get(photo.lens_id) : null;
            const filmHolder = photo.film_holder_id ? filmHolders.get(photo.film_holder_id) : null;
            const film = photo.film_id
              ? films.get(photo.film_id) ?? null
              : roll?.film_id
                ? films.get(roll.film_id) ?? null
                : filmHolder?.current_load?.film ?? null;
            const dateTime = formatDateTimeDisplayValue(photo.taken_at, preferredTimeZone);
            const exposureDisplay = formatPhotographExposureDisplay(photo);
            const selectedFilters = resolvePhotographSelectedFilters(photo, filters);
            const filterSummary = formatFilterSelectionSummary(selectedFilters, 2);
            const thumbnail = getPhotographThumbnail(photo);
            const thumbnailUrl = thumbnail ? getPhotographImagePreviewUrl(thumbnail) : null;
            const filmLabel = formatPhotographFilmMediaLabel({
              filmName: film?.name ?? null,
              filmHolderName: filmHolder?.name ?? null,
              rollName: roll?.name ?? null,
              frameNumber: photo.frame_number,
            });
            const title = getPhotographListLabel(photo);
            return (
              <li key={photo.id}>
                <Link to={`/app/photos/${photo.id}`} className={`photo-row${thumbnailUrl ? "" : " photo-row--no-thumb"}`}>
                  <PhotographSummaryBlock
                    title={title}
                    dateTime={dateTime}
                    cameraName={camera ? formatCameraDisplayName(camera) : photo.camera_id}
                    lensName={lens?.name ?? photo.lens_id}
                    filmLabel={filmLabel}
                    exposureDisplay={exposureDisplay}
                    filterSummary={filterSummary}
                    thumbnailUrl={thumbnailUrl}
                    thumbnailAlt={thumbnail ? formatPhotographImageLabel(thumbnail) : ""}
                    thumbnailWidth={thumbnail?.thumbnail_width ?? thumbnail?.width ?? null}
                    thumbnailHeight={thumbnail?.thumbnail_height ?? thumbnail?.height ?? null}
                    thumbnailFetchPriority={index === 0 ? "high" : "auto"}
                    thumbnailLoading={index === 0 ? "eager" : "lazy"}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
