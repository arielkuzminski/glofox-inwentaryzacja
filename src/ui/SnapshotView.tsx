import { useMemo, useState } from "react";
import { ReportState } from "../model/types";
import { snapshotMetas, snapshotStockMap } from "../model/ledger";
import { matchesQuery, variantRows } from "../state/store";
import { useSort } from "./useSort";

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

  const metasSort = useSort(metas, {
    at: (m) => m.at,
    variants: (m) => snapshotStockMap(report.ledger, m.source).size,
  });
  const rowsSort = useSort(rows, {
    productName: (r) => r.productName,
    presentationName: (r) => r.presentationName,
    unitPrice: (r) => r.unitPrice,
    stock: (r) => stock?.get(`${r.productId}::${r.presentationId}`) ?? -1,
  });

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
                <th
                  className="sortable"
                  onClick={() => metasSort.toggle("at")}
                >
                  Czas zrzutu (capturedAt){metasSort.arrow("at")}
                </th>
                <th
                  className="num sortable"
                  onClick={() => metasSort.toggle("variants")}
                >
                  Warianty{metasSort.arrow("variants")}
                </th>
              </tr>
            </thead>
            <tbody>
              {metasSort.sorted.map((m, i) => (
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
                <th
                  className="sortable"
                  onClick={() => rowsSort.toggle("productName")}
                >
                  Produkt{rowsSort.arrow("productName")}
                </th>
                <th
                  className="sortable"
                  onClick={() => rowsSort.toggle("presentationName")}
                >
                  Wariant{rowsSort.arrow("presentationName")}
                </th>
                <th
                  className="num sortable"
                  onClick={() => rowsSort.toggle("unitPrice")}
                >
                  Cena{rowsSort.arrow("unitPrice")}
                </th>
                <th
                  className="num sortable"
                  onClick={() => rowsSort.toggle("stock")}
                >
                  Stan Glofox{rowsSort.arrow("stock")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsSort.sorted.map((r) => (
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
