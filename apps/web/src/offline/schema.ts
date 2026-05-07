import type {
  BTZSChartData,
  Camera,
  DevelopmentProfile,
  Filter,
  FilmHolder,
  FilmHolderLoad,
  FilmStock,
  Lens,
  Photograph,
  PhotographImage,
  Roll,
} from "../api/client";
import type { ReferenceImageProcessingOptions } from "../referenceImageProcessing";

export const OFFLINE_DB_NAME = "darkcloth-offline";
export const OFFLINE_DB_VERSION = 4;

export type RecordSyncStatus = "synced" | "pending" | "failed" | "conflict";

export interface SyncMetadata {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  serverRevision?: string | number | null;
  syncStatus?: RecordSyncStatus;
}

export interface CachedRecord<T> extends SyncMetadata {
  entityId: string;
  userId: string | null;
  data: T;
}

export type CameraCacheRecord = CachedRecord<Camera>;
export type LensCacheRecord = CachedRecord<Lens>;
export type FilterCacheRecord = CachedRecord<Filter>;
export type FilmStockCacheRecord = CachedRecord<FilmStock>;
export type FilmRollCacheRecord = CachedRecord<Roll>;
export type FilmHolderCacheRecord = CachedRecord<FilmHolder>;

export interface FilmHolderLoadCacheRecord extends CachedRecord<FilmHolderLoad> {
  filmHolderId: string;
  status: FilmHolderLoad["status"];
}

export interface DevelopmentProfileCacheRecord extends CachedRecord<DevelopmentProfile> {
  filmStockId: string;
  profileType: DevelopmentProfile["type"];
  chartData: BTZSChartData[] | null;
}

export interface PhotographCacheRecord extends CachedRecord<Photograph> {
  rollId: string | null;
  filmHolderId: string | null;
  takenAt: string | null;
}

export interface ReferenceImageMetadataRecord extends CachedRecord<PhotographImage> {
  photographId: string;
}

export interface ReferenceImageBlobRecord extends SyncMetadata {
  metadataId: string;
  photographId: string;
  blob: Blob | null;
  mimeType: string | null;
  localPath: string | null;
  width: number | null;
  height: number | null;
}

export interface ReferenceImageProcessingJobRecord extends SyncMetadata {
  userId: string | null;
  photoId: string;
  imageId: string;
  original: Blob | null;
  originalName: string;
  originalType: string | null;
  options: ReferenceImageProcessingOptions;
  attempts: number;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  status: "pending" | "processing" | "failed" | "done";
}

export type SyncQueueEntityType =
  | "camera"
  | "lens"
  | "filter"
  | "film_stock"
  | "film_roll"
  | "film_holder"
  | "film_holder_load"
  | "development_profile"
  | "photo"
  | "photo_image";

export type SyncQueueOperation = "create" | "update" | "delete" | "upload";

export interface SyncQueueEntry {
  id: string;
  userId: string;
  entityType: SyncQueueEntityType;
  entityId: string;
  operation: SyncQueueOperation;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  status: "pending" | "syncing" | "failed" | "done";
}

export interface SyncQueueCounts {
  pendingCount: number;
  failedCount: number;
}

interface StoreIndexDefinition {
  name: string;
  keyPath: string;
  options?: IDBIndexParameters;
}

interface StoreDefinition {
  name: OfflineStoreName;
  indexes: readonly StoreIndexDefinition[];
}

export const OFFLINE_STORE_NAMES = {
  cameras: "cameras",
  lenses: "lenses",
  filters: "filters",
  filmStocks: "film_stocks",
  filmRolls: "film_rolls",
  filmHolders: "film_holders",
  filmHolderLoads: "film_holder_loads",
  developmentProfiles: "development_profiles",
  btzsChartData: "btzs_chart_data",
  photographs: "photographs",
  referenceImageMetadata: "reference_image_metadata",
  referenceImageBlobs: "reference_image_blobs",
  referenceImageProcessingJobs: "reference_image_processing_jobs",
  syncQueue: "sync_queue",
} as const;

export type OfflineStoreName = typeof OFFLINE_STORE_NAMES[keyof typeof OFFLINE_STORE_NAMES];

