import { ReportState } from "../model/types";

/**
 * Ustawienia klubu. Nazwa klubu trafia do nagłówka wzoru sieci (komórka B2) —
 * wpisujemy ją ręcznie, a nie z tokenu Glofox: bookmarklet dekoduje JWT przez
 * `JSON.parse(atob(...))`, co psuje polskie znaki (znany bug rodziny skryptów).
 */
export function SettingsView({
  report,
  update,
}: {
  report: ReportState;
  update: (fn: (r: ReportState) => ReportState) => void;
}) {
  const s = report.settings;

  function set<K extends keyof ReportState["settings"]>(
    key: K,
    value: ReportState["settings"][K],
  ) {
    update((r) => ({ ...r, settings: { ...r.settings, [key]: value } }));
  }

  return (
    <div className="panel">
      <h2>Ustawienia klubu</h2>
      <div className="row">
        <div className="field" style={{ minWidth: 320 }}>
          <label htmlFor="set-club">Nazwa klubu (nagłówek wzoru sieci)</label>
          <input
            id="set-club"
            value={s.clubName ?? ""}
            placeholder="np. XFG Lębork"
            onChange={(e) => set("clubName", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="set-expiry">Krótka data — próg (dni)</label>
          <input
            id="set-expiry"
            type="number"
            min={1}
            value={s.expiryWarnDays}
            onChange={(e) =>
              set("expiryWarnDays", Math.max(1, Number(e.target.value) || 1))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="set-tol">Domyślna tolerancja audytu (szt)</label>
          <input
            id="set-tol"
            type="number"
            min={0}
            value={s.toleranceUnits}
            onChange={(e) =>
              set("toleranceUnits", Math.max(0, Number(e.target.value) || 0))
            }
          />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        Nazwa klubu i data spisu trafiają do nagłówka pliku „WZÓR INWENTARYZACJA”.
        Próg krótkiej daty decyduje, co wchodzi do kolumn „Krótka data ważności” i
        „Ilość sztuk z krótką datą”.
      </p>
    </div>
  );
}
