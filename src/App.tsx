import { useRef, useState } from "react";
import { useReport, type PersistStatus } from "./state/store";
import { ingestSnapshot } from "./model/ledger";
import {
  exportReport,
  isReport,
  isSnapshot,
  readJsonFile,
  assertSchema,
  normalizeReport,
} from "./storage/file";
import { BridgeView } from "./ui/BridgeView";
import { SnapshotView } from "./ui/SnapshotView";
import { DeliveriesView } from "./ui/DeliveriesView";
import { SalesView } from "./ui/SalesView";
import { AuditView } from "./ui/AuditView";
import { ExpiryView } from "./ui/ExpiryView";
import { OrdersView } from "./ui/OrdersView";
import { ReportView } from "./ui/ReportView";
import { SettingsView } from "./ui/SettingsView";

type Tab =
  | "bridge"
  | "snapshot"
  | "deliveries"
  | "sales"
  | "audit"
  | "expiry"
  | "orders"
  | "report"
  | "settings";

/** Kolejność zakładek = kolejność tygodniowego przepływu pracy w klubie. */
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "bridge", label: "Pobierz dane" },
  { id: "snapshot", label: "Stan / Snapshoty" },
  { id: "deliveries", label: "Dostawy" },
  { id: "sales", label: "Sprzedaż" },
  { id: "audit", label: "Spis (audyt)" },
  { id: "expiry", label: "Daty ważności" },
  { id: "orders", label: "Zamówienia" },
  { id: "report", label: "Raport" },
  { id: "settings", label: "Ustawienia" },
];

export function App() {
  const { report, update, replace, reset, persist } = useReport();
  const [tab, setTab] = useState<Tab>("snapshot");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function runPersist(action: () => Promise<void>, ok: string) {
    setErr(null);
    setMsg(null);
    try {
      await action();
      setMsg(ok);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null);
    setMsg(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = await readJsonFile<unknown>(file);
      if (isSnapshot(data)) {
        assertSchema(data.schemaVersion);
        update((r) => ingestSnapshot(r, data));
        setMsg(
          `Zaimportowano snapshot z ${data.capturedAt} (${data.products.length} produktów).`,
        );
      } else if (isReport(data)) {
        assertSchema(data.schemaVersion);
        replace(normalizeReport(data));
        setMsg(`Wczytano raport z ${data.generatedAt}.`);
      } else {
        setErr("Nie rozpoznano pliku — to ani snapshot, ani raport.");
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    }
  }

  function onReset() {
    if (!confirm("Wyczyścić cały stan (kopia awaryjna + bieżące dane)?")) return;
    void reset().then(() => setMsg("Wyczyszczono stan."));
  }

  return (
    <div className="app">
      <h1>Glofox — Inwentaryzacja</h1>
      <p className="subtitle">
        Spis, krótkie daty, zamówienia i kontrola ubytków w jednym miejscu. Manko =
        stan Glofox − spis z natury. Dane zapisują się same do wybranego pliku.
      </p>

      <div className="panel">
        <div className="row" style={{ alignItems: "center" }}>
          <PersistBadge persist={persist} />
          {persist.status === "connected" ? (
            <>
              <button
                onClick={() =>
                  runPersist(persist.backupNow, "Zapisano kopię zapasową.")
                }
              >
                Zrób kopię teraz
              </button>
              <button
                className="ghost"
                onClick={() =>
                  runPersist(persist.disconnect, "Odłączono folder — dane zostają w przeglądarce.")
                }
              >
                Odłącz folder
              </button>
            </>
          ) : persist.status === "needs-permission" ? (
            <button
              onClick={() =>
                runPersist(persist.reconnect, "Wznowiono auto-zapis do folderu.")
              }
            >
              Wznów zapis do folderu
            </button>
          ) : persist.status === "disconnected" ? (
            <button
              onClick={() =>
                runPersist(
                  persist.connectDirectory,
                  "Podpięto folder danych — auto-zapis i kopie włączone.",
                )
              }
            >
              Wybierz folder danych
            </button>
          ) : null}
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => fileRef.current?.click()}>
            Importuj snapshot z bookmarkletu
          </button>
          <button className="ghost" onClick={() => exportReport(report)}>
            Eksportuj kopię (JSON)
          </button>
          <button className="ghost" onClick={onReset}>
            Wyczyść stan
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={onFile}
          />
        </div>
        {msg && <p className="ok" style={{ marginBottom: 0 }}>{msg}</p>}
        {err && <p className="err" style={{ marginBottom: 0 }}>{err}</p>}
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bridge" && <BridgeView />}
      {tab === "snapshot" && <SnapshotView report={report} />}
      {tab === "deliveries" && (
        <DeliveriesView report={report} update={update} />
      )}
      {tab === "sales" && <SalesView report={report} />}
      {tab === "audit" && <AuditView report={report} update={update} />}
      {tab === "expiry" && <ExpiryView report={report} update={update} />}
      {tab === "orders" && <OrdersView report={report} update={update} />}
      {tab === "report" && <ReportView report={report} />}
      {tab === "settings" && <SettingsView report={report} update={update} />}
    </div>
  );
}

function PersistBadge({
  persist,
}: {
  persist: { status: PersistStatus; dirName: string | null; lastBackup: string | null };
}) {
  const map: Record<PersistStatus, { text: string; cls: string }> = {
    connected: {
      text:
        `Zapisywane do folderu ${persist.dirName ?? ""} ✓` +
        (persist.lastBackup ? ` · kopia z ${persist.lastBackup}` : ""),
      cls: "ok",
    },
    "needs-permission": {
      text: `Folder ${persist.dirName ?? ""} czeka na zgodę →`,
      cls: "warn",
    },
    disconnected: {
      text: "Tylko w przeglądarce — wskaż folder danych",
      cls: "warn",
    },
    unsupported: {
      text: "Ta przeglądarka nie zapisze do folderu (użyj Chrome/Edge; tu działa import/eksport)",
      cls: "muted",
    },
  };
  const { text, cls } = map[persist.status];
  return (
    <span className={`pill ${cls}`} style={{ marginRight: 8 }}>
      {text}
    </span>
  );
}
