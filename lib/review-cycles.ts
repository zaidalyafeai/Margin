export interface ReviewDirectoryHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | ReviewDirectoryHandle]>;
  getFileHandle(name: string): Promise<FileSystemFileHandle>;
  queryPermission(options?: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options?: { mode: "read" }): Promise<PermissionState>;
}

export type CyclePaper = {
  name: string;
  size: number;
  lastModified: number;
};

export type ReviewCycle = {
  id: string;
  name: string;
  papers: CyclePaper[];
  reviewed: string[];
  createdAt: number;
  handle?: ReviewDirectoryHandle;
};

const DB_NAME = "margin-review";
const STORE_NAME = "cycles";
const TEXT_STORE_NAME = "paper-text";
const DB_VERSION = 2;

type CachedPaperText = {
  id: string;
  cycleId: string;
  size: number;
  lastModified: number;
  text: string;
  updatedAt: number;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains(TEXT_STORE_NAME)) {
        request.result.createObjectStore(TEXT_STORE_NAME, { keyPath: "id" }).createIndex("cycleId", "cycleId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listReviewCycles() {
  const database = await openDatabase();
  return new Promise<ReviewCycle[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      database.close();
      resolve((request.result as ReviewCycle[]).sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

export async function saveReviewCycle(cycle: ReviewCycle) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(cycle);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function deleteReviewCycle(id: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, TEXT_STORE_NAME], "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    const cacheCursor = transaction.objectStore(TEXT_STORE_NAME).index("cycleId").openKeyCursor(IDBKeyRange.only(id));
    cacheCursor.onsuccess = () => {
      const cursor = cacheCursor.result;
      if (!cursor) return;
      transaction.objectStore(TEXT_STORE_NAME).delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function getCachedPaperText(id: string, size: number, lastModified: number) {
  const database = await openDatabase();
  return new Promise<string | null>((resolve, reject) => {
    const request = database.transaction(TEXT_STORE_NAME, "readonly").objectStore(TEXT_STORE_NAME).get(id);
    request.onsuccess = () => {
      database.close();
      const cached = request.result as CachedPaperText | undefined;
      resolve(cached?.size === size && cached.lastModified === lastModified ? cached.text : null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

export async function saveCachedPaperText(entry: Omit<CachedPaperText, "updatedAt">) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TEXT_STORE_NAME, "readwrite");
    transaction.objectStore(TEXT_STORE_NAME).put({ ...entry, updatedAt: Date.now() });
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function scanReviewFolder(handle: ReviewDirectoryHandle) {
  const papers: CyclePaper[] = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file" || !name.toLowerCase().endsWith(".pdf")) continue;
    const file = await entry.getFile();
    papers.push({ name, size: file.size, lastModified: file.lastModified });
  }
  return papers.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}
