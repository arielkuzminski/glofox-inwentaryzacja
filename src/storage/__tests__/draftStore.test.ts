import { describe, it, expect } from "vitest";
import { loadDraftMigrating, type DraftPorts } from "../draftStore";
import { emptyReport, ReportState, SCHEMA_VERSION } from "../../model/types";

function ports(over: Partial<DraftPorts> = {}): DraftPorts & { cleared: boolean } {
  const state = {
    cleared: false,
    readLocal: () => null,
    clearLocal() {
      state.cleared = true;
    },
    readIdb: async () => null,
    writeIdb: async () => {},
    ...over,
  };
  return state as DraftPorts & { cleared: boolean };
}

function legacyJson(tag: string, schemaVersion = SCHEMA_VERSION): string {
  const r = emptyReport() as Partial<ReportState>;
  delete r.expiryBatches; // plik sprzed rozbudowy
  delete r.settings;
  delete r.minStock;
  return JSON.stringify({ ...r, schemaVersion, branchId: tag });
}

describe("loadDraftMigrating", () => {
  it("zwraca kopię z IndexedDB i nie rusza localStorage", async () => {
    const p = ports({
      readIdb: async () => ({ ...emptyReport(), branchId: "z-idb" }),
      readLocal: () => legacyJson("ze-storage"),
    });

    expect((await loadDraftMigrating(p))?.branchId).toBe("z-idb");
    expect(p.cleared).toBe(false);
  });

  it("przenosi stary autosave z localStorage do IndexedDB i czyści localStorage", async () => {
    let written: ReportState | null = null;
    const p = ports({
      readLocal: () => legacyJson("ze-storage"),
      writeIdb: async (r) => {
        written = r;
      },
    });

    const out = await loadDraftMigrating(p);

    expect(out?.branchId).toBe("ze-storage");
    expect(written).not.toBeNull();
    expect(p.cleared).toBe(true);
  });

  it("uzupełnia brakujące pola przy migracji (normalizacja)", async () => {
    const p = ports({ readLocal: () => legacyJson("ze-storage") });

    const out = await loadDraftMigrating(p);

    expect(out?.expiryBatches).toEqual([]);
    expect(out?.settings.expiryWarnDays).toBe(30);
  });

  it("pomija autosave o niezgodnej wersji schematu", async () => {
    const p = ports({ readLocal: () => legacyJson("stary", SCHEMA_VERSION + 1) });

    expect(await loadDraftMigrating(p)).toBeNull();
    expect(p.cleared).toBe(false);
  });

  it("nie wywraca się na uszkodzonym JSON-ie", async () => {
    const p = ports({ readLocal: () => "{ to nie jest json" });

    expect(await loadDraftMigrating(p)).toBeNull();
  });

  it("zwraca null, gdy nie ma nic ani w IDB, ani w localStorage", async () => {
    expect(await loadDraftMigrating(ports())).toBeNull();
  });
});
