import { ReportState } from "../model/types";
import { summarizeAudit } from "../model/reconcile";

export function ReportView({ report }: { report: ReportState }) {
  const audits = [...report.audits].sort((a, b) =>
    (b.closedAt ?? b.openedAt).localeCompare(a.closedAt ?? a.openedAt),
  );

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
                <th>Zamknięty</th>
                <th>Snapshot</th>
                <th className="num">Policzone</th>
                <th className="num">Oznaczone</th>
                <th className="num">Manko (szt)</th>
                <th className="num">Wartość (zł)</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => {
                const s = summarizeAudit(a);
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
