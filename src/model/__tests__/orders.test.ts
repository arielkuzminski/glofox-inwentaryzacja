import { describe, it, expect } from "vitest";
import { emptyReport, GlofoxSnapshot, ReportState, variantKey } from "../types";
import { ingestSnapshot, recordPhysicalCount } from "../ledger";
import { computeOrderPlan, setMinStock } from "../orders";

const KEY = variantKey("P1", "V1");

function snap(capturedAt: string, stock: number, soldQty = 0): GlofoxSnapshot {
  return {
    schemaVersion: 1,
    capturedAt,
    products: [
      {
        productId: "P1",
        name: "Baton",
        presentations: [{ presentationId: "V1", name: "", stock, price: 5 }],
      },
    ],
    sales: soldQty
      ? [
          {
            orderId: `${capturedAt}-o1`,
            productId: "P1",
            presentationId: "V1",
            qty: soldQty,
            soldAt: capturedAt,
          },
        ]
      : [],
  };
}

const T1 = "2026-06-01T20:00:00.000Z";
const T2 = "2026-06-15T20:00:00.000Z"; // +14 dni

/** Dwa snapshoty w odstępie 14 dni, 20 sztuk sprzedane w oknie. */
function twoWeeks(): ReportState {
  let r = ingestSnapshot(emptyReport(), snap(T1, 100));
  r = ingestSnapshot(r, snap(T2, 80, 20));
  return r;
}

describe("computeOrderPlan — zużycie", () => {
  it("przelicza sprzedaż z okna na tydzień", () => {
    const line = computeOrderPlan(twoWeeks(), T2)[0];

    expect(line.weeklyUsage).toBe(10); // 20 szt / 14 dni × 7
  });

  it("bez poprzedniego snapshotu nie zgaduje zużycia", () => {
    const r = ingestSnapshot(emptyReport(), snap(T1, 100));
    const line = computeOrderPlan(r, T1)[0];

    expect(line.weeklyUsage).toBeNull();
    expect(line.weeksOfCover).toBeNull();
  });

  it("liczy pokrycie w tygodniach", () => {
    const line = computeOrderPlan(twoWeeks(), T2)[0];

    expect(line.weeksOfCover).toBe(8); // 80 szt przy 10/tydz
  });
});

describe("computeOrderPlan — stan bieżący", () => {
  it("bierze stan z Glofoxa, gdy pozycji nie policzono", () => {
    const line = computeOrderPlan(twoWeeks(), T2)[0];

    expect(line.currentStock).toBe(80);
    expect(line.basis).toBe("glofox");
  });

  it("gdy jest spis z natury, to on jest podstawą — Glofox zawyża przy ubytkach", () => {
    const r = recordPhysicalCount(twoWeeks(), {
      productId: "P1",
      presentationId: "V1",
      count: 70,
      snapshotSource: T2,
    });
    const line = computeOrderPlan(r, T2)[0];

    expect(line.currentStock).toBe(70);
    expect(line.basis).toBe("spis");
  });
});

describe("computeOrderPlan — rekomendacja", () => {
  it("bez ustawionego minimum nie proponuje zamówienia", () => {
    const line = computeOrderPlan(twoWeeks(), T2)[0];

    expect(line.minStock).toBeNull();
    expect(line.toOrder).toBeNull();
  });

  it("proponuje uzupełnienie do minimum", () => {
    const r = setMinStock(twoWeeks(), KEY, 100);
    const line = computeOrderPlan(r, T2)[0];

    expect(line.toOrder).toBe(20); // 100 − 80
  });

  it("nie proponuje nic, gdy stan pokrywa minimum", () => {
    const r = setMinStock(twoWeeks(), KEY, 50);

    expect(computeOrderPlan(r, T2)[0].toOrder).toBe(0);
  });
});

describe("setMinStock", () => {
  it("zapisuje minimum, a wartość 0 kasuje wpis", () => {
    const withMin = setMinStock(twoWeeks(), KEY, 40);
    expect(withMin.minStock[KEY]).toBe(40);

    expect(setMinStock(withMin, KEY, 0).minStock[KEY]).toBeUndefined();
  });
});
