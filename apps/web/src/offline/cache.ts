import {
  api,
  type Camera,
  type DevelopmentProfile,
  type FilmHolder,
  type FilmHolderLoad,
  type FilmStock,
  type Filter,
  type Lens,
  type Photograph,
  type PhotographImage,
  type Roll,
  type User,
} from "../api/client";
import {
  OFFLINE_STORE_NAMES,
  openOfflineDatabase,
  type CameraCacheRecord,
  type DevelopmentProfileCacheRecord,
  type FilmHolderCacheRecord,
  type FilmHolderLoadCacheRecord,
  type FilmRollCacheRecord,
  type FilmStockCacheRecord,
  type FilterCacheRecord,
  type LensCacheRecord,
  type PhotographCacheRecord,
  type ReferenceImageMetadataRecord,
  type ReferenceImageBlobRecord,
} from "./schema";
import { readServiceWorkerRegistrationDiagnostics, type ServiceWorkerRegistrationDiagnostics } from "../pwa";

const OFFLINE_CACHE_LAST_REFRESH_KEY_PREFIX = "darkcloth-offline-cache-last-refresh";
const DEVELOPMENT_PROFILE_PAGE_SIZE = 200;
const FILTER_PAGE_SIZE = 200;
const PHOTOGRAPH_PAGE_SIZE = 200;

export type PwaDisplayMode = "standalone" | "browser";

export interface OfflineCacheStats {
  cameraCount: number;
  lensCount: number;
  filterCount: number;
  filmStockCount: number;
  rollCount: number;
  filmHolderCount: number;
  photographCount: number;
  developmentProfileCount: number;
  btzsProfileCount: number;
  lastRefreshedAt: string | null;
}

export interface OfflineRuntimeReadiness {
  serviceWorkerSupported: boolean;
  serviceWorkerReady: boolean;
  serviceWorkerControlled: boolean;
  serviceWorkerRegistrationState: string | null;
  serviceWorkerRegistrationDiagnostics: ServiceWorkerRegistrationDiagnostics;
  displayMode: PwaDisplayMode;
  indexedDbSupported: boolean;
  cacheStats: OfflineCacheStats;
}

function nowIso() {
  return new Date().toISOString();
}

function isIosStandaloneNavigator(navigatorLike: Navigator | undefined) {
  return Boolean((navigatorLike as Navigator & { standalone?: boolean } | undefined)?.standalone);
}

export function getPwaDisplayMode(
  windowLike: Pick<Window, "matchMedia"> | undefined = typeof window === "undefined" ? undefined : window,
  navigatorLike: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator,
): PwaDisplayMode {
  if (windowLike?.matchMedia?.("(display-mode: standalone)").matches || isIosStandaloneNavigator(navigatorLike)) {
    return "standalone";
  }

  return "browser";
}

function lastRefreshKey(userId: string | null | undefined) {
  return userId ? `${OFFLINE_CACHE_LAST_REFRESH_KEY_PREFIX}:${userId}` : OFFLINE_CACHE_LAST_REFRESH_KEY_PREFIX;
}

function readLastRefresh(userId: string | null | undefined) {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(lastRefreshKey(userId));
}

function writeLastRefresh(userId: string, value: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(lastRefreshKey(userId), value);
}

function cacheRecordBase<T>(
  user: Pick<User, "id">,
  entityId: string,
  data: T,
  timestamp: string,
) {
  return {
    id: entityId,
    entityId,
    userId: user.id,
    data,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    serverRevision: null,
    syncStatus: "synced" as const,
  };
}

