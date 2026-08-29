import { describe, it, expect } from "vitest";
import { normalizeReport, DEFAULT_SETTINGS } from "../file";
import { emptyReport, ReportState } from "../../model/types";

/** Raport zapisany przed dodaniem dat ważności / ustawień / stanów minimalnych. */
function legacyReport(): ReportState {
  const r = emptyReport();
  return {
    schemaVersion: r.schemaVersion,
    generatedAt: "2026-07-01T10:00:00.000Z",
    catalog: [],
    ledger: [],
    audits: [],
  } as ReportState;
}

describe("normalizeReport", () => {
  it("dopełnia brakujące pola w pliku sprzed rozbudowy", () => {
    const out = normalizeReport(legacyReport());

    expect(out.expiryBatches).toEqual([]);
    expect(out.minStock).toEqual({});
    expect(out.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("nie nadpisuje danych, które w pliku już są", () => {
    const batch = {
      id: "e1",
      productId: "P1",
      presentationId: "V1",
      expiryDate: "2026-09-10",
      qty: 3,
      createdAt: "2026-08-01T10:00:00.000Z",
    };
    const out = normalizeReport({
      ...legacyReport(),
      expiryBatches: [batch],
      minStock: { "P1::V1": 12 },
      settings: { clubName: "XFG Lębork", expiryWarnDays: 14, toleranceUnits: 2 },
    });

    expect(out.expiryBatches).toEqual([batch]);
    expect(out.minStock).toEqual({ "P1::V1": 12 });
    expect(out.settings.clubName).toBe("XFG Lębork");
    expect(out.settings.expiryWarnDays).toBe(14);
  });

  it("uzupełnia pojedyncze brakujące ustawienie, zachowując resztę", () => {
    const out = normalizeReport({
      ...legacyReport(),
      settings: { clubName: "XFG Lębork" } as ReportState["settings"],
    });

    expect(out.settings.clubName).toBe("XFG Lębork");
    expect(out.settings.expiryWarnDays).toBe(DEFAULT_SETTINGS.expiryWarnDays);
    expect(out.settings.toleranceUnits).toBe(DEFAULT_SETTINGS.toleranceUnits);
  });
});
