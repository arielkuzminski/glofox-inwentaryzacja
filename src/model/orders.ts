// Planowanie zamówień — cel sieci („unikać braków, zamawiać z wyprzedzeniem").
// Nadbudowa nad computeAudit: bierzemy stąd stan systemowy, spis i sprzedaż w oknie,
// żeby nie mieć drugiego, rozjeżdżającego się źródła prawdy.

import { physicalCountMap, snapshotMetas } from "./ledger";
import { computeAudit } from "./reconcile";
import { ReportState, variantKey } from "./types";

export interface OrderLine {
  productId: string;
  presentationId: string;
  productName: string;
  /** Stan, od którego liczymy zamówienie. */
  currentStock: number;
  /** Skąd wzięty stan: spis z natury jest wiarygodniejszy niż Glofox. */
  basis: "spis" | "glofox";
  /** Sprzedaż z okna między snapshotami przeliczona na 7 dni; null bez poprzedniego. */
  weeklyUsage: number | null;
  minStock: number | null;
  /** Ile domówić, żeby wrócić do minimum; null gdy minimum nieustawione. */
  toOrder: number | null;
  /** Na ile tygodni starczy obecnego stanu. */
  weeksOfCover: number | null;
  unitPrice: number;
}

const DAY_MS = 86400000;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Ustawia stan minimalny wariantu; 0 (lub mniej) usuwa wpis. */
export function setMinStock(
  report: ReportState,
  key: string,
  value: number,
): ReportState {
  const minStock = { ...report.minStock };
  if (value > 0) minStock[key] = value;
  else delete minStock[key];
  return { ...report, minStock };
}

export function computeOrderPlan(
  report: ReportState,
  snapshotSource: string,
): OrderLine[] {
  const counts = physicalCountMap(report.ledger, snapshotSource);
  const audit = computeAudit(report, snapshotSource, counts, 0);

  const metas = snapshotMetas(report.ledger);
  const current = metas.find((m) => m.source === snapshotSource);
  const previous = [...metas]
    .filter((m) => current && m.at < current.at)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  const windowDays =
    current && previous
      ? (Date.parse(current.at) - Date.parse(previous.at)) / DAY_MS
      : null;

  return audit.lines
    .map((l) => {
      const key = variantKey(l.productId, l.presentationId);
      const currentStock = l.physicalCount ?? l.systemStock;
      const weeklyUsage =
        windowDays && windowDays > 0 && l.soldInWindow !== null
          ? round1((l.soldInWindow / windowDays) * 7)
          : null;
      const minStock = report.minStock[key] ?? null;

      return {
        productId: l.productId,
        presentationId: l.presentationId,
        productName: l.productName,
        currentStock,
        basis: l.physicalCount === null ? ("glofox" as const) : ("spis" as const),
        weeklyUsage,
        minStock,
        toOrder: minStock === null ? null : Math.max(0, minStock - currentStock),
        weeksOfCover:
          weeklyUsage && weeklyUsage > 0 ? round1(currentStock / weeklyUsage) : null,
        unitPrice: l.unitPrice,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, "pl"));
}
