import type { PhotographImageUploadDraft, PreparedPhotographImageUpload } from "../../photoImageUpload";

const DB_NAME = "darkcloth-photo-log-reference-image-draft";
const DB_VERSION = 1;
const STORE_NAME = "draft";
const RECORD_ID = "current";

type StoredReferenceImageUpload =
  | { kind: "file"; file: File }
  | { kind: "prepared"; upload: PreparedPhotographImageUpload };

type ReferenceImageDraftRecord = {
  id: typeof RECORD_ID;
  uploads: StoredReferenceImageUpload[];
  reviewQueue: File[];
  updatedAt: string;
};

export type PhotoLogReferenceImageDraft = {
  uploads: PhotographImageUploadDraft[];
  reviewQueue: File[];
};

function openDraftDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function storeUpload(upload: PhotographImageUploadDraft): StoredReferenceImageUpload {
  return upload instanceof File
    ? { kind: "file", file: upload }
    : { kind: "prepared", upload };
}

function restoreUpload(upload: StoredReferenceImageUpload): PhotographImageUploadDraft | null {
  if (upload.kind === "file") return upload.file instanceof File ? upload.file : null;
  const prepared = upload.upload;
  return prepared?.original instanceof File ? prepared : null;
}

export async function readPhotoLogReferenceImageDraft(): Promise<PhotoLogReferenceImageDraft | null> {
  const db = await openDraftDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(RECORD_ID);
    request.onsuccess = () => {
      const record = request.result as ReferenceImageDraftRecord | undefined;
      if (!record) {
        resolve(null);
        return;
      }
      resolve({
        uploads: record.uploads.map(restoreUpload).filter((upload): upload is PhotographImageUploadDraft => upload != null),
        reviewQueue: record.reviewQueue.filter((file): file is File => file instanceof File),
      });
    };
    request.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
    tx.onerror = () => resolve(null);
  });
}

export async function writePhotoLogReferenceImageDraft(draft: PhotoLogReferenceImageDraft): Promise<void> {
  const db = await openDraftDatabase();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({
      id: RECORD_ID,
      uploads: draft.uploads.map(storeUpload),
      reviewQueue: draft.reviewQueue,
      updatedAt: new Date().toISOString(),
    } satisfies ReferenceImageDraftRecord);
    tx.oncomplete = () => resolve();
    tx.onabort = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function clearPhotoLogReferenceImageDraft(): Promise<void> {
  const db = await openDraftDatabase();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(RECORD_ID);
    tx.oncomplete = () => resolve();
    tx.onabort = () => resolve();
    tx.onerror = () => resolve();
  });
}