function replaceUserScopedRecords<T extends { entityId: string; userId: string | null }>(
  db: IDBDatabase,
  storeName: string,
  userId: string,
  nextRecords: T[],
) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    const nextIds = new Set(nextRecords.map((record) => record.entityId));

    request.onsuccess = () => {
      const existing = request.result as T[];
      for (const record of existing) {
        if (record.userId === userId && !nextIds.has(record.entityId)) {
          store.delete(record.entityId);
        }
      }

      for (const record of nextRecords) {
        store.put(record);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function listAllDevelopmentProfiles(filmStockId: string) {
  const profiles: DevelopmentProfile[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const response = await api.listDevelopmentProfiles(filmStockId, {
      limit: DEVELOPMENT_PROFILE_PAGE_SIZE,
      offset,
    });
    profiles.push(...response.items);
    total = response.total;
    if (response.items.length < DEVELOPMENT_PROFILE_PAGE_SIZE) break;
    offset += response.items.length;
  }

  return profiles;
}

async function listAllFilters() {
  const filters: Filter[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const response = await api.listFilters({
      limit: FILTER_PAGE_SIZE,
      offset,
    });
    filters.push(...response.items);
    total = response.total;
    if (response.items.length < FILTER_PAGE_SIZE) break;
    offset += response.items.length;
  }

  return filters;
}

async function listAllPhotographs() {
  const photographs: Photograph[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const response = await api.listPhotographs({
      limit: PHOTOGRAPH_PAGE_SIZE,
      offset,
    });
    photographs.push(...response.items);
    total = response.total;
    if (response.items.length < PHOTOGRAPH_PAGE_SIZE) break;
    offset += response.items.length;
  }

  return photographs;
}

type CacheLoadResult<T> = { ok: true; value: T } | { ok: false };

async function loadCacheSection<T>(load: () => Promise<T>): Promise<CacheLoadResult<T>> {
  try {
    return { ok: true, value: await load() };
  } catch {
    return { ok: false };
  }
}

export async function refreshOfflineDataCache(user: Pick<User, "id">): Promise<OfflineCacheStats> {
  const db = await openOfflineDatabase();
  if (!db) {
    throw new Error("IndexedDB is not available.");
  }

  const [
    cameraLoad,
    lensLoad,
    filterLoad,
    filmStockLoad,
    rollLoad,
    filmHolderLoad,
    photographLoad,
  ] = await Promise.all([
    loadCacheSection(() => api.listCameras().then((response) => response.items)),
    loadCacheSection(() => api.listLenses().then((response) => response.items)),
    loadCacheSection(() => listAllFilters()),
    loadCacheSection(() => api.listFilmStocks().then((response) => response.items)),
    loadCacheSection(() => api.listRolls().then((response) => response.items)),
    loadCacheSection(() => api.listFilmHolders().then((response) => response.items)),
    loadCacheSection(() => listAllPhotographs()),
  ]);

  const timestamp = nowIso();
  const writes: Promise<void>[] = [];

  if (cameraLoad.ok) {
    const cameraRecords: CameraCacheRecord[] = cameraLoad.value.map((camera) => ({
      ...cacheRecordBase(user, camera.id, camera, timestamp),
    }));
    writes.push(replaceUserScopedRecords(db, OFFLINE_STORE_NAMES.cameras, user.id, cameraRecords));
  }

  if (lensLoad.ok) {
    const lensRecords: LensCacheRecord[] = lensLoad.value.map((lens) => ({
      ...cacheRecordBase(user, lens.id, lens, timestamp),
    }));
    writes.push(replaceUserScopedRecords(db, OFFLINE_STORE_NAMES.lenses, user.id, lensRecords));
  }

  if (filterLoad.ok) {
    const filterRecords: FilterCacheRecord[] = filterLoad.value.map((filter) => ({
      ...cacheRecordBase(user, filter.id, filter, timestamp),
    }));
    writes.push(replaceUserScopedRecords(db, OFFLINE_STORE_NAMES.filters, user.id, filterRecords));
  }

  if (filmStockLoad.ok) {
    const filmRecords: FilmStockCacheRecord[] = filmStockLoad.value.map((filmStock) => ({
      ...cacheRecordBase(user, filmStock.id, filmStock, timestamp),
    }));
    writes.push(replaceUserScopedRecords(db, OFFLINE_STORE_NAMES.filmStocks, user.id, filmRecords));

    const profileGroupLoads = await Promise.all(
      filmStockLoad.value.map((filmStock) => loadCacheSection(async () => ({
        filmStock,
        profiles: await listAllDevelopmentProfiles(filmStock.id),
      }))),
    );
    if (profileGroupLoads.every((group): group is { ok: true; value: { filmStock: FilmStock; profiles: DevelopmentProfile[] } } => group.ok)) {
      const profileRecords: DevelopmentProfileCacheRecord[] = profileGroupLoads.flatMap(({ value: { filmStock, profiles } }) =>
        profiles.map((profile) => ({
          ...cacheRecordBase(user, profile.id, profile, timestamp),
          filmStockId: filmStock.id,
          profileType: profile.type,
          chartData: profile.type === "btzs" ? profile.chartData : null,
        })),
      );
      writes.push(replaceUserScopedRecords(db, OFFLINE_STORE_NAMES.developmentProfiles, user.id, profileRecords));
    }
  }

  if (rollLoad.ok) {
    const rollRecords: FilmRollCacheRecord[] = rollLoad.value.map((roll) => ({
      ...cacheRecordBase(user, roll.id, roll, timestamp),
    }));
    writes.push(replaceUserScopedRecords(db, OFFLINE_STORE_NAMES.filmRolls, user.id, rollRecords));
  }

  if (filmHolderLoad.ok) {
    const holderRecords: FilmHolderCacheRecord[] = filmHolderLoad.value.map((filmHolder) => ({
      ...cacheRecordBase(user, filmHolder.id, filmHolder, timestamp),
    }));
    writes.push(replaceUserScopedRecords(db, OFFLINE_STORE_NAMES.filmHolders, user.id, holderRecords));

    const holderLoadGroups = await Promise.all(
      filmHolderLoad.value.map(async (filmHolder) => ({
        filmHolder,
        loads: await api.listFilmHolderLoads(filmHolder.id)
          .then((response) => response.items)
          .catch(() => [] as FilmHolderLoad[]),
      })),
    );
    const holderLoadRecords: FilmHolderLoadCacheRecord[] = holderLoadGroups.flatMap(({ filmHolder, loads }) =>
      loads.map((load) => ({
        ...cacheRecordBase(user, load.id, load, timestamp),
        filmHolderId: filmHolder.id,
        status: load.status,
      })),
    );
    writes.push(replaceUserScopedRecords(db, OFFLINE_STORE_NAMES.filmHolderLoads, user.id, holderLoadRecords));
  }

  if (photographLoad.ok) {
    const imageGroups = await Promise.all(
      photographLoad.value.map(async (photograph) => ({
        photograph,
        images: await api.listPhotographImages(photograph.id)
          .then((response) => response.items)
          .catch(() => photograph.images?.items ?? [] as PhotographImage[]),
      })),
    );
    const photographImages = imageGroups.flatMap((group) => group.images);
    const photographRecords: PhotographCacheRecord[] = photographLoad.value.map((photograph) => ({
      ...cacheRecordBase(user, photograph.id, photograph, timestamp),
      rollId: photograph.roll_id,
      filmHolderId: photograph.film_holder_id,
      takenAt: photograph.taken_at,
    }));
    const photographImageRecords: ReferenceImageMetadataRecord[] = photographImages.map((image) => ({
      ...cacheRecordBase(user, image.id, image, timestamp),
      photographId: image.photograph_id,
    }));
    const photographImageBlobRecords = await cachePhotographImageBlobs(photographImages, timestamp);
    writes.push(
      replaceUserScopedRecords(db, OFFLINE_STORE_NAMES.photographs, user.id, photographRecords),
      replaceUserScopedRecords(db, OFFLINE_STORE_NAMES.referenceImageMetadata, user.id, photographImageRecords),
      replaceReferenceImageBlobRecords(db, photographImageBlobRecords),
    );
  }

  if (writes.length > 0) {
    await Promise.all(writes);
    writeLastRefresh(user.id, timestamp);
  }

  return readOfflineCacheStats(user);
}

function imageBlobUrl(image: PhotographImage) {
  return image.thumbnail_url ?? image.url ?? image.original_url ?? null;
}

async function cachePhotographImageBlobs(images: PhotographImage[], timestamp: string): Promise<ReferenceImageBlobRecord[]> {
  const records: ReferenceImageBlobRecord[] = [];

  await Promise.all(images.map(async (image) => {
    const url = imageBlobUrl(image);
    if (!url) return;

    try {
      const response = await fetch(url);
      if (!response.ok) return;

      const blob = await response.blob();
      records.push({
        id: image.id,
        metadataId: image.id,
        photographId: image.photograph_id,
        blob,
        mimeType: blob.type || image.thumbnail_content_type || image.content_type || image.original_content_type,
        localPath: null,
        width: image.thumbnail_width ?? image.width ?? image.original_width,
        height: image.thumbnail_height ?? image.height ?? image.original_height,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        serverRevision: null,
        syncStatus: "synced",
      });
    } catch {
      // Image bytes are best-effort; metadata is still useful offline.
    }
  }));

  return records;
}

function replaceReferenceImageBlobRecords(
  db: IDBDatabase,
  records: ReferenceImageBlobRecord[],
) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE_NAMES.referenceImageBlobs, "readwrite");
    const store = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageBlobs);
    for (const record of records) {
      store.put(record);
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB image blob transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB image blob transaction failed"));
  });
}

