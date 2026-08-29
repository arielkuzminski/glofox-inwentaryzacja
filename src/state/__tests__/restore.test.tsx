// @vitest-environment jsdom
// Regresja: auto-zapis NIE MOŻE ruszyć, zanim skończy się odtwarzanie kopii.
// Odczyt z IndexedDB jest asynchroniczny, więc pusty stan startowy zdążył
// nadpisać zapisaną kopię i menadżer tracił wszystko przy odświeżeniu strony.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { emptyReport, ReportState } from "../../model/types";
import { ingestSnapshot } from "../../model/ledger";

const saveDraft = vi.fn(async () => {});
let resolveDraft: (r: ReportState | null) => void;

vi.mock("../../storage/draftStore", () => ({
  loadDraftMigrating: () =>
    new Promise<ReportState | null>((res) => {
      resolveDraft = res;
    }),
  saveDraft: (r: ReportState) => saveDraft(r),
  clearDraft: async () => {},
}));

const { useReport } = await import("../store");

const SNAP = {
  schemaVersion: 1,
  capturedAt: "2026-06-01T20:00:00.000Z",
  products: [
    {
      productId: "P1",
      name: "Baton",
      presentations: [{ presentationId: "V1", name: "", stock: 5, price: 2 }],
    },
  ],
  sales: [],
};

beforeEach(() => saveDraft.mockClear());

describe("useReport — odtwarzanie kopii", () => {
  it("nie zapisuje pustego stanu, dopóki kopia się nie wczytała", async () => {
    renderHook(() => useReport());

    await new Promise((r) => setTimeout(r, 20));
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("po wczytaniu kopii przywraca ją i dopiero wtedy zapisuje", async () => {
    const stored = ingestSnapshot(emptyReport(), SNAP);
    const { result } = renderHook(() => useReport());

    resolveDraft(stored);

    await waitFor(() => expect(result.current.report.catalog).toHaveLength(1));
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    expect(saveDraft.mock.calls[0][0].catalog).toHaveLength(1); // nigdy pusty
  });
});
