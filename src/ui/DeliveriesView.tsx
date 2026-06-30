import { useMemo, useState } from "react";
import { ReportState } from "../model/types";
import { recordDelivery } from "../model/ledger";
import { matchesQuery, variantRows, VariantRow } from "../state/store";

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

  function nameFor(productId: string, presentationId: string) {
    const r = rows.find(
      (x) => x.productId === productId && x.presentationId === presentationId,
    );
    return r ? r.productName : presentationId;
  }

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
                <th>Data</th>
                <th>Produkt</th>
                <th className="num">Ilość</th>
                <th>Notatka</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{new Date(d.at).toLocaleDateString("pl-PL")}</td>
                  <td>{nameFor(d.productId, d.presentationId)}</td>
                  <td className="num">+{d.qty}</td>
                  <td className="muted">{d.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
