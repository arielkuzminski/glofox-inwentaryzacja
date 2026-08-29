// Układ folderu danych klubu. Menadżer wskazuje FOLDER (raz), a panel trzyma w nim
// kanon i rotowane kopie zapasowe:
//
//   Inwentaryzacja/
//     inwentaryzacja.json              ← kanon, auto-zapis
//     backups/
//       inwentaryzacja-2026-08-22.json ← kopia dnia (trzymamy KEEP_BACKUPS ostatnich)
//
// Dzięki temu backup nie zależy od tego, czy ktoś pamiętał kliknąć „eksportuj",
// a przeniesienie stanu na inny komputer to skopiowanie jednego pliku.

import { ReportState } from "../model/types";
import { DataFileHandle, readReport, writeReport } from "./fileSystem";

export const DATA_FILE = "inwentaryzacja.json";
export const BACKUP_DIR = "backups";
export const KEEP_BACKUPS = 8;

const BACKUP_RE = /^inwentaryzacja-(\d{4}-\d{2}-\d{2})\.json$/;

type FsPermissionState = "granted" | "denied" | "prompt";

/** Wycinek FileSystemDirectoryHandle, którego używamy (typy FS Access nie są w lib.dom). */
export interface DataDirHandle {
  readonly name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<DataFileHandle>;
  getDirectoryHandle(
    name: string,
    opts?: { create?: boolean },
  ): Promise<DataDirHandle>;
  values(): AsyncIterable<{ kind: "file" | "directory"; name: string }>;
  removeEntry(name: string): Promise<void>;
  queryPermission(desc: { mode: "read" | "readwrite" }): Promise<FsPermissionState>;
  requestPermission(desc: { mode: "read" | "readwrite" }): Promise<FsPermissionState>;
}

interface DirPickerWindow {
  showDirectoryPicker(opts?: unknown): Promise<DataDirHandle>;
}

export function isDirPickerSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Dialog wyboru folderu danych. Rzuca AbortError, gdy anulowano. */
export async function pickDataDirectory(): Promise<DataDirHandle> {
  return (window as unknown as DirPickerWindow).showDirectoryPicker({
    id: "glofox-inwentaryzacja",
    mode: "readwrite",
  });
}

/** Dzisiejsza data w czasie LOKALNYM klubu (kopia ma się nazywać wg jego doby). */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function backupName(day: string): string {
  return `inwentaryzacja-${day}.json`;
}

/** Nazwy kopii do skasowania: zostają `keep` najnowszych (nazwa sortuje się po dacie). */
export function backupsToPrune(names: string[], keep: number): string[] {
  const sorted = names.filter((n) => BACKUP_RE.test(n)).sort();
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}

function isNotFound(e: unknown): boolean {
  return e instanceof Error && e.name === "NotFoundError";
}

/** Kanon z folderu; null gdy folder jest jeszcze pusty (pierwsze uruchomienie). */
export async function readReportFromDir(
  dir: DataDirHandle,
): Promise<ReportState | null> {
  try {
    return await readReport(await dir.getFileHandle(DATA_FILE));
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function writeReportToDir(
  dir: DataDirHandle,
  report: ReportState,
): Promise<void> {
  await writeReport(await dir.getFileHandle(DATA_FILE, { create: true }), report);
}

export async function listBackups(dir: DataDirHandle): Promise<string[]> {
  try {
    const backups = await dir.getDirectoryHandle(BACKUP_DIR);
    const names: string[] = [];
    for await (const entry of backups.values()) {
      if (entry.kind === "file" && BACKUP_RE.test(entry.name)) names.push(entry.name);
    }
    return names.sort();
  } catch (e) {
    if (isNotFound(e)) return []; // folder kopii powstaje przy pierwszej kopii
    throw e;
  }
}

/** Kopia dnia (nadpisuje kopię z tej samej daty) + przycięcie najstarszych. */
export async function writeBackup(
  dir: DataDirHandle,
  report: ReportState,
  day: string,
  keep = KEEP_BACKUPS,
): Promise<void> {
  const backups = await dir.getDirectoryHandle(BACKUP_DIR, { create: true });
  await writeReport(
    await backups.getFileHandle(backupName(day), { create: true }),
    report,
  );

  for (const stale of backupsToPrune(await listBackups(dir), keep)) {
    await backups.removeEntry(stale);
  }
}
