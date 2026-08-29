import { describe, it, expect } from "vitest";
import { emptyReport, GlofoxSnapshot, variantKey } from "../types";
import { ingestSnapshot, recordDelivery, recordAdjustment } from "../ledger";
import { computeAudit, summarizeAudit } from "../reconcile";

function snap(capturedAt: string, stock: number, sales: number[] = []): GlofoxSnapshot {
  return {
    schemaVersion: 1,
    capturedAt,
    products: [
      {
        productId: "P1",
        name: "Baton proteinowy",
        presentations: [
          { presentationId: "V1", name: "Czekolada", stock, price: 10 },
        ],
      },
    ],
    sales: sales.map((qty, i) => ({
      orderId: `${capturedAt}-o${i}`,
      productId: "P1",
      presentationId: "V1",
      qty,
      soldAt: capturedAt,
    })),
  };
}

const KEY = variantKey("P1", "V1");

describe("computeAudit — prawda fizyczna (manko)", () => {
  it("liczy manko = system - spis, wycenia je i flaguje wg progu", () => {
    let r = emptyReport();
    r = ingestSnapshot(r, snap("2026-06-01T20:00:00.000Z", 100));

    const counts = new Map([[KEY, 95]]);
    const audit = computeAudit(r, "2026-06-01T20:00:00.000Z", counts, 0);
    const line = audit.lines[0];

    expect(line.systemStock).toBe(100);
    expect(line.physicalCount).toBe(95);
    expect(line.manko).toBe(5);
    expect(line.mankoValue).toBe(50); // 5 * 10
    expect(line.flagged).toBe(true); // |5| > 0
    expect(line.expectedFromBook).toBeNull(); // brak poprzedniego snapshotu
  });

  it("nie flaguje, gdy manko mieści się w tolerancji", () => {
    let r = emptyReport();
    r = ingestSnapshot(r, snap("2026-06-01T20:00:00.000Z", 100));
    const audit = computeAudit(r, "2026-06-01T20:00:00.000Z", new Map([[KEY, 98]]), 3);
    expect(audit.lines[0].manko).toBe(2);
    expect(audit.lines[0].flagged).toBe(false);
  });

  it("manko = null, gdy wariantu nie policzono", () => {
    let r = emptyReport();
    r = ingestSnapshot(r, snap("2026-06-01T20:00:00.000Z", 100));
    const audit = computeAudit(r, "2026-06-01T20:00:00.000Z", new Map(), 0);
    expect(audit.lines[0].manko).toBeNull();
    expect(audit.lines[0].flagged).toBe(false);
  });
});

describe("computeAudit — spójność księgowa (bookDiscrepancy)", () => {
  it("expected = prev + dostawy - sprzedaż; rozbieżność = system - expected", () => {
    let r = emptyReport();
    // Poprzedni snapshot: stan 100.
    r = ingestSnapshot(r, snap("2026-06-01T20:00:00.000Z", 100));
    // Dostawa +50 w oknie.
    r = recordDelivery(r, {
      productId: "P1",
      presentationId: "V1",
      qty: 50,
      at: "2026-06-05T12:00:00.000Z",
    });
    // Bieżący snapshot: stan 118, sprzedaż 30 szt w oknie (soldAt = capturedAt).
    r = ingestSnapshot(r, snap("2026-06-10T20:00:00.000Z", 118, [10, 20]));

    const audit = computeAudit(r, "2026-06-10T20:00:00.000Z", new Map(), 0);
    const line = audit.lines[0];

    expect(line.expectedFromBook).toBe(120); // 100 + 50 - 30
    expect(line.bookDiscrepancy).toBe(-2); // 118 - 120
    expect(line.soldInWindow).toBe(30); // 10 + 20
  });

  it("uwzględnia korektę (ADJUSTMENT) w oczekiwanym stanie", () => {
    let r = emptyReport();
    r = ingestSnapshot(r, snap("2026-06-01T20:00:00.000Z", 100));
    r = recordDelivery(r, {
      productId: "P1",
      presentationId: "V1",
      qty: 50,
      at: "2026-06-05T12:00:00.000Z",
    });
    // Korekta: cofnięcie błędnej dostawy −50 w oknie.
    r = recordAdjustment(r, {
      productId: "P1",
      presentationId: "V1",
      qty: -50,
      at: "2026-06-06T12:00:00.000Z",
    });
    r = ingestSnapshot(r, snap("2026-06-10T20:00:00.000Z", 70, [10, 20]));

    const line = computeAudit(r, "2026-06-10T20:00:00.000Z", new Map(), 0).lines[0];
    expect(line.expectedFromBook).toBe(70); // 100 + 50 - 50 - 30
    expect(line.bookDiscrepancy).toBe(0); // 70 - 70
  });
});

describe("summarizeAudit", () => {
  it("sumuje tylko dodatnie manko i jego wartość", () => {
    let r = emptyReport();
    r = ingestSnapshot(r, snap("2026-06-01T20:00:00.000Z", 100));
    const audit = computeAudit(r, "2026-06-01T20:00:00.000Z", new Map([[KEY, 90]]), 0);
    const s = summarizeAudit(audit);
    expect(s.countedVariants).toBe(1);
    expect(s.flaggedVariants).toBe(1);
    expect(s.totalMankoUnits).toBe(10);
    expect(s.totalMankoValue).toBe(100);
  });
});

describe("computeAudit — uwagi do pozycji", () => {
  it("przenosi uwagę z ledgera do linii audytu", () => {
    const r = ingestSnapshot(emptyReport(), snap("2026-06-01T20:00:00.000Z", 100));
    const audit = computeAudit(
      r,
      "2026-06-01T20:00:00.000Z",
      new Map([[KEY, 98]]),
      0,
      new Map([[KEY, "stłuczka"]]),
    );
    expect(audit.lines[0].note).toBe("stłuczka");
  });

  it("note = null, gdy uwagi nie ma", () => {
    const r = ingestSnapshot(emptyReport(), snap("2026-06-01T20:00:00.000Z", 100));
    const audit = computeAudit(r, "2026-06-01T20:00:00.000Z", new Map(), 0);
    expect(audit.lines[0].note).toBeNull();
  });
});
