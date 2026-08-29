// Eksport w układzie pliku „WZÓR INWENTARYZACJA 2026" sieci franczyzowej.
//
// UWAGA NA ZNAK: sieć liczy `Różnica = stan faktyczny − stan w systemie`, czyli
// ODWROTNIE niż nasze `manko = stan systemowy − spis`. Rdzeń (model/reconcile.ts)
// zostaje nietknięty — znak odwracamy wyłącznie tutaj, na granicy eksportu.

import { Audit, ReportState, Settings, variantKey } from "../model/types";
import { ExpiryEntry, expirySummary } from "../model/expiry";
import { csvCell, downloadBlob } from "./file";
import { buildXlsx } from "./xlsx";

export const FRANCHISE_HEADERS = [
  "Lp.",
  "Nazwa produktu ze sklepu",
  "Stan w sklepie XFG",
  "Stan faktyczny",
  "Różnica",
  "Krótka data ważności (wpisujemy datę np. 05.02.2026)",
  "Ilośc sztuk z krótką datą ważności",
  "Uwagi",
] as const;

export interface FranchiseRow {
  lp: number;
  name: string;
  systemStock: number;
  physicalCount: number | null;
  /** stan faktyczny − stan systemowy; null gdy pozycji nie policzono. */
  difference: number | null;
  expiryDate: string | null;
  expiryQty: number | null;
  note: string | null;
}

/**
 * Glofox wbija EAN w nazwę produktu (brak osobnego pola SKU), a klub trzyma go raz
 * na początku, raz na końcu, raz przed dopiskiem typu „[k]" — w katalogu z Lęborka
 * jest 83 / 87 / 43 takich przypadków. Usuwamy samodzielny token 8–14 cyfr,
 * gdziekolwiek stoi; krótsze liczby (gramatura, „100 procent") zostają.
 */
export function stripEan(name: string): string {
  return name
    .replace(/(^|\s)\d{8,14}(?=\s|$)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildFranchiseRows(
  audit: Audit,
  opts: { expiry?: Map<string, ExpiryEntry>; includeAll?: boolean },
): FranchiseRow[] {
  const expiry = opts.expiry ?? new Map<string, ExpiryEntry>();

  const kept = audit.lines.filter((l) => {
    if (opts.includeAll) return true;
    const exp = expiry.get(variantKey(l.productId, l.presentationId));
    return (
      l.systemStock !== 0 ||
      l.physicalCount !== null ||
      !!exp ||
      !!(l.note && l.note.trim())
    );
  });

  return kept
    .map((l) => {
      const exp = expiry.get(variantKey(l.productId, l.presentationId));
      return {
        name: stripEan(l.productName),
        systemStock: l.systemStock,
        physicalCount: l.physicalCount,
        difference: l.manko === null ? null : -l.manko, // ← odwrócenie znaku
        expiryDate: exp?.nearest ?? null,
        expiryQty: exp?.qty ?? null,
        note: l.note && l.note.trim() ? l.note : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pl"))
    .map((row, i) => ({ lp: i + 1, ...row }));
}

/**
 * Wiersze wzoru dla konkretnego audytu: krótkie daty liczone NA DZIEŃ SPISU
 * (nie „dziś"), progiem z ustawień klubu — dzięki temu eksport starego audytu
 * pokazuje to, co było widać wtedy.
 */
export function franchiseRowsFor(
  report: ReportState,
  audit: Audit,
  includeAll = false,
): FranchiseRow[] {
  const day = (audit.closedAt ?? audit.openedAt).slice(0, 10);
  return buildFranchiseRows(audit, {
    expiry: expirySummary(report, day, report.settings.expiryWarnDays),
    includeAll,
  });
}

export function franchiseToCsv(rows: FranchiseRow[]): string {
  const body = rows.map((r) =>
    [
      r.lp,
      r.name,
      r.systemStock,
      r.physicalCount,
      r.difference,
      r.expiryDate,
      r.expiryQty,
      r.note,
    ]
      .map(csvCell)
      .join(";"),
  );
  return [FRANCHISE_HEADERS.join(";"), ...body].join("\r\n");
}

/** Nazwa pliku wspólna dla CSV i XLSX: klub + data spisu. */
function fileStem(audit: Audit, settings: Settings): string {
  const club = (settings.clubName ?? "klub")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return `inwentaryzacja-${club}-${(audit.closedAt ?? audit.openedAt).slice(0, 10)}`;
}

export function exportFranchiseCsv(
  audit: Audit,
  rows: FranchiseRow[],
  settings: Settings,
): void {
  downloadBlob(
    `${fileStem(audit, settings)}.csv`,
    // BOM, żeby Excel wykrył UTF-8 i pokazał polskie znaki.
    new Blob(["﻿" + franchiseToCsv(rows)], {
      type: "text/csv;charset=utf-8",
    }),
  );
}

export function exportFranchiseXlsx(
  audit: Audit,
  rows: FranchiseRow[],
  settings: Settings,
): void {
  downloadBlob(
    `${fileStem(audit, settings)}.xlsx`,
    buildXlsx(rows, {
      clubName: settings.clubName ?? "",
      countedAt: audit.closedAt ?? audit.openedAt,
    }),
  );
}