export const OFFLINE_STORE_DEFINITIONS: readonly StoreDefinition[] = [
  {
    name: OFFLINE_STORE_NAMES.cameras,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.lenses,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.filters,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.filmStocks,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.filmRolls,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.filmHolders,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.filmHolderLoads,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "filmHolderId", keyPath: "filmHolderId" },
      { name: "status", keyPath: "status" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.developmentProfiles,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "filmStockId", keyPath: "filmStockId" },
      { name: "profileType", keyPath: "profileType" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.btzsChartData,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "profileId", keyPath: "profileId" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.photographs,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "rollId", keyPath: "rollId" },
      { name: "filmHolderId", keyPath: "filmHolderId" },
      { name: "takenAt", keyPath: "takenAt" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.referenceImageMetadata,
    indexes: [
      { name: "entityId", keyPath: "entityId" },
      { name: "userId", keyPath: "userId" },
      { name: "photographId", keyPath: "photographId" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.referenceImageBlobs,
    indexes: [
      { name: "metadataId", keyPath: "metadataId" },
      { name: "photographId", keyPath: "photographId" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.referenceImageProcessingJobs,
    indexes: [
      { name: "photoId", keyPath: "photoId" },
      { name: "imageId", keyPath: "imageId" },
      { name: "status", keyPath: "status" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.syncQueue,
    indexes: [
      { name: "status", keyPath: "status" },
      { name: "entityType", keyPath: "entityType" },
      { name: "entityId", keyPath: "entityId" },
      { name: "createdAt", keyPath: "createdAt" },
      { name: "attempts", keyPath: "attempts" },
    ],
  },
] as const;

const ZERO_COUNTS: SyncQueueCounts = { pendingCount: 0, failedCount: 0 };

let openDatabasePromise: Promise<IDBDatabase | null> | null = null;

export function openOfflineDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  if (openDatabasePromise) {
    return openDatabasePromise;
  }

  openDatabasePromise = new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const definition of OFFLINE_STORE_DEFINITIONS) {
        if (db.objectStoreNames.contains(definition.name)) continue;
        const store = db.createObjectStore(definition.name, { keyPath: "id" });
        for (const index of definition.indexes) {
          store.createIndex(index.name, index.keyPath, index.options);
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        openDatabasePromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      openDatabasePromise = null;
      resolve(null);
    };

    request.onblocked = () => {
      openDatabasePromise = null;
      resolve(null);
    };
  });

  return openDatabasePromise;
}

function countSyncQueueEntries(entries: SyncQueueEntry[]): SyncQueueCounts {
  let pendingCount = 0;
  let failedCount = 0;

  for (const entry of entries) {
    if (entry.status === "failed") {
      failedCount += 1;
    }

    if (entry.status === "pending" || entry.status === "syncing") {
      pendingCount += 1;
    }
  }

  return { pendingCount, failedCount };
}

export async function readSyncQueueCounts(): Promise<SyncQueueCounts> {
  const db = await openOfflineDatabase();
  if (!db) {
    return ZERO_COUNTS;
  }

  return new Promise<SyncQueueCounts>((resolve) => {
    let settled = false;
    const settle = (value: SyncQueueCounts) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const tx = db.transaction(OFFLINE_STORE_NAMES.syncQueue, "readonly");
      const store = tx.objectStore(OFFLINE_STORE_NAMES.syncQueue);
      const request = store.getAll();

      request.onsuccess = () => {
        settle(countSyncQueueEntries(request.result as SyncQueueEntry[]));
      };
      request.onerror = () => settle(ZERO_COUNTS);
      tx.onabort = () => settle(ZERO_COUNTS);
      tx.onerror = () => settle(ZERO_COUNTS);
    } catch {
      settle(ZERO_COUNTS);
    }
  });
}

export async function readSyncQueueEntries(limit = 20): Promise<SyncQueueEntry[]> {
  const db = await openOfflineDatabase();
  if (!db) {
    return [];
  }

  return new Promise<SyncQueueEntry[]>((resolve) => {
    let settled = false;
    const settle = (value: SyncQueueEntry[]) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const tx = db.transaction(OFFLINE_STORE_NAMES.syncQueue, "readonly");
      const store = tx.objectStore(OFFLINE_STORE_NAMES.syncQueue);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = (request.result as SyncQueueEntry[])
          .filter((entry) => entry.status !== "done")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit);
        settle(entries);
      };
      request.onerror = () => settle([]);
      tx.onabort = () => settle([]);
      tx.onerror = () => settle([]);
    } catch {
      settle([]);
    }
  });
}
