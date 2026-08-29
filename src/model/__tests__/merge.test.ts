import { describe, it, expect } from "vitest";
import { mergeReports } from "../merge";
import { genId, ingestSnapshot, recordDelivery } from "../ledger";
import { addExpiryBatch, removeExpiryBatch } from "../expiry";
import { emptyReport, GlofoxSnapshot, ReportState } from "../types";

const SRC = "2026-06-01T20:00:00.000Z";

function snap(): GlofoxSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: SRC,
    products: [
      {
        productId: "P1",
        name: "Baton",
        presentations: [{ presentationId: "V1", name: "", stock: 10, price: 5 }],
      },
    ],
    sales: [],
  };
}

/** Wspólny punkt wyjścia — tak wygląda plik skopiowany na drugi komputer. */
function base(): ReportState {
  return ingestSnapshot(emptyReport(), snap());
}

function withGeneratedAt(r: ReportState, at: string): ReportState {
  return { ...r, generatedAt: at };
}

describe("mergeReports — ledger", () => {
  it("łączy pracę z dwóch komputerów bez duplikowania wspólnej historii", () => {
    const common = base();
    const a = recordDelivery(common, {
      productId: "P1",
      presentationId: "V1",
      qty: 5,
      at: "2026-06-02T10:00:00.000Z",
    });
    const b = recordDelivery(common, {
      productId: "P1",
      presentationId: "V1",
      qty: 7,
      at: "2026-06-03T10:00:00.000Z",
    });

    const { report, stats } = mergeReports(a, b);

    expect(report.ledger).toHaveLength(common.ledger.length + 2);
    expect(stats.events).toBe(1); // tylko dostawa z drugiego komputera jest nowa
  });

  it("scalenie tego samego pliku niczego nie zmienia (idempotencja)", () => {
    const a = base();

    const { report, stats } = mergeReports(a, a);

    expect(report.ledger).toHaveLength(a.ledger.length);
    expect(stats).toEqual({ events: 0, audits: 0, batches: 0 });
  });

  it("porządkuje zdarzenia chronologicznie", () => {
    const common = base();
    const a = recordDelivery(common, {
      productId: "P1",
      presentationId: "V1",
      qty: 1,
      at: "2026-06-09T10:00:00.000Z",
    });
    const b = recordDelivery(common, {
      productId: "P1",
      presentationId: "V1",
      qty: 1,
      at: "2026-06-05T10:00:00.000Z",
    });

    const times = mergeReports(a, b).report.ledger.map((e) => e.at);

    expect([...times]).toEqual([...times].sort());
  });
});

describe("mergeReports — audyty i partie", () => {
  it("łączy zapisane audyty po id", () => {
    const common = base();
    const audit = (id: string) => ({
      id,
      openedAt: SRC,
      closedAt: SRC,
      snapshotSource: SRC,
      toleranceUnits: 0,
      lines: [],
    });
    const a = { ...common, audits: [audit("a1")] };
    const b = { ...common, audits: [audit("a1"), audit("a2")] };

    const { report, stats } = mergeReports(a, b);

    expect(report.audits.map((x) => x.id)).toEqual(["a1", "a2"]);
    expect(stats.audits).toBe(1);
  });

  it("wycofanie partii jest nieodwracalne — import nie wskrzesza zdjętego towaru", () => {
    const withBatch = addExpiryBatch(base(), {
      productId: "P1",
      presentationId: "V1",
      expiryDate: "2026-09-10",
      qty: 3,
    });
    const id = withBatch.expiryBatches[0].id;
    const removed = removeExpiryBatch(withBatch, id);

    // stary plik (bez wycofania) importowany na komputer, gdzie już wycofano
    const merged = mergeReports(removed, withBatch).report;

    expect(merged.expiryBatches[0].removedAt).toBeTruthy();
  });

  it("liczy nowe partie w statystykach", () => {
    const a = base();
    const b = addExpiryBatch(a, {
      productId: "P1",
      presentationId: "V1",
      expiryDate: "2026-09-10",
      qty: 3,
    });

    expect(mergeReports(a, b).stats.batches).toBe(1);
  });
});

describe("mergeReports — ustawienia i minima", () => {
  it("nowszy raport wygrywa przy ustawieniach", () => {
    const older = withGeneratedAt(
      { ...base(), settings: { clubName: "Stara", expiryWarnDays: 30, toleranceUnits: 0 } },
      "2026-06-01T00:00:00.000Z",
    );
    const newer = withGeneratedAt(
      { ...base(), settings: { clubName: "Nowa", expiryWarnDays: 14, toleranceUnits: 2 } },
      "2026-06-08T00:00:00.000Z",
    );

    expect(mergeReports(older, newer).report.settings.clubName).toBe("Nowa");
    expect(mergeReports(newer, older).report.settings.clubName).toBe("Nowa");
  });

  it("minima z obu stron zostają, a przy konflikcie wygrywa nowszy", () => {
    const older = withGeneratedAt(
      { ...base(), minStock: { "P1::V1": 10, "P2::V1": 4 } },
      "2026-06-01T00:00:00.000Z",
    );
    const newer = withGeneratedAt(
      { ...base(), minStock: { "P1::V1": 20 } },
      "2026-06-08T00:00:00.000Z",
    );

    expect(mergeReports(older, newer).report.minStock).toEqual({
      "P1::V1": 20,
      "P2::V1": 4,
    });
  });
});

describe("genId", () => {
  it("nie powtarza id nawet przy zawołaniach w tej samej milisekundzie", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => genId("ev")));

    expect(ids.size).toBe(5000);
  });

  it("zawiera człon losowy — dwa komputery nie wygenerują tego samego id", () => {
    // Licznik i czas mogą się zgadzać na obu maszynach; różnicę robi losowość.
    const [a, b] = [genId("ev"), genId("ev")];
    const tail = (s: string) => s.split("_").slice(2).join("_");

    expect(tail(a)).not.toBe(tail(b));
  });
});
