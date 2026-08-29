// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { emptyReport, GlofoxSnapshot, ReportState } from "../../model/types";
import { ingestSnapshot } from "../../model/ledger";
import { ExpiryView } from "../ExpiryView";

afterEach(() => cleanup());

function snap(): GlofoxSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: "2026-06-01T20:00:00.000Z",
    products: [
      {
        productId: "P1",
        name: "5900617013064 Baton proteinowy",
        presentations: [{ presentationId: "V1", name: "", stock: 12, price: 9.5 }],
      },
    ],
    sales: [],
  };
}

function Harness() {
  const [report, setReport] = useState<ReportState>(() =>
    ingestSnapshot(emptyReport(), snap()),
  );
  return (
    <>
      <ExpiryView report={report} update={(fn) => setReport(fn)} />
      <output data-testid="count">{report.expiryBatches.length}</output>
      <output data-testid="removed">
        {report.expiryBatches.filter((b) => b.removedAt).length}
      </output>
    </>
  );
}

function addBatch(ui: ReturnType<typeof render>, date: string, qty: string) {
  fireEvent.change(ui.getByPlaceholderText("np. baton albo 5900617013064"), {
    target: { value: "baton" },
  });
  fireEvent.click(ui.getByText("Wybierz"));
  fireEvent.change(ui.getByLabelText("Data ważności"), {
    target: { value: date },
  });
  fireEvent.change(ui.getByLabelText("Ilość sztuk"), { target: { value: qty } });
  fireEvent.click(ui.getByText("Dodaj partię"));
}

describe("ExpiryView", () => {
  it("dodaje partię z krótką datą do raportu", () => {
    const ui = render(<Harness />);

    addBatch(ui, "2026-09-10", "3");

    expect(ui.getByTestId("count").textContent).toBe("1");
    expect(ui.container.textContent).toContain("2026-09-10");
  });

  it("„wycofano” oznacza partię, nie kasując jej z raportu", () => {
    const ui = render(<Harness />);
    addBatch(ui, "2026-09-10", "3");

    fireEvent.click(ui.getByText("wycofano"));

    expect(ui.getByTestId("count").textContent).toBe("1");
    expect(ui.getByTestId("removed").textContent).toBe("1");
  });
});
