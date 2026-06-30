// Import/eksport plików JSON. Plik = kanon. Wzorzec Blob+anchor jak w siostrzanych
// wtyczkach (glofox-users-manager, glofox-access-modal).

import {
  GlofoxSnapshot,
  ReportState,
  SCHEMA_VERSION,
} from "../model/types";

function download(filename: string, json: unknown): void {
  const blob = new Blob([JSON.stringify(json, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export function exportReport(report: ReportState): void {
  download(`glofox-inwentaryzacja-raport-${stamp()}.json`, {
    ...report,
    generatedAt: new Date().toISOString(),
  });
}

/** Wczytuje plik z <input type=file> i parsuje JSON. */
export function readJsonFile<T>(file: File): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku"));
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)) as T);
      } catch {
        reject(new Error("Plik nie jest poprawnym JSON-em"));
      }
    };
    reader.readAsText(file);
  });
}

export function isReport(obj: unknown): obj is ReportState {
  const o = obj as Partial<ReportState>;
  return (
    !!o &&
    Array.isArray(o.ledger) &&
    Array.isArray(o.catalog) &&
    Array.isArray(o.audits)
  );
}

export function isSnapshot(obj: unknown): obj is GlofoxSnapshot {
  const o = obj as Partial<GlofoxSnapshot>;
  return !!o && typeof o.capturedAt === "string" && Array.isArray(o.products);
}

export function assertSchema(version: number): void {
  if (version !== SCHEMA_VERSION) {
    throw new Error(
      `Niezgodna wersja schematu (plik: ${version}, moduł: ${SCHEMA_VERSION})`,
    );
  }
}
