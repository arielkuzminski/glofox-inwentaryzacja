// Autosave roboczy w localStorage — chroni pracę przed F5 w środku liczenia.
// To NIE jest kanon: trwałym źródłem prawdy jest eksportowany plik JSON.

import { LoadedReport, ReportState, SCHEMA_VERSION, emptyReport } from "../model/types";
import { normalizeReport } from "./file";

const KEY = "glofox-inwentaryzacja:autosave:v1";

export function saveDraft(report: ReportState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(report));
  } catch {
    // quota / tryb prywatny — autosave best-effort, kanon i tak jest w pliku.
  }
}

export function loadDraft(): ReportState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LoadedReport;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
    return normalizeReport(parsed);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function freshReport(): ReportState {
  return loadDraft() ?? emptyReport();
}
