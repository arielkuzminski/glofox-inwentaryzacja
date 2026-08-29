// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { emptyReport, GlofoxSnapshot, ReportState, variantKey } from "../../model/types";
import { ingestSnapshot } from "../../model/ledger";
import { OrdersView } from "../OrdersView";

afterEach(() => cleanup());

const T1 = "2026-06-01T20:00:00.000Z";
const T2 = "2026-06-15T20:00:00.000Z";
const KEY = variantKey("P1", "V1");

function snap(capturedAt: string, stock: number, sold = 0): GlofoxSnapshot {
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
    sales: sold
      ? [
          {
            orderId: `${capturedAt}-o`,
            productId: "P1",
            presentationId: "V1",
            qty: sold,
            soldAt: capturedAt,
          },
        ]
      : [],
  };
}

function Harness() {
  const [report, setReport] = useState<ReportState>(() => {
    let r = ingestSnapshot(emptyReport(), snap(T1, 100));
    r = ingestSnapshot(r, snap(T2, 8, 20));
    return r;
  });
  return (
    <>
      <OrdersView report={report} update={(fn) => setReport(fn)} />
      <output data-testid="min">{report.minStock[KEY] ?? ""}</output>
    </>
  );
}

describe("OrdersView", () => {
  it("pokazuje zużycie tygodniowe policzone z okna między snapshotami", () => {
    const { container } = render(<Harness />);
    expect(container.textContent).toContain("10"); // 20 szt / 14 dni × 7
  });

  it("zapisuje ręcznie wpisane minimum", () => {
    const ui = render(<Harness />);
    const input = ui.getByLabelText("Minimum dla Baton");

    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.blur(input);

    expect(ui.getByTestId("min").textContent).toBe("30");
  });

  it("„min = zużycie tygodniowe” ustawia minimum z realnej rotacji", () => {
    const ui = render(<Harness />);

    fireEvent.click(ui.getByText("min = zużycie tyg. (wszystkie)"));

    expect(ui.getByTestId("min").textContent).toBe("10");
  });
});
