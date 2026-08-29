// Trwałe przechowanie uchwytu folderu danych (FileSystemDirectoryHandle) w IndexedDB.
// Handle jest structured-cloneable, więc przeżywa reload — localStorage by go zgubił
// (serializuje do stringa).

import { DataDirHandle } from "./dataDir";
import { idbDelete, idbGet, idbPut } from "./idb";

const KEY = "dataDirHandle";

export async function saveHandle(handle: DataDirHandle): Promise<void> {
  await idbPut(KEY, handle);
}

export async function loadHandle(): Promise<DataDirHandle | null> {
  return idbGet<DataDirHandle>(KEY);
}

export async function clearHandle(): Promise<void> {
  await idbDelete(KEY);
}