async function countRecords<T>(db: IDBDatabase, storeName: string, predicate: (record: T) => boolean) {
  return new Promise<number>((resolve) => {
    let settled = false;
    const settle = (value: number) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => settle((request.result as T[]).filter(predicate).length);
      request.onerror = () => settle(0);
      tx.onabort = () => settle(0);
      tx.onerror = () => settle(0);
    } catch {
      settle(0);
    }
  });
}

export async function readOfflineCacheStats(user: Pick<User, "id"> | null): Promise<OfflineCacheStats> {
  const lastRefreshedAt = readLastRefresh(user?.id);
  if (!user) {
    return {
      cameraCount: 0,
      lensCount: 0,
      filterCount: 0,
      filmStockCount: 0,
      rollCount: 0,
      filmHolderCount: 0,
      photographCount: 0,
      developmentProfileCount: 0,
      btzsProfileCount: 0,
      lastRefreshedAt,
    };
  }

  const db = await openOfflineDatabase();
  if (!db) {
    return {
      cameraCount: 0,
      lensCount: 0,
      filterCount: 0,
      filmStockCount: 0,
      rollCount: 0,
      filmHolderCount: 0,
      photographCount: 0,
      developmentProfileCount: 0,
      btzsProfileCount: 0,
      lastRefreshedAt,
    };
  }

  const [
    cameraCount,
    lensCount,
    filterCount,
    filmStockCount,
    rollCount,
    filmHolderCount,
    photographCount,
    developmentProfileCount,
    btzsProfileCount,
  ] = await Promise.all([
    countRecords<CameraCacheRecord>(
      db,
      OFFLINE_STORE_NAMES.cameras,
      (record) => record.userId === user.id,
    ),
    countRecords<LensCacheRecord>(
      db,
      OFFLINE_STORE_NAMES.lenses,
      (record) => record.userId === user.id,
    ),
    countRecords<FilterCacheRecord>(
      db,
      OFFLINE_STORE_NAMES.filters,
      (record) => record.userId === user.id,
    ),
    countRecords<FilmStockCacheRecord>(
      db,
      OFFLINE_STORE_NAMES.filmStocks,
      (record) => record.userId === user.id,
    ),
    countRecords<FilmRollCacheRecord>(
      db,
      OFFLINE_STORE_NAMES.filmRolls,
      (record) => record.userId === user.id,
    ),
    countRecords<FilmHolderCacheRecord>(
      db,
      OFFLINE_STORE_NAMES.filmHolders,
      (record) => record.userId === user.id,
    ),
    countRecords<PhotographCacheRecord>(
      db,
      OFFLINE_STORE_NAMES.photographs,
      (record) => record.userId === user.id,
    ),
    countRecords<DevelopmentProfileCacheRecord>(
      db,
      OFFLINE_STORE_NAMES.developmentProfiles,
      (record) => record.userId === user.id,
    ),
    countRecords<DevelopmentProfileCacheRecord>(
      db,
      OFFLINE_STORE_NAMES.developmentProfiles,
      (record) => record.userId === user.id && record.profileType === "btzs",
    ),
  ]);

  return {
    cameraCount,
    lensCount,
    filterCount,
    filmStockCount,
    rollCount,
    filmHolderCount,
    photographCount,
    developmentProfileCount,
    btzsProfileCount,
    lastRefreshedAt,
  };
}

