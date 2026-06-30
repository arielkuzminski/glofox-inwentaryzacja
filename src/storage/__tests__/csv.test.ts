import { describe, it, expect } from "vitest";
import { auditToCsv } from "../file";
import { ingestSnapshot } from "../../model/ledger";
import { computeAudit } from "../../model/reconcile";
import { emptyReport, GlofoxSnapshot, variantKey } from "../../model/types";

function snap(): GlofoxSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: "2026-06-01T20:00:00.000Z",
    products: [
      {
        productId: "P1",
        name: 'Woda "źródlana"; 0.5', // przecinek/cudzysłów → test cytowania
        presentations: [{ presentationId: "V1", name: "", stock: 100, price: 2.5 }],
      },
    ],
    sales: [],
  };
}

describe("auditToCsv", () => {
  it("zwraca nagłówek + wiersz, cytuje pola ze średnikiem/cudzysłowem", () => {
    let r = emptyReport();
    r = ingestSnapshot(r, snap());
    const audit = computeAudit(
      r,
      "2026-06-01T20:00:00.000Z",
      new Map([[variantKey("P1", "V1"), 95]]),
      0,
    );
    const csv = auditToCsv(audit);
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe(
      "Produkt;Wariant;Cena;Stan Glofox;Sprzedano (okno);Spis fizyczny;Manko;Wartość (zł);Rozb. księgowa;Oznaczone",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Woda ""źródlana""; 0.5"'); // pole ocytowane
    expect(lines[1]).toContain(";100;"); // stan Glofox
    expect(lines[1]).toContain(";5;"); // manko
    expect(lines[1].endsWith(";TAK")).toBe(true); // oznaczone
  });
});
