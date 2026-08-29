import { describe, it, expect } from "vitest";
import { isPristine } from "../store";
import { emptyReport, GlofoxSnapshot, ReportState } from "../../model/types";
import { ingestSnapshot } from "../../model/ledger";
import { addExpiryBatch } from "../../model/expiry";

const SNAP: GlofoxSnapshot = {
  schemaVersion: 1,
  capturedAt: "2026-06-01T20:00:00.000Z",
  products: [
    {
      productId: "P1",
      name: "Baton",
      presentations: [{ presentationId: "V1", name: "", stock: 5, price: 2 }],
    },
  ],
  sales: [],
};

describe("isPristine", () => {
  it("świeży raport jest pusty", () => {
    expect(isPristine(emptyReport())).toBe(true);
  });

  it("po imporcie snapshotu już nie", () => {
    expect(isPristine(ingestSnapshot(emptyReport(), SNAP))).toBe(false);
  });

  it("sama partia z datą ważności też liczy się jako praca", () => {
    const r: ReportState = addExpiryBatch(emptyReport(), {
      productId: "P1",
      presentationId: "V1",
      expiryDate: "2026-09-01",
      qty: 1,
    });
    expect(isPristine(r)).toBe(false);
  });

  it("zapisany audyt też", () => {
    const r: ReportState = {
      ...emptyReport(),
      audits: [
        {
          id: "a1",
          openedAt: "2026-06-01T20:00:00.000Z",
          snapshotSource: "s",
          toleranceUnits: 0,
          lines: [],
        },
      ],
    };
    expect(isPristine(r)).toBe(false);
  });
});
