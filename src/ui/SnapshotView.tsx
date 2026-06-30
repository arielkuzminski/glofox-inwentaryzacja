import { useMemo, useState } from "react";
import { ReportState } from "../model/types";
import { snapshotMetas, snapshotStockMap } from "../model/ledger";
import { matchesQuery, variantRows } from "../state/store";

export function SnapshotView({ report }: { report: ReportState }) {
  const metas = snapshotMetas(report.ledger);
  const latest = metas[metas.length - 1];
  const stock = latest ? snapshotStockMap(report.ledger, latest.source) : null;
  const allRows = useMemo(() => variantRows(report), [report]);
  const [q, setQ] = useState("");
  const rows = useMemo(
    () => allRows.filter((r) => matchesQuery(r.productName, q)),
    [allRows, q],
  );

  return (
    <>
      <div className="panel">
        <h2>Zaimportowane snapshoty ({metas.length})</h2>
        {metas.length === 0 ? (
          <p className="empty">
            Brak danych. Odpal bookmarklet na app.glofox.com (patrz README),
            potem zaimportuj snapshot.json przyciskiem powyżej.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Czas zrzutu (capturedAt)</th>
                <th className="num">Warianty</th>
              </tr>
            </thead>
            <tbody>
              {metas.map((m, i) => (
                <tr key={m.source}>
                  <td>{i + 1}</td>
                  <td>
                    {new Date(m.at).toLocaleString("pl-PL")}
                    {m === latest && (
                      <span className="pill" style={{ marginLeft: 8 }}>
                        najnowszy
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {snapshotStockMap(report.ledger, m.source).size}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {latest && (
        <div className="panel">
          <h2>
            Stan magazynowy (najnowszy snapshot:{" "}
            {new Date(latest.at).toLocaleString("pl-PL")})
          </h2>
          <div className="field" style={{ maxWidth: 460, marginBottom: 12 }}>
            <label>Szukaj (nazwa / EAN)</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="np. oshee albo 5901783951389"
            />
          </div>
          <table>
            <thead>
              <tr>
                <th>Produkt</th>
                <th>Wariant</th>
                <th className="num">Cena</th>
                <th className="num">Stan Glofox</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.productId}::${r.presentationId}`}>
                  <td>{r.productName}</td>
                  <td>{r.presentationName}</td>
                  <td className="num">{r.unitPrice.toFixed(2)}</td>
                  <td className="num">
                    {stock?.get(`${r.productId}::${r.presentationId}`) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
