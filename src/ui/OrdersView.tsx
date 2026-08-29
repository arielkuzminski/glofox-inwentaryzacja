import { useMemo, useState } from "react";
import { ReportState, variantKey } from "../model/types";
import { snapshotMetas } from "../model/ledger";
import { computeOrderPlan, setMinStock } from "../model/orders";
import { exportOrdersCsv } from "../storage/ordersCsv";
import { matchesQuery } from "../state/store";
import { useSort } from "./useSort";

/**
 * Zamówienia — druga połowa celu sieci: „porównaj z poprzednim tygodniem i oceń,
 * czy złożyć zamówienie". Stan bierzemy ze spisu, gdy jest (Glofox zawyża przy
 * ubytkach), a zużycie z realnej sprzedaży w oknie między snapshotami.
 */
export function OrdersView({
  report,
  update,
}: {
  report: ReportState;
  update: (fn: (r: ReportState) => ReportState) => void;
}) {
  const metas = useMemo(() => snapshotMetas(report.ledger), [report.ledger]);
  const latest = metas[metas.length - 1];
  const [source, setSource] = useState(latest?.source ?? "");
  const [q, setQ] = useState("");
  const [onlyToOrder, setOnlyToOrder] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const lines = useMemo(
    () => (source ? computeOrderPlan(report, source) : []),
    [report, source],
  );

  const visible = useMemo(
    () =>
      lines.filter((l) => {
        if (onlyToOrder && !(l.toOrder && l.toOrder > 0)) return false;
        return matchesQuery(l.productName, q);
      }),
    [lines, q, onlyToOrder],
  );

  const sort = useSort(visible, {
    productName: (l) => l.productName,
    currentStock: (l) => l.currentStock,
    weeklyUsage: (l) => l.weeklyUsage,
    minStock: (l) => l.minStock,
    toOrder: (l) => l.toOrder,
    weeksOfCover: (l) => l.weeksOfCover,
  });

  const toOrderCount = lines.filter((l) => l.toOrder && l.toOrder > 0).length;
  const toOrderUnits = lines.reduce((s, l) => s + (l.toOrder ?? 0), 0);
  const noUsage = lines.every((l) => l.weeklyUsage === null);

  function commitMin(key: string) {
    const raw = draft[key];
    if (raw === undefined) return;
    setDraft((d) => {
      const c = { ...d };
      delete c[key];
      return c;
    });
    const n = Number(raw.trim());
    if (raw.trim() === "" || Number.isNaN(n)) return;
    update((r) => setMinStock(r, key, Math.max(0, Math.round(n))));
  }

  /** Minimum na poziomie tygodniowej rotacji = zapas na jeden cykl zamówień. */
  function minFromUsage(scope: "all" | string) {
    update((r) => {
      let out = r;
      for (const l of lines) {
        const key = variantKey(l.productId, l.presentationId);
        if (scope !== "all" && scope !== key) continue;
        if (l.weeklyUsage === null || l.weeklyUsage <= 0) continue;
        out = setMinStock(out, key, Math.ceil(l.weeklyUsage));
      }
      return out;
    });
  }

  if (!latest) {
    return (
      <div className="panel">
        <p className="empty">
          Najpierw zaimportuj snapshot — bez stanu nie ma czego zamawiać.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <h2>Zamówienia</h2>
        <div className="row">
          <div className="field" style={{ minWidth: 280 }}>
            <label htmlFor="ord-src">Stan na dzień (snapshot)</label>
            <select
              id="ord-src"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {metas.map((m) => (
                <option key={m.source} value={m.source}>
                  {new Date(m.at).toLocaleString("pl-PL")}
                </option>
              ))}
            </select>
          </div>
          <button className="ghost" onClick={() => minFromUsage("all")}>
            min = zużycie tyg. (wszystkie)
          </button>
          <button
            className="ghost"
            onClick={() => exportOrdersCsv(lines)}
            disabled={toOrderCount === 0}
          >
            Eksportuj zamówienie (CSV)
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <span className="stat">
            <span className={`v ${toOrderCount ? "danger" : ""}`}>
              {toOrderCount}
            </span>
            <div className="l">pozycji do zamówienia</div>
          </span>
          <span className="stat">
            <span className="v">{toOrderUnits}</span>
            <div className="l">sztuk łącznie</div>
          </span>
        </div>
        {noUsage && (
          <p className="warn" style={{ marginBottom: 0 }}>
            Brak poprzedniego snapshotu — zużycia tygodniowego nie da się policzyć.
            Po kolejnym niedzielnym spisie pojawi się samo.
          </p>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="field" style={{ minWidth: 320 }}>
            <label htmlFor="ord-q">Szukaj (nazwa lub EAN)</label>
            <input
              id="ord-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="np. woda"
            />
          </div>
          <label
            className="field"
            style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={onlyToOrder}
              onChange={(e) => setOnlyToOrder(e.target.checked)}
            />
            tylko do zamówienia
          </label>
          <span className="pill">{visible.length} pozycji</span>
        </div>
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => sort.toggle("productName")}>
                Produkt{sort.arrow("productName")}
              </th>
              <th className="num sortable" onClick={() => sort.toggle("currentStock")}>
                Stan bieżący{sort.arrow("currentStock")}
              </th>
              <th className="num sortable" onClick={() => sort.toggle("weeklyUsage")}>
                Zużycie / tydz.{sort.arrow("weeklyUsage")}
              </th>
              <th className="num sortable" onClick={() => sort.toggle("weeksOfCover")}>
                Pokrycie (tyg.){sort.arrow("weeksOfCover")}
              </th>
              <th className="num sortable" onClick={() => sort.toggle("minStock")}>
                Minimum{sort.arrow("minStock")}
              </th>
              <th className="num sortable" onClick={() => sort.toggle("toOrder")}>
                Do zamówienia{sort.arrow("toOrder")}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sort.sorted.map((l) => {
              const key = variantKey(l.productId, l.presentationId);
              return (
                <tr key={key}>
                  <td>
                    {l.productName}{" "}
                    {l.basis === "glofox" && (
                      <span className="muted" style={{ fontSize: 11 }}>
                        (stan z Glofoxa — nie policzony)
                      </span>
                    )}
                  </td>
                  <td className="num">{l.currentStock}</td>
                  <td className="num muted">
                    {l.weeklyUsage === null ? "—" : l.weeklyUsage}
                  </td>
                  <td
                    className={`num ${
                      l.weeksOfCover !== null && l.weeksOfCover < 1 ? "flag" : "muted"
                    }`}
                  >
                    {l.weeksOfCover === null ? "—" : l.weeksOfCover}
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      aria-label={`Minimum dla ${l.productName}`}
                      value={draft[key] ?? (l.minStock === null ? "" : String(l.minStock))}
                      placeholder="—"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [key]: e.target.value }))
                      }
                      onBlur={() => commitMin(key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitMin(key);
                      }}
                    />
                  </td>
                  <td className={`num ${l.toOrder ? "flag" : "muted"}`}>
                    {l.toOrder === null ? "—" : l.toOrder}
                  </td>
                  <td className="num">
                    {l.weeklyUsage !== null && l.weeklyUsage > 0 && (
                      <button
                        className="ghost"
                        style={{ padding: "2px 8px" }}
                        onClick={() => minFromUsage(key)}
                        title="Ustaw minimum = zużycie z ostatniego tygodnia"
                      >
                        min = {Math.ceil(l.weeklyUsage)}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Zużycie liczone ze sprzedaży między dwoma ostatnimi snapshotami, przeliczonej
          na 7 dni. „Do zamówienia” = minimum − stan bieżący. Pokrycie poniżej 1 tygodnia
          oznacza, że towar skończy się przed następną niedzielą.
        </p>
      </div>
    </>
  );
}
