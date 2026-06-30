import { useCallback, useEffect, useState } from "react";
import { ReportState } from "../model/types";
import { freshReport, saveDraft } from "../storage/local";

/** Centralny stan modułu z autosave do localStorage przy każdej zmianie. */
export function useReport() {
  const [report, setReport] = useState<ReportState>(() => freshReport());

  useEffect(() => {
    saveDraft(report);
  }, [report]);

  const update = useCallback(
    (fn: (r: ReportState) => ReportState) => setReport((r) => fn(r)),
    [],
  );

  const replace = useCallback((r: ReportState) => setReport(r), []);

  return { report, update, replace };
}

export interface VariantRow {
  productId: string;
  presentationId: string;
  productName: string;
  presentationName: string;
  unitPrice: number;
}

/** Płaska lista wariantów z katalogu — do tabel i selektorów. */
export function variantRows(report: ReportState): VariantRow[] {
  const rows: VariantRow[] = [];
  for (const p of report.catalog) {
    for (const pres of p.presentations) {
      rows.push({
        productId: p.productId,
        presentationId: pres.presentationId,
        productName: p.name,
        presentationName: pres.name || "(domyślny)",
        unitPrice: pres.price,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.productName.localeCompare(b.productName) ||
      a.presentationName.localeCompare(b.presentationName),
  );
}

/** Dopasowanie po nazwie/EAN (EAN jest wbity w nazwę). Wszystkie słowa muszą trafić. */
export function matchesQuery(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = text.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
