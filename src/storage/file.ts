// Import/eksport plików JSON. Plik = kanon. Wzorzec Blob+anchor jak w siostrzanych
// wtyczkach (glofox-users-manager, glofox-access-modal).

import {
  Audit,
  GlofoxSnapshot,
  LoadedReport,
  ReportState,
  SCHEMA_VERSION,
  Settings,
} from "../model/types";

export const DEFAULT_SETTINGS: Settings = {
  expiryWarnDays: 30,
  toleranceUnits: 0,
};

/**
 * Granica wczytywania: plik zapisany starszą wersją modułu nie ma pól dodanych
 * później. Dopełniamy je domyślnymi wartościami zamiast bumpować SCHEMA_VERSION —
 * dzięki temu kluby nie tracą dostępu do swoich plików (assertSchema jest sztywne).
 */
export function normalizeReport(raw: LoadedReport): ReportState {
  return {
    ...raw,
    expiryBatches: raw.expiryBatches ?? [],
    minStock: raw.minStock ?? {},
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
  };
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function download(filename: string, json: unknown): void {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }),
  );
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

const CSV_HEADERS = [
  "Produkt",
  "Wariant",
  "Cena",
  "Stan Glofox",
  "Sprzedano (okno)",
  "Spis fizyczny",
  "Manko",
  "Wartość (zł)",
  "Rozb. księgowa",
  "Oznaczone",
] as const;

export function csvCell(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Czytelny CSV audytu (separator „;", Excel-PL). Czysta funkcja — testowalna. */
export function auditToCsv(audit: Audit): string {
  const rows = audit.lines.map((l) =>
    [
      l.productName,
      l.presentationName,
      l.unitPrice,
      l.systemStock,
      l.soldInWindow,
      l.physicalCount,
      l.manko,
      l.mankoValue,
      l.bookDiscrepancy,
      l.flagged ? "TAK" : "",
    ]
      .map(csvCell)
      .join(";"),
  );
  return [CSV_HEADERS.join(";"), ...rows].join("\r\n");
}

export function exportAuditCsv(audit: Audit): void {
  const stampAt = (audit.closedAt ?? audit.openedAt).slice(0, 19).replace(/[:T]/g, "-");
  // BOM, żeby Excel wykrył UTF-8 i pokazał polskie znaki.
  downloadBlob(
    `glofox-audyt-${stampAt}.csv`,
    new Blob(["﻿" + auditToCsv(audit)], { type: "text/csv;charset=utf-8" }),
  );
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

export function isReport(obj: unknown): obj is LoadedReport {
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
