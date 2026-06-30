// Rdzeń analityczny: budowa audytu z dwóch niezależnych równań.
//   1) Prawda fizyczna:    manko = systemStock - physicalCount      (kradzież/rozdawanie)
//   2) Spójność księgowa:  bookDiscrepancy = systemStock - (prevStock + dostawy - sprzedaż)

import {
  snapshotMetas,
  snapshotStockMap,
  sumDeltasInWindow,
  genId,
} from "./ledger";
import {
  Audit,
  AuditLine,
  Product,
  ReportState,
  variantKey,
} from "./types";

const EPOCH = "0000-01-01T00:00:00.000Z";

export interface VariantInfo {
  productName: string;
  presentationName: string;
  unitPrice: number;
}

/** Indeks katalogu: variantKey -> nazwy + cena. */
export function buildVariantIndex(catalog: Product[]): Map<string, VariantInfo> {
  const idx = new Map<string, VariantInfo>();
  for (const p of catalog) {
    for (const pres of p.presentations) {
      idx.set(variantKey(p.productId, pres.presentationId), {
        productName: p.name,
        presentationName: pres.name || "(domyślny)",
        unitPrice: pres.price,
      });
    }
  }
  return idx;
}

/**
 * Liczy audyt dla snapshotu o danym source.
 * physicalCounts: variantKey -> policzona z natury ilość (brak wpisu = nie policzono).
 */
export function computeAudit(
  report: ReportState,
  snapshotSource: string,
  physicalCounts: Map<string, number>,
  toleranceUnits: number,
): Audit {
  const metas = snapshotMetas(report.ledger);
  const current = metas.find((m) => m.source === snapshotSource);
  if (!current) {
    throw new Error(`Brak snapshotu o source=${snapshotSource} w ledgerze`);
  }

  // Poprzedni snapshot = najświeższy o czasie < bieżącego.
  const previous = [...metas]
    .filter((m) => m.at < current.at)
    .sort((a, b) => b.at.localeCompare(a.at))[0];

  const systemMap = snapshotStockMap(report.ledger, snapshotSource);
  const prevMap = previous
    ? snapshotStockMap(report.ledger, previous.source)
    : null;
  const windowStart = previous ? previous.at : EPOCH;

  const deliveries = sumDeltasInWindow(
    report.ledger,
    "DELIVERY",
    windowStart,
    current.at,
  );
  const sales = sumDeltasInWindow(
    report.ledger,
    "SALES_IMPORT",
    windowStart,
    current.at,
  );

  const vIndex = buildVariantIndex(report.catalog);
  const lines: AuditLine[] = [];

  for (const [key, systemStock] of systemMap.entries()) {
    const [productId, presentationId] = key.split("::");
    const info = vIndex.get(key);
    const unitPrice = info?.unitPrice ?? 0;

    const physical = physicalCounts.has(key) ? physicalCounts.get(key)! : null;
    const manko = physical === null ? null : systemStock - physical;
    const mankoValue = manko === null ? null : round2(manko * unitPrice);

    let expectedFromBook: number | null = null;
    let bookDiscrepancy: number | null = null;
    let soldInWindow: number | null = null;
    if (prevMap && prevMap.has(key)) {
      const prevStock = prevMap.get(key)!;
      const deliv = deliveries.get(key) ?? 0;
      const sold = sales.get(key) ?? 0; // już ujemne
      soldInWindow = -sold;
      expectedFromBook = prevStock + deliv + sold;
      bookDiscrepancy = systemStock - expectedFromBook;
    }

    lines.push({
      productId,
      presentationId,
      productName: info?.productName ?? productId,
      presentationName: info?.presentationName ?? presentationId,
      unitPrice,
      systemStock,
      soldInWindow,
      physicalCount: physical,
      manko,
      mankoValue,
      expectedFromBook,
      bookDiscrepancy,
      flagged: manko !== null && Math.abs(manko) > toleranceUnits,
    });
  }

  lines.sort((a, b) => Math.abs(b.manko ?? 0) - Math.abs(a.manko ?? 0));

  return {
    id: genId("audit"),
    openedAt: new Date().toISOString(),
    snapshotSource,
    toleranceUnits,
    lines,
  };
}

/** Podsumowanie audytu do nagłówka raportu. */
export function summarizeAudit(audit: Audit): {
  countedVariants: number;
  flaggedVariants: number;
  totalMankoUnits: number;
  totalMankoValue: number;
} {
  let countedVariants = 0;
  let flaggedVariants = 0;
  let totalMankoUnits = 0;
  let totalMankoValue = 0;
  for (const l of audit.lines) {
    if (l.physicalCount !== null) countedVariants += 1;
    if (l.flagged) flaggedVariants += 1;
    if (l.manko && l.manko > 0) {
      totalMankoUnits += l.manko;
      totalMankoValue += l.mankoValue ?? 0;
    }
  }
  return {
    countedVariants,
    flaggedVariants,
    totalMankoUnits,
    totalMankoValue: round2(totalMankoValue),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
