import { useCallback, useEffect, useRef, useState } from "react";
import { ReportState } from "../model/types";
import { freshReport, saveDraft } from "../storage/local";
import {
  DataFileHandle,
  WriteQueue,
  ensurePermission,
  isFsAccessSupported,
  pickExistingFile,
  pickNewFile,
  readReport,
  writeReport,
} from "../storage/fileSystem";
import { clearHandle, loadHandle, saveHandle } from "../storage/handleStore";

const WRITE_DEBOUNCE_MS = 600;

export type PersistStatus =
  | "unsupported" // przeglądarka bez File System Access — tryb import/eksport
  | "disconnected" // brak wybranego pliku — dane tylko w przeglądarce
  | "needs-permission" // plik znany z poprzedniej sesji, czeka na zgodę (gest)
  | "connected"; // auto-zapis do pliku działa

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/**
 * Centralny stan modułu. Kanonem jest plik na dysku (auto-zapis przez File System
 * Access); localStorage zostaje jako pas bezpieczeństwa i fallback dla przeglądarek
 * bez tego API.
 */
export function useReport() {
  const [report, setReport] = useState<ReportState>(() => freshReport());
  const [status, setStatus] = useState<PersistStatus>(() =>
    isFsAccessSupported() ? "disconnected" : "unsupported",
  );
  const [fileName, setFileName] = useState<string | null>(null);

  const handleRef = useRef<DataFileHandle | null>(null);
  const queueRef = useRef<WriteQueue | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Podpina uchwyt pliku jako aktywny cel auto-zapisu.
  const attach = useCallback((handle: DataFileHandle) => {
    handleRef.current = handle;
    queueRef.current = new WriteQueue((r) => writeReport(handle, r));
    setFileName(handle.name);
    setStatus("connected");
  }, []);

  // Próba wznowienia pliku z poprzedniej sesji (bez pytania o zgodę — brak gestu).
  useEffect(() => {
    if (!isFsAccessSupported()) return;
    let cancelled = false;
    void (async () => {
      const handle = await loadHandle();
      if (cancelled || !handle) return;
      if (await ensurePermission(handle, false)) {
        try {
          const loaded = await readReport(handle);
          if (cancelled) return;
          setReport(loaded);
          attach(handle);
        } catch {
          // plik zniknął/uszkodzony — zostaw stan z pamięci, traktuj jak rozłączony
        }
      } else {
        handleRef.current = handle; // zachowaj do „Wznów zapis"
        setFileName(handle.name);
        setStatus("needs-permission");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attach]);

  // Auto-zapis: localStorage zawsze (fallback), plik z debounce gdy połączony.
  useEffect(() => {
    saveDraft(report);
    if (status !== "connected" || !queueRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      queueRef.current?.enqueue(report);
    }, WRITE_DEBOUNCE_MS);
  }, [report, status]);

  const update = useCallback(
    (fn: (r: ReportState) => ReportState) => setReport((r) => fn(r)),
    [],
  );
  const replace = useCallback((r: ReportState) => setReport(r), []);

  /** Tworzy nowy plik i od razu zrzuca do niego bieżący stan z pamięci. */
  const connectNew = useCallback(async () => {
    try {
      const handle = await pickNewFile();
      if (!(await ensurePermission(handle, true))) return;
      await writeReport(handle, report);
      await saveHandle(handle);
      attach(handle);
    } catch (e) {
      if (!isAbort(e)) throw e;
    }
  }, [report, attach]);

  /** Otwiera istniejący plik — jego treść staje się kanonem (nadpisuje pamięć). */
  const connectExisting = useCallback(async () => {
    try {
      const handle = await pickExistingFile();
      if (!(await ensurePermission(handle, true))) return;
      const loaded = await readReport(handle);
      await saveHandle(handle);
      setReport(loaded);
      attach(handle);
    } catch (e) {
      if (!isAbort(e)) throw e;
    }
  }, [attach]);

  /** Wznawia zapis do pliku z poprzedniej sesji (wymaga gestu użytkownika). */
  const reconnect = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;
    if (!(await ensurePermission(handle, true))) return;
    const loaded = await readReport(handle);
    setReport(loaded);
    attach(handle);
  }, [attach]);

  /** Odłącza plik (dane zostają w pamięci i localStorage). */
  const disconnect = useCallback(async () => {
    await clearHandle();
    handleRef.current = null;
    queueRef.current = null;
    setFileName(null);
    setStatus("disconnected");
  }, []);

  return {
    report,
    update,
    replace,
    persist: {
      status,
      fileName,
      connectNew,
      connectExisting,
      reconnect,
      disconnect,
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
