import { useEffect, useState, type ReactNode } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Photograph, PhotographImage, Camera, Lens, FilmStock, Roll, FilmHolder, Filter } from "../api/client";
import {
  CollectionSwipeNavigator,
  consumeCollectionSwipeEntryDirection,
  type CollectionSwipeDirection,
} from "../components/CollectionSwipeNavigator";
import { getCollectionNavigationState } from "../components/collectionNavigation";
import { PhotographImageUploadActions } from "../components/PhotographImageUploadActions";
import { FilterSimulationImage } from "../components/FilterSimulationImage";
import { useAuth } from "../contexts/AuthContext";
import { useConnectivity } from "../contexts/ConnectivityContext";
import { schedulePhotographImageDisplayUpdate } from "../deferredPhotographImageDisplay";
import {
  readCachedCameras,
  readCachedFilmHolders,
  readCachedFilmStocks,
  readCachedFilters,
  readCachedLenses,
  readCachedPhotograph,
  readCachedPhotographs,
  readCachedPhotographImages,
  readCachedRolls,
} from "../offline/cache";
import { queueOfflinePhotographImageUpload } from "../offline/sync";
import {
  buildPhotographExposureSummary,
  formatPhotographExposureEntryModeLabel,
} from "../photoExposure";
import { formatFilterDisplayLabel, getFilterSimulationOptions } from "../photoFilters";
import {
  formatPhotographExposureDisplay,
  formatPhotographLensDisplay,
  getPhotographLifecycleRows,
  getPhotographLocationLink,
  resolvePhotographSelectedFilters,
} from "../photoDetail";
import { preparePhotographImageUpload } from "../photoImageUpload";
import {
  formatPhotographImageLabel,
  getPhotographImageDisplayUrl,
  getPhotographImageOpenUrl,
} from "../photoReferenceImages";
import { processReferenceImageForDisplay } from "../referenceImageProcessing";
import { isMonochromeFilmStockType } from "../film-stocks";
import { usePreferredTimeZone } from "../hooks/usePreferredTimeZone";
import {
  getPhotographListLabel,
} from "../photoIdentity";
import { PhotoEditPage } from "./PhotoEditPage";
import {
  formatCameraDisplayName,
  formatRollPushPullLabel,
  formatRollStatusLabel,
  getRollStatusClassName,
} from "./GearFormFields";
import { formatDateTimeDisplayValue } from "./photoFormUtils";

const CAMERA_EDIT_PATH = (id: string) => `/app/gear/cameras/${id}/edit`;
const LENS_EDIT_PATH = (id: string) => `/app/gear/lenses/${id}/edit`;
const FILM_STOCK_DETAIL_PATH = (id: string) => `/app/film/stocks/${id}`;
const FILM_HOLDER_DETAIL_PATH = (id: string) => `/app/film/holders/${id}/edit`;

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

interface GearMaps {
  cameras: Map<string, Camera>;
  lenses: Map<string, Lens>;
  films: Map<string, FilmStock>;
  rolls: Map<string, Roll>;
  filmHolders: Map<string, FilmHolder>;
  filters: Map<string, Filter>;
}

function mergePhotographImages(...groups: PhotographImage[][]) {
  const merged: PhotographImage[] = [];
  const indexesById = new Map<string, number>();
  const hasDisplayUrl = (image: PhotographImage) =>
    Boolean(getPhotographImageDisplayUrl(image) || getPhotographImageOpenUrl(image));
  const hasLocalUrl = (image: PhotographImage) =>
    [image.thumbnail_url, image.url, image.original_url].some((url) => typeof url === "string" && url.startsWith("blob:"));

  for (const group of groups) {
    for (const image of group) {
      const existingIndex = indexesById.get(image.id);
      if (existingIndex != null) {
        const existing = merged[existingIndex];
        if ((!hasLocalUrl(existing) && hasLocalUrl(image)) || (!hasDisplayUrl(existing) && hasDisplayUrl(image))) {
          merged[existingIndex] = image;
        }
        continue;
      }
      indexesById.set(image.id, merged.length);
      merged.push(image);
    }
  }

  return merged;
}

