// Partie z krótką datą ważności — drugi cel inwentaryzacji sieci (rotacja towaru).
// Świadomie POZA ledgerem: nie zmieniają stanu magazynowego, a jeden wariant może mieć
// wiele partii o różnych datach (append-only „latest wins" by tu nie zadziałał).
// Wszystkie funkcje czyste: przyjmują ReportState, zwracają NOWY ReportState.

import { genId } from "./ledger";
import { ExpiryBatch, ReportState, variantKey } from "./types";

export interface ExpiryEntry {
  /** Najbliższa data ważności wśród aktywnych partii wariantu (YYYY-MM-DD). */
  nearest: string;
  /** Suma sztuk z krótką datą. */
  qty: number;
  batches: ExpiryBatch[];
}

export function addExpiryBatch(
  report: ReportState,
  input: {
    productId: string;
    presentationId: string;
    expiryDate: string;
    qty: number;
    note?: string;
    at?: string;
  },
): ReportState {
  const batch: ExpiryBatch = {
    id: genId("exp"),
    productId: input.productId,
    presentationId: input.presentationId,
    expiryDate: input.expiryDate,
    qty: Math.abs(input.qty),
    note: input.note,
    createdAt: input.at ?? new Date().toISOString(),
  };
  return { ...report, expiryBatches: [...report.expiryBatches, batch] };
}

/** Wycofanie partii = soft delete (ślad zostaje, jak przy korektach dostaw). */
export function removeExpiryBatch(
  report: ReportState,
  id: string,
  at?: string,
): ReportState {
  return {
    ...report,
    expiryBatches: report.expiryBatches.map((b) =>
      b.id === id ? { ...b, removedAt: at ?? new Date().toISOString() } : b,
    ),
  };
}

/** YYYY-MM-DD przesunięte o `days` — porównania dat robimy leksykalnie. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Aktywne partie, których data wypada nie później niż `today + warnDays`
 * (przeterminowane też się liczą), zgrupowane per wariant.
 */
export function expirySummary(
  report: ReportState,
  today: string,
  warnDays: number,
): Map<string, ExpiryEntry> {
  const limit = addDays(today, warnDays);
  const out = new Map<string, ExpiryEntry>();

  for (const b of report.expiryBatches) {
    if (b.removedAt) continue;
    if (b.expiryDate > limit) continue;
    const key = variantKey(b.productId, b.presentationId);
    const entry = out.get(key);
    if (!entry) {
      out.set(key, { nearest: b.expiryDate, qty: b.qty, batches: [b] });
    } else {
      entry.qty += b.qty;
      entry.batches.push(b);
      if (b.expiryDate < entry.nearest) entry.nearest = b.expiryDate;
    }
  }
  return out;
}

/** Wszystkie niewycofane partie — do widoku zakładki (także te z daleką datą). */
export function activeBatches(report: ReportState): ExpiryBatch[] {
  return report.expiryBatches
    .filter((b) => !b.removedAt)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}
