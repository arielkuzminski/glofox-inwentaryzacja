import { useRef, useState } from "react";
import { useReport } from "./state/store";
import { ingestSnapshot } from "./model/ledger";
import {
  exportReport,
  isReport,
  isSnapshot,
  readJsonFile,
  assertSchema,
} from "./storage/file";
import { clearDraft } from "./storage/local";
import { emptyReport } from "./model/types";
import { SnapshotView } from "./ui/SnapshotView";
import { DeliveriesView } from "./ui/DeliveriesView";
import { SalesView } from "./ui/SalesView";
import { AuditView } from "./ui/AuditView";
import { ReportView } from "./ui/ReportView";

type Tab = "snapshot" | "deliveries" | "sales" | "audit" | "report";

export function App() {
  const { report, update, replace } = useReport();
  const [tab, setTab] = useState<Tab>("snapshot");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
        replace(data);
        setMsg(`Wczytano raport z ${data.generatedAt}.`);
      } else {
        setErr("Nie rozpoznano pliku — to ani snapshot, ani raport.");
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    }
  }

  function onReset() {
    if (!confirm("Wyczyścić cały stan (autosave + bieżące dane)?")) return;
    clearDraft();
    replace(emptyReport());
    setMsg("Wyczyszczono stan.");
  }

  return (
    <div className="app">
      <h1>Glofox — Inwentaryzacja</h1>
      <p className="subtitle">
        Kontrola ubytków: manko = stan Glofox − spis z natury. Bez backendu —
        kanon to plik JSON.
      </p>

      <div className="panel">
        <div className="row">
          <button onClick={() => fileRef.current?.click()}>
            Importuj plik (snapshot / raport)
          </button>
          <button className="ghost" onClick={() => exportReport(report)}>
            Eksportuj raport (JSON)
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
        <button
          className={`tab ${tab === "snapshot" ? "active" : ""}`}
          onClick={() => setTab("snapshot")}
        >
          Stan / Snapshoty
        </button>
        <button
          className={`tab ${tab === "deliveries" ? "active" : ""}`}
          onClick={() => setTab("deliveries")}
        >
          Dostawy
        </button>
        <button
          className={`tab ${tab === "sales" ? "active" : ""}`}
          onClick={() => setTab("sales")}
        >
          Sprzedaż
        </button>
        <button
          className={`tab ${tab === "audit" ? "active" : ""}`}
          onClick={() => setTab("audit")}
        >
          Audyt (spis)
        </button>
        <button
          className={`tab ${tab === "report" ? "active" : ""}`}
          onClick={() => setTab("report")}
        >
          Raport
        </button>
      </div>

      {tab === "snapshot" && <SnapshotView report={report} />}
      {tab === "deliveries" && (
        <DeliveriesView report={report} update={update} />
      )}
      {tab === "sales" && <SalesView report={report} />}
      {tab === "audit" && <AuditView report={report} update={update} />}
      {tab === "report" && <ReportView report={report} />}
    </div>
  );
}