function PhotoDetailView() {
  const { user } = useAuth();
  const { state: connectivityState } = useConnectivity();
  const preferredTimeZone = usePreferredTimeZone();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<Photograph | null>(null);
  const [photoCollection, setPhotoCollection] = useState<Photograph[]>([]);
  const [images, setImages] = useState<PhotographImage[]>([]);
  const [gear, setGear] = useState<GearMaps>({ cameras: new Map(), lenses: new Map(), films: new Map(), rolls: new Map(), filmHolders: new Map(), filters: new Map() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [viewerImageId, setViewerImageId] = useState<string | null>(null);
  const [filterSimulationEnabled, setFilterSimulationEnabled] = useState(false);
  const [selectedSimulationFilterId, setSelectedSimulationFilterId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [entryDirection, setEntryDirection] = useState<CollectionSwipeDirection | null>(null);
  const isOffline = connectivityState.transportStatus === "offline";

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const nextEntryDirection = consumeCollectionSwipeEntryDirection();

    setLoading(true);
    setError(null);
    setEntryDirection(nextEntryDirection);
    setPhoto(null);
    setImages([]);
    setUploadError(null);
    setUploadMessage(null);
    setSelectedImageId(null);
    setViewerImageId(null);

    const loadCachedBundle = async () => {
        const [
          cachedPhoto,
          cachedPhotos,
          cachedImages,
          cachedCameras,
          cachedLenses,
          cachedFilms,
          cachedRolls,
          cachedFilmHolders,
          cachedFilters,
        ] = await Promise.all([
          readCachedPhotograph(user, id),
          readCachedPhotographs(user),
          readCachedPhotographImages(user, id),
          readCachedCameras(user),
          readCachedLenses(user),
          readCachedFilmStocks(user),
          readCachedRolls(user),
          readCachedFilmHolders(user),
          readCachedFilters(user),
        ]);
      return {
        cachedPhoto,
        cachedPhotos,
        cachedImages,
        cachedCameras,
        cachedLenses,
        cachedFilms,
        cachedRolls,
        cachedFilmHolders,
        cachedFilters,
      };
    };

    const applyGear = (
      cameras: Camera[],
      lenses: Lens[],
      films: FilmStock[],
      rolls: Roll[],
      filmHolders: FilmHolder[],
      filters: Filter[],
    ) => {
      setGear({
        cameras: new Map(cameras.map(c => [c.id, c])),
        lenses: new Map(lenses.map(l => [l.id, l])),
        films: new Map(films.map(f => [f.id, f])),
        rolls: new Map(rolls.map(r => [r.id, r])),
        filmHolders: new Map(filmHolders.map(h => [h.id, h])),
        filters: new Map(filters.map(f => [f.id, f])),
      });
    };

    void (async () => {
      let primaryPhoto: Photograph | null = null;
      try {
        primaryPhoto = await api.getPhotograph(id);
        if (cancelled) return;
        setPhoto(primaryPhoto);
        setImages(mergePhotographImages(primaryPhoto.images?.items ?? []));
        setLoading(false);
      } catch (e) {
        const cached = await loadCachedBundle();
        if (cancelled) return;
        const fallbackCachedPhoto = cached.cachedPhoto ?? cached.cachedPhotos.find((item) => item.id === id) ?? null;
        if (fallbackCachedPhoto) {
          setPhoto(fallbackCachedPhoto);
          setPhotoCollection(cached.cachedPhotos);
          setImages(mergePhotographImages(fallbackCachedPhoto.images?.items ?? [], cached.cachedImages));
          applyGear(cached.cachedCameras, cached.cachedLenses, cached.cachedFilms, cached.cachedRolls, cached.cachedFilmHolders, cached.cachedFilters);
          setLoading(false);
          return;
        }
        setError(e instanceof Error ? e.message : "Failed to load photograph.");
        setLoading(false);
        return;
      }

      const [photoList, imgs, cameras, lenses, films, rolls, filmHolders, filters] = await Promise.all([
        api.listPhotographs({ limit: 200 }).catch(async () => ({ items: await readCachedPhotographs(user), total: 0 })),
        api.listPhotographImages(id).catch(async () => ({ items: await readCachedPhotographImages(user, id) })),
        api.listCameras().catch(async () => ({ items: await readCachedCameras(user) })),
        api.listLenses().catch(async () => ({ items: await readCachedLenses(user) })),
        api.listFilmStocks().catch(async () => ({ items: await readCachedFilmStocks(user) })),
        api.listRolls().catch(async () => ({ items: await readCachedRolls(user) })),
        api.listFilmHolders().catch(async () => ({ items: await readCachedFilmHolders(user) })),
        api.listFilters({ limit: 200 }).catch(async () => ({ items: await readCachedFilters(user), total: 0 })),
      ]);
      if (cancelled) return;
      setPhotoCollection(photoList.items);
      setImages(mergePhotographImages(primaryPhoto.images?.items ?? [], imgs.items));
      applyGear(cameras.items, lenses.items, films.items, rolls.items, filmHolders.items, filters.items);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  useEffect(() => {
    setSelectedImageId(prev => {
      if (images.length === 0) return null;
      if (prev && images.some(image => image.id === prev)) return prev;
      return images[0].id;
    });
  }, [images]);

  useEffect(() => {
    setViewerImageId(prev => {
      if (!prev) return null;
      return images.some(image => image.id === prev) ? prev : null;
    });
  }, [images]);

  const handleDelete = async () => {
    if (isOffline) {
      setDeleteError("Delete actions are disabled while offline.");
      return;
    }
    if (!id || !confirm("Delete this photograph?")) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deletePhotograph(id);
      navigate("/app/photos", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete this photograph.");
    } finally {
      setDeleting(false);
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!id || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);
    let uploadedCount = 0;
    let queuedCount = 0;
    const shouldQueueOffline = (err: unknown) => {
      if (connectivityState.transportStatus === "offline") return true;
      if (err instanceof TypeError) return true;
      return err instanceof Error && /failed to fetch|network/i.test(err.message);
    };
    try {
      for (const file of files) {
        let img: PhotographImage;
        if (connectivityState.transportStatus === "offline") {
          if (!user) throw new Error("Sign in is required to queue reference images.");
          img = await queueOfflinePhotographImageUpload(user, id, file);
          queuedCount += 1;
        } else {
          try {
            const photoFilm = photo?.film_id
              ? gear.films.get(photo.film_id) ?? null
              : photo?.roll_id
                ? gear.films.get(gear.rolls.get(photo.roll_id)?.film_id ?? "") ?? null
                : photo?.film_holder_id
                  ? gear.filmHolders.get(photo.film_holder_id)?.current_load?.film ?? null
                  : null;
            const photoIsMonochrome = isMonochromeFilmStockType(photoFilm?.stock_type);
            const selectedSimulation = getFilterSimulationOptions(photo?.filters ?? [])[0] ?? null;
            const shouldPrepareDisplay = photoIsMonochrome || Boolean(selectedSimulation);
            const deferredDisplay = shouldPrepareDisplay
              ? {
                  aspectRatio: null,
                  cropToFrame: false,
                  simulation: selectedSimulation,
                  monochrome: photoIsMonochrome,
                  maxLongEdge: 2048,
                  simulationMethod: "detailed" as const,
                }
              : null;
            const shouldPrepareThumbnail = photoIsMonochrome || Boolean(selectedSimulation);
            const quickDisplay = shouldPrepareThumbnail
              ? await processReferenceImageForDisplay(file, {
                  aspectRatio: null,
                  cropToFrame: false,
                  simulation: selectedSimulation,
                  monochrome: photoIsMonochrome,
                  maxLongEdge: 1280,
                  simulationMethod: "lut",
                  previewQuality: true,
                })
              : null;
            const thumbnail = shouldPrepareThumbnail
              ? await processReferenceImageForDisplay(file, {
                  aspectRatio: null,
                  cropToFrame: false,
                  simulation: selectedSimulation,
                  monochrome: photoIsMonochrome,
                  maxLongEdge: 256,
                  simulationMethod: "lut",
                  previewQuality: true,
                })
              : null;
            const prepared = deferredDisplay || thumbnail
              ? await preparePhotographImageUpload({
                  original: file,
                  ...(quickDisplay ? { display: quickDisplay } : {}),
                  ...(thumbnail ? { thumbnail } : {}),
                  ...(deferredDisplay ? { deferredDisplay } : {}),
                })
              : await preparePhotographImageUpload(file);
            img = await api.uploadPhotographImage(id, prepared);
            if (deferredDisplay) {
              void schedulePhotographImageDisplayUpdate({
                photoId: id,
                imageId: img.id,
                original: file,
                options: deferredDisplay,
                onUpdated: (updatedImage) => setImages(prev => mergePhotographImages(prev, [updatedImage])),
              }).catch(() => undefined);
            }
            uploadedCount += 1;
          } catch (uploadError) {
            if (!shouldQueueOffline(uploadError)) throw uploadError;
            if (!user) throw uploadError;
            img = await queueOfflinePhotographImageUpload(user, id, file);
            queuedCount += 1;
          }
        }
        setImages(prev => mergePhotographImages(prev, [img]));
        setSelectedImageId(img.id);
      }
      if (queuedCount > 0) {
        setUploadMessage(`${queuedCount} image${queuedCount === 1 ? "" : "s"} queued for sync.`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setUploadError(uploadedCount > 0
        ? `${uploadedCount} image${uploadedCount === 1 ? "" : "s"} uploaded before the failure. ${message}`
        : queuedCount > 0
          ? `${queuedCount} image${queuedCount === 1 ? "" : "s"} queued before the failure. ${message}`
        : message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (isOffline) {
      setUploadError("Delete actions are disabled while offline.");
      return;
    }
    if (!id || !confirm("Remove this image?")) return;
    await api.deletePhotographImage(id, imageId);
    setImages(prev => prev.filter(i => i.id !== imageId));
  };

  if (loading || (id && photo && photo.id !== id)) {
    return <div className="page"><p className="muted">Loading…</p></div>;
  }
  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (!photo) return null;

  const camera = photo.camera_id ? gear.cameras.get(photo.camera_id) : null;
  const roll = photo.roll_id ? gear.rolls.get(photo.roll_id) : null;
  const filmHolder = photo.film_holder_id ? gear.filmHolders.get(photo.film_holder_id) : null;
  const takenAt = formatDateTimeDisplayValue(photo.taken_at, preferredTimeZone);
  const selectedFilters = resolvePhotographSelectedFilters(photo, gear.filters);
  const filterSimulationOptions = getFilterSimulationOptions(selectedFilters);
  const selectedFilterSimulation = filterSimulationOptions.find(option => option.id === selectedSimulationFilterId)
    ?? filterSimulationOptions[0]
    ?? null;
  const title = getPhotographListLabel(photo);
  const exposureSummary = buildPhotographExposureSummary(photo);
  const lens = photo.lens_id ? gear.lenses.get(photo.lens_id) ?? null : null;
  const film = photo.film_id ? gear.films.get(photo.film_id) ?? null : null;
  const locationLink = getPhotographLocationLink(photo);
  const lensDisplay = formatPhotographLensDisplay(lens, photo.focal_length_mm);
  const exposureDisplay = formatPhotographExposureDisplay(photo);
  const lifecycleRows = getPhotographLifecycleRows(photo.lifecycle_summary ?? null, preferredTimeZone);
  const viewerImage = viewerImageId ? images.find(image => image.id === viewerImageId) ?? null : null;
  const isOfflineSafeImageUrl = (url: string | null | undefined) => !url || !isOffline || url.startsWith("blob:");
  const selectedImage = selectedImageId ? images.find(image => image.id === selectedImageId) ?? null : images[0] ?? null;
  const selectedImageUrl = selectedImage
    ? [getPhotographImageOpenUrl(selectedImage), getPhotographImageDisplayUrl(selectedImage)]
        .find((url) => isOfflineSafeImageUrl(url)) ?? null
    : null;
  const viewerImageUrl = viewerImage
    ? [getPhotographImageOpenUrl(viewerImage), getPhotographImageDisplayUrl(viewerImage)]
        .find((url) => isOfflineSafeImageUrl(url)) ?? null
    : null;
  const photoIsMonochrome = isMonochromeFilmStockType(film?.stock_type);
  const canSimulateFilter = filterSimulationOptions.length > 0;
  const activeFilterSimulation = canSimulateFilter && filterSimulationEnabled;
  const collectionNav = getCollectionNavigationState(photoCollection, photo.id);
  const collectionPositionLabel = collectionNav.currentIndex != null
    ? `${collectionNav.currentIndex + 1} of ${collectionNav.total}`
    : null;

  return (
    <CollectionSwipeNavigator
      collectionLabel="photograph"
      positionLabel={collectionPositionLabel}
      previous={collectionNav.previous ? {
        to: `/app/photos/${collectionNav.previous.item.id}`,
        label: getPhotographListLabel(collectionNav.previous.item),
      } : null}
      next={collectionNav.next ? {
        to: `/app/photos/${collectionNav.next.item.id}`,
        label: getPhotographListLabel(collectionNav.next.item),
      } : null}
    >
    <div
      className={[
        "page page-narrow photo-page photo-page--view",
        entryDirection ? `photo-page--swipe-loaded-${entryDirection}` : "",
      ].filter(Boolean).join(" ")}
      key={photo.id}
    >
      <div className="page-header photo-page-header">
        <div className="photo-page-header-main">
          <h1>{title}</h1>
        </div>
        <div className="page-header-actions photo-page-header-actions">
          <Link to={`/app/photos/${photo.id}?edit=1`} className="btn-secondary photo-edit-action">Edit</Link>
          <button type="button" className="btn-danger-ghost photo-delete-action" onClick={handleDelete} disabled={deleting || isOffline}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      {deleteError && <p className="form-error">{deleteError}</p>}

      {selectedImage && selectedImageUrl && (
        <figure className="photo-hero-image">
          <button
            type="button"
            className="photo-hero-image-button"
            onClick={() => {
              const firstSimulation = filterSimulationOptions[0] ?? null;
              if (firstSimulation) {
                setSelectedSimulationFilterId(current =>
                  current && filterSimulationOptions.some(option => option.id === current)
                    ? current
                    : firstSimulation.id,
                );
                setFilterSimulationEnabled(true);
              } else {
                setFilterSimulationEnabled(false);
              }
              setViewerImageId(selectedImage.id);
            }}
            aria-label={`View ${formatPhotographImageLabel(selectedImage)} larger`}
          >
            <img
              src={selectedImageUrl}
              alt={formatPhotographImageLabel(selectedImage)}
              width={selectedImage.width ?? selectedImage.thumbnail_width ?? undefined}
              height={selectedImage.height ?? selectedImage.thumbnail_height ?? undefined}
            />
          </button>
        </figure>
      )}

      <dl className="detail-grid photo-detail-main-grid">
        <Row
          label="Roll"
          value={roll ? (
            <Link className="photo-roll-link" to={`/app/film/rolls/${roll.id}`}>
              <span className="photo-roll-link-name">{roll.name}</span>
              <span className="photo-roll-link-badges">
                <span className={`gear-status gear-status--${getRollStatusClassName(roll.status)}`}>
                  {formatRollStatusLabel(roll.status)}
                </span>
                <span
                  className={`roll-push-pull-badge roll-push-pull-badge--${
                    roll.push_pull_stops > 0 ? "push" : roll.push_pull_stops < 0 ? "pull" : "normal"
                  }`}
                >
                  {formatRollPushPullLabel(roll.push_pull_stops)}
                </span>
              </span>
            </Link>
          ) : null}
        />
        <Row label="Frame" value={photo.frame_number} />
        <Row
          label="Camera"
          value={camera ? (
            <Link className="photo-resource-link" to={CAMERA_EDIT_PATH(camera.id)}>
              {formatCameraDisplayName(camera)}
            </Link>
          ) : null}
        />
        <Row
          label="Lens"
          value={lens ? (
            <Link className="photo-resource-link" to={LENS_EDIT_PATH(lens.id)}>
              {lensDisplay}
            </Link>
          ) : lensDisplay}
        />
        <Row
          label="Filters"
          value={selectedFilters.length > 0 ? (
            <div className="photo-filter-summary photo-filter-summary--detail">
              {selectedFilters.map(filter => (
                <span key={filter.id} className="photo-filter-pill">
                  {formatFilterDisplayLabel(filter)}
                </span>
              ))}
            </div>
          ) : null}
        />
        <Row
          label="Film"
          value={film ? (
            <Link className="photo-resource-link" to={FILM_STOCK_DETAIL_PATH(film.id)}>
              {film.name}
            </Link>
          ) : null}
        />
        <Row
          label="Film holder"
          value={filmHolder ? (
            <Link className="photo-resource-link" to={FILM_HOLDER_DETAIL_PATH(filmHolder.id)}>
              {filmHolder.name}
            </Link>
          ) : null}
        />
        <Row label="Exposure" value={exposureDisplay} />
        <Row label="Exposure mode" value={formatPhotographExposureEntryModeLabel(photo)} />
        <Row label="Date" value={takenAt} />
        <Row
          label="Location"
          value={locationLink ? (
            <a className="photo-location-link" href={locationLink.href} target="_blank" rel="noreferrer">
              {locationLink.text}
            </a>
          ) : null}
        />
        <Row label="GPS accuracy" value={photo.gps_accuracy_m != null ? `±${photo.gps_accuracy_m}m` : null} />
        <Row label="Notes" value={photo.notes} />
      </dl>

      {lifecycleRows.length > 0 && (
        <section className="photo-exposure-summary">
          <h2>Lifecycle</h2>
          <dl className="detail-grid">
            {lifecycleRows.map(row => (
              <Row key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
        </section>
      )}

      {exposureSummary && (
        <section className="photo-exposure-summary">
          <h2>Stored exposure calculation</h2>
          <dl className="detail-grid">
            {exposureSummary.rows.map(row => (
              <Row key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>

          {exposureSummary.warnings.length > 0 && (
            <div className="photo-exposure-warnings">
              <h3>Warnings</h3>
              <ul>
                {exposureSummary.warnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="images-section">
        <div className="images-header">
          <h2>Reference images</h2>
          <PhotographImageUploadActions
            disabled={uploading}
            onFilesSelected={handleUploadFiles}
          />
        </div>

        {uploading && <p className="field-note">Uploading…</p>}

        {uploadMessage && <p className="field-note">{uploadMessage}</p>}

        {uploadError && <p className="form-error">{uploadError}</p>}

        {images.length === 0 && <p className="muted">No reference images yet.</p>}

        <div className="image-grid">
          {images.map(img => {
            const isSelected = img.id === selectedImageId;
            const thumbnailUrl = getPhotographImageDisplayUrl(img);
            const openUrl = getPhotographImageOpenUrl(img);
            const canOpenUrl = Boolean(openUrl && isOfflineSafeImageUrl(openUrl));
            const alt = formatPhotographImageLabel(img);
            const dimensions = img.width != null && img.height != null
              ? `${img.width} × ${img.height}px`
              : "Display size";

            return (
              <div key={img.id} className={`image-card${isSelected ? " image-card--selected" : ""}`}>
                <button
                  type="button"
                  className="image-card-select"
                  onClick={() => setSelectedImageId(img.id)}
                  aria-pressed={isSelected}
                  aria-label={`Select ${alt}`}
                >
                  {thumbnailUrl
                    ? <img src={thumbnailUrl} alt={alt} loading="lazy" decoding="async" />
                    : <div className="image-placeholder" />
                  }
                </button>
                <div className="image-card-body">
                  <div className="image-card-title">{alt}</div>
                  <div className="image-card-meta muted">{dimensions}</div>
                  <div className="image-card-actions">
                    {openUrl && (
                      <>
                        <button
                          type="button"
                          className="image-card-open"
                          onClick={() => {
                            const firstSimulation = filterSimulationOptions[0] ?? null;
                            if (firstSimulation) {
                              setSelectedSimulationFilterId(current =>
                                current && filterSimulationOptions.some(option => option.id === current)
                                  ? current
                                  : firstSimulation.id,
                              );
                              setFilterSimulationEnabled(true);
                            } else {
                              setFilterSimulationEnabled(false);
                            }
                            setViewerImageId(img.id);
                          }}
                          disabled={!canOpenUrl}
                        >
                          View larger
                        </button>
                        {canOpenUrl && (
                          <a className="image-card-open image-card-open--secondary" href={openUrl} target="_blank" rel="noreferrer">
                            Open original
                          </a>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      className="image-delete"
                      onClick={() => handleDeleteImage(img.id)}
                      disabled={isOffline}
                      aria-label={`Remove ${alt}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {viewerImage && viewerImageUrl && (
        <div
          className="reference-viewer-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewerImageId(null);
          }}
        >
          <section className="reference-viewer" role="dialog" aria-modal="true" aria-label="Reference image viewer">
            <div className="reference-viewer-header">
              <div>
                <p className="page-count">Reference image</p>
                <h2>{formatPhotographImageLabel(viewerImage)}</h2>
              </div>
              <button type="button" className="link-btn" onClick={() => setViewerImageId(null)}>
                Close
              </button>
            </div>

            <div className="reference-viewer-controls">
              <label className={`reference-filter-toggle${!canSimulateFilter ? " reference-filter-toggle--disabled" : ""}`}>
                <input
                  type="checkbox"
                  checked={activeFilterSimulation}
                  disabled={!canSimulateFilter}
                  onChange={(event) => setFilterSimulationEnabled(event.target.checked)}
                />
                <span>{photoIsMonochrome ? "Simulate B&W filter" : "Simulate color filter"}</span>
              </label>
              {filterSimulationOptions.length > 0 && (
                <label className="reference-filter-color">
                  <span>Filter</span>
                  <select
                    value={selectedFilterSimulation?.id ?? ""}
                    onChange={(event) => {
                      setSelectedSimulationFilterId(event.target.value || null);
                      setFilterSimulationEnabled(Boolean(event.target.value));
                    }}
                  >
                    {filterSimulationOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
              )}
              {!canSimulateFilter && (
                <p className="field-note reference-viewer-note">
                  No selected filters have simulation settings.
                </p>
              )}
            </div>

            <div
              className="reference-viewer-stage"
            >
              <FilterSimulationImage
                src={viewerImageUrl}
                alt={formatPhotographImageLabel(viewerImage)}
                settings={activeFilterSimulation ? selectedFilterSimulation : null}
                mode="filtered"
                monochrome={photoIsMonochrome}
              />
            </div>
          </section>
        </div>
      )}
    </div>
    </CollectionSwipeNavigator>
  );
}

export function PhotoDetailPage() {
  const [searchParams] = useSearchParams();
  const isEditing = searchParams.get("edit") === "1";

  if (isEditing) {
    return <PhotoEditPage />;
  }

  return <PhotoDetailView />;
}
