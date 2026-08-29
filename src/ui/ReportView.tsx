import { useMemo } from "react";
import { ReportState } from "../model/types";
import { summarizeAudit } from "../model/reconcile";
import { compareAudits } from "../model/compare";
import { exportAuditCsv } from "../storage/file";
import {
  franchiseRowsFor,
  exportFranchiseCsv,
  exportFranchiseXlsx,
} from "../storage/franchise";
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

  // Dwa ostatnie spisy: powtórka manka na tym samym produkcie to wzorzec,
  // a nie pomyłka w liczeniu — dlatego to najmocniejszy sygnał w całym module.
  const recurring = useMemo(() => {
    if (audits.length < 2) return [];
    const [curr, prev] = audits; // audits są posortowane malejąco po dacie
    return compareAudits(prev, curr, curr.toleranceUnits).filter((l) => l.recurring);
  }, [audits]);

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
        {summaries.length > 0 && (
          <span className="stat">
            <span
              className={`v ${summaries[0].summary.totalMankoValue ? "danger" : ""}`}
            >
              {summaries[0].summary.totalMankoValue.toFixed(2)}
            </span>
            <div className="l">
              manko ostatniego spisu (zł)
              {summaries.length > 1 && (
                <>
                  {" "}
                  — poprzednio {summaries[1].summary.totalMankoValue.toFixed(2)} zł
                </>
              )}
            </div>
          </span>
        )}
      </div>

      {audits.length >= 2 && (
        <div className="panel">
          <h2>Powtarzające się manka (dwa ostatnie spisy)</h2>
          {recurring.length === 0 ? (
            <p className="empty">
              Żadna pozycja nie powtórzyła manka — pojedyncze odchylenia to zwykle
              pomyłki w liczeniu.
            </p>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Produkt</th>
                    <th className="num">Manko poprzednio</th>
                    <th className="num">Manko teraz</th>
                  </tr>
                </thead>
                <tbody>
                  {recurring.map((l) => (
                    <tr key={`${l.productId}::${l.presentationId}`}>
                      <td>{l.productName}</td>
                      <td className="num flag">{l.mankoPrev}</td>
                      <td className="num flag">{l.mankoCurr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                Ten sam produkt znika dwa spisy z rzędu w tym samym kierunku. Pomyłka
                w liczeniu się nie powtarza — to sygnał do sprawdzenia, kto stał na
                kasie (zakładka Sprzedaż) i czy towar nie jest rozdawany.
              </p>
            </>
          )}
        </div>
      )}

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
                        title="Nasz CSV z manko i rozbieżnością księgową"
                      >
                        CSV
                      </button>{" "}
                      <button
                        style={{ padding: "2px 8px" }}
                        onClick={() =>
                          exportFranchiseXlsx(
                            a,
                            franchiseRowsFor(report, a),
                            report.settings,
                          )
                        }
                        title="Plik dla sieci w układzie wzoru"
                      >
                        Wzór XLSX
                      </button>{" "}
                      <button
                        className="ghost"
                        style={{ padding: "2px 8px" }}
                        onClick={() =>
                          exportFranchiseCsv(
                            a,
                            franchiseRowsFor(report, a),
                            report.settings,
                          )
                        }
                      >
                        Wzór CSV
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
