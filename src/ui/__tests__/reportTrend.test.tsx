// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Audit, AuditLine, emptyReport, ReportState } from "../../model/types";
import { ReportView } from "../ReportView";

afterEach(() => cleanup());

function line(productId: string, name: string, manko: number): AuditLine {
  return {
    productId,
    presentationId: "V1",
    productName: name,
    presentationName: "(domyślny)",
    unitPrice: 5,
    systemStock: 10,
    soldInWindow: null,
    physicalCount: 10 - manko,
    manko,
    mankoValue: manko * 5,
    expectedFromBook: null,
    bookDiscrepancy: null,
    note: null,
    flagged: manko !== 0,
  };
}

function audit(closedAt: string, lines: AuditLine[]): Audit {
  return {
    id: `a-${closedAt}`,
    openedAt: closedAt,
    closedAt,
    snapshotSource: closedAt,
    toleranceUnits: 0,
    lines,
  };
}

function reportWith(audits: Audit[]): ReportState {
  return { ...emptyReport(), audits };
}

describe("ReportView — trend i powtarzalność", () => {
  it("pokazuje produkt, który ma manko dwa spisy z rzędu", () => {
    const report = reportWith([
      audit("2026-06-01T20:00:00.000Z", [
        line("P1", "Woda Kropla", 3),
        line("P2", "Baton", 1),
      ]),
      audit("2026-06-08T20:00:00.000Z", [
        line("P1", "Woda Kropla", 2),
        line("P2", "Baton", 0),
      ]),
    ]);

    const { container } = render(<ReportView report={report} />);
    const section = container.textContent ?? "";

    expect(section).toContain("Powtarzające się manka");
    expect(section).toContain("Woda Kropla");
  });

  it("pokazuje zmianę manka względem poprzedniego spisu", () => {
    const report = reportWith([
      audit("2026-06-01T20:00:00.000Z", [line("P1", "Woda Kropla", 4)]), // 4 szt = 20 zł
      audit("2026-06-08T20:00:00.000Z", [line("P1", "Woda Kropla", 1)]), // 1 szt = 5 zł
    ]);

    const { container } = render(<ReportView report={report} />);

    expect(container.textContent).toContain("poprzednio 20.00 zł");
  });

  it("nie pokazuje sekcji, gdy jest tylko jeden spis", () => {
    const report = reportWith([
      audit("2026-06-08T20:00:00.000Z", [line("P1", "Woda Kropla", 2)]),
    ]);

    const { container } = render(<ReportView report={report} />);

    expect(container.textContent).not.toContain("Powtarzające się manka");
  });
});
