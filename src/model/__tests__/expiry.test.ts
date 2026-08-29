import { describe, it, expect } from "vitest";
import { emptyReport, ReportState, variantKey } from "../types";
import { addExpiryBatch, removeExpiryBatch, expirySummary } from "../expiry";

const KEY = variantKey("P1", "V1");
const TODAY = "2026-09-01";

function withBatch(
  r: ReportState,
  expiryDate: string,
  qty: number,
  productId = "P1",
): ReportState {
  return addExpiryBatch(r, {
    productId,
    presentationId: "V1",
    expiryDate,
    qty,
  });
}

describe("addExpiryBatch", () => {
  it("dopisuje partię z własnym id i znacznikiem czasu", () => {
    const r = withBatch(emptyReport(), "2026-09-10", 3);

    expect(r.expiryBatches).toHaveLength(1);
    expect(r.expiryBatches[0].id).toBeTruthy();
    expect(r.expiryBatches[0].createdAt).toBeTruthy();
    expect(r.expiryBatches[0].removedAt).toBeUndefined();
  });
});

describe("removeExpiryBatch", () => {
  it("oznacza partię jako wycofaną, nie kasując śladu", () => {
    const r = withBatch(emptyReport(), "2026-09-10", 3);
    const out = removeExpiryBatch(r, r.expiryBatches[0].id);

    expect(out.expiryBatches).toHaveLength(1);
    expect(out.expiryBatches[0].removedAt).toBeTruthy();
  });
});

describe("expirySummary", () => {
  it("sumuje sztuki wariantu i wskazuje najbliższą datę", () => {
    let r = withBatch(emptyReport(), "2026-09-20", 3);
    r = withBatch(r, "2026-09-10", 2);

    const entry = expirySummary(r, TODAY, 30).get(KEY)!;

    expect(entry.qty).toBe(5);
    expect(entry.nearest).toBe("2026-09-10");
    expect(entry.batches).toHaveLength(2);
  });

  it("pomija partie poza progiem ostrzegania", () => {
    const r = withBatch(emptyReport(), "2026-12-01", 7); // ponad 30 dni

    expect(expirySummary(r, TODAY, 30).has(KEY)).toBe(false);
  });

  it("bierze partię dokładnie na granicy progu", () => {
    const r = withBatch(emptyReport(), "2026-10-01", 4); // today + 30 dni

    expect(expirySummary(r, TODAY, 30).get(KEY)!.qty).toBe(4);
  });

  it("liczy partie już przeterminowane", () => {
    const r = withBatch(emptyReport(), "2026-08-20", 1);

    expect(expirySummary(r, TODAY, 30).get(KEY)!.qty).toBe(1);
  });

  it("pomija partie wycofane", () => {
    let r = withBatch(emptyReport(), "2026-09-10", 3);
    r = removeExpiryBatch(r, r.expiryBatches[0].id);

    expect(expirySummary(r, TODAY, 30).has(KEY)).toBe(false);
  });

  it("rozdziela warianty", () => {
    let r = withBatch(emptyReport(), "2026-09-10", 3, "P1");
    r = withBatch(r, "2026-09-12", 8, "P2");

    const summary = expirySummary(r, TODAY, 30);
    expect(summary.get(KEY)!.qty).toBe(3);
    expect(summary.get(variantKey("P2", "V1"))!.qty).toBe(8);
  });
});
