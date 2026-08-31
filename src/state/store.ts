import { useCallback, useEffect, useRef, useState } from "react";
import { emptyReport, ReportState } from "../model/types";
import { mergeReports } from "../model/merge";
import { loadDraftMigrating, saveDraft, clearDraft } from "../storage/draftStore";
import { ensurePermission, WriteQueue } from "../storage/fileSystem";
import {
  DataDirHandle,
  isDirPickerSupported,
  listBackups,
  localDay,
  pickDataDirectory,
  readReportFromDir,
  writeBackup,
  writeReportToDir,
} from "../storage/dataDir";
import { clearHandle, loadHandle, saveHandle } from "../storage/handleStore";

const WRITE_DEBOUNCE_MS = 600;

export type PersistStatus =
  | "unsupported" // przeglądarka bez File System Access — tryb import/eksport
  | "disconnected" // brak wybranego folderu — dane tylko w przeglądarce (IndexedDB)
  | "needs-permission" // folder znany z poprzedniej sesji, czeka na zgodę (gest)
  | "connected"; // auto-zapis do folderu działa

/**
 * Czy stan jest jeszcze nietknięty. Odczyt kopii z IndexedDB jest ASYNCHRONICZNY
 * (localStorage był synchroniczny), więc bez tej bramki wynik odczytu potrafił
 * wylądować już po tym, jak menadżer zaimportował snapshot — i skasować mu pracę.
 */
