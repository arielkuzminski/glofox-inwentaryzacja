// Scalanie dwóch plików danych — praca z dwóch komputerów albo powrót do kopii.
//
// Dlaczego suma, a nie nadpisanie: ledger jest append-only, a każde zdarzenie ma
// unikalne id, więc złączenie zbiorów jest bezstratne i idempotentne. Import tego
// samego pliku dwa razy niczego nie zmienia.

import { mergeCatalog } from "./ledger";
import { Audit, ExpiryBatch, LedgerEvent, ReportState } from "./types";

export interface MergeStats {
  events: number;
  audits: number;
  batches: number;
}

/** Suma po id z policzeniem, ile wpisów doszło z `incoming`. */
function unionById<T extends { id: string }>(
  local: T[],
  incoming: T[],
  resolve: (a: T, b: T) => T = (a) => a,
): { items: T[]; added: number } {
  const byId = new Map(local.map((x) => [x.id, x]));
  let added = 0;
  for (const x of incoming) {
    const existing = byId.get(x.id);
    if (existing) byId.set(x.id, resolve(existing, x));
    else {
      byId.set(x.id, x);
      added += 1;
    }
  }
  return { items: [...byId.values()], added };
}

export function mergeReports(
  local: ReportState,
  incoming: ReportState,
): { report: ReportState; stats: MergeStats } {
  const newer =
    (incoming.generatedAt ?? "") > (local.generatedAt ?? "") ? incoming : local;
  const older = newer === incoming ? local : incoming;

  const ledger = unionById<LedgerEvent>(local.ledger, incoming.ledger);
  const audits = unionById<Audit>(local.audits, incoming.audits);
  // Wycofanie partii jest nieodwracalne — inaczej import starszego pliku
  // „wskrzesiłby" towar zdjęty już z półki.
  const batches = unionById<ExpiryBatch>(
    local.expiryBatches,
    incoming.expiryBatches,
    (a, b) => (a.removedAt ? a : b.removedAt ? b : a),
  );

  return {
    report: {
      ...newer,
      catalog: mergeCatalog(older.catalog, newer.catalog),
      ledger: ledger.items.sort(
        (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
      ),
      audits: audits.items,
      expiryBatches: batches.items,
      settings: { ...older.settings, ...newer.settings },
      minStock: { ...older.minStock, ...newer.minStock },
      snapshotWindows: { ...older.snapshotWindows, ...newer.snapshotWindows },
      generatedAt: newer.generatedAt,
    },
    stats: {
      events: ledger.added,
      audits: audits.added,
      batches: batches.added,
    },
  };
}