async function readCachedRecords<TRecord extends { userId: string | null; data: TData }, TData>(
  user: Pick<User, "id"> | null,
  storeName: string,
  sort?: (a: TData, b: TData) => number,
): Promise<TData[]> {
  if (!user) return [];

  const db = await openOfflineDatabase();
  if (!db) return [];

  return new Promise<TData[]>((resolve) => {
    let settled = false;
    const settle = (value: TData[]) => {
      if (settled) return;
      settled = true;
      resolve(sort ? [...value].sort(sort) : value);
    };

    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result as TRecord[];
        settle(records
          .filter((record) => record.userId === user.id)
          .map((record) => record.data));
      };
      request.onerror = () => settle([]);
      tx.onabort = () => settle([]);
      tx.onerror = () => settle([]);
    } catch {
      settle([]);
    }
  });
}

async function readCachedRecord<TRecord extends { userId: string | null; entityId: string; data: TData }, TData>(
  user: Pick<User, "id"> | null,
  storeName: string,
  entityId: string,
): Promise<TData | null> {
  if (!user) return null;

  const db = await openOfflineDatabase();
  if (!db) return null;

  return new Promise<TData | null>((resolve) => {
    let settled = false;
    const settle = (value: TData | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.get(entityId);
      request.onsuccess = () => {
        const record = request.result as TRecord | undefined;
        settle(record?.userId === user.id ? record.data : null);
      };
      request.onerror = () => settle(null);
      tx.onabort = () => settle(null);
      tx.onerror = () => settle(null);
    } catch {
      settle(null);
    }
  });
}

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const byTakenAtDesc = (a: Photograph, b: Photograph) =>
  (b.taken_at ?? b.created_at ?? "").localeCompare(a.taken_at ?? a.created_at ?? "");

