// Trwałe przechowanie uchwytu pliku (FileSystemFileHandle) w IndexedDB.
// Handle jest structured-cloneable, więc przeżywa reload — to jedyny powód, dla
// którego dotykamy IDB (dane mieszkają w pliku, nie tutaj). localStorage nie
// nadaje się: serializuje do stringa i gubi uchwyt.

import { DataFileHandle } from "./fileSystem";

const DB_NAME = "glofox-inwentaryzacja";
const STORE = "kv";
const KEY = "dataFileHandle";

function idbSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function saveHandle(handle: DataFileHandle): Promise<void> {
  if (!idbSupported()) return;
  await tx("readwrite", (s) => s.put(handle, KEY));
}

export async function loadHandle(): Promise<DataFileHandle | null> {
  if (!idbSupported()) return null;
  try {
    const h = await tx<DataFileHandle | undefined>("readonly", (s) => s.get(KEY));
    return h ?? null;
  } catch {
    return null;
  }
}

export async function clearHandle(): Promise<void> {
  if (!idbSupported()) return;
  try {
    await tx("readwrite", (s) => s.delete(KEY));
  } catch {
    // best-effort
  }
}
