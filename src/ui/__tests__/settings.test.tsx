// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { emptyReport, ReportState } from "../../model/types";
import { SettingsView } from "../SettingsView";

afterEach(() => cleanup());

/** Harness: trzyma stan tak jak App, żeby sprawdzić realny zapis do ReportState. */
function Harness() {
  const [report, setReport] = useState<ReportState>(emptyReport());
  return (
    <>
      <SettingsView report={report} update={(fn) => setReport(fn)} />
      <output data-testid="club">{report.settings.clubName ?? ""}</output>
      <output data-testid="warn">{report.settings.expiryWarnDays}</output>
    </>
  );
}

describe("SettingsView", () => {
  it("zapisuje nazwę klubu do ustawień raportu", () => {
    const { getByPlaceholderText, getByTestId } = render(<Harness />);

    fireEvent.change(getByPlaceholderText("np. XFG Lębork"), {
      target: { value: "XFG Lębork" },
    });

    expect(getByTestId("club").textContent).toBe("XFG Lębork");
  });

  it("zapisuje próg krótkiej daty jako liczbę", () => {
    const { getByLabelText, getByTestId } = render(<Harness />);

    fireEvent.change(getByLabelText("Krótka data — próg (dni)"), {
      target: { value: "14" },
    });

    expect(getByTestId("warn").textContent).toBe("14");
  });
});
