import { describe, it, expect } from "vitest";
import { Audit, AuditLine } from "../types";
import { compareAudits } from "../compare";

function line(over: Partial<AuditLine> = {}): AuditLine {
  return {
    productId: "P1",
    presentationId: "V1",
    productName: "Baton",
    presentationName: "(domyślny)",
    unitPrice: 5,
    systemStock: 10,
    soldInWindow: null,
    physicalCount: 8,
    manko: 2,
    mankoValue: 10,
    expectedFromBook: null,
    bookDiscrepancy: null,
    note: null,
    flagged: true,
    ...over,
  };
}

function audit(lines: AuditLine[], closedAt = "2026-06-08T20:00:00.000Z"): Audit {
  return {
    id: `a-${closedAt}`,
    openedAt: closedAt,
    closedAt,
    snapshotSource: closedAt,
    toleranceUnits: 0,
    lines,
  };
}

describe("compareAudits", () => {
  it("oznacza manko powtórzone w dwóch spisach z rzędu", () => {
    const out = compareAudits(audit([line({ manko: 3 })]), audit([line({ manko: 2 })]), 0);

    expect(out[0].recurring).toBe(true);
    expect(out[0].mankoPrev).toBe(3);
    expect(out[0].mankoCurr).toBe(2);
  });

  it("jednorazowe odchylenie to nie wzorzec", () => {
    const out = compareAudits(audit([line({ manko: 0 })]), audit([line({ manko: 4 })]), 0);

    expect(out[0].recurring).toBe(false);
  });

  it("nadwyżka po jednej i brak po drugiej stronie to nie wzorzec", () => {
    const out = compareAudits(audit([line({ manko: -3 })]), audit([line({ manko: 3 })]), 0);

    expect(out[0].recurring).toBe(false);
  });

  it("respektuje próg tolerancji", () => {
    const out = compareAudits(audit([line({ manko: 2 })]), audit([line({ manko: 2 })]), 2);

    expect(out[0].recurring).toBe(false);
  });

  it("pomija pozycje niepoliczone w którymś ze spisów", () => {
    const out = compareAudits(
      audit([line({ manko: null, physicalCount: null })]),
      audit([line({ manko: 5 })]),
      0,
    );

    expect(out[0].recurring).toBe(false);
  });

  it("pomija warianty, których nie ma w obu spisach", () => {
    const prev = audit([line({ productId: "P9" })]);
    const curr = audit([line({ productId: "P1" })]);

    expect(compareAudits(prev, curr, 0)).toHaveLength(0);
  });

  it("sortuje najgorsze pozycje na górę", () => {
    const prev = audit([
      line({ productId: "P1", manko: 1 }),
      line({ productId: "P2", productName: "Woda", manko: 9 }),
    ]);
    const curr = audit([
      line({ productId: "P1", manko: 1 }),
      line({ productId: "P2", productName: "Woda", manko: 9 }),
    ]);

    expect(compareAudits(prev, curr, 0)[0].productName).toBe("Woda");
  });
});
