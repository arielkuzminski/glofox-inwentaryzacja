// Wspólny, minimalny dostęp do IndexedDB. Używają go dwie rzeczy: uchwyt folderu
// danych (handleStore) i kopia awaryjna raportu (draftStore). IDB, a nie localStorage,
// bo raport po roku tygodniowych spisów waży ~23 MB — localStorage pęka przy ~5 MB
// i robi to po cichu (QuotaExceededError w try/catch).

const DB_NAME = "glofox-inwentaryzacja";
const STORE = "kv";

export function idbSupported(): boolean {
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

export function tx<T>(
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

export async function idbGet<T>(key: string): Promise<T | null> {
  if (!idbSupported()) return null;
  try {
    return (await tx<T | undefined>("readonly", (s) => s.get(key))) ?? null;
  } catch {
    return null;
  }
}

export async function idbPut(key: string, value: unknown): Promise<void> {
  if (!idbSupported()) return;
  await tx("readwrite", (s) => s.put(value, key));
}

export async function idbDelete(key: string): Promise<void> {
  if (!idbSupported()) return;
  try {
    await tx("readwrite", (s) => s.delete(key));
  } catch {
    // best-effort
  }
}
