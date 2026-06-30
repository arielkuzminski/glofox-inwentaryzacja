// Operacje na append-only ledgerze zdarzeń + ingest snapshotów Glofox.
// Wszystkie funkcje są czyste: przyjmują ReportState, zwracają NOWY ReportState.

import {
  GlofoxSnapshot,
  LedgerEvent,
  Product,
  ReportState,
  variantKey,
} from "./types";

let idCounter = 0;
export function genId(prefix = "ev"): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/** Scala katalog: nowy snapshot nadpisuje/ dodaje produkty, znikłe zostają (po _id). */
function mergeCatalog(existing: Product[], incoming: Product[]): Product[] {
  const byId = new Map<string, Product>();
  for (const p of existing) byId.set(p.productId, p);
  for (const p of incoming) byId.set(p.productId, p); // świeży payload wygrywa
  return [...byId.values()];
}

/** Metadane snapshotów obecnych w ledgerze (źródło + czas), posortowane rosnąco po czasie. */
export function snapshotMetas(
  ledger: LedgerEvent[],
): Array<{ source: string; at: string }> {
  const seen = new Map<string, string>();
  for (const ev of ledger) {
    if (ev.type === "SNAPSHOT" && !seen.has(ev.source)) {
      seen.set(ev.source, ev.at);
    }
  }
  return [...seen.entries()]
    .map(([source, at]) => ({ source, at }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Mapa variantKey -> stan systemowy dla SNAPSHOT-ów danego źródła. */
export function snapshotStockMap(
  ledger: LedgerEvent[],
  source: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const ev of ledger) {
    if (ev.type === "SNAPSHOT" && ev.source === source) {
      map.set(variantKey(ev.productId, ev.presentationId), ev.qty);
    }
  }
  return map;
}

/**
 * Wprowadza zrzut z bookmarkletu: aktualizuje katalog, dopisuje SNAPSHOT per wariant
 * oraz SALES_IMPORT per linia sprzedaży. Idempotentny względem source (capturedAt)
 * i orderId — ponowny import tego samego snapshotu nie duplikuje zdarzeń.
 */
export function ingestSnapshot(
  report: ReportState,
  snap: GlofoxSnapshot,
): ReportState {
  const source = snap.capturedAt;
  const alreadyHasSnapshot = report.ledger.some(
    (e) => e.type === "SNAPSHOT" && e.source === source,
  );

  const newEvents: LedgerEvent[] = [];

  if (!alreadyHasSnapshot) {
    for (const product of snap.products) {
      for (const pres of product.presentations) {
        newEvents.push({
          id: genId("snap"),
          type: "SNAPSHOT",
          at: snap.capturedAt,
          productId: product.productId,
          presentationId: pres.presentationId,
          qty: pres.stock,
          unitPrice: pres.price,
          source,
        });
      }
    }
  }

  // Cena wariantu ze snapshotu — do wyceny sprzedaży (Wartość zł w zakładce Sprzedaż).
  const priceMap = new Map<string, number>();
  for (const product of snap.products)
    for (const pres of product.presentations)
      priceMap.set(variantKey(product.productId, pres.presentationId), pres.price);

  const existingOrderKeys = new Set(
    report.ledger
      .filter((e) => e.type === "SALES_IMPORT")
      .map((e) => `${e.source}|${e.productId}|${e.presentationId}`),
  );
  for (const sale of snap.sales ?? []) {
    const okey = `${sale.orderId ?? source}|${sale.productId}|${sale.presentationId}`;
    if (existingOrderKeys.has(okey)) continue;
    existingOrderKeys.add(okey);
    newEvents.push({
      id: genId("sale"),
      type: "SALES_IMPORT",
      at: sale.soldAt,
      productId: sale.productId,
      presentationId: sale.presentationId,
      qty: -Math.abs(sale.qty), // sprzedaż = delta ujemna
      unitPrice: priceMap.get(variantKey(sale.productId, sale.presentationId)),
      staffId: sale.staffId,
      source: sale.orderId ?? source,
    });
  }

  return {
    ...report,
    catalog: mergeCatalog(report.catalog, snap.products),
    ledger: [...report.ledger, ...newEvents],
  };
}

/** Rejestruje dostawę (delta dodatnia) — kontrola krzyżowa względem stanu Glofox. */
export function recordDelivery(
  report: ReportState,
  input: {
    productId: string;
    presentationId: string;
    qty: number;
    at: string;
    unitPrice?: number;
    note?: string;
  },
): ReportState {
  const ev: LedgerEvent = {
    id: genId("deliv"),
    type: "DELIVERY",
    at: input.at,
    productId: input.productId,
    presentationId: input.presentationId,
    qty: Math.abs(input.qty),
    unitPrice: input.unitPrice,
    note: input.note,
    source: "manual",
  };
  return { ...report, ledger: [...report.ledger, ev] };
}

/** Suma delt (DELIVERY dodatnie / SALES_IMPORT ujemne) w oknie (afterAt, untilAt]. */
export function sumDeltasInWindow(
  ledger: LedgerEvent[],
  type: "DELIVERY" | "SALES_IMPORT",
  afterAt: string,
  untilAt: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const ev of ledger) {
    if (ev.type !== type) continue;
    if (ev.at <= afterAt || ev.at > untilAt) continue;
    const k = variantKey(ev.productId, ev.presentationId);
    map.set(k, (map.get(k) ?? 0) + ev.qty);
  }
  return map;
}
