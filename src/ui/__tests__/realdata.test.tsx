// @vitest-environment jsdom
// Test komponentów React na PRAWDZIWYM snapshocie z real_data/ (jeśli istnieje).
// Weryfikuje, że UI poprawnie renderuje 228 produktów / 2105 sprzedaży na żywych danych.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { emptyReport, GlofoxSnapshot, ReportState } from "../../model/types";
import { ingestSnapshot } from "../../model/ledger";
import { SnapshotView } from "../SnapshotView";
import { SalesView } from "../SalesView";
import { AuditView } from "../AuditView";

afterEach(() => cleanup());

const SNAP_PATH = resolve(
  process.cwd(),
  "real_data/glofox-snapshot-2026-06-30.json",
);
const hasReal = existsSync(SNAP_PATH);
const d = hasReal ? describe : describe.skip;

d("UI na prawdziwym snapshocie", () => {
  const snap = JSON.parse(readFileSync(SNAP_PATH, "utf8")) as GlofoxSnapshot;
  const report: ReportState = ingestSnapshot(emptyReport(), snap);

  const variantCount = snap.products.reduce(
    (n, p) => n + p.presentations.length,
    0,
  );
  const totalUnits = snap.sales.reduce((s, x) => s + x.qty, 0);

  it("STAN: renderuje katalog i stan konkretnego produktu", () => {
    const { container, getAllByText } = render(<SnapshotView report={report} />);
    // licznik wariantów w tabeli snapshotów
    expect(getAllByText(String(variantCount)).length).toBeGreaterThan(0);
    // konkretny produkt + jego stan (Woda Kropla Beskidu 0.75L, stock 38)
    const woda = snap.products.find((p) => p.productId === "691b31841d1c67c2ec044f88");
    expect(container.textContent).toContain(woda!.name);
    expect(container.textContent).toContain(String(woda!.presentations[0].stock));
  });

  it("SPRZEDAŻ: renderuje sumę sztuk i rozbicie per sprzedawca", () => {
    const { getAllByText, container } = render(<SalesView report={report} />);
    expect(getAllByText(String(totalUnits)).length).toBeGreaterThan(0);
    // jakikolwiek sprzedawca z danych pojawia się w tabeli
    const someStaff = snap.sales.find((s) => s.staffId)?.staffId;
    if (someStaff) expect(container.textContent).toContain(someStaff);
  });

  it("AUDYT: po wpisaniu spisu liczy manko i jego wartość na żywo", () => {
    const { container, getByPlaceholderText } = render(
      <AuditView report={report} update={() => {}} />,
    );
    // odfiltruj do jednego produktu (Woda 0.75L, EAN w nazwie)
    fireEvent.change(getByPlaceholderText(/woda 0.75/i), {
      target: { value: "5000112679540" },
    });
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(1);
    const row = rows[0];
    const input = row.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "35" } }); // system 38 → manko 3

    const cells = row.querySelectorAll("td");
    expect(cells[1].textContent).toBe("38"); // stan Glofox
    expect(cells[4].textContent).toBe("3"); // manko
    expect(cells[5].textContent).toBe("12.00"); // wartość = 3 * 4.00
  });
});
