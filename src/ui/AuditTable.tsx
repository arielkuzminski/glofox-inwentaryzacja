import { AuditLine, variantKey } from "../model/types";
import type { SortApi } from "./useSort";

/**
 * Tabela spisu — warstwa czysto prezentacyjna. Cały stan (bufory edycji, skan,
 * przeliczanie audytu) zostaje w AuditView; tutaj są wiersze i pola wejściowe.
 */
export function AuditTable({
  sort,
  inputRefs,
  countValue,
  onCountChange,
  onCountCommit,
  onCountKeyDown,
  noteValue,
  onNoteChange,
  onNoteCommit,
}: {
  sort: SortApi<AuditLine>;
  inputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>;
  countValue: (key: string) => string;
  onCountChange: (key: string, value: string) => void;
  onCountCommit: (key: string, productId: string, presentationId: string) => void;
  onCountKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    key: string,
    productId: string,
    presentationId: string,
    rowIndex: number,
  ) => void;
  noteValue: (key: string) => string;
  onNoteChange: (key: string, value: string) => void;
  onNoteCommit: (key: string, productId: string, presentationId: string) => void;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th className="sortable" onClick={() => sort.toggle("productName")}>
            Produkt{sort.arrow("productName")}
          </th>
          <th className="num sortable" onClick={() => sort.toggle("systemStock")}>
            Stan Glofox{sort.arrow("systemStock")}
          </th>
          <th className="num sortable" onClick={() => sort.toggle("soldInWindow")}>
            Sprzedano (okno){sort.arrow("soldInWindow")}
          </th>
          <th className="num sortable" onClick={() => sort.toggle("physicalCount")}>
            Spis fizyczny{sort.arrow("physicalCount")}
          </th>
          <th className="num sortable" onClick={() => sort.toggle("manko")}>
            Manko{sort.arrow("manko")}
          </th>
          <th className="num sortable" onClick={() => sort.toggle("mankoValue")}>
            Wartość (zł){sort.arrow("mankoValue")}
          </th>
          <th
            className="num sortable"
            onClick={() => sort.toggle("bookDiscrepancy")}
          >
            Rozb. księgowa{sort.arrow("bookDiscrepancy")}
          </th>
          <th>Uwagi</th>
        </tr>
      </thead>
      <tbody>
        {sort.sorted.map((l, i) => {
          const key = variantKey(l.productId, l.presentationId);
          return (
            <tr key={key}>
              <td>{l.productName}</td>
              <td className="num">{l.systemStock}</td>
              <td className="num muted">
                {l.soldInWindow === null ? "—" : l.soldInWindow}
              </td>
              <td className="num">
                <input
                  ref={(el) => {
                    if (el) inputRefs.current.set(key, el);
                    else inputRefs.current.delete(key);
                  }}
                  type="number"
                  value={countValue(key)}
                  placeholder="—"
                  onChange={(e) => onCountChange(key, e.target.value)}
                  onBlur={() => onCountCommit(key, l.productId, l.presentationId)}
                  onKeyDown={(e) =>
                    onCountKeyDown(e, key, l.productId, l.presentationId, i)
                  }
                />
              </td>
              <td className={`num ${l.flagged ? "flag" : ""}`}>
                {l.manko === null ? "—" : l.manko}
              </td>
              <td className={`num ${l.flagged ? "flag" : ""}`}>
                {l.mankoValue === null ? "—" : l.mankoValue.toFixed(2)}
              </td>
              <td className={`num ${l.bookDiscrepancy ? "flag" : "muted"}`}>
                {l.bookDiscrepancy === null ? "—" : l.bookDiscrepancy}
              </td>
              <td>
                <input
                  value={noteValue(key)}
                  placeholder="uwaga…"
                  onChange={(e) => onNoteChange(key, e.target.value)}
                  onBlur={() => onNoteCommit(key, l.productId, l.presentationId)}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