async function readCachedPhotographImagesByPhoto(
  user: Pick<User, "id"> | null,
  photographIds: Set<string> | null = null,
): Promise<Map<string, PhotographImage[]>> {
  const grouped = new Map<string, PhotographImage[]>();
  if (!user) return grouped;

  const db = await openOfflineDatabase();
  if (!db) return grouped;

  return new Promise<Map<string, PhotographImage[]>>((resolve) => {
    let settled = false;
    const settle = (value: Map<string, PhotographImage[]>) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const tx = db.transaction([OFFLINE_STORE_NAMES.referenceImageMetadata, OFFLINE_STORE_NAMES.referenceImageBlobs], "readonly");
      const metadataRequest = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageMetadata).getAll();
      const blobRequest = tx.objectStore(OFFLINE_STORE_NAMES.referenceImageBlobs).getAll();
      let metadataRecords: ReferenceImageMetadataRecord[] | null = null;
      let blobRecords: ReferenceImageBlobRecord[] | null = null;

      const maybeSettle = () => {
        if (!metadataRecords || !blobRecords) return;
        const blobsByMetadataId = new Map(blobRecords.map((record) => [record.metadataId, record]));
        const next = new Map<string, PhotographImage[]>();

        for (const record of metadataRecords) {
          if (record.userId !== user.id) continue;
          if (photographIds && !photographIds.has(record.photographId)) continue;

          const blobRecord = blobsByMetadataId.get(record.entityId);
          const localUrl = blobRecord?.blob ? URL.createObjectURL(blobRecord.blob) : null;
          const image = localUrl
            ? {
                ...record.data,
                thumbnail_url: localUrl,
                url: localUrl,
              }
            : record.data;
          const list = next.get(record.photographId) ?? [];
          list.push(image);
          next.set(record.photographId, list);
        }

        settle(next);
      };

      metadataRequest.onsuccess = () => {
        metadataRecords = metadataRequest.result as ReferenceImageMetadataRecord[];
        maybeSettle();
      };
      blobRequest.onsuccess = () => {
        blobRecords = blobRequest.result as ReferenceImageBlobRecord[];
        maybeSettle();
      };
      metadataRequest.onerror = () => settle(grouped);
      blobRequest.onerror = () => settle(grouped);
      tx.onabort = () => settle(grouped);
      tx.onerror = () => settle(grouped);
    } catch {
      settle(grouped);
    }
  });
}

