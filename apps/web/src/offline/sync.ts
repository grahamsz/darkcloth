import { api, type FilmHolder, type FilmHolderLoad, type Photograph, type PhotographImage, type PhotographWritePayload, type Roll, type User } from "../api/client";
import { schedulePhotographImageDisplayUpdate } from "../deferredPhotographImageDisplay";
import type { PreparedPhotographImageUpload } from "../photoImageUpload";
import { OFFLINE_STORE_NAMES, openOfflineDatabase, type FilmHolderCacheRecord, type FilmRollCacheRecord, type PhotographCacheRecord, type ReferenceImageBlobRecord, type ReferenceImageMetadataRecord, type SyncQueueEntry } from "./schema";

function nowIso() {
  return new Date().toISOString();
}

function localId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local-${prefix}-${random}`;
}

function queueRecord(user: Pick<User, "id">, entityType: SyncQueueEntry["entityType"], entityId: string, operation: SyncQueueEntry["operation"], payload: unknown): SyncQueueEntry {
  return {
    id: localId("queue"),
    userId: user.id,
    entityType,
    entityId,
    operation,
    payload,
    createdAt: nowIso(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    status: "pending",
  };
}

function createPreviewUrl(blob: Blob) {
  return typeof URL !== "undefined" && "createObjectURL" in URL
    ? URL.createObjectURL(blob)
    : null;
}

function localPhotographImage(photographId: string, imageId: string, file: File, createdAt: string): PhotographImage {
  return {
    id: imageId,
    photograph_id: photographId,
    content_type: file.type || "application/octet-stream",
    width: null,
    height: null,
    thumbnail_content_type: file.type || null,
    thumbnail_width: null,
    thumbnail_height: null,
    thumbnail_url: null,
    original_content_type: file.type || "application/octet-stream",
    original_width: null,
    original_height: null,
    original_filename: file.name || "reference-image",
    original_url: null,
    url: null,
    created_at: createdAt,
  };
}

function withLocalImagePreview(image: PhotographImage, file: File): PhotographImage {
  const previewUrl = createPreviewUrl(file);
  if (!previewUrl) return image;
  return {
    ...image,
    thumbnail_url: previewUrl,
    url: previewUrl,
    original_url: previewUrl,
  };
}

function imageMetadataRecord(
  user: Pick<User, "id">,
  image: PhotographImage,
  timestamp: string,
  syncStatus: "pending" | "synced" = "pending",
): ReferenceImageMetadataRecord {
  return {
    id: image.id,
    entityId: image.id,
    userId: user.id,
    data: image,
    photographId: image.photograph_id,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    serverRevision: null,
    syncStatus,
  };
}

function imageBlobRecord(image: PhotographImage, file: Blob, timestamp: string, id = image.id): ReferenceImageBlobRecord {
  return {
    id,
    metadataId: id,
    photographId: image.photograph_id,
    blob: file,
    mimeType: file.type || image.content_type,
    localPath: null,
    width: null,
    height: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    serverRevision: null,
    syncStatus: "pending",
  };
}

function normalizeQueuedUpload(upload: File | PreparedPhotographImageUpload): PreparedPhotographImageUpload {
  return upload instanceof File ? { original: upload } : upload;
}

function queuedUploadPreviewFile(upload: PreparedPhotographImageUpload) {
  return upload.thumbnail ?? upload.display ?? upload.original;
}

function queuedUploadPayload(
  photographId: string,
  imageId: string,
  upload: PreparedPhotographImageUpload,
) {
  const displayBlobId = upload.display ? `${imageId}:display` : null;
  const thumbnailBlobId = upload.thumbnail ? `${imageId}:thumbnail` : null;
  return {
    photographId,
    metadataId: imageId,
    fileName: upload.original.name || "reference-image",
    contentType: upload.original.type || "application/octet-stream",
    lastModified: upload.original.lastModified || Date.now(),
    displayBlobId,
    displayFileName: upload.display?.name || null,
    displayContentType: upload.display?.type || null,
    displayLastModified: upload.display?.lastModified || null,
    thumbnailBlobId,
    thumbnailFileName: upload.thumbnail?.name || null,
    thumbnailContentType: upload.thumbnail?.type || null,
    thumbnailLastModified: upload.thumbnail?.lastModified || null,
    deferredDisplay: upload.deferredDisplay ?? null,
  };
}

function queuedUploadBlobRecords(
  image: PhotographImage,
  upload: PreparedPhotographImageUpload,
  timestamp: string,
) {
  const records = [imageBlobRecord(image, upload.original, timestamp)];
  if (upload.display) {
    records.push(imageBlobRecord(image, upload.display, timestamp, `${image.id}:display`));
  }
  if (upload.thumbnail) {
    records.push(imageBlobRecord(image, upload.thumbnail, timestamp, `${image.id}:thumbnail`));
  }
  return records;
}

function photographFromPayload(user: Pick<User, "id">, id: string, payload: PhotographWritePayload): Photograph {
  const now = nowIso();

  return {
    id,
    user_id: user.id,
    roll_id: payload.roll_id ?? null,
    camera_id: payload.camera_id ?? null,
    lens_id: payload.lens_id ?? null,
    film_id: payload.film_id ?? null,
    filter_ids: payload.filter_ids ?? [],
    filters: [],
    frame_number: payload.frame_number ?? null,
    exposure_entry_mode: payload.exposure_entry_mode ?? "manual",
    exposure_details: payload.exposure_details && Object.keys(payload.exposure_details).length > 0
      ? payload.exposure_details as Photograph["exposure_details"]
      : null,
    taken_at: payload.taken_at ?? now,
    aperture: payload.aperture ?? null,
    shutter_speed: payload.shutter_speed ?? null,
    shutter_speed_seconds: payload.shutter_speed_seconds ?? null,
    shutter_mode: payload.shutter_mode ?? "fixed",
    bulb_duration_seconds: payload.bulb_duration_seconds ?? null,
    focal_length_mm: payload.focal_length_mm ?? null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    altitude_m: payload.altitude_m ?? null,
    gps_accuracy_m: payload.gps_accuracy_m ?? null,
    notes: payload.notes ?? null,
    title: payload.title ?? null,
    film_holder_id: payload.film_holder_id ?? null,
    lifecycle_summary: null,
    created_at: now,
    updated_at: now,
    images: { items: [] },
  };
}

function rollFromPayload(user: Pick<User, "id">, id: string, payload: RollWritePayloadWithName): Roll {
  const timestamp = nowIso();
  const loadedAt = payload.loaded_at ?? timestamp;
  const finishedAt = payload.finished_at ?? null;
  const processedAt = payload.processed_at ?? null;
  return {
    id,
    user_id: user.id,
    film_id: payload.film_id ?? null,
    roll_format: payload.roll_format ?? null,
    name: payload.name,
    loaded_at: loadedAt,
    finished_at: finishedAt,
    status: processedAt ? "processed" : finishedAt ? "finished" : "exposing",
    push_pull_stops: payload.push_pull_stops ?? 0,
    processed_at: processedAt,
    developed_at: payload.developed_at ?? processedAt,
    development_profile_id: payload.development_profile_id ?? null,
    development_notes: payload.development_notes ?? null,
    created_at: timestamp,
  };
}

type RollWritePayloadWithName = Parameters<typeof api.createRoll>[0];

async function readCachedFilmHolderRecord(
  db: IDBDatabase,
  user: Pick<User, "id">,
  filmHolderId: string,
): Promise<FilmHolderCacheRecord | null> {
  return new Promise<FilmHolderCacheRecord | null>((resolve) => {
    const tx = db.transaction(OFFLINE_STORE_NAMES.filmHolders, "readonly");
    const request = tx.objectStore(OFFLINE_STORE_NAMES.filmHolders).get(filmHolderId);
    request.onsuccess = () => {
      const record = request.result as FilmHolderCacheRecord | undefined;
      resolve(record?.userId === user.id ? record : null);
    };
    request.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
    tx.onerror = () => resolve(null);
  });
}

async function readCachedFilmRollRecord(
  db: IDBDatabase,
  user: Pick<User, "id">,
  rollId: string,
): Promise<FilmRollCacheRecord | null> {
  return new Promise<FilmRollCacheRecord | null>((resolve) => {
    const tx = db.transaction(OFFLINE_STORE_NAMES.filmRolls, "readonly");
    const request = tx.objectStore(OFFLINE_STORE_NAMES.filmRolls).get(rollId);
    request.onsuccess = () => {
      const record = request.result as FilmRollCacheRecord | undefined;
      resolve(record?.userId === user.id ? record : null);
    };
    request.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
    tx.onerror = () => resolve(null);
  });
}

function photographReferenceImageSummary(image: PhotographImage | null) {
  if (!image) return null;
  return {
    id: image.id,
    content_type: image.content_type,
    width: image.width,
    height: image.height,
    thumbnail_content_type: image.thumbnail_content_type,
    thumbnail_width: image.thumbnail_width,
    thumbnail_height: image.thumbnail_height,
    thumbnail_url: image.thumbnail_url,
    url: image.url,
  };
}

function exposeCachedFilmHolderRecord(
  record: FilmHolderCacheRecord,
  photo: Photograph,
  previewImages: PhotographImage[],
  timestamp: string,
): FilmHolderCacheRecord | null {
  const currentLoad = record.data.current_load;
  if (!currentLoad) return null;

  const firstImage = previewImages[0] ?? null;
  const exposedAt = photo.taken_at ?? timestamp;
  const exposedLoad: FilmHolderLoad = {
    ...currentLoad,
    status: "exposed",
    exposed_at: exposedAt,
    exposed_photograph_id: photo.id,
    exposed_photograph: {
      id: photo.id,
      title: photo.title,
      frame_number: photo.frame_number,
      taken_at: photo.taken_at,
      camera_id: photo.camera_id,
      camera_name: null,
      lens_id: photo.lens_id,
      lens_name: null,
      aperture: photo.aperture,
      shutter_speed: photo.shutter_speed,
      shutter_speed_seconds: photo.shutter_speed_seconds,
      shutter_mode: photo.shutter_mode,
      bulb_duration_seconds: photo.bulb_duration_seconds,
      exposure_entry_mode: photo.exposure_entry_mode,
      reference_image: photographReferenceImageSummary(firstImage),
    },
    updated_at: timestamp,
  };

  return {
    ...record,
    data: {
      ...record.data,
      current_load: exposedLoad,
    },
    updatedAt: timestamp,
    syncStatus: "pending",
  };
}

function exposeCachedFilmRollRecord(
  record: FilmRollCacheRecord,
  timestamp: string,
): FilmRollCacheRecord | null {
  if (record.data.status !== "unexposed") return null;
  const updatedRoll: Roll = {
    ...record.data,
    status: "exposing",
  };
  return {
    ...record,
    data: updatedRoll,
    updatedAt: timestamp,
    syncStatus: "pending",
  };
}

export async function queueOfflinePhotographCreate(
  user: Pick<User, "id">,
  payload: PhotographWritePayload,
  referenceImageFiles: File[] = [],
): Promise<Photograph> {
  const db = await openOfflineDatabase();
  if (!db) throw new Error("IndexedDB is not available.");

  const photoId = localId("photo");
  const timestamp = nowIso();
  const queuedImages = referenceImageFiles.map((file) => {
    const image = localPhotographImage(photoId, localId("photo-image"), file, timestamp);
    return {
      file,
      image,
      previewImage: withLocalImagePreview(image, file),
      metadataRecord: imageMetadataRecord(user, image, timestamp),
      blobRecord: imageBlobRecord(image, file, timestamp),
      entry: queueRecord(user, "photo_image", image.id, "upload", {
        photographId: photoId,
        metadataId: image.id,
        fileName: file.name || "reference-image",
        contentType: file.type || "application/octet-stream",
        lastModified: file.lastModified || Date.now(),
      }),
    };
  });
  const photo = {
    ...photographFromPayload(user, photoId, payload),
    images: { items: queuedImages.map((queued) => queued.image) },
  };
  const returnedPhoto = {
    ...photo,
    images: { items: queuedImages.map((queued) => queued.previewImage) },
  };
  const cachedFilmHolderRecord = payload.film_holder_id
    ? await readCachedFilmHolderRecord(db, user, payload.film_holder_id)
    : null;
  const cachedFilmRollRecord = payload.roll_id
    ? await readCachedFilmRollRecord(db, user, payload.roll_id)
    : null;
  const exposedFilmHolderRecord = cachedFilmHolderRecord
    ? exposeCachedFilmHolderRecord(
        cachedFilmHolderRecord,
        returnedPhoto,
        queuedImages.map((queued) => queued.previewImage),
        timestamp,
      )
    : null;
  const exposedFilmRollRecord = cachedFilmRollRecord
    ? exposeCachedFilmRollRecord(cachedFilmRollRecord, timestamp)
    : null;
  const photoRecord: PhotographCacheRecord = {
    id: photoId,
    entityId: photoId,
    userId: user.id,
    data: photo,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    serverRevision: null,
    syncStatus: "pending",
    rollId: photo.roll_id,
    filmHolderId: photo.film_holder_id,
    takenAt: photo.taken_at,
  };
  const entry = queueRecord(user, "photo", photoId, "create", payload);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([
      OFFLINE_STORE_NAMES.photographs,
      OFFLINE_STORE_NAMES.filmHolders,
      OFFLINE_STORE_NAMES.filmRolls,
      OFFLINE_STORE_NAMES.referenceImageMetadata,
      OFFLINE_STORE_NAMES.referenceImageBlobs,
      OFFLINE_STORE_NAMES.syncQueue,
    ], "readwrite");
    tx.objectStore(OFFLINE_STORE_NAMES.photographs).put(photoRecord);
    if (exposedFilmHolderRecord) {
      tx.objectStore(OFFLINE_STORE_NAMES.filmHolders).put(exposedFilmHolderRecord);
    }
    if (exposedFilmRollRecord) {
      tx.objectStore(OFFLINE_STORE_NAMES.filmRolls).put(exposedFilmRollRecord);
    }
    tx.objectStore(OFFLINE_STORE_NAMES.syncQueue).put(entry);
    const metadataStore = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageMetadata);
    const blobStore = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageBlobs);
    const queueStore = tx.objectStore(OFFLINE_STORE_NAMES.syncQueue);
    for (const queued of queuedImages) {
      metadataStore.put(queued.metadataRecord);
      blobStore.put(queued.blobRecord);
      queueStore.put(queued.entry);
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Offline queue transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Offline queue transaction failed"));
  });

  return returnedPhoto;
}

export async function queueOfflinePhotographUpdate(
  user: Pick<User, "id">,
  photograph: Photograph,
  payload: PhotographWritePayload,
): Promise<Photograph> {
  const db = await openOfflineDatabase();
  if (!db) throw new Error("IndexedDB is not available.");

  const timestamp = nowIso();
  const nextPhoto: Photograph = {
    ...photograph,
    ...payload,
    filter_ids: payload.filter_ids ?? photograph.filter_ids,
    filters: payload.filter_ids ? [] : photograph.filters,
    exposure_details: payload.exposure_details === undefined
      ? photograph.exposure_details
      : payload.exposure_details && Object.keys(payload.exposure_details).length > 0
        ? payload.exposure_details as Photograph["exposure_details"]
        : null,
    updated_at: timestamp,
  };
  const photoRecord: PhotographCacheRecord = {
    id: photograph.id,
    entityId: photograph.id,
    userId: user.id,
    data: nextPhoto,
    createdAt: photograph.created_at,
    updatedAt: timestamp,
    deletedAt: null,
    serverRevision: null,
    syncStatus: "pending",
    rollId: nextPhoto.roll_id,
    filmHolderId: nextPhoto.film_holder_id,
    takenAt: nextPhoto.taken_at,
  };
  const entry = queueRecord(user, "photo", photograph.id, "update", {
    photographId: photograph.id,
    payload,
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([OFFLINE_STORE_NAMES.photographs, OFFLINE_STORE_NAMES.syncQueue], "readwrite");
    tx.objectStore(OFFLINE_STORE_NAMES.photographs).put(photoRecord);
    tx.objectStore(OFFLINE_STORE_NAMES.syncQueue).put(entry);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Offline photo update transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Offline photo update transaction failed"));
  });

  return nextPhoto;
}

export async function queueOfflinePhotographImageUpload(
  user: Pick<User, "id">,
  photographId: string,
  uploadDraft: File | PreparedPhotographImageUpload,
): Promise<PhotographImage> {
  const db = await openOfflineDatabase();
  if (!db) throw new Error("IndexedDB is not available.");

  const upload = normalizeQueuedUpload(uploadDraft);
  const timestamp = nowIso();
  const image = localPhotographImage(photographId, localId("photo-image"), upload.original, timestamp);
  const metadataRecord = imageMetadataRecord(user, image, timestamp);
  const blobRecords = queuedUploadBlobRecords(image, upload, timestamp);
  const entry = queueRecord(user, "photo_image", image.id, "upload", {
    ...queuedUploadPayload(photographId, image.id, upload),
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([
      OFFLINE_STORE_NAMES.referenceImageMetadata,
      OFFLINE_STORE_NAMES.referenceImageBlobs,
      OFFLINE_STORE_NAMES.syncQueue,
    ], "readwrite");
    tx.objectStore(OFFLINE_STORE_NAMES.referenceImageMetadata).put(metadataRecord);
    const blobStore = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageBlobs);
    for (const blobRecord of blobRecords) {
      blobStore.put(blobRecord);
    }
    tx.objectStore(OFFLINE_STORE_NAMES.syncQueue).put(entry);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Offline image queue transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Offline image queue transaction failed"));
  });

  return withLocalImagePreview(image, queuedUploadPreviewFile(upload));
}

export async function deleteOfflineLocalPhotograph(
  user: Pick<User, "id">,
  photographId: string,
): Promise<void> {
  if (!photographId.startsWith("local-photo-")) {
    throw new Error("Only photographs created while offline can be deleted while offline.");
  }

  const db = await openOfflineDatabase();
  if (!db) throw new Error("IndexedDB is not available.");

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([
      OFFLINE_STORE_NAMES.photographs,
      OFFLINE_STORE_NAMES.syncQueue,
      OFFLINE_STORE_NAMES.referenceImageMetadata,
      OFFLINE_STORE_NAMES.referenceImageBlobs,
    ], "readwrite");
    tx.objectStore(OFFLINE_STORE_NAMES.photographs).delete(photographId);

    const queueStore = tx.objectStore(OFFLINE_STORE_NAMES.syncQueue);
    const queueRequest = queueStore.getAll();
    queueRequest.onsuccess = () => {
      for (const entry of queueRequest.result as SyncQueueEntry[]) {
        if (entry.entityType === "photo" && entry.entityId === photographId) {
          queueStore.delete(entry.id);
          continue;
        }
        if (entry.entityType !== "photo_image") continue;
        const payload = entry.payload as { photographId?: string };
        if (payload.photographId === photographId) queueStore.delete(entry.id);
      }
    };

    const metadataStore = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageMetadata);
    const metadataRequest = metadataStore.getAll();
    metadataRequest.onsuccess = () => {
      for (const record of metadataRequest.result as ReferenceImageMetadataRecord[]) {
        if (record.photographId === photographId) metadataStore.delete(record.id);
      }
    };

    const blobStore = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageBlobs);
    const blobRequest = blobStore.getAll();
    blobRequest.onsuccess = () => {
      for (const record of blobRequest.result as ReferenceImageBlobRecord[]) {
        if (record.photographId === photographId) blobStore.delete(record.id);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Offline photo delete transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Offline photo delete transaction failed"));
  });
}

function cachedRecord<T>(user: Pick<User, "id">, entityId: string, data: T, timestamp: string) {
  return {
    id: entityId,
    entityId,
    userId: user.id,
    data,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    serverRevision: null,
    syncStatus: "pending" as const,
  };
}

export async function queueOfflineRollAction(
  user: Pick<User, "id">,
  roll: Roll,
  action: "finish" | "process" | "reopen",
  payload?: Record<string, unknown>,
): Promise<Roll> {
  const db = await openOfflineDatabase();
  if (!db) throw new Error("IndexedDB is not available.");

  const timestamp = nowIso();
  const nextRoll: Roll = {
    ...roll,
    status: action === "finish" ? "finished" : action === "process" ? "processed" : "exposing",
    finished_at: action === "finish" ? (payload?.finished_at as string | undefined) ?? timestamp : action === "reopen" ? null : roll.finished_at,
    processed_at: action === "process" ? (payload?.processed_at as string | undefined) ?? timestamp : roll.processed_at,
    developed_at: action === "process" ? (payload?.developed_at as string | undefined) ?? (payload?.processed_at as string | undefined) ?? timestamp : roll.developed_at,
    development_profile_id: action === "process" ? (payload?.development_profile_id as string | null | undefined) ?? null : roll.development_profile_id,
    development_notes: action === "process" ? (payload?.development_notes as string | null | undefined) ?? null : roll.development_notes,
  };
  const rollRecord: FilmRollCacheRecord = {
    ...cachedRecord(user, roll.id, nextRoll, timestamp),
  };
  const entry = queueRecord(user, "film_roll", roll.id, "update", { action, rollId: roll.id, payload });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([OFFLINE_STORE_NAMES.filmRolls, OFFLINE_STORE_NAMES.syncQueue], "readwrite");
    tx.objectStore(OFFLINE_STORE_NAMES.filmRolls).put(rollRecord);
    tx.objectStore(OFFLINE_STORE_NAMES.syncQueue).put(entry);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Offline roll transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Offline roll transaction failed"));
  });

  return nextRoll;
}

export async function queueOfflineRollCreate(
  user: Pick<User, "id">,
  payload: RollWritePayloadWithName,
): Promise<Roll> {
  const db = await openOfflineDatabase();
  if (!db) throw new Error("IndexedDB is not available.");

  const timestamp = nowIso();
  const rollId = localId("roll");
  const roll = rollFromPayload(user, rollId, payload);
  const rollRecord: FilmRollCacheRecord = {
    ...cachedRecord(user, rollId, roll, timestamp),
  };
  const entry = queueRecord(user, "film_roll", rollId, "create", payload);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([OFFLINE_STORE_NAMES.filmRolls, OFFLINE_STORE_NAMES.syncQueue], "readwrite");
    tx.objectStore(OFFLINE_STORE_NAMES.filmRolls).put(rollRecord);
    tx.objectStore(OFFLINE_STORE_NAMES.syncQueue).put(entry);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Offline roll create transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Offline roll create transaction failed"));
  });

  return roll;
}

export async function queueOfflineFilmHolderAction(
  user: Pick<User, "id">,
  holder: FilmHolder,
  action: "load" | "unload" | "process" | "undo" | "discard",
  payload?: Record<string, unknown>,
): Promise<FilmHolder> {
  const db = await openOfflineDatabase();
  if (!db) throw new Error("IndexedDB is not available.");

  const timestamp = nowIso();
  const currentLoad = holder.current_load ?? null;
  let nextCurrentLoad: FilmHolderLoad | null = currentLoad;
  const nextHistory = holder.load_history ? [...holder.load_history] : [];

  if (action === "load") {
    nextCurrentLoad = {
      id: localId("holder-load"),
      user_id: user.id,
      film_holder_id: holder.id,
      film_id: payload?.film_id as string,
      status: "loaded",
      loaded_at: timestamp,
      exposed_at: null,
      exposed_photograph_id: null,
      processed_at: null,
      discarded_at: null,
      discarded_reason: null,
      development_profile_id: null,
      development_profile: null,
      development_summary: null,
      exposed_photograph: null,
      notes: (payload?.notes as string | null | undefined) ?? null,
      created_at: timestamp,
      updated_at: timestamp,
      film: null,
    };
  } else if (currentLoad) {
    nextCurrentLoad = {
      ...currentLoad,
      status: action === "process" ? "processed" : action === "discard" ? "discarded" : action === "undo" ? "loaded" : currentLoad.status,
      exposed_at: action === "undo" ? null : currentLoad.exposed_at,
      exposed_photograph_id: action === "undo" ? null : currentLoad.exposed_photograph_id,
      processed_at: action === "process" ? timestamp : currentLoad.processed_at,
      discarded_at: action === "discard" ? timestamp : currentLoad.discarded_at,
      discarded_reason: action === "discard" ? ((payload?.reason as string | null | undefined) ?? "Discarded offline") : currentLoad.discarded_reason,
      development_profile_id: action === "process" ? ((payload?.development_profile_id as string | null | undefined) ?? null) : currentLoad.development_profile_id,
      notes: action === "process" ? ((payload?.notes as string | null | undefined) ?? currentLoad.notes) : currentLoad.notes,
      updated_at: timestamp,
    };
    if (nextCurrentLoad.status === "processed" || nextCurrentLoad.status === "discarded") {
      nextHistory.unshift(nextCurrentLoad);
      nextCurrentLoad = null;
    }
  }

  const nextHolder: FilmHolder = {
    ...holder,
    current_load: action === "unload" ? null : nextCurrentLoad,
    load_history: nextHistory,
  };
  const holderRecord: FilmHolderCacheRecord = {
    ...cachedRecord(user, holder.id, nextHolder, timestamp),
  };
  const entry = queueRecord(user, "film_holder_load", holder.id, "update", { action, holderId: holder.id, payload });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([OFFLINE_STORE_NAMES.filmHolders, OFFLINE_STORE_NAMES.syncQueue], "readwrite");
    tx.objectStore(OFFLINE_STORE_NAMES.filmHolders).put(holderRecord);
    tx.objectStore(OFFLINE_STORE_NAMES.syncQueue).put(entry);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Offline holder transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Offline holder transaction failed"));
  });

  return nextHolder;
}

async function putQueueEntry(db: IDBDatabase, entry: SyncQueueEntry) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE_NAMES.syncQueue, "readwrite");
    tx.objectStore(OFFLINE_STORE_NAMES.syncQueue).put(entry);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Sync queue transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Sync queue transaction failed"));
  });
}

async function readPendingEntriesForUser(db: IDBDatabase, user: Pick<User, "id">) {
  const syncPriority = (entry: SyncQueueEntry) => {
    if (entry.entityType === "film_roll" && entry.operation === "create") return 0;
    if (entry.entityType === "photo" && entry.operation === "create") return 1;
    if (entry.entityType === "photo" && entry.operation === "update") return 2;
    if (entry.entityType === "photo_image" && entry.operation === "upload") return 3;
    return 4;
  };

  return new Promise<SyncQueueEntry[]>((resolve) => {
    const tx = db.transaction(OFFLINE_STORE_NAMES.syncQueue, "readonly");
    const request = tx.objectStore(OFFLINE_STORE_NAMES.syncQueue).getAll();
    request.onsuccess = () => {
      resolve((request.result as SyncQueueEntry[])
        .filter((entry) => entry.userId === user.id && (entry.status === "pending" || entry.status === "failed"))
        .sort((a, b) => {
          const priorityDiff = syncPriority(a) - syncPriority(b);
          if (priorityDiff !== 0) return priorityDiff;
          return a.createdAt.localeCompare(b.createdAt);
        }));
    };
    request.onerror = () => resolve([]);
    tx.onabort = () => resolve([]);
    tx.onerror = () => resolve([]);
  });
}

async function readCompletedPhotoIdRemaps(db: IDBDatabase, user: Pick<User, "id">) {
  return new Promise<Map<string, string>>((resolve) => {
    const remaps = new Map<string, string>();
    const tx = db.transaction(OFFLINE_STORE_NAMES.syncQueue, "readonly");
    const request = tx.objectStore(OFFLINE_STORE_NAMES.syncQueue).getAll();
    request.onsuccess = () => {
      for (const entry of request.result as SyncQueueEntry[]) {
        if (entry.userId !== user.id || entry.entityType !== "photo" || entry.operation !== "create" || entry.status !== "done") continue;
        const payload = entry.payload as { serverPhotoId?: unknown };
        if (typeof payload.serverPhotoId === "string" && payload.serverPhotoId.trim()) {
          remaps.set(entry.entityId, payload.serverPhotoId);
        }
      }
      resolve(remaps);
    };
    request.onerror = () => resolve(remaps);
    tx.onabort = () => resolve(remaps);
    tx.onerror = () => resolve(remaps);
  });
}

async function readCompletedRollIdRemaps(db: IDBDatabase, user: Pick<User, "id">) {
  return new Promise<Map<string, string>>((resolve) => {
    const remaps = new Map<string, string>();
    const tx = db.transaction(OFFLINE_STORE_NAMES.syncQueue, "readonly");
    const request = tx.objectStore(OFFLINE_STORE_NAMES.syncQueue).getAll();
    request.onsuccess = () => {
      for (const entry of request.result as SyncQueueEntry[]) {
        if (entry.userId !== user.id || entry.entityType !== "film_roll" || entry.operation !== "create" || entry.status !== "done") continue;
        const payload = entry.payload as { serverRollId?: unknown };
        if (typeof payload.serverRollId === "string" && payload.serverRollId.trim()) {
          remaps.set(entry.entityId, payload.serverRollId);
        }
      }
      resolve(remaps);
    };
    request.onerror = () => resolve(remaps);
    tx.onabort = () => resolve(remaps);
    tx.onerror = () => resolve(remaps);
  });
}

function remapPhotographPayloadRollId(
  payload: PhotographWritePayload,
  rollIdRemaps: Map<string, string>,
): PhotographWritePayload {
  if (!payload.roll_id) return payload;
  const serverRollId = rollIdRemaps.get(payload.roll_id);
  return serverRollId ? { ...payload, roll_id: serverRollId } : payload;
}

async function replaceCachedLocalPhoto(
  db: IDBDatabase,
  user: Pick<User, "id">,
  localPhotoId: string,
  serverPhoto: Photograph,
) {
  const timestamp = nowIso();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE_NAMES.photographs, "readwrite");
    const store = tx.objectStore(OFFLINE_STORE_NAMES.photographs);
    store.delete(localPhotoId);
    store.put({
      id: serverPhoto.id,
      entityId: serverPhoto.id,
      userId: user.id,
      data: serverPhoto,
      createdAt: serverPhoto.created_at ?? timestamp,
      updatedAt: serverPhoto.updated_at ?? timestamp,
      deletedAt: null,
      serverRevision: null,
      syncStatus: "synced",
      rollId: serverPhoto.roll_id,
      filmHolderId: serverPhoto.film_holder_id,
      takenAt: serverPhoto.taken_at,
    } satisfies PhotographCacheRecord);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Cached photo replacement aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Cached photo replacement failed"));
  });
}

async function cacheSyncedPhotograph(
  db: IDBDatabase,
  user: Pick<User, "id">,
  photograph: Photograph,
) {
  const timestamp = nowIso();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE_NAMES.photographs, "readwrite");
    tx.objectStore(OFFLINE_STORE_NAMES.photographs).put({
      id: photograph.id,
      entityId: photograph.id,
      userId: user.id,
      data: photograph,
      createdAt: photograph.created_at ?? timestamp,
      updatedAt: photograph.updated_at ?? timestamp,
      deletedAt: null,
      serverRevision: null,
      syncStatus: "synced",
      rollId: photograph.roll_id,
      filmHolderId: photograph.film_holder_id,
      takenAt: photograph.taken_at,
    } satisfies PhotographCacheRecord);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Cached photo update aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Cached photo update failed"));
  });
}

async function replaceCachedLocalRoll(
  db: IDBDatabase,
  user: Pick<User, "id">,
  localRollId: string,
  serverRoll: Roll,
) {
  const timestamp = nowIso();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE_NAMES.filmRolls, "readwrite");
    const store = tx.objectStore(OFFLINE_STORE_NAMES.filmRolls);
    store.delete(localRollId);
    store.put({
      id: serverRoll.id,
      entityId: serverRoll.id,
      userId: user.id,
      data: serverRoll,
      createdAt: serverRoll.created_at ?? timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      serverRevision: null,
      syncStatus: "synced",
    } satisfies FilmRollCacheRecord);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Cached roll replacement aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Cached roll replacement failed"));
  });
}

async function remapCachedPhotographRolls(
  db: IDBDatabase,
  localRollId: string,
  serverRollId: string,
) {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([OFFLINE_STORE_NAMES.photographs, OFFLINE_STORE_NAMES.syncQueue], "readwrite");
    const photoStore = tx.objectStore(OFFLINE_STORE_NAMES.photographs);
    const queueStore = tx.objectStore(OFFLINE_STORE_NAMES.syncQueue);

    const photoRequest = photoStore.getAll();
    photoRequest.onsuccess = () => {
      for (const record of photoRequest.result as PhotographCacheRecord[]) {
        if (record.data.roll_id !== localRollId && record.rollId !== localRollId) continue;
        photoStore.put({
          ...record,
          data: {
            ...record.data,
            roll_id: serverRollId,
          },
          rollId: serverRollId,
        });
      }
    };

    const queueRequest = queueStore.getAll();
    queueRequest.onsuccess = () => {
      for (const entry of queueRequest.result as SyncQueueEntry[]) {
        if (entry.entityType !== "photo") continue;
        const payload = entry.payload as PhotographWritePayload | { payload?: PhotographWritePayload };
        if ("payload" in payload && payload.payload?.roll_id === localRollId) {
          queueStore.put({
            ...entry,
            payload: {
              ...payload,
              payload: {
                ...payload.payload,
                roll_id: serverRollId,
              },
            },
          });
        } else if ("roll_id" in payload && payload.roll_id === localRollId) {
          queueStore.put({
            ...entry,
            payload: {
              ...payload,
              roll_id: serverRollId,
            },
          });
        }
      }
    };

    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Cached photo roll remap aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Cached photo roll remap failed"));
  });
}

async function remapQueuedImageUploads(
  db: IDBDatabase,
  localPhotoId: string,
  serverPhotoId: string,
) {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([
      OFFLINE_STORE_NAMES.syncQueue,
      OFFLINE_STORE_NAMES.referenceImageMetadata,
      OFFLINE_STORE_NAMES.referenceImageBlobs,
    ], "readwrite");
    const queueStore = tx.objectStore(OFFLINE_STORE_NAMES.syncQueue);
    const metadataStore = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageMetadata);
    const blobStore = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageBlobs);

    const queueRequest = queueStore.getAll();
    queueRequest.onsuccess = () => {
      for (const entry of queueRequest.result as SyncQueueEntry[]) {
        if (entry.entityType !== "photo_image" || entry.operation !== "upload") continue;
        const payload = entry.payload as { photographId?: string };
        if (payload.photographId !== localPhotoId) continue;
        queueStore.put({
          ...entry,
          payload: {
            ...payload,
            photographId: serverPhotoId,
          },
        });
      }
    };

    const metadataRequest = metadataStore.getAll();
    metadataRequest.onsuccess = () => {
      for (const record of metadataRequest.result as ReferenceImageMetadataRecord[]) {
        if (record.photographId !== localPhotoId) continue;
        metadataStore.put({
          ...record,
          photographId: serverPhotoId,
          data: {
            ...record.data,
            photograph_id: serverPhotoId,
          },
        });
      }
    };

    const blobRequest = blobStore.getAll();
    blobRequest.onsuccess = () => {
      for (const record of blobRequest.result as ReferenceImageBlobRecord[]) {
        if (record.photographId !== localPhotoId) continue;
        blobStore.put({
          ...record,
          photographId: serverPhotoId,
        });
      }
    };

    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Queued image remap aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Queued image remap failed"));
  });
}

async function remapCachedFilmHolderPhotograph(
  db: IDBDatabase,
  user: Pick<User, "id">,
  localPhotoId: string,
  serverPhoto: Photograph,
) {
  if (!serverPhoto.film_holder_id) return;
  const record = await readCachedFilmHolderRecord(db, user, serverPhoto.film_holder_id);
  if (!record?.data.current_load) return;
  const load = record.data.current_load;
  if (load.exposed_photograph_id !== localPhotoId) return;

  const updatedLoad: FilmHolderLoad = {
    ...load,
    exposed_photograph_id: serverPhoto.id,
    exposed_photograph: load.exposed_photograph
      ? {
          ...load.exposed_photograph,
          id: serverPhoto.id,
          title: serverPhoto.title,
          taken_at: serverPhoto.taken_at,
          frame_number: serverPhoto.frame_number,
          camera_id: serverPhoto.camera_id,
          lens_id: serverPhoto.lens_id,
          aperture: serverPhoto.aperture,
          shutter_speed: serverPhoto.shutter_speed,
          shutter_speed_seconds: serverPhoto.shutter_speed_seconds,
          shutter_mode: serverPhoto.shutter_mode,
          bulb_duration_seconds: serverPhoto.bulb_duration_seconds,
          exposure_entry_mode: serverPhoto.exposure_entry_mode,
        }
      : null,
    updated_at: serverPhoto.updated_at,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE_NAMES.filmHolders, "readwrite");
    tx.objectStore(OFFLINE_STORE_NAMES.filmHolders).put({
      ...record,
      data: {
        ...record.data,
        current_load: updatedLoad,
      },
      updatedAt: serverPhoto.updated_at,
      syncStatus: "synced",
    } satisfies FilmHolderCacheRecord);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Cached holder photo remap aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Cached holder photo remap failed"));
  });
}

async function readQueuedImageBlob(
  db: IDBDatabase,
  metadataId: string,
): Promise<ReferenceImageBlobRecord | null> {
  return new Promise<ReferenceImageBlobRecord | null>((resolve) => {
    const tx = db.transaction(OFFLINE_STORE_NAMES.referenceImageBlobs, "readonly");
    const request = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageBlobs).get(metadataId);
    request.onsuccess = () => resolve((request.result as ReferenceImageBlobRecord | undefined) ?? null);
    request.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
    tx.onerror = () => resolve(null);
  });
}

async function storeSyncedImage(
  db: IDBDatabase,
  user: Pick<User, "id">,
  localMetadataId: string,
  serverImage: PhotographImage,
  sourceBlob: Blob,
  extraLocalBlobIds: string[] = [],
) {
  const timestamp = nowIso();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([
      OFFLINE_STORE_NAMES.referenceImageMetadata,
      OFFLINE_STORE_NAMES.referenceImageBlobs,
    ], "readwrite");
    const metadataStore = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageMetadata);
    const blobStore = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageBlobs);
    metadataStore.delete(localMetadataId);
    blobStore.delete(localMetadataId);
    for (const blobId of extraLocalBlobIds) {
      blobStore.delete(blobId);
    }
    metadataStore.put(imageMetadataRecord(user, serverImage, timestamp, "synced"));
    blobStore.put({
      ...imageBlobRecord(serverImage, sourceBlob, timestamp),
      syncStatus: "synced",
    });
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Synced image cache transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Synced image cache transaction failed"));
  });
}

export async function syncPendingQueueForUser(user: Pick<User, "id">): Promise<void> {
  const db = await openOfflineDatabase();
  if (!db) return;

  const entries = await readPendingEntriesForUser(db, user);
  const photoIdRemaps = await readCompletedPhotoIdRemaps(db, user);
  const rollIdRemaps = await readCompletedRollIdRemaps(db, user);

  for (const entry of entries) {
    if (entry.userId !== user.id) continue;

    const syncingEntry: SyncQueueEntry = {
      ...entry,
      status: "syncing",
      attempts: entry.attempts + 1,
      lastAttemptAt: nowIso(),
      lastError: null,
    };
    await putQueueEntry(db, syncingEntry);

    try {
      if (entry.entityType === "film_roll" && entry.operation === "create") {
        const createdRoll = await api.createRoll(entry.payload as RollWritePayloadWithName);
        rollIdRemaps.set(entry.entityId, createdRoll.id);
        await replaceCachedLocalRoll(db, user, entry.entityId, createdRoll);
        await remapCachedPhotographRolls(db, entry.entityId, createdRoll.id);
      } else if (entry.entityType === "photo" && entry.operation === "create") {
        const createdPhoto = await api.createPhotograph(remapPhotographPayloadRollId(entry.payload as PhotographWritePayload, rollIdRemaps));
        photoIdRemaps.set(entry.entityId, createdPhoto.id);
        await replaceCachedLocalPhoto(db, user, entry.entityId, createdPhoto);
        await remapCachedFilmHolderPhotograph(db, user, entry.entityId, createdPhoto);
        await remapQueuedImageUploads(db, entry.entityId, createdPhoto.id);
      } else if (entry.entityType === "photo" && entry.operation === "update") {
        const payload = entry.payload as { photographId: string; payload: PhotographWritePayload };
        const photographId = photoIdRemaps.get(payload.photographId) ?? payload.photographId;
        if (photographId.startsWith("local-photo-")) {
          throw new Error("Photograph has not synced yet.");
        }
        const updatedPhoto = await api.updatePhotograph(photographId, remapPhotographPayloadRollId(payload.payload, rollIdRemaps));
        await cacheSyncedPhotograph(db, user, updatedPhoto);
      } else if (entry.entityType === "photo_image" && entry.operation === "upload") {
        const payload = entry.payload as {
          photographId: string;
          metadataId: string;
          fileName?: string;
          contentType?: string;
          lastModified?: number;
          displayBlobId?: string | null;
          displayFileName?: string | null;
          displayContentType?: string | null;
          displayLastModified?: number | null;
          thumbnailBlobId?: string | null;
          thumbnailFileName?: string | null;
          thumbnailContentType?: string | null;
          thumbnailLastModified?: number | null;
          deferredDisplay?: PreparedPhotographImageUpload["deferredDisplay"] | null;
        };
        const photographId = photoIdRemaps.get(payload.photographId) ?? payload.photographId;
        if (photographId.startsWith("local-photo-")) {
          throw new Error("Photograph must sync before its reference images can upload.");
        }

        const blobRecord = await readQueuedImageBlob(db, payload.metadataId);
        if (!blobRecord?.blob) throw new Error("Queued reference image bytes are missing.");
        const original = new File(
          [blobRecord.blob],
          payload.fileName?.trim() || "reference-image",
          {
            type: payload.contentType || blobRecord.mimeType || blobRecord.blob.type || "application/octet-stream",
            lastModified: payload.lastModified ?? Date.now(),
          },
        );
        const displayBlobRecord = payload.displayBlobId
          ? await readQueuedImageBlob(db, payload.displayBlobId)
          : null;
        const thumbnailBlobRecord = payload.thumbnailBlobId
          ? await readQueuedImageBlob(db, payload.thumbnailBlobId)
          : null;
        const display = displayBlobRecord?.blob
          ? new File(
              [displayBlobRecord.blob],
              payload.displayFileName?.trim() || "reference.display.jpg",
              {
                type: payload.displayContentType || displayBlobRecord.mimeType || displayBlobRecord.blob.type || "image/jpeg",
                lastModified: payload.displayLastModified ?? Date.now(),
              },
            )
          : undefined;
        const thumbnail = thumbnailBlobRecord?.blob
          ? new File(
              [thumbnailBlobRecord.blob],
              payload.thumbnailFileName?.trim() || "reference.thumbnail.jpg",
              {
                type: payload.thumbnailContentType || thumbnailBlobRecord.mimeType || thumbnailBlobRecord.blob.type || "image/jpeg",
                lastModified: payload.thumbnailLastModified ?? Date.now(),
              },
            )
          : undefined;
        const uploadedImage = await api.uploadPhotographImage(photographId, {
          original,
          ...(display ? { display } : {}),
          ...(thumbnail ? { thumbnail } : {}),
          ...(payload.deferredDisplay ? { deferredDisplay: payload.deferredDisplay } : {}),
        });
        if (payload.deferredDisplay) {
          await schedulePhotographImageDisplayUpdate({
            photoId: photographId,
            imageId: uploadedImage.id,
            original,
            options: payload.deferredDisplay,
          });
        }
        await storeSyncedImage(
          db,
          user,
          payload.metadataId,
          uploadedImage,
          thumbnailBlobRecord?.blob ?? displayBlobRecord?.blob ?? blobRecord.blob,
          [payload.displayBlobId, payload.thumbnailBlobId].filter((id): id is string => Boolean(id)),
        );
      } else if (entry.entityType === "film_roll" && entry.operation === "update") {
        const payload = entry.payload as { action: "finish" | "process" | "reopen"; rollId: string; payload?: Record<string, unknown> };
        const rollId = rollIdRemaps.get(payload.rollId) ?? payload.rollId;
        if (payload.action === "finish") await api.finishRoll(rollId, payload.payload as { finished_at?: string | null } | undefined);
        else if (payload.action === "process") await api.processRoll(rollId, payload.payload as Parameters<typeof api.processRoll>[1]);
        else await api.reopenRoll(rollId);
      } else if (entry.entityType === "film_holder_load" && entry.operation === "update") {
        const payload = entry.payload as { action: "load" | "unload" | "process" | "undo" | "discard"; holderId: string; payload?: Record<string, unknown> };
        if (payload.action === "load") await api.loadFilmHolder(payload.holderId, payload.payload as { film_id: string; notes?: string | null });
        else if (payload.action === "unload") await api.unloadFilmHolder(payload.holderId);
        else if (payload.action === "process") await api.processFilmHolderLoad(payload.holderId, payload.payload as { development_profile_id?: string | null; notes?: string | null });
        else if (payload.action === "undo") await api.undoFilmHolderExposure(payload.holderId, payload.payload as { clear_photograph_holder?: boolean } | undefined);
        else await api.discardFilmHolderLoad(payload.holderId, payload.payload as { reason?: string | null; notes?: string | null } | undefined);
      } else {
        throw new Error(`Unsupported offline sync operation: ${entry.entityType}/${entry.operation}`);
      }

      await putQueueEntry(db, {
        ...syncingEntry,
        payload: entry.entityType === "photo" && entry.operation === "create" && photoIdRemaps.has(entry.entityId)
          ? { ...(entry.payload as Record<string, unknown>), serverPhotoId: photoIdRemaps.get(entry.entityId) }
          : entry.entityType === "film_roll" && entry.operation === "create" && rollIdRemaps.has(entry.entityId)
            ? { ...(entry.payload as Record<string, unknown>), serverRollId: rollIdRemaps.get(entry.entityId) }
            : syncingEntry.payload,
        status: "done",
        lastError: null,
      });
    } catch (error) {
      await putQueueEntry(db, {
        ...syncingEntry,
        status: "failed",
        lastError: error instanceof Error ? error.message : "Sync failed",
      });
    }
  }
}
