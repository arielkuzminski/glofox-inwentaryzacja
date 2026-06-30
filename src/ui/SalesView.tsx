import { useMemo, useState } from "react";
import { ReportState, variantKey } from "../model/types";
import { buildVariantIndex } from "../model/reconcile";
import { matchesQuery } from "../state/store";
import { useSort } from "./useSort";

export function SalesView({ report }: { report: ReportState }) {
  const [q, setQ] = useState("");

  const sales = useMemo(
    () => report.ledger.filter((e) => e.type === "SALES_IMPORT"),
    [report.ledger],
  );
  const vIndex = useMemo(
    () => buildVariantIndex(report.catalog),
    [report.catalog],
  );

  const { byProduct, byStaff, range } = useMemo(() => {
    const prod = new Map<string, { name: string; units: number; value: number }>();
    const staff = new Map<string, { units: number; value: number }>();
    let min = "";
    let max = "";
    for (const e of sales) {
      const units = -e.qty; // qty ujemne
      const value = units * (e.unitPrice ?? 0);
      const key = variantKey(e.productId, e.presentationId);
      const name = vIndex.get(key)?.productName ?? e.productId;
      const p = prod.get(key) ?? { name, units: 0, value: 0 };
      p.units += units;
      p.value += value;
      prod.set(key, p);

      const who = e.staffId || "(nieznany)";
      const s = staff.get(who) ?? { units: 0, value: 0 };
      s.units += units;
      s.value += value;
      staff.set(who, s);

      if (!min || e.at < min) min = e.at;
      if (!max || e.at > max) max = e.at;
    }
    return {
      byProduct: [...prod.values()].sort((a, b) => b.units - a.units),
      byStaff: [...staff.entries()].sort((a, b) => b[1].units - a[1].units),
      range: { min, max },
    };
  }, [sales, vIndex]);

  const filtered = useMemo(
    () => byProduct.filter((p) => matchesQuery(p.name, q)),
    [byProduct, q],
  );

  const staffSort = useSort(byStaff, {
    who: ([who]) => who,
    units: ([, s]) => s.units,
    value: ([, s]) => s.value,
  });
  const productSort = useSort(filtered, {
    name: (p) => p.name,
    units: (p) => p.units,
    value: (p) => p.value,
  });

  if (sales.length === 0) {
    return (
      <div className="panel">
        <p className="empty">
          Brak danych sprzedaży. Zaimportuj snapshot z bookmarkletu (zawiera
          sprzedaż złączoną po nazwie z katalogiem).
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <h2>Sprzedaż — podsumowanie</h2>
        <span className="stat">
          <span className="v">{sales.length}</span>
          <div className="l">linii sprzedaży</div>
        </span>
        <span className="stat">
          <span className="v">{byProduct.reduce((s, p) => s + p.units, 0)}</span>
          <div className="l">sztuk łącznie</div>
        </span>
        {range.min && (
          <span className="stat">
            <span className="v" style={{ fontSize: 14 }}>
              {new Date(range.min).toLocaleDateString("pl-PL")} –{" "}
              {new Date(range.max).toLocaleDateString("pl-PL")}
            </span>
            <div className="l">zakres dat</div>
          </span>
        )}
      </div>

      <div className="panel">
        <h2>Wg sprzedawcy (sold_by)</h2>
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => staffSort.toggle("who")}>
                Sprzedawca{staffSort.arrow("who")}
              </th>
              <th
                className="num sortable"
                onClick={() => staffSort.toggle("units")}
              >
                Sztuk{staffSort.arrow("units")}
              </th>
              <th
                className="num sortable"
                onClick={() => staffSort.toggle("value")}
              >
                Wartość (zł){staffSort.arrow("value")}
              </th>
            </tr>
          </thead>
          <tbody>
            {staffSort.sorted.map(([who, s]) => (
              <tr key={who}>
                <td>{who}</td>
                <td className="num">{s.units}</td>
                <td className="num">{s.value.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Uwaga: darmowe rozdawanie nie tworzy linii sprzedaży — to kolumna
          kontekstowa (rotacja, obsada kasy), nie dowód manka.
        </p>
      </div>

      <div className="panel">
        <h2>Wg produktu</h2>
        <div className="field" style={{ maxWidth: 460, marginBottom: 12 }}>
          <label>Szukaj (nazwa / EAN)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <table>
          <thead>
            <tr>
              <th
                className="sortable"
                onClick={() => productSort.toggle("name")}
              >
                Produkt{productSort.arrow("name")}
              </th>
              <th
                className="num sortable"
                onClick={() => productSort.toggle("units")}
              >
                Sprzedano (szt){productSort.arrow("units")}
              </th>
              <th
                className="num sortable"
                onClick={() => productSort.toggle("value")}
              >
                Wartość (zł){productSort.arrow("value")}
              </th>
            </tr>
          </thead>
          <tbody>
            {productSort.sorted.map((p, i) => (
              <tr key={i}>
                <td>{p.name}</td>
                <td className="num">{p.units}</td>
                <td className="num">{p.value.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
