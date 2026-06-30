import { describe, it, expect } from "vitest";
import { emptyReport, GlofoxSnapshot } from "../types";
import {
  ingestSnapshot,
  snapshotMetas,
  snapshotStockMap,
  sumDeltasInWindow,
  recordDelivery,
} from "../ledger";

function snap(capturedAt: string): GlofoxSnapshot {
  return {
    schemaVersion: 1,
    capturedAt,
    products: [
      {
        productId: "P1",
        name: "Baton",
        presentations: [
          { presentationId: "V1", name: "Czekolada", stock: 100, price: 10 },
          { presentationId: "V2", name: "Wanilia", stock: 40, price: 10 },
        ],
      },
    ],
    sales: [
      { orderId: "o1", productId: "P1", presentationId: "V1", qty: 3, soldAt: capturedAt },
    ],
  };
}

describe("ingestSnapshot", () => {
  it("tworzy SNAPSHOT per wariant + SALES_IMPORT z ujemną deltą", () => {
    let r = emptyReport();
    r = ingestSnapshot(r, snap("2026-06-01T20:00:00.000Z"));
    const snaps = r.ledger.filter((e) => e.type === "SNAPSHOT");
    const sales = r.ledger.filter((e) => e.type === "SALES_IMPORT");
    expect(snaps).toHaveLength(2);
    expect(sales).toHaveLength(1);
    expect(sales[0].qty).toBe(-3);
    expect(r.catalog).toHaveLength(1);
  });

  it("jest idempotentny — ponowny import tego samego snapshotu nie duplikuje", () => {
    let r = emptyReport();
    const s = snap("2026-06-01T20:00:00.000Z");
    r = ingestSnapshot(r, s);
    r = ingestSnapshot(r, s);
    expect(r.ledger.filter((e) => e.type === "SNAPSHOT")).toHaveLength(2);
    expect(r.ledger.filter((e) => e.type === "SALES_IMPORT")).toHaveLength(1);
  });
});

describe("snapshotMetas / snapshotStockMap", () => {
  it("zwraca źródła posortowane po czasie i poprawny stan", () => {
    let r = emptyReport();
    r = ingestSnapshot(r, snap("2026-06-10T20:00:00.000Z"));
    r = ingestSnapshot(r, snap("2026-06-01T20:00:00.000Z"));
    const metas = snapshotMetas(r.ledger);
    expect(metas.map((m) => m.source)).toEqual([
      "2026-06-01T20:00:00.000Z",
      "2026-06-10T20:00:00.000Z",
    ]);
    const stock = snapshotStockMap(r.ledger, "2026-06-01T20:00:00.000Z");
    expect(stock.get("P1::V1")).toBe(100);
    expect(stock.get("P1::V2")).toBe(40);
  });
});

describe("sumDeltasInWindow", () => {
  it("liczy tylko zdarzenia w (afterAt, untilAt]", () => {
    let r = emptyReport();
    r = recordDelivery(r, { productId: "P1", presentationId: "V1", qty: 10, at: "2026-06-02T12:00:00.000Z" });
    r = recordDelivery(r, { productId: "P1", presentationId: "V1", qty: 5, at: "2026-06-20T12:00:00.000Z" });
    const sums = sumDeltasInWindow(
      r.ledger,
      "DELIVERY",
      "2026-06-01T00:00:00.000Z",
      "2026-06-10T00:00:00.000Z",
    );
    expect(sums.get("P1::V1")).toBe(10); // druga dostawa poza oknem
  });
});
