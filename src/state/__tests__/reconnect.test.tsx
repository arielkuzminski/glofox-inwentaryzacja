// @vitest-environment jsdom
// Regresja: podpięcie/wznowienie folderu NIE MOŻE skasować pracy zrobionej wcześniej.
// Ścieżka z życia: F5 → „Folder czeka na zgodę" → import snapshotu → „Wznów zapis
// do folderu" → stara treść folderu nadpisywała świeży import i wyglądało to jak
// „import nie działa".
import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { emptyReport, GlofoxSnapshot, ReportState } from "../../model/types";
import { ingestSnapshot } from "../../model/ledger";

function snap(productId: string, capturedAt: string): GlofoxSnapshot {
  return {
    schemaVersion: 1,
    capturedAt,
    products: [
      {
        productId,
        name: `Produkt ${productId}`,
        presentations: [{ presentationId: "V1", name: "", stock: 5, price: 2 }],
      },
    ],
    sales: [],
  };
}

/** To leży w folderze danych (starszy spis). */
const inFolder: ReportState = ingestSnapshot(
  emptyReport(),
  snap("STARY", "2026-06-01T20:00:00.000Z"),
);
/** To menadżer właśnie zaimportował z bookmarkletu. */
const justImported: ReportState = ingestSnapshot(
  emptyReport(),
  snap("NOWY", "2026-08-31T16:28:25.523Z"),
);

vi.mock("../../storage/draftStore", () => ({
  loadDraftMigrating: async () => null,
  saveDraft: async () => {},
  clearDraft: async () => {},
}));
vi.mock("../../storage/handleStore", () => ({
  loadHandle: async () => ({ name: "Inwentaryzacja" }),
  saveHandle: async () => {},
  clearHandle: async () => {},
}));
vi.mock("../../storage/dataDir", () => ({
  isDirPickerSupported: () => true,
  pickDataDirectory: async () => ({ name: "Inwentaryzacja" }),
  readReportFromDir: async () => inFolder,
  writeReportToDir: async () => {},
  writeBackup: async () => {},
  listBackups: async () => [],
  localDay: () => "2026-08-31",
}));
vi.mock("../../storage/fileSystem", () => ({
  // zgoda dopiero po geście użytkownika → status „needs-permission" na starcie
  ensurePermission: async (_h: unknown, interactive: boolean) => interactive === true,
  WriteQueue: class {
    enqueue() {}
    async idle() {}
  },
}));

const { useReport } = await import("../store");

describe("useReport — wznowienie folderu", () => {
  it("scala treść folderu z tym, co menadżer zdążył zaimportować", async () => {
    const { result } = renderHook(() => useReport());
    await waitFor(() => expect(result.current.persist.status).toBe("needs-permission"));

    act(() => result.current.replace(justImported)); // import z bookmarkletu
    await act(async () => {
      await result.current.persist.reconnect(); // „Wznów zapis do folderu"
    });

    const ids = result.current.report.catalog.map((p) => p.productId).sort();
    expect(ids).toEqual(["NOWY", "STARY"]);
    expect(result.current.persist.status).toBe("connected");
  });

  it("wskazanie folderu też nie kasuje bieżącej pracy", async () => {
    const { result } = renderHook(() => useReport());
    await waitFor(() => expect(result.current.persist.status).toBe("needs-permission"));

    act(() => result.current.replace(justImported));
    await act(async () => {
      await result.current.persist.connectDirectory();
    });

    expect(result.current.report.catalog.map((p) => p.productId).sort()).toEqual([
      "NOWY",
      "STARY",
    ]);
  });
});