function withCachedPhotographImages(photo: Photograph, images: PhotographImage[] | undefined): Photograph {
  if (!images || images.length === 0) return photo;
  return {
    ...photo,
    images: { items: images },
  };
}

function hydrateFilmHolderLoadWithCachedImages(
  load: FilmHolderLoad,
  imagesByPhoto: Map<string, PhotographImage[]>,
): FilmHolderLoad {
  const photograph = load.exposed_photograph ?? null;
  const photographId = load.exposed_photograph_id ?? photograph?.id ?? null;
  if (!photograph || !photographId) return load;

  const images = imagesByPhoto.get(photographId) ?? [];
  const existingReference = photograph.reference_image;
  const image = images.find((candidate) => candidate.id === existingReference?.id) ?? images[0] ?? null;
  const thumbnailUrl = image?.thumbnail_url ?? image?.url ?? null;
  if (!image || !thumbnailUrl) return load;

  return {
    ...load,
    exposed_photograph: {
      ...photograph,
      reference_image: {
        id: existingReference?.id ?? image.id,
        content_type: existingReference?.content_type ?? image.content_type,
        width: existingReference?.width ?? image.width,
        height: existingReference?.height ?? image.height,
        thumbnail_content_type: existingReference?.thumbnail_content_type ?? image.thumbnail_content_type,
        thumbnail_width: existingReference?.thumbnail_width ?? image.thumbnail_width,
        thumbnail_height: existingReference?.thumbnail_height ?? image.thumbnail_height,
        thumbnail_url: thumbnailUrl,
        url: image.url ?? thumbnailUrl,
      },
    },
  };
}

async function hydrateFilmHoldersWithCachedImages(
  user: Pick<User, "id"> | null,
  holders: FilmHolder[],
): Promise<FilmHolder[]> {
  const photographIds = new Set<string>();
  for (const holder of holders) {
    for (const load of [holder.current_load, ...(holder.load_history ?? [])]) {
      const photographId = load?.exposed_photograph_id ?? load?.exposed_photograph?.id ?? null;
      if (photographId) photographIds.add(photographId);
    }
  }
  if (photographIds.size === 0) return holders;

  const imagesByPhoto = await readCachedPhotographImagesByPhoto(user, photographIds);
  return holders.map((holder) => ({
    ...holder,
    current_load: holder.current_load ? hydrateFilmHolderLoadWithCachedImages(holder.current_load, imagesByPhoto) : holder.current_load,
    load_history: holder.load_history?.map((load) => hydrateFilmHolderLoadWithCachedImages(load, imagesByPhoto)),
  }));
}

export const readCachedCameras = (user: Pick<User, "id"> | null) =>
  readCachedRecords<CameraCacheRecord, Camera>(user, OFFLINE_STORE_NAMES.cameras, byName);

export const readCachedCamera = (user: Pick<User, "id"> | null, id: string) =>
  readCachedRecord<CameraCacheRecord, Camera>(user, OFFLINE_STORE_NAMES.cameras, id);

export const readCachedLenses = (user: Pick<User, "id"> | null) =>
  readCachedRecords<LensCacheRecord, Lens>(user, OFFLINE_STORE_NAMES.lenses, byName);

export const readCachedLens = (user: Pick<User, "id"> | null, id: string) =>
  readCachedRecord<LensCacheRecord, Lens>(user, OFFLINE_STORE_NAMES.lenses, id);

