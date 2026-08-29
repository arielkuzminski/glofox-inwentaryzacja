import { describe, it, expect } from "vitest";
import {
  FRANCHISE_HEADERS,
  buildFranchiseRows,
  franchiseToCsv,
  franchiseRowsFor,
  stripEan,
} from "../franchise";
import { ingestSnapshot } from "../../model/ledger";
import { addExpiryBatch, expirySummary } from "../../model/expiry";
import { computeAudit } from "../../model/reconcile";
import {
  emptyReport,
  GlofoxSnapshot,
  ReportState,
  variantKey,
} from "../../model/types";

const SRC = "2026-06-01T20:00:00.000Z";
const KEY = variantKey("P1", "V1");

function snap(): GlofoxSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: SRC,
    products: [
      {
        productId: "P1",
        name: "5000112679540 Woda Kropla Beskidu 0.75L",
        presentations: [{ presentationId: "V1", name: "", stock: 12, price: 2.5 }],
      },
      {
        productId: "P2",
        name: "5061013964968 BURN GUAVA",
        presentations: [{ presentationId: "V1", name: "", stock: 0, price: 8 }],
      },
    ],
    sales: [],
  };
}

function base(): ReportState {
  return ingestSnapshot(emptyReport(), snap());
}

describe("stripEan", () => {
  it("obcina wiodący kod EAN z nazwy produktu", () => {
    expect(stripEan("5000112679540 Woda Kropla Beskidu 0.75L")).toBe(
      "Woda Kropla Beskidu 0.75L",
    );
  });

  it("zostawia nazwę bez kodu nietkniętą", () => {
    expect(stripEan("Woda Kropla Beskidu")).toBe("Woda Kropla Beskidu");
  });

  it("obcina kod z KOŃCA nazwy (tak wygląda połowa katalogu klubu)", () => {
    expect(stripEan("60PAK 80WHEY PROTEIN 908G STRAWBERRY 5902811811286")).toBe(
      "60PAK 80WHEY PROTEIN 908G STRAWBERRY",
    );
  });

  it("obcina kod ze środka, gdy po nim jest dopisek", () => {
    expect(stripEan("6PAK CRAZE SHOT 80ml LEMON-GRAPE 5902114081959 [k]")).toBe(
      "6PAK CRAZE SHOT 80ml LEMON-GRAPE [k]",
    );
  });

  it("nie obcina liczby, która jest częścią nazwy", () => {
    expect(stripEan("100 procent whey")).toBe("100 procent whey");
    expect(stripEan("6PAK CARBO PAK 1000G ORANGE")).toBe("6PAK CARBO PAK 1000G ORANGE");
  });
});

describe("buildFranchiseRows", () => {
  it("Różnica liczy się jak w sieci: stan faktyczny − stan systemowy (odwrotnie niż manko)", () => {
    const r = base();
    const audit = computeAudit(r, SRC, new Map([[KEY, 10]]), 0);

    const row = buildFranchiseRows(audit, {}).find((x) =>
      x.name.includes("Woda"),
    )!;

    expect(audit.lines.find((l) => l.productId === "P1")!.manko).toBe(2); // nasze manko
    expect(row.systemStock).toBe(12);
    expect(row.physicalCount).toBe(10);
    expect(row.difference).toBe(-2); // wzór sieci: brak = minus
  });

  it("pozycji niepoliczonej nie zgaduje — puste D i E", () => {
    const r = base();
    const audit = computeAudit(r, SRC, new Map(), 0);

    const row = buildFranchiseRows(audit, {}).find((x) =>
      x.name.includes("Woda"),
    )!;

    expect(row.physicalCount).toBeNull();
    expect(row.difference).toBeNull();
  });

  it("pomija pozycje bez stanu, spisu, daty i uwagi; includeAll pokazuje wszystko", () => {
    const r = base();
    const audit = computeAudit(r, SRC, new Map(), 0);

    expect(buildFranchiseRows(audit, {})).toHaveLength(1); // BURN ma stan 0
    expect(buildFranchiseRows(audit, { includeAll: true })).toHaveLength(2);
  });

  it("numeruje wiersze od 1 po posortowaniu nazwami", () => {
    const r = base();
    const audit = computeAudit(r, SRC, new Map([[variantKey("P2", "V1"), 4]]), 0);

    const rows = buildFranchiseRows(audit, { includeAll: true });

    expect(rows.map((x) => x.lp)).toEqual([1, 2]);
    expect(rows[0].name).toBe("BURN GUAVA");
    expect(rows[1].name).toBe("Woda Kropla Beskidu 0.75L");
  });

  it("dokłada najbliższą datę i sumę sztuk z krótką datą", () => {
    let r = base();
    r = addExpiryBatch(r, {
      productId: "P1",
      presentationId: "V1",
      expiryDate: "2026-09-10",
      qty: 2,
    });
    r = addExpiryBatch(r, {
      productId: "P1",
      presentationId: "V1",
      expiryDate: "2026-09-20",
      qty: 1,
    });
    const audit = computeAudit(r, SRC, new Map([[KEY, 12]]), 0);

    const row = buildFranchiseRows(audit, {
      expiry: expirySummary(r, "2026-09-01", 30),
    }).find((x) => x.name.includes("Woda"))!;

    expect(row.expiryDate).toBe("2026-09-10");
    expect(row.expiryQty).toBe(3);
  });

  it("przenosi uwagę ze spisu do kolumny Uwagi", () => {
    const r = base();
    const audit = computeAudit(
      r,
      SRC,
      new Map([[KEY, 12]]),
      0,
      new Map([[KEY, "stłuczka"]]),
    );

    expect(
      buildFranchiseRows(audit, {}).find((x) => x.name.includes("Woda"))!.note,
    ).toBe("stłuczka");
  });
});

describe("franchiseToCsv", () => {
  it("zaczyna się nagłówkiem wzoru i zapisuje wiersz w kolejności kolumn A–H", () => {
    const r = base();
    const audit = computeAudit(
      r,
      SRC,
      new Map([[KEY, 10]]),
      0,
      new Map([[KEY, "stłuczka"]]),
    );
    const csv = franchiseToCsv(buildFranchiseRows(audit, {}));
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe(FRANCHISE_HEADERS.join(";"));
    expect(lines[1]).toBe("1;Woda Kropla Beskidu 0.75L;12;10;-2;;;stłuczka");
  });
});

describe("franchiseRowsFor", () => {
  it("liczy krótkie daty na dzień spisu i wg progu z ustawień klubu", () => {
    let r = base();
    r = { ...r, settings: { ...r.settings, expiryWarnDays: 7 } };
    r = addExpiryBatch(r, {
      productId: "P1",
      presentationId: "V1",
      expiryDate: "2026-06-05", // 4 dni po spisie → w progu 7 dni
      qty: 2,
    });
    r = addExpiryBatch(r, {
      productId: "P1",
      presentationId: "V1",
      expiryDate: "2026-06-20", // poza progiem
      qty: 5,
    });
    const audit = { ...computeAudit(r, SRC, new Map([[KEY, 12]]), 0), closedAt: SRC };

    const row = franchiseRowsFor(r, audit).find((x) => x.name.includes("Woda"))!;

    expect(row.expiryQty).toBe(2);
    expect(row.expiryDate).toBe("2026-06-05");
  });
});
