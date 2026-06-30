import { useMemo, useState } from "react";
import { ReportState } from "../model/types";
import { recordDelivery, recordAdjustment } from "../model/ledger";
import { matchesQuery, variantRows, VariantRow } from "../state/store";
import { useSort } from "./useSort";

export function DeliveriesView({
  report,
  update,
}: {
  report: ReportState;
  update: (fn: (r: ReportState) => ReportState) => void;
}) {
  const rows = useMemo(() => variantRows(report), [report]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<VariantRow | null>(null);
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    return rows.filter((r) => matchesQuery(r.productName, q)).slice(0, 25);
  }, [rows, q]);

  const deliveries = report.ledger
    .filter((e) => e.type === "DELIVERY")
    .sort((a, b) => b.at.localeCompare(a.at));

  const adjustments = report.ledger
    .filter((e) => e.type === "ADJUSTMENT")
    .sort((a, b) => b.at.localeCompare(a.at));

  function voidDelivery(d: (typeof deliveries)[number]) {
    if (
      !confirm(
        `Cofnąć dostawę +${d.qty} (${nameFor(d.productId, d.presentationId)})? ` +
          "Dopisze korektę −" +
          d.qty +
          " (ślad audytu zostaje).",
      )
    )
      return;
    update((rep) =>
      recordAdjustment(rep, {
        productId: d.productId,
        presentationId: d.presentationId,
        qty: -d.qty,
        at: new Date().toISOString(),
        unitPrice: d.unitPrice,
        note: `korekta: cofnięcie dostawy${d.note ? ` (${d.note})` : ""}`,
      }),
    );
  }

  function nameFor(productId: string, presentationId: string) {
    const r = rows.find(
      (x) => x.productId === productId && x.presentationId === presentationId,
    );
    return r ? r.productName : presentationId;
  }

  const deliveriesSort = useSort(deliveries, {
    at: (d) => d.at,
    name: (d) => nameFor(d.productId, d.presentationId),
    qty: (d) => d.qty,
    note: (d) => d.note ?? "",
  });

  function add() {
    if (!picked || !qty) return;
    update((rep) =>
      recordDelivery(rep, {
        productId: picked.productId,
        presentationId: picked.presentationId,
        qty: Number(qty),
        at: new Date(date + "T12:00:00").toISOString(),
        unitPrice: picked.unitPrice,
        note: note || undefined,
      }),
    );
    setQty("");
    setNote("");
    setPicked(null);
    setQ("");
  }

  return (
    <>
      <div className="panel">
        <h2>Wprowadź dostawę (ręcznie z faktury)</h2>
        {rows.length === 0 ? (
          <p className="empty">
            Najpierw zaimportuj snapshot — bez katalogu nie ma czego dostarczać.
          </p>
        ) : !picked ? (
          <>
            <div className="field" style={{ maxWidth: 460 }}>
              <label>Znajdź produkt (nazwa lub EAN)</label>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="np. oshee blueberry albo 5901783951389"
              />
            </div>
            {q.trim() && (
              <table style={{ marginTop: 10 }}>
                <tbody>
                  {matches.map((r) => (
                    <tr key={`${r.productId}::${r.presentationId}`}>
                      <td>{r.productName}</td>
                      <td className="num">{r.unitPrice.toFixed(2)} zł</td>
                      <td className="num">
                        <button onClick={() => setPicked(r)}>Wybierz</button>
                      </td>
                    </tr>
                  ))}
                  {matches.length === 0 && (
                    <tr>
                      <td className="muted">Brak dopasowań.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <div className="row">
            <div className="field" style={{ minWidth: 320 }}>
              <label>Produkt</label>
              <div>
                <strong>{picked.productName}</strong>{" "}
                <button
                  className="ghost"
                  style={{ marginLeft: 8, padding: "2px 8px" }}
                  onClick={() => setPicked(null)}
                >
                  zmień
                </button>
              </div>
            </div>
            <div className="field">
              <label>Ilość (szt)</label>
              <input
                autoFocus
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Data dostawy</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field" style={{ minWidth: 200 }}>
              <label>Notatka (nr faktury)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button onClick={add} disabled={!qty}>
              Dodaj dostawę
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Historia dostaw ({deliveries.length})</h2>
        {deliveries.length === 0 ? (
          <p className="empty">Brak dostaw.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th
                  className="sortable"
                  onClick={() => deliveriesSort.toggle("at")}
                >
                  Data{deliveriesSort.arrow("at")}
                </th>
                <th
                  className="sortable"
                  onClick={() => deliveriesSort.toggle("name")}
                >
                  Produkt{deliveriesSort.arrow("name")}
                </th>
                <th
                  className="num sortable"
                  onClick={() => deliveriesSort.toggle("qty")}
                >
                  Ilość{deliveriesSort.arrow("qty")}
                </th>
                <th
                  className="sortable"
                  onClick={() => deliveriesSort.toggle("note")}
                >
                  Notatka{deliveriesSort.arrow("note")}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deliveriesSort.sorted.map((d) => (
                <tr key={d.id}>
                  <td>{new Date(d.at).toLocaleDateString("pl-PL")}</td>
                  <td>{nameFor(d.productId, d.presentationId)}</td>
                  <td className="num">+{d.qty}</td>
                  <td className="muted">{d.note ?? ""}</td>
                  <td className="num">
                    <button
                      className="ghost"
                      style={{ padding: "2px 8px" }}
                      onClick={() => voidDelivery(d)}
                    >
                      cofnij
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adjustments.length > 0 && (
        <div className="panel">
          <h2>Korekty ({adjustments.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Produkt</th>
                <th className="num">Korekta</th>
                <th>Notatka</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.at).toLocaleDateString("pl-PL")}</td>
                  <td>{nameFor(a.productId, a.presentationId)}</td>
                  <td className={`num ${a.qty < 0 ? "flag" : ""}`}>
                    {a.qty > 0 ? `+${a.qty}` : a.qty}
                  </td>
                  <td className="muted">{a.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
