import { api, type PhotographImage } from "./api/client";
import {
  OFFLINE_STORE_NAMES,
  openOfflineDatabase,
  type ReferenceImageProcessingJobRecord,
} from "./offline/schema";
import type { ReferenceImageProcessingOptions } from "./referenceImageProcessing";

type DeferredDisplayUpdate = {
  photoId: string;
  imageId: string;
  original: File;
  options: ReferenceImageProcessingOptions;
  onUpdated?: (image: PhotographImage) => void;
};

type WorkerSuccess = {
  id: string;
  ok: true;
  blob: Blob;
  fileName: string;
};

type WorkerFailure = {
  id: string;
  ok: false;
  error: string;
};

type WorkerResponse = WorkerSuccess | WorkerFailure;

const MAX_WORKER_FAILURES = 3;
const JOBS_CHANGED_EVENT = "darkcloth:image-processing-jobs-changed";
const callbacksByImageId = new Map<string, Set<(image: PhotographImage) => void>>();

let queuePromise: Promise<void> | null = null;
let worker: Worker | null = null;

function nowIso() {
  return new Date().toISOString();
}

function jobId(photoId: string, imageId: string) {
  return `${photoId}:${imageId}`;
}

function emitJobsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
}

function getStore<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  onComplete: () => void,
  onError: () => void,
) {
  const tx = db.transaction(OFFLINE_STORE_NAMES.referenceImageProcessingJobs, mode);
  tx.oncomplete = onComplete;
  tx.onabort = onError;
  tx.onerror = onError;
  return tx.objectStore(OFFLINE_STORE_NAMES.referenceImageProcessingJobs) as IDBObjectStore & {
    getAll: () => IDBRequest<T[]>;
  };
}

function registerCallback(imageId: string, callback?: (image: PhotographImage) => void) {
  if (!callback) return;
  const callbacks = callbacksByImageId.get(imageId) ?? new Set<(image: PhotographImage) => void>();
  callbacks.add(callback);
  callbacksByImageId.set(imageId, callbacks);
}

function notifyUpdatedImage(image: PhotographImage) {
  const callbacks = callbacksByImageId.get(image.id);
  if (!callbacks) return;
  callbacksByImageId.delete(image.id);
  for (const callback of callbacks) {
    callback(image);
  }
}

async function putJob(job: ReferenceImageProcessingJobRecord) {
  const db = await openOfflineDatabase();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const store = getStore<ReferenceImageProcessingJobRecord>(db, "readwrite", resolve, () => {
      reject(store.transaction.error ?? new Error("Unable to store image processing job."));
    });
    store.put(job);
  });
  emitJobsChanged();
}

async function updateJob(job: ReferenceImageProcessingJobRecord) {
  await putJob(job);
}

async function deleteJob(id: string) {
  const db = await openOfflineDatabase();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const store = getStore<ReferenceImageProcessingJobRecord>(db, "readwrite", resolve, () => {
      reject(store.transaction.error ?? new Error("Unable to delete image processing job."));
    });
    store.delete(id);
  });
  emitJobsChanged();
}

async function readRunnableJobs() {
  const db = await openOfflineDatabase();
  if (!db) return [];

  return new Promise<ReferenceImageProcessingJobRecord[]>((resolve) => {
    let settled = false;
    const settle = (jobs: ReferenceImageProcessingJobRecord[]) => {
      if (settled) return;
      settled = true;
      resolve(jobs);
    };

    try {
      const store = getStore<ReferenceImageProcessingJobRecord>(db, "readonly", () => undefined, () => settle([]));
      const request = store.getAll();
      request.onsuccess = () => {
        settle(request.result
          .filter((job) => (
            Boolean(job.original)
            && (
              job.status === "pending"
              || job.status === "processing"
              || (job.status === "failed" && job.attempts < MAX_WORKER_FAILURES)
            )
          ))
          .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)));
      };
      request.onerror = () => settle([]);
    } catch {
      settle([]);
    }
  });
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./referenceImageProcessing.worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

