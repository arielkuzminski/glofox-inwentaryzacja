// Kopia awaryjna raportu. Kanonem jest plik w folderze danych — to jest pas
// bezpieczeństwa na wypadek, gdyby menadżer nie podpiął folderu (albo siedział
// w Firefoksie, gdzie File System Access nie istnieje).
//
// Siedzi w IndexedDB, nie w localStorage: przy tygodniowym rytmie raport przekracza
// 5 MB około 11. tygodnia, a localStorage gubił to bez słowa.

import { LoadedReport, ReportState, SCHEMA_VERSION } from "../model/types";
import { normalizeReport } from "./file";
import { idbDelete, idbGet, idbPut } from "./idb";

const KEY = "reportCopy";
const LEGACY_KEY = "glofox-inwentaryzacja:autosave:v1";

export async function saveDraft(report: ReportState): Promise<void> {
  await idbPut(KEY, report);
}

export async function clearDraft(): Promise<void> {
  await idbDelete(KEY);
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // brak localStorage (tryb prywatny) — nic nie szkodzi
  }
}

/** Porty wejścia/wyjścia — wstrzykiwane, żeby migrację dało się przetestować bez IDB. */
export interface DraftPorts {
  readLocal(): string | null;
  clearLocal(): void;
  readIdb(): Promise<ReportState | null>;
  writeIdb(report: ReportState): Promise<void>;
}

const realPorts: DraftPorts = {
  readLocal: () => {
    try {
      return localStorage.getItem(LEGACY_KEY);
    } catch {
      return null;
    }
  },
  clearLocal: () => {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // ignore
    }
  },
  readIdb: () => idbGet<ReportState>(KEY),
  writeIdb: (r) => idbPut(KEY, r),
};

/**
 * Wczytuje kopię awaryjną, jednorazowo przenosząc stary autosave z localStorage.
 * IDB wygrywa — gdy tam coś jest, localStorage zostaje nietknięty.
 */
export async function loadDraftMigrating(
  ports: DraftPorts = realPorts,
): Promise<ReportState | null> {
  const fromIdb = await ports.readIdb();
  if (fromIdb) return normalizeReport(fromIdb);

  const raw = ports.readLocal();
  if (!raw) return null;

  let parsed: LoadedReport;
  try {
    parsed = JSON.parse(raw) as LoadedReport;
  } catch {
    return null; // uszkodzony autosave — nie kasujemy, może ktoś zechce go obejrzeć
  }
  if (parsed?.schemaVersion !== SCHEMA_VERSION) return null;

  const migrated = normalizeReport(parsed);
  await ports.writeIdb(migrated);
  ports.clearLocal();
  return migrated;
}

export const loadDraft = () => loadDraftMigrating();