export const readCachedFilters = (user: Pick<User, "id"> | null) =>
  readCachedRecords<FilterCacheRecord, Filter>(user, OFFLINE_STORE_NAMES.filters, byName);

export const readCachedFilter = (user: Pick<User, "id"> | null, id: string) =>
  readCachedRecord<FilterCacheRecord, Filter>(user, OFFLINE_STORE_NAMES.filters, id);

export const readCachedRolls = (user: Pick<User, "id"> | null) =>
  readCachedRecords<FilmRollCacheRecord, Roll>(user, OFFLINE_STORE_NAMES.filmRolls, byName);

export const readCachedRoll = (user: Pick<User, "id"> | null, id: string) =>
  readCachedRecord<FilmRollCacheRecord, Roll>(user, OFFLINE_STORE_NAMES.filmRolls, id);

export async function readCachedFilmHolders(user: Pick<User, "id"> | null) {
  const holders = await readCachedRecords<FilmHolderCacheRecord, FilmHolder>(user, OFFLINE_STORE_NAMES.filmHolders, byName);
  return hydrateFilmHoldersWithCachedImages(user, holders);
}

export async function readCachedFilmHolder(user: Pick<User, "id"> | null, id: string) {
  const holder = await readCachedRecord<FilmHolderCacheRecord, FilmHolder>(user, OFFLINE_STORE_NAMES.filmHolders, id);
  if (!holder) return null;
  return (await hydrateFilmHoldersWithCachedImages(user, [holder]))[0] ?? holder;
}

export async function readCachedPhotographs(user: Pick<User, "id"> | null) {
  const photos = await readCachedRecords<PhotographCacheRecord, Photograph>(user, OFFLINE_STORE_NAMES.photographs, byTakenAtDesc);
  const imagesByPhoto = await readCachedPhotographImagesByPhoto(user, new Set(photos.map((photo) => photo.id)));
  return photos.map((photo) => withCachedPhotographImages(photo, imagesByPhoto.get(photo.id)));
}

export async function readCachedPhotograph(user: Pick<User, "id"> | null, id: string) {
  const photo = await readCachedRecord<PhotographCacheRecord, Photograph>(user, OFFLINE_STORE_NAMES.photographs, id);
  if (!photo) return null;
  const imagesByPhoto = await readCachedPhotographImagesByPhoto(user, new Set([id]));
  return withCachedPhotographImages(photo, imagesByPhoto.get(id));
}

export const readCachedFilmStock = (user: Pick<User, "id"> | null, id: string) =>
  readCachedRecord<FilmStockCacheRecord, FilmStock>(user, OFFLINE_STORE_NAMES.filmStocks, id);

export async function readCachedFilmHolderLoads(
  user: Pick<User, "id"> | null,
  filmHolderId: string,
): Promise<FilmHolderLoad[]> {
  if (!user) return [];

  const db = await openOfflineDatabase();
  if (!db) return [];

  return new Promise<FilmHolderLoad[]>((resolve) => {
    let settled = false;
    const settle = (value: FilmHolderLoad[]) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const tx = db.transaction(OFFLINE_STORE_NAMES.filmHolderLoads, "readonly");
      const store = tx.objectStore(OFFLINE_STORE_NAMES.filmHolderLoads);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result as FilmHolderLoadCacheRecord[];
        const loads = records
          .filter((record) => record.userId === user.id && record.filmHolderId === filmHolderId)
          .map((record) => record.data)
          .sort((a, b) => (b.loaded_at ?? b.created_at ?? "").localeCompare(a.loaded_at ?? a.created_at ?? ""));
        const photographIds = new Set(
          loads
            .map((load) => load.exposed_photograph_id ?? load.exposed_photograph?.id ?? null)
            .filter((id): id is string => Boolean(id)),
        );
        void readCachedPhotographImagesByPhoto(user, photographIds)
          .then((imagesByPhoto) => settle(loads.map((load) => hydrateFilmHolderLoadWithCachedImages(load, imagesByPhoto))))
          .catch(() => settle(loads));
      };
      request.onerror = () => settle([]);
      tx.onabort = () => settle([]);
      tx.onerror = () => settle([]);
    } catch {
      settle([]);
    }
  });
}