function processJobInWorker(job: ReferenceImageProcessingJobRecord) {
  return new Promise<{ blob: Blob; fileName: string }>((resolve, reject) => {
    const requestId = `${job.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const activeWorker = getWorker();
    if (!job.original) {
      reject(new Error("Original image is no longer available for processing."));
      return;
    }

    const cleanup = () => {
      activeWorker.removeEventListener("message", onMessage);
      activeWorker.removeEventListener("error", onError);
      activeWorker.removeEventListener("messageerror", onMessageError);
    };

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== requestId) return;
      cleanup();
      if (event.data.ok) {
        resolve({ blob: event.data.blob, fileName: event.data.fileName });
      } else {
        reject(new Error(event.data.error));
      }
    };

    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    };

    const onMessageError = () => {
      cleanup();
      reject(new Error("Unable to send image data to background processor."));
    };

    activeWorker.addEventListener("message", onMessage);
    activeWorker.addEventListener("error", onError);
    activeWorker.addEventListener("messageerror", onMessageError);
    activeWorker.postMessage({
      id: requestId,
      original: job.original,
      originalName: job.originalName,
      options: job.options,
    });
  });
}

async function processOneJob(job: ReferenceImageProcessingJobRecord) {
  const startedAt = nowIso();
  const processingJob: ReferenceImageProcessingJobRecord = {
    ...job,
    status: "processing",
    attempts: job.attempts + 1,
    lastAttemptAt: startedAt,
    lastError: null,
    updatedAt: startedAt,
  };
  await updateJob(processingJob);

  let processed: { blob: Blob; fileName: string };
  try {
    processed = await processJobInWorker(processingJob);
  } catch (error) {
    await updateJob({
      ...processingJob,
      status: "failed",
      lastError: error instanceof Error ? error.message : "Unable to process image.",
      updatedAt: nowIso(),
    });
    return true;
  }

  try {
    const display = new File([processed.blob], processed.fileName, {
      type: processed.blob.type || "image/jpeg",
      lastModified: Date.now(),
    });
    const updatedImage = await api.updatePhotographImageDisplay(processingJob.photoId, processingJob.imageId, display);
    await updateJob({
      ...processingJob,
      original: null,
      status: "done",
      lastError: null,
      updatedAt: nowIso(),
      syncStatus: "synced",
    });
    notifyUpdatedImage(updatedImage);
  } catch (error) {
    await updateJob({
      ...processingJob,
      status: "pending",
      lastError: error instanceof Error ? error.message : "Unable to upload processed display image.",
      updatedAt: nowIso(),
    });
    return false;
  }

  return true;
}

async function processQueue() {
  const jobs = await readRunnableJobs();
  for (const job of jobs) {
    if (navigator.onLine === false) return;
    const shouldContinue = await processOneJob(job);
    if (!shouldContinue) return;
  }
}

export function startPhotographImageDisplayQueue() {
  if (queuePromise) return queuePromise;
  queuePromise = processQueue()
    .catch(() => undefined)
    .finally(() => {
      queuePromise = null;
    });
  return queuePromise;
}

export function subscribePhotographImageProcessingJobs(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(JOBS_CHANGED_EVENT, callback);
  return () => {
    window.removeEventListener(JOBS_CHANGED_EVENT, callback);
  };
}

export async function readPhotographImageProcessingJobs(limit = 30) {
  const db = await openOfflineDatabase();
  if (!db) return [];

  return new Promise<ReferenceImageProcessingJobRecord[]>((resolve) => {
    let settled = false;
    const settle = (jobs: ReferenceImageProcessingJobRecord[]) => {
      if (settled) return;
      settled = true;
      resolve(jobs);
    };

    try {
      const store = getStore<ReferenceImageProcessingJobRecord>(db, "readonly", () => undefined, () => settle([]));
      const request = store.getAll();
      request.onsuccess = () => {
        settle(request.result
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, limit));
      };
      request.onerror = () => settle([]);
    } catch {
      settle([]);
    }
  });
}

export function schedulePhotographImageDisplayUpdate({
  photoId,
  imageId,
  original,
  options,
  onUpdated,
}: DeferredDisplayUpdate) {
  registerCallback(imageId, onUpdated);
  const timestamp = nowIso();
  const job: ReferenceImageProcessingJobRecord = {
    id: jobId(photoId, imageId),
    userId: null,
    photoId,
    imageId,
    original,
    originalName: original.name,
    originalType: original.type || null,
    options,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    serverRevision: null,
    syncStatus: "pending",
  };

  return putJob(job).then(() => {
    void startPhotographImageDisplayQueue();
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void startPhotographImageDisplayQueue();
  });
}
