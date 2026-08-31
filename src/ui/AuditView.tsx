import { useMemo, useRef, useState } from "react";
import { ReportState, variantKey } from "../model/types";
import {
  snapshotMetas,
  physicalCountMap,
  recordPhysicalCount,
  countNoteMap,
  recordCountNote,
} from "../model/ledger";
import { computeAudit, summarizeAudit } from "../model/reconcile";
import { matchesQuery } from "../state/store";
import { exportAuditCsv } from "../storage/file";
import {
  franchiseRowsFor,
  exportFranchiseCsv,
  exportFranchiseXlsx,
} from "../storage/franchise";
import { useSort } from "./useSort";
import { AuditTable } from "./AuditTable";

export function AuditView({
  report,
  update,
}: {
  report: ReportState;
  update: (fn: (r: ReportState) => ReportState) => void;
}) {
  const metas = useMemo(() => snapshotMetas(report.ledger), [report.ledger]);
  const latest = metas[metas.length - 1];
  const [source, setSource] = useState(latest?.source ?? "");
  const [tolerance, setTolerance] = useState(
    String(report.settings.toleranceUnits),
  );
  const [saved, setSaved] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onlyCounted, setOnlyCounted] = useState(false);
  const [plusOne, setPlusOne] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [exportAll, setExportAll] = useState(false);

  // Bufor aktualnie edytowanego pola — commit (Enter/blur) zapisuje do ledgera.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const scanRef = useRef<HTMLInputElement>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  // Źródło prawdy spisu = ledger (auto-zapis do folderu danych, przeżywa F5).
  const ledgerCounts = useMemo(
    () => (source ? physicalCountMap(report.ledger, source) : new Map<string, number>()),
    [report.ledger, source],
  );
  // Do liczenia na żywo nakładamy niezatwierdzony bufor na wartości z ledgera.
  const effectiveCounts = useMemo(() => {
    const m = new Map(ledgerCounts);
    for (const [k, v] of Object.entries(draft)) {
      if (v.trim() !== "" && !Number.isNaN(Number(v))) m.set(k, Number(v));
    }
    return m;
  }, [ledgerCounts, draft]);

  const ledgerNotes = useMemo(
    () => (source ? countNoteMap(report.ledger, source) : new Map<string, string>()),
    [report.ledger, source],
  );
  const effectiveNotes = useMemo(() => {
    const m = new Map(ledgerNotes);
    for (const [k, v] of Object.entries(noteDraft)) m.set(k, v);
    return m;
  }, [ledgerNotes, noteDraft]);

  const audit = useMemo(() => {
    if (!source) return null;
    return computeAudit(
      report,
      source,
      effectiveCounts,
      Number(tolerance) || 0,
      effectiveNotes,
    );
  }, [report, source, effectiveCounts, tolerance, effectiveNotes]);

  const stats = audit ? summarizeAudit(audit) : null;
  const totalVariants = audit ? audit.lines.length : 0;

  // Ostrzeżenie: czy okno sprzedaży snapshotu pokrywa przerwę od poprzedniego snapshotu?
  const windowWarn = useMemo(() => {
    if (!source) return null;
    const from = report.snapshotWindows?.[source]?.from;
    if (!from) return null;
    const current = metas.find((m) => m.source === source);
    const prev = metas
      .filter((m) => current && m.at < current.at)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    if (!prev) return null;
    if (from > prev.at.slice(0, 10)) {
      return `Uwaga: okno sprzedaży zaczyna się ${from}, a poprzedni snapshot jest z ${prev.at.slice(
        0,
        10,
      )}. Rozbieżność księgowa może być policzona na za krótkim oknie — pobierz snapshot z większym zakresem dni.`;
    }
    return null;
  }, [report.snapshotWindows, source, metas]);

  const visibleLines = useMemo(() => {
    if (!audit) return [];
    return audit.lines.filter((l) => {
      if (onlyFlagged && !l.flagged) return false;
      if (onlyCounted && l.physicalCount === null) return false;
      return matchesQuery(l.productName, q);
    });
  }, [audit, q, onlyFlagged, onlyCounted]);

  const linesSort = useSort(visibleLines, {
    productName: (l) => l.productName,
    systemStock: (l) => l.systemStock,
    soldInWindow: (l) => l.soldInWindow,
    physicalCount: (l) => l.physicalCount,
    manko: (l) => l.manko,
    mankoValue: (l) => l.mankoValue,
    bookDiscrepancy: (l) => l.bookDiscrepancy,
  });

  function displayValue(key: string): string {
    if (draft[key] !== undefined) return draft[key];
    return ledgerCounts.has(key) ? String(ledgerCounts.get(key)) : "";
  }

  function commit(key: string, productId: string, presentationId: string) {
    const raw = draft[key];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    setDraft((d) => {
      const c = { ...d };
      delete c[key];
      return c;
    });
    if (trimmed === "" || Number.isNaN(Number(trimmed))) return;
    update((r) =>
      recordPhysicalCount(r, {
        productId,
        presentationId,
        count: Number(trimmed),
        snapshotSource: source,
      }),
    );
  }

  function displayNote(key: string): string {
    return noteDraft[key] ?? ledgerNotes.get(key) ?? "";
  }

  function commitNote(key: string, productId: string, presentationId: string) {
    const raw = noteDraft[key];
    if (raw === undefined) return;
    setNoteDraft((d) => {
      const c = { ...d };
      delete c[key];
      return c;
    });
    if (raw === (ledgerNotes.get(key) ?? "")) return; // bez zmiany — nie śmiecimy ledgera
    update((r) =>
      recordCountNote(r, {
        productId,
        presentationId,
        note: raw,
        snapshotSource: source,
      }),
    );
  }

  function increment(productId: string, presentationId: string) {
    const key = variantKey(productId, presentationId);
    const current = effectiveCounts.get(key) ?? 0;
    update((r) =>
      recordPhysicalCount(r, {
        productId,
        presentationId,
        count: current + 1,
        snapshotSource: source,
      }),
    );
    return current + 1;
  }

  // Skan/szukaj: czytnik EAN = klawiatura (cyfry + Enter). EAN jest wbity w nazwę.
  function onScanEnter() {
    if (!audit) return;
    const term = q.trim();
    if (!term) return;
    const matches = audit.lines.filter((l) => matchesQuery(l.productName, term));
    if (matches.length === 0) {
      setScanMsg(`Brak dopasowania: „${term}".`);
      return;
    }
    if (matches.length === 1) {
      const l = matches[0];
      if (plusOne) {
        const next = increment(l.productId, l.presentationId);
        setScanMsg(`+1 → ${l.productName}: ${next} szt.`);
        setQ("");
        scanRef.current?.focus();
        return;
      }
      setScanMsg(`${l.productName} — wpisz policzoną ilość, Enter zatwierdza.`);
      const key = variantKey(l.productId, l.presentationId);
      requestAnimationFrame(() => {
        const el = inputRefs.current.get(key);
        el?.focus();
        el?.select();
      });
      return;
    }
    setScanMsg(`${matches.length} wariantów pasuje — wybierz wiersz.`);
    const key = variantKey(matches[0].productId, matches[0].presentationId);
    requestAnimationFrame(() => inputRefs.current.get(key)?.focus());
  }

  function onRowKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    key: string,
    productId: string,
    presentationId: string,
    rowIndex: number,
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    commit(key, productId, presentationId);
    // Po zatwierdzeniu wracamy do skanu (kolejny skan trafia we właściwe pole).
    setQ("");
    const next = linesSort.sorted[rowIndex + 1];
    if (next && q.trim() === "") {
      const nk = variantKey(next.productId, next.presentationId);
      requestAnimationFrame(() => inputRefs.current.get(nk)?.focus());
    } else {
      requestAnimationFrame(() => scanRef.current?.focus());
    }
  }

  /** Eksport w układzie sieci — zamyka audyt „na teraz", żeby nagłówek miał datę spisu. */
  function exportForNetwork(format: "xlsx" | "csv") {
    if (!audit) return;
    const stamped = { ...audit, closedAt: audit.closedAt ?? new Date().toISOString() };
    const rows = franchiseRowsFor(report, stamped, exportAll);
    if (format === "xlsx") exportFranchiseXlsx(stamped, rows, report.settings);
    else exportFranchiseCsv(stamped, rows, report.settings);
  }

  function saveAudit() {
    if (!audit) return;
    const closed = { ...audit, closedAt: new Date().toISOString() };
    update((r) => ({ ...r, audits: [...r.audits, closed] }));
    setSaved(`Zapisano audyt (${closed.id}).`);
  }

  if (!latest) {
    return (
      <div className="panel">
        <p className="empty">
          Najpierw zaimportuj snapshot — audyt liczy manko względem stanu Glofox.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <h2>Parametry audytu</h2>
        <div className="row">
          <div className="field" style={{ minWidth: 280 }}>
            <label>Snapshot (stan systemowy)</label>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {metas.map((m) => (
                <option key={m.source} value={m.source}>
                  {new Date(m.at).toLocaleString("pl-PL")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="audit-tolerance">Próg tolerancji (szt)</label>
            <input
              id="audit-tolerance"
              type="number"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
            />
          </div>
          <button onClick={saveAudit} disabled={!audit}>
            Zapisz audyt do raportu
          </button>
          <button className="ghost" onClick={() => audit && exportAuditCsv(audit)} disabled={!audit}>
            Eksportuj CSV (nasz)
          </button>
        </div>
        <div className="row" style={{ marginTop: 8, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Dla sieci (wzór „INWENTARYZACJA”):
          </span>
          <button
            onClick={() => exportForNetwork("xlsx")}
            disabled={!audit}
            title="Plik .xlsx w układzie kolumn wzoru sieci"
          >
            Wzór sieci (XLSX)
          </button>
          <button
            className="ghost"
            onClick={() => exportForNetwork("csv")}
            disabled={!audit}
            title="Do wklejenia w arkusz online"
          >
            Wzór sieci (CSV)
          </button>
          <label
            className="field"
            style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={exportAll}
              onChange={(e) => setExportAll(e.target.checked)}
            />
            także pozycje bez stanu
          </label>
        </div>
        {windowWarn && <p className="warn" style={{ marginBottom: 0 }}>{windowWarn}</p>}
        {stats && (
          <div style={{ marginTop: 16 }}>
            <span className="stat">
              <span className="v">
                {stats.countedVariants}
                <span className="muted" style={{ fontSize: 14 }}>
                  {" "}
                  / {totalVariants}
                </span>
              </span>
              <div className="l">policzonych wariantów</div>
            </span>
            <span className="stat">
              <span className={`v ${stats.flaggedVariants ? "danger" : ""}`}>
                {stats.flaggedVariants}
              </span>
              <div className="l">oznaczonych (manko &gt; próg)</div>
            </span>
            <span className="stat">
              <span className={`v ${stats.totalMankoUnits ? "danger" : ""}`}>
                {stats.totalMankoUnits}
              </span>
              <div className="l">łączne manko (szt)</div>
            </span>
            <span className="stat">
              <span className={`v ${stats.totalMankoValue ? "danger" : ""}`}>
                {stats.totalMankoValue.toFixed(2)}
              </span>
              <div className="l">wartość manka (zł)</div>
            </span>
          </div>
        )}
        {saved && <p className="ok">{saved}</p>}
      </div>

      <div className="panel">
        <h2>Spis z natury — skanuj lub wpisz policzone ilości</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="field" style={{ minWidth: 360 }}>
            <label>Skanuj / szukaj (EAN lub nazwa)</label>
            <input
              ref={scanRef}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onScanEnter();
                }
              }}
              placeholder="zeskanuj kod albo wpisz: woda 0.75"
            />
          </div>
          <label className="field" style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={plusOne}
              onChange={(e) => setPlusOne(e.target.checked)}
            />
            tryb +1 (skan dolicza sztukę)
          </label>
          <label className="field" style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={onlyCounted}
              onChange={(e) => setOnlyCounted(e.target.checked)}
            />
            tylko policzone
          </label>
          <label className="field" style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={onlyFlagged}
              onChange={(e) => setOnlyFlagged(e.target.checked)}
            />
            tylko oznaczone
          </label>
          <span className="pill">{visibleLines.length} pozycji</span>
        </div>
        {scanMsg && (
          <p className="muted" style={{ marginTop: 0 }}>
            {scanMsg}
          </p>
        )}
        <AuditTable
          sort={linesSort}
          inputRefs={inputRefs}
          countValue={displayValue}
          onCountChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
          onCountCommit={commit}
          onCountKeyDown={onRowKeyDown}
          noteValue={displayNote}
          onNoteChange={(key, value) =>
            setNoteDraft((d) => ({ ...d, [key]: value }))
          }
          onNoteCommit={commitNote}
        />
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Skan EAN ustawia fokus na polu spisu (tryb +1 = dolicza sztukę). Enter zatwierdza
          i przechodzi dalej. Spis zapisuje się na bieżąco — F5 nic nie kasuje.
          Manko dodatnie = brakuje na półce. Rozbieżność księgowa ≠ 0 = stan w Glofox ruszył
          inaczej niż wynika z dostaw i sprzedaży.
        </p>
      </div>
    </>
  );
}
