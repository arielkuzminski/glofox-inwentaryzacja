import { useMemo, useState } from "react";
import { ReportState } from "../model/types";
import { snapshotMetas } from "../model/ledger";
import { computeAudit, summarizeAudit } from "../model/reconcile";
import { matchesQuery } from "../state/store";

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
  const [tolerance, setTolerance] = useState("0");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onlyCounted, setOnlyCounted] = useState(false);

  const physicalCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(counts)) {
      if (v.trim() !== "" && !Number.isNaN(Number(v))) m.set(k, Number(v));
    }
    return m;
  }, [counts]);

  const audit = useMemo(() => {
    if (!source) return null;
    return computeAudit(report, source, physicalCounts, Number(tolerance) || 0);
  }, [report, source, physicalCounts, tolerance]);

  const stats = audit ? summarizeAudit(audit) : null;

  const visibleLines = useMemo(() => {
    if (!audit) return [];
    return audit.lines.filter((l) => {
      if (onlyFlagged && !l.flagged) return false;
      if (onlyCounted && l.physicalCount === null) return false;
      return matchesQuery(l.productName, q);
    });
  }, [audit, q, onlyFlagged, onlyCounted]);

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
            <label>Próg tolerancji (szt)</label>
            <input
              type="number"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
            />
          </div>
          <button onClick={saveAudit} disabled={!audit}>
            Zapisz audyt do raportu
          </button>
        </div>
        {stats && (
          <div style={{ marginTop: 16 }}>
            <span className="stat">
              <span className="v">{stats.countedVariants}</span>
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
        <h2>Spis z natury — wpisz policzone ilości</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="field" style={{ minWidth: 320 }}>
            <label>Szukaj (nazwa / EAN)</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="np. woda 0.75 albo 5000112679540"
            />
          </div>
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
        <table>
          <thead>
            <tr>
              <th>Produkt</th>
              <th className="num">Stan Glofox</th>
              <th className="num">Sprzedano (okno)</th>
              <th className="num">Spis fizyczny</th>
              <th className="num">Manko</th>
              <th className="num">Wartość (zł)</th>
              <th className="num">Rozb. księgowa</th>
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((l) => {
              const key = `${l.productId}::${l.presentationId}`;
              return (
                <tr key={key}>
                  <td>{l.productName}</td>
                  <td className="num">{l.systemStock}</td>
                  <td className="num muted">
                    {l.soldInWindow === null ? "—" : l.soldInWindow}
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      value={counts[key] ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        setCounts((c) => ({ ...c, [key]: e.target.value }))
                      }
                    />
                  </td>
                  <td className={`num ${l.flagged ? "flag" : ""}`}>
                    {l.manko === null ? "—" : l.manko}
                  </td>
                  <td className={`num ${l.flagged ? "flag" : ""}`}>
                    {l.mankoValue === null ? "—" : l.mankoValue.toFixed(2)}
                  </td>
                  <td className={`num ${l.bookDiscrepancy ? "flag" : "muted"}`}>
                    {l.bookDiscrepancy === null ? "—" : l.bookDiscrepancy}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Manko dodatnie = brakuje na półce (możliwa kradzież / rozdawanie).
          „Sprzedano (okno)” = sztuki sprzedane od poprzedniego snapshotu. Rozbieżność
          księgowa ≠ 0 = stan w Glofox ruszył inaczej niż wynika z dostaw i sprzedaży.
        </p>
      </div>
    </>
  );
}