export async function readCachedPhotographImages(
  user: Pick<User, "id"> | null,
  photographId: string,
): Promise<PhotographImage[]> {
  if (!user) return [];

  const db = await openOfflineDatabase();
  if (!db) return [];

  return new Promise<PhotographImage[]>((resolve) => {
    let settled = false;
    const settle = (value: PhotographImage[]) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      void readCachedPhotographImagesByPhoto(user, new Set([photographId]))
        .then((imagesByPhoto) => settle(imagesByPhoto.get(photographId) ?? []))
        .catch(() => settle([]));
    } catch {
      settle([]);
    }
  });
}

export async function readCachedDevelopmentProfiles(
  user: Pick<User, "id"> | null,
  filmStockId: string,
): Promise<DevelopmentProfile[]> {
  if (!user) return [];

  const db = await openOfflineDatabase();
  if (!db) return [];

  return new Promise<DevelopmentProfile[]>((resolve) => {
    let settled = false;
    const settle = (value: DevelopmentProfile[]) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const tx = db.transaction(OFFLINE_STORE_NAMES.developmentProfiles, "readonly");
      const store = tx.objectStore(OFFLINE_STORE_NAMES.developmentProfiles);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result as DevelopmentProfileCacheRecord[];
        settle(records
          .filter((record) => record.userId === user.id && record.filmStockId === filmStockId)
          .map((record) => record.data));
      };
      request.onerror = () => settle([]);
      tx.onabort = () => settle([]);
      tx.onerror = () => settle([]);
    } catch {
      settle([]);
    }
  });
}

export async function readCachedFilmStocks(user: Pick<User, "id"> | null): Promise<FilmStock[]> {
  if (!user) return [];

  const db = await openOfflineDatabase();
  if (!db) return [];

  return new Promise<FilmStock[]>((resolve) => {
    let settled = false;
    const settle = (value: FilmStock[]) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const tx = db.transaction(OFFLINE_STORE_NAMES.filmStocks, "readonly");
      const store = tx.objectStore(OFFLINE_STORE_NAMES.filmStocks);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result as FilmStockCacheRecord[];
        settle(records
          .filter((record) => record.userId === user.id)
          .map((record) => record.data)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
      };
      request.onerror = () => settle([]);
      tx.onabort = () => settle([]);
      tx.onerror = () => settle([]);
    } catch {
      settle([]);
    }
  });
}

export async function readOfflineRuntimeReadiness(user: Pick<User, "id"> | null): Promise<OfflineRuntimeReadiness> {
  const serviceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator
    ? navigator.serviceWorker
    : null;

  let serviceWorkerRegistrationState: string | null = null;
  if (serviceWorker) {
    try {
      const registration = await serviceWorker.getRegistration();
      if (registration?.installing) {
        serviceWorkerRegistrationState = `installing:${registration.installing.state}`;
      } else if (registration?.waiting) {
        serviceWorkerRegistrationState = `waiting:${registration.waiting.state}`;
      } else if (registration?.active) {
        serviceWorkerRegistrationState = `active:${registration.active.state}`;
      } else {
        serviceWorkerRegistrationState = registration ? "empty" : "none";
      }
    } catch {
      serviceWorkerRegistrationState = "unavailable";
    }
  }

  const serviceWorkerReady = serviceWorker
    ? await Promise.race([
        serviceWorker.ready.then(() => true).catch(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
      ])
    : false;

  return {
    serviceWorkerSupported: Boolean(serviceWorker),
    serviceWorkerReady,
    serviceWorkerControlled: Boolean(serviceWorker?.controller),
    serviceWorkerRegistrationState,
    serviceWorkerRegistrationDiagnostics: readServiceWorkerRegistrationDiagnostics(),
    displayMode: getPwaDisplayMode(),
    indexedDbSupported: typeof indexedDB !== "undefined" && Boolean(await openOfflineDatabase()),
    cacheStats: await readOfflineCacheStats(user),
  };
}
