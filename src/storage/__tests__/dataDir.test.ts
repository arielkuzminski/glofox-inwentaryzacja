import { describe, it, expect } from "vitest";
import {
  DATA_FILE,
  BACKUP_DIR,
  backupName,
  backupsToPrune,
  readReportFromDir,
  writeReportToDir,
  listBackups,
  writeBackup,
  localDay,
  type DataDirHandle,
} from "../dataDir";
import { emptyReport, ReportState } from "../../model/types";

/** Pamięciowy uchwyt katalogu — jak fakeHandle w fileSystem.test.ts, tylko dla folderu. */
function makeDir(name = "Inwentaryzacja") {
  const files = new Map<string, string>();
  const subdirs = new Map<string, ReturnType<typeof makeDir>>();

  const notFound = () =>
    Object.assign(new Error("nie ma takiego wpisu"), { name: "NotFoundError" });

  const dir = {
    name,
    files,
    subdirs,
    async getFileHandle(fname: string, opts?: { create?: boolean }) {
      if (!files.has(fname)) {
        if (!opts?.create) throw notFound();
        files.set(fname, "");
      }
      return {
        name: fname,
        getFile: async () => ({ text: async () => files.get(fname) ?? "" }),
        createWritable: async () => ({
          write: async (data: string) => void files.set(fname, String(data)),
          close: async () => {},
        }),
        queryPermission: async () => "granted",
        requestPermission: async () => "granted",
      };
    },
    async getDirectoryHandle(dname: string, opts?: { create?: boolean }) {
      if (!subdirs.has(dname)) {
        if (!opts?.create) throw notFound();
        subdirs.set(dname, makeDir(dname));
      }
      return subdirs.get(dname)!;
    },
    async *values() {
      for (const f of files.keys()) yield { kind: "file", name: f };
      for (const d of subdirs.keys()) yield { kind: "directory", name: d };
    },
    async removeEntry(entry: string) {
      files.delete(entry);
      subdirs.delete(entry);
    },
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
  };
  return dir;
}

function asHandle(d: ReturnType<typeof makeDir>): DataDirHandle {
  return d as unknown as DataDirHandle;
}

function report(tag: string): ReportState {
  return { ...emptyReport(), branchId: tag };
}

describe("backupName", () => {
  it("buduje nazwę kopii z daty dnia", () => {
    expect(backupName("2026-08-29")).toBe("inwentaryzacja-2026-08-29.json");
  });
});

describe("backupsToPrune", () => {
  const names = [
    "inwentaryzacja-2026-08-01.json",
    "inwentaryzacja-2026-08-08.json",
    "inwentaryzacja-2026-08-15.json",
    "inwentaryzacja-2026-08-22.json",
  ];

  it("zostawia N najnowszych, zwraca resztę do skasowania", () => {
    expect(backupsToPrune(names, 2)).toEqual([
      "inwentaryzacja-2026-08-01.json",
      "inwentaryzacja-2026-08-08.json",
    ]);
  });

  it("nie kasuje nic, gdy kopii jest mniej niż limit", () => {
    expect(backupsToPrune(names, 8)).toEqual([]);
  });

  it("ignoruje pliki, które nie są naszą kopią", () => {
    expect(backupsToPrune([...names, "notatki.txt", "inwentaryzacja.json"], 8)).toEqual(
      [],
    );
  });
});

describe("writeReportToDir / readReportFromDir", () => {
  it("zapisuje raport pod stałą nazwą w folderze", async () => {
    const dir = makeDir();
    await writeReportToDir(asHandle(dir), report("klub-1"));

    expect([...dir.files.keys()]).toEqual([DATA_FILE]);
    expect(JSON.parse(dir.files.get(DATA_FILE)!).branchId).toBe("klub-1");
  });

  it("odczytuje zapisany raport", async () => {
    const dir = makeDir();
    await writeReportToDir(asHandle(dir), report("klub-1"));

    expect((await readReportFromDir(asHandle(dir)))?.branchId).toBe("klub-1");
  });

  it("zwraca null dla pustego folderu, zamiast rzucać", async () => {
    expect(await readReportFromDir(asHandle(makeDir()))).toBeNull();
  });

  it("uzupełnia pola starszego pliku (normalizacja)", async () => {
    const dir = makeDir();
    const legacy = report("klub-1") as Partial<ReportState>;
    delete legacy.expiryBatches;
    delete legacy.settings;
    delete legacy.minStock;
    await dir.getFileHandle(DATA_FILE, { create: true });
    dir.files.set(DATA_FILE, JSON.stringify(legacy));

    const loaded = await readReportFromDir(asHandle(dir));

    expect(loaded?.expiryBatches).toEqual([]);
    expect(loaded?.settings.expiryWarnDays).toBe(30);
  });
});

describe("writeBackup", () => {
  it("zapisuje kopię dnia w podfolderze backups", async () => {
    const dir = makeDir();
    await writeBackup(asHandle(dir), report("klub-1"), "2026-08-29");

    const backups = dir.subdirs.get(BACKUP_DIR)!;
    expect([...backups.files.keys()]).toEqual(["inwentaryzacja-2026-08-29.json"]);
  });

  it("nadpisuje kopię z tego samego dnia, nie mnoży plików", async () => {
    const dir = makeDir();
    await writeBackup(asHandle(dir), report("v1"), "2026-08-29");
    await writeBackup(asHandle(dir), report("v2"), "2026-08-29");

    const backups = dir.subdirs.get(BACKUP_DIR)!;
    expect(backups.files.size).toBe(1);
    expect(JSON.parse([...backups.files.values()][0]).branchId).toBe("v2");
  });

  it("przycina najstarsze kopie do limitu", async () => {
    const dir = makeDir();
    for (const day of ["01", "02", "03", "04"]) {
      await writeBackup(asHandle(dir), report(day), `2026-08-${day}`, 2);
    }

    expect(await listBackups(asHandle(dir))).toEqual([
      "inwentaryzacja-2026-08-03.json",
      "inwentaryzacja-2026-08-04.json",
    ]);
  });
});

describe("listBackups", () => {
  it("zwraca pustą listę, gdy folderu kopii jeszcze nie ma", async () => {
    expect(await listBackups(asHandle(makeDir()))).toEqual([]);
  });
});

describe("localDay", () => {
  it("formatuje datę w czasie lokalnym, nie UTC", () => {
    // 23:30 czasu lokalnego — w UTC byłby już następny dzień w części stref.
    expect(localDay(new Date(2026, 7, 29, 23, 30))).toBe("2026-08-29");
  });
});
