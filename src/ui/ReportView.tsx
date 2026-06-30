import { useMemo } from "react";
import { ReportState } from "../model/types";
import { summarizeAudit } from "../model/reconcile";
import { exportAuditCsv } from "../storage/file";
import { useSort } from "./useSort";

export function ReportView({ report }: { report: ReportState }) {
  const audits = useMemo(
    () =>
      [...report.audits].sort((a, b) =>
        (b.closedAt ?? b.openedAt).localeCompare(a.closedAt ?? a.openedAt),
      ),
    [report.audits],
  );
  const summaries = useMemo(
    () => audits.map((a) => ({ audit: a, summary: summarizeAudit(a) })),
    [audits],
  );
  const auditsSort = useSort(summaries, {
    closedAt: (x) => x.audit.closedAt ?? "",
    snapshot: (x) => x.audit.snapshotSource,
    counted: (x) => x.summary.countedVariants,
    flagged: (x) => x.summary.flaggedVariants,
    mankoUnits: (x) => x.summary.totalMankoUnits,
    mankoValue: (x) => x.summary.totalMankoValue,
  });

  return (
    <>
      <div className="panel">
        <h2>Podsumowanie raportu</h2>
        <span className="stat">
          <span className="v">{report.catalog.length}</span>
          <div className="l">produktów w katalogu</div>
        </span>
        <span className="stat">
          <span className="v">{report.ledger.length}</span>
          <div className="l">zdarzeń w ledgerze</div>
        </span>
        <span className="stat">
          <span className="v">{report.audits.length}</span>
          <div className="l">zapisanych audytów</div>
        </span>
      </div>

      <div className="panel">
        <h2>Zapisane audyty</h2>
        {audits.length === 0 ? (
          <p className="empty">
            Brak audytów. Przejdź do zakładki „Audyt (spis)”, wpisz spis z natury
            i zapisz audyt.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th
                  className="sortable"
                  onClick={() => auditsSort.toggle("closedAt")}
                >
                  Zamknięty{auditsSort.arrow("closedAt")}
                </th>
                <th
                  className="sortable"
                  onClick={() => auditsSort.toggle("snapshot")}
                >
                  Snapshot{auditsSort.arrow("snapshot")}
                </th>
                <th
                  className="num sortable"
                  onClick={() => auditsSort.toggle("counted")}
                >
                  Policzone{auditsSort.arrow("counted")}
                </th>
                <th
                  className="num sortable"
                  onClick={() => auditsSort.toggle("flagged")}
                >
                  Oznaczone{auditsSort.arrow("flagged")}
                </th>
                <th
                  className="num sortable"
                  onClick={() => auditsSort.toggle("mankoUnits")}
                >
                  Manko (szt){auditsSort.arrow("mankoUnits")}
                </th>
                <th
                  className="num sortable"
                  onClick={() => auditsSort.toggle("mankoValue")}
                >
                  Wartość (zł){auditsSort.arrow("mankoValue")}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {auditsSort.sorted.map(({ audit: a, summary: s }) => {
                return (
                  <tr key={a.id}>
                    <td>
                      {a.closedAt
                        ? new Date(a.closedAt).toLocaleString("pl-PL")
                        : "—"}
                    </td>
                    <td className="muted">
                      {new Date(a.snapshotSource).toLocaleString("pl-PL")}
                    </td>
                    <td className="num">{s.countedVariants}</td>
                    <td className={`num ${s.flaggedVariants ? "flag" : ""}`}>
                      {s.flaggedVariants}
                    </td>
                    <td className={`num ${s.totalMankoUnits ? "flag" : ""}`}>
                      {s.totalMankoUnits}
                    </td>
                    <td className={`num ${s.totalMankoValue ? "flag" : ""}`}>
                      {s.totalMankoValue.toFixed(2)}
                    </td>
                    <td className="num">
                      <button
                        className="ghost"
                        style={{ padding: "2px 8px" }}
                        onClick={() => exportAuditCsv(a)}
                      >
                        CSV
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
