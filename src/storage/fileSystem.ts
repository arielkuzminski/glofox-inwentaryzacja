// Auto-zapis kanonu do realnego pliku przez File System Access API.
// Plik nadal jest kanonem (jak w siostrzanym podejściu „plik JSON"), ale zapisuje
// się sam — bez rytuału pobierz/wybierz przy każdej sesji. Handle pliku trzymamy
// w IndexedDB (patrz handleStore), więc przeżywa reload.
//
// API jest dostępne tylko w secure context (localhost / https) i w Chromium.
// Gdy go brak — moduł zgłasza to przez isFsAccessSupported(), a UI wraca do
// klasycznego importu/eksportu.

import { ReportState } from "../model/types";
import { assertSchema, isReport } from "./file";

type FsPermissionState = "granted" | "denied" | "prompt";

interface FsPermissionDescriptor {
  mode: "read" | "readwrite";
}

/** Wycinek FileSystemFileHandle, którego używamy (typy FS Access nie są w lib.dom). */
export interface DataFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableLike>;
  queryPermission(desc: FsPermissionDescriptor): Promise<FsPermissionState>;
  requestPermission(desc: FsPermissionDescriptor): Promise<FsPermissionState>;
}

interface FileSystemWritableLike {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
}

interface FsWindow {
  showSaveFilePicker(opts?: unknown): Promise<DataFileHandle>;
  showOpenFilePicker(opts?: unknown): Promise<DataFileHandle[]>;
}

const JSON_TYPES = [
  { description: "Raport inwentaryzacji (JSON)", accept: { "application/json": [".json"] } },
];

export function isFsAccessSupported(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

function fsWindow(): FsWindow {
  return window as unknown as FsWindow;
}

/** Tworzy nowy plik danych (dialog „zapisz jako"). Rzuca AbortError gdy anulowano. */
export async function pickNewFile(): Promise<DataFileHandle> {
  return fsWindow().showSaveFilePicker({
    suggestedName: "glofox-inwentaryzacja.json",
    types: JSON_TYPES,
  });
}

/** Otwiera istniejący plik danych. Rzuca AbortError gdy anulowano. */
export async function pickExistingFile(): Promise<DataFileHandle> {
  const [handle] = await fsWindow().showOpenFilePicker({
    types: JSON_TYPES,
    multiple: false,
  });
  return handle;
}

/**
 * Upewnia się, że mamy prawo zapisu. `interactive: true` wolno wołać tylko
 * z gestu użytkownika (Chromium wymaga go do requestPermission po reloadzie).
 */
export async function ensurePermission(
  handle: DataFileHandle,
  interactive: boolean,
): Promise<boolean> {
  const desc: FsPermissionDescriptor = { mode: "readwrite" };
  if ((await handle.queryPermission(desc)) === "granted") return true;
  if (!interactive) return false;
  return (await handle.requestPermission(desc)) === "granted";
}

/** Czyta i waliduje raport z pliku (plik = kanon). */
export async function readReport(handle: DataFileHandle): Promise<ReportState> {
  const text = await (await handle.getFile()).text();
  const data = JSON.parse(text) as unknown;
  if (!isReport(data)) {
    throw new Error("Plik danych nie jest poprawnym raportem.");
  }
  assertSchema(data.schemaVersion);
  return data;
}

/** Jednorazowy zapis raportu do pliku (atomowo: close commituje swap). */
export async function writeReport(
  handle: DataFileHandle,
  report: ReportState,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(
    JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2),
  );
  await writable.close();
}

/**
 * Serializuje zapisy: skleja wiele zgłoszeń w ostatni stan i nigdy nie pozwala
 * dwóm createWritable nakładać się na siebie. Debounce robi wołający (store).
 */
export class WriteQueue {
  private pending: ReportState | null = null;
  private running = false;

  constructor(private readonly writer: (r: ReportState) => Promise<void>) {}

  /** Zgłasza najnowszy stan do zapisu; starsze oczekujące jest porzucane. */
  enqueue(report: ReportState): void {
    this.pending = report;
    void this.pump();
  }

  /** Czeka aż kolejka się opróżni (do testów / zamykania). */
  async idle(): Promise<void> {
    // setTimeout, nie Promise.resolve — pętla mikrozadań zagłodziłaby timery
    // (i sam zapis), więc nigdy by się nie skończyła.
    while (this.running) await new Promise((r) => setTimeout(r, 0));
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending) {
        const next = this.pending;
        this.pending = null;
        await this.writer(next);
      }
    } finally {
      this.running = false;
    }
  }
}
