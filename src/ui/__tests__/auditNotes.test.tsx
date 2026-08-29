// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { emptyReport, GlofoxSnapshot, ReportState } from "../../model/types";
import { ingestSnapshot, countNoteMap } from "../../model/ledger";
import { AuditView } from "../AuditView";

afterEach(() => cleanup());

const SRC = "2026-06-01T20:00:00.000Z";

function snap(): GlofoxSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: SRC,
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
      <AuditView report={report} update={(fn) => setReport(fn)} />
      <output data-testid="note">
        {countNoteMap(report.ledger, SRC).get("P1::V1") ?? ""}
      </output>
    </>
  );
}

describe("AuditView — próg tolerancji", () => {
  it("startuje z domyślną tolerancją z ustawień klubu", () => {
    const base = ingestSnapshot(emptyReport(), snap());
    const report: ReportState = {
      ...base,
      settings: { ...base.settings, toleranceUnits: 3 },
    };
    const { getByLabelText } = render(
      <AuditView report={report} update={() => {}} />,
    );
    expect((getByLabelText("Próg tolerancji (szt)") as HTMLInputElement).value).toBe(
      "3",
    );
  });
});

describe("AuditView — uwagi do pozycji", () => {
  it("zapisuje uwagę z wiersza spisu do ledgera", () => {
    const { getByPlaceholderText, getByTestId } = render(<Harness />);

    const input = getByPlaceholderText("uwaga…");
    fireEvent.change(input, { target: { value: "stłuczka" } });
    fireEvent.blur(input);

    expect(getByTestId("note").textContent).toBe("stłuczka");
  });
});
