import { useMemo, useState } from "react";
import { ReportState } from "../model/types";
import { addExpiryBatch, removeExpiryBatch, activeBatches, addDays } from "../model/expiry";
import { matchesQuery, variantRows, VariantRow } from "../state/store";
import { useSort } from "./useSort";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Krótkie daty ważności — kolumny F/G wzoru sieci i cel „rotacja towaru".
 * Osobna zakładka (nie wiersz spisu), żeby liczenie ze skanerem zostało szybkie.
 */
export function ExpiryView({
  report,
  update,
}: {
  report: ReportState;
  update: (fn: (r: ReportState) => ReportState) => void;
}) {
  const rows = useMemo(() => variantRows(report), [report]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<VariantRow | null>(null);
  const [date, setDate] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    return rows.filter((r) => matchesQuery(r.productName, q)).slice(0, 25);
  }, [rows, q]);

  const now = today();
  const limit = addDays(now, report.settings.expiryWarnDays);

  const batches = useMemo(() => {
    const nameOf = new Map(
      rows.map((r) => [`${r.productId}::${r.presentationId}`, r.productName]),
    );
    return activeBatches(report).map((b) => ({
      ...b,
      productName:
        nameOf.get(`${b.productId}::${b.presentationId}`) ?? b.productId,
      status:
        b.expiryDate < now
          ? ("przeterminowane" as const)
          : b.expiryDate <= limit
            ? ("krótka data" as const)
            : ("ok" as const),
    }));
  }, [report, rows, now, limit]);

  const alerts = batches.filter((b) => b.status !== "ok");
  const alertUnits = alerts.reduce((s, b) => s + b.qty, 0);

  const sort = useSort(batches, {
    expiryDate: (b) => b.expiryDate,
    productName: (b) => b.productName,
    qty: (b) => b.qty,
    status: (b) => b.status,
  });

  function add() {
    if (!picked || !date || !qty) return;
    update((r) =>
      addExpiryBatch(r, {
        productId: picked.productId,
        presentationId: picked.presentationId,
        expiryDate: date,
        qty: Number(qty),
        note: note || undefined,
      }),
    );
    setPicked(null);
    setQ("");
    setDate("");
    setQty("");
    setNote("");
  }

  return (
    <>
      <div className="panel">
        <h2>Krótkie daty ważności</h2>
        <div style={{ marginBottom: 12 }}>
          <span className="stat">
            <span className={`v ${alerts.length ? "danger" : ""}`}>
              {alerts.length}
            </span>
            <div className="l">partii do pilnowania</div>
          </span>
          <span className="stat">
            <span className={`v ${alertUnits ? "danger" : ""}`}>{alertUnits}</span>
            <div className="l">sztuk z krótką datą</div>
          </span>
          <span className="stat">
            <span className="v">{report.settings.expiryWarnDays}</span>
            <div className="l">próg (dni) — patrz Ustawienia</div>
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="empty">
            Najpierw zaimportuj snapshot — bez katalogu nie ma do czego przypiąć daty.
          </p>
        ) : !picked ? (
          <div className="field" style={{ maxWidth: 460 }}>
            <label htmlFor="exp-search">Znajdź produkt (nazwa lub EAN)</label>
            <input
              id="exp-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="np. baton albo 5900617013064"
            />
            {q.trim() && (
              <table style={{ marginTop: 10 }}>
                <tbody>
                  {matches.map((r) => (
                    <tr key={`${r.productId}::${r.presentationId}`}>
                      <td>{r.productName}</td>
                      <td className="num">
                        <button onClick={() => setPicked(r)}>Wybierz</button>
                      </td>
                    </tr>
                  ))}
                  {matches.length === 0 && (
                    <tr>
                      <td className="empty">Brak dopasowania.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{picked.productName}</strong>{" "}
              <button className="ghost" onClick={() => setPicked(null)}>
                zmień
              </button>
            </p>
            <div className="row">
              <div className="field">
                <label htmlFor="exp-date">Data ważności</label>
                <input
                  id="exp-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="exp-qty">Ilość sztuk</label>
                <input
                  id="exp-qty"
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div className="field" style={{ minWidth: 240 }}>
                <label htmlFor="exp-note">Uwaga (opcjonalnie)</label>
                <input
                  id="exp-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="np. przecena −30%"
                />
              </div>
              <button onClick={add} disabled={!date || !qty}>
                Dodaj partię
              </button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Partie w klubie</h2>
        {batches.length === 0 ? (
          <p className="empty">Brak zapisanych partii.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => sort.toggle("expiryDate")}>
                  Data ważności{sort.arrow("expiryDate")}
                </th>
                <th className="sortable" onClick={() => sort.toggle("productName")}>
                  Produkt{sort.arrow("productName")}
                </th>
                <th className="num sortable" onClick={() => sort.toggle("qty")}>
                  Sztuk{sort.arrow("qty")}
                </th>
                <th className="sortable" onClick={() => sort.toggle("status")}>
                  Status{sort.arrow("status")}
                </th>
                <th>Uwaga</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sort.sorted.map((b) => (
                <tr key={b.id}>
                  <td>{b.expiryDate}</td>
                  <td>{b.productName}</td>
                  <td className="num">{b.qty}</td>
                  <td className={b.status === "ok" ? "muted" : "flag"}>
                    {b.status}
                  </td>
                  <td className="muted">{b.note ?? ""}</td>
                  <td className="num">
                    <button
                      className="ghost"
                      style={{ padding: "2px 8px" }}
                      onClick={() => update((r) => removeExpiryBatch(r, b.id))}
                    >
                      wycofano
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          „Wycofano” zdejmuje partię z listy (ślad zostaje w pliku danych). Partie
          w statusie „krótka data” i „przeterminowane” trafiają do kolumn „Krótka data
          ważności” i „Ilość sztuk z krótką datą” w eksporcie dla sieci.
        </p>
      </div>
    </>
  );
}