export function isPristine(r: ReportState): boolean {
  return (
    r.ledger.length === 0 &&
    r.catalog.length === 0 &&
    r.audits.length === 0 &&
    r.expiryBatches.length === 0
  );
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/**
 * Centralny stan modułu. Kanonem jest `inwentaryzacja.json` we WSKAZANYM FOLDERZE
 * (auto-zapis + dzienna kopia w `backups/`); IndexedDB trzyma kopię awaryjną na
 * wypadek braku podpiętego folderu albo przeglądarki bez File System Access.
 */
export function useReport() {
  const [report, setReport] = useState<ReportState>(() => emptyReport());
  const [status, setStatus] = useState<PersistStatus>(() =>
    isDirPickerSupported() ? "disconnected" : "unsupported",
  );
  const [dirName, setDirName] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  /** Dopóki false, auto-zapis milczy — inaczej pusty stan startowy zamazałby kopię. */
  const [restored, setRestored] = useState(false);

  const dirRef = useRef<DataDirHandle | null>(null);
  const queueRef = useRef<WriteQueue | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Dni, na które kopia już istnieje — czytane z listingu folderu, więc samo się naprawia. */
  const backupDaysRef = useRef<Set<string>>(new Set());

  // Podpina folder jako aktywny cel auto-zapisu.
  const attach = useCallback(async (handle: DataDirHandle) => {
    dirRef.current = handle;
    queueRef.current = new WriteQueue((r) => writeReportToDir(handle, r));
    const days = (await listBackups(handle)).map((n) => n.slice(-15, -5));
    backupDaysRef.current = new Set(days);
    setLastBackup(days[days.length - 1] ?? null);
    setDirName(handle.name);
    setStatus("connected");
  }, []);

  // Start: kopia awaryjna z IndexedDB (z jednorazową migracją ze starego localStorage),
  // a potem — jeśli się da — folder z poprzedniej sesji jako kanon.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const draft = await loadDraftMigrating();
        if (!cancelled && draft) setReport((cur) => (isPristine(cur) ? draft : cur));
        if (!isDirPickerSupported()) return;

        const handle = await loadHandle();
        if (cancelled || !handle) return;
        if (await ensurePermission(handle, false)) {
          try {
            const loaded = await readReportFromDir(handle);
            if (cancelled) return;
            // Gdy użytkownik zdążył już coś zrobić, folder nie kasuje jego pracy —
            // scalamy (ledger jest append-only, więc suma jest bezstratna).
            if (loaded)
              setReport((cur) =>
                isPristine(cur) ? loaded : mergeReports(cur, loaded).report,
              );
            await attach(handle);
          } catch {
            // folder zniknął/uszkodzony — zostaw stan z pamięci, traktuj jak rozłączony
          }
        } else {
          dirRef.current = handle; // zachowaj do „Wznów zapis"
          setDirName(handle.name);
          setStatus("needs-permission");
        }
      } finally {
        if (!cancelled) setRestored(true); // od teraz auto-zapis wolno pisać
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attach]);

  // Auto-zapis: kopia awaryjna zawsze, plik w folderze z debounce gdy podpięty.
  useEffect(() => {
    if (!restored) return;
    void saveDraft(report);
    if (status !== "connected" || !queueRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      queueRef.current?.enqueue(report);
      void makeDailyBackup(report);
    }, WRITE_DEBOUNCE_MS);
    // makeDailyBackup jest stabilne (ref), więc nie trafia do zależności
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, status, restored]);

  /** Pierwszy zapis w danym dniu odkłada kopię do backups/ i przycina najstarsze. */
  const makeDailyBackup = useCallback(async (r: ReportState) => {
    const dir = dirRef.current;
    if (!dir) return;
    const day = localDay();
    if (backupDaysRef.current.has(day)) return;
    backupDaysRef.current.add(day); // najpierw znacznik — zapis nie może się zapętlić
    try {
      await writeBackup(dir, r, day);
      setLastBackup(day);
    } catch {
      backupDaysRef.current.delete(day); // nie udało się — spróbuj przy kolejnym zapisie
    }
  }, []);

  const update = useCallback(
    (fn: (r: ReportState) => ReportState) => setReport((r) => fn(r)),
    [],
  );
  const replace = useCallback((r: ReportState) => setReport(r), []);

  /**
   * Bierze folder na stan roboczy. Treść folderu NIE MOŻE skasować tego, co
   * menadżer zdążył zrobić w pamięci (np. zaimportował snapshot przed kliknięciem
   * „Wznów zapis") — dlatego pusty stan przyjmuje folder, a niepusty się z nim scala.
   * Scalony wynik od razu utrwalamy, żeby folder nie został z niepełną historią.
   */
  const adoptFolder = useCallback(
    async (handle: DataDirHandle, loaded: ReportState | null) => {
      const next =
        loaded === null
          ? report
          : isPristine(report)
            ? loaded
            : mergeReports(report, loaded).report;
      setReport(next);
      await writeReportToDir(handle, next);
      await saveHandle(handle);
      await attach(handle);
    },
    [report, attach],
  );

  /** Wskazanie folderu danych (nowego albo istniejącego). */
  const connectDirectory = useCallback(async () => {
    try {
      const handle = await pickDataDirectory();
      if (!(await ensurePermission(handle, true))) return;
      await adoptFolder(handle, await readReportFromDir(handle));
    } catch (e) {
      if (!isAbort(e)) throw e;
    }
  }, [adoptFolder]);

  /** Wznawia zapis do folderu z poprzedniej sesji (wymaga gestu użytkownika). */
  const reconnect = useCallback(async () => {
    const handle = dirRef.current;
    if (!handle) return;
    if (!(await ensurePermission(handle, true))) return;
    await adoptFolder(handle, await readReportFromDir(handle));
  }, [adoptFolder]);

  /** Odłącza folder (dane zostają w pamięci i w kopii awaryjnej). */
  const disconnect = useCallback(async () => {
    await clearHandle();
    dirRef.current = null;
    queueRef.current = null;
    setDirName(null);
    setLastBackup(null);
    setStatus("disconnected");
  }, []);

  /** Kopia na żądanie — nadpisuje kopię dzisiejszą. */
  const backupNow = useCallback(async () => {
    const dir = dirRef.current;
    if (!dir) return;
    const day = localDay();
    await writeBackup(dir, report, day);
    backupDaysRef.current.add(day);
    setLastBackup(day);
  }, [report]);

  /** Czyści stan i kopię awaryjną (folder zostaje — plik nadpisze się przy zapisie). */
  const reset = useCallback(async () => {
    await clearDraft();
    setReport(emptyReport());
  }, []);

  return {
    report,
    update,
    replace,
    reset,
    persist: {
      status,
      dirName,
      lastBackup,
      connectDirectory,
      reconnect,
      disconnect,
      backupNow,
    },
  };
}

export interface VariantRow {
  productId: string;
  presentationId: string;
  productName: string;
  presentationName: string;
  unitPrice: number;
}

/** Płaska lista wariantów z katalogu — do tabel i selektorów. */
export function variantRows(report: ReportState): VariantRow[] {
  const rows: VariantRow[] = [];
  for (const p of report.catalog) {
    for (const pres of p.presentations) {
      rows.push({
        productId: p.productId,
        presentationId: pres.presentationId,
        productName: p.name,
        presentationName: pres.name || "(domyślny)",
        unitPrice: pres.price,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.productName.localeCompare(b.productName) ||
      a.presentationName.localeCompare(b.presentationName),
  );
}

/** Dopasowanie po nazwie/EAN (EAN jest wbity w nazwę). Wszystkie słowa muszą trafić. */
export function matchesQuery(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = text.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
