# Glofox — Moduł Inwentaryzacji

Panel do przeprowadzania i zarządzania inwentaryzacją sklepu Glofox (kontrola
ubytków / loss prevention). **Bez backendu** — trwałym źródłem prawdy jest
eksportowany plik JSON; localStorage służy tylko jako autosave roboczy.

## Po co to (logika biznesowa)

Cel: wykryć, że pracownik **rozdaje towar za darmo / nie wbija sprzedaży**.
Taki ubytek jest **niewidoczny dla Glofox** — bez wbitej sprzedaży stan w systemie
zostaje zawyżony. Dlatego moduł opiera się na **dwóch niezależnych równaniach**:

1. **Prawda fizyczna (łapie kradzież/rozdawanie):**
   `manko = stan_Glofox − spis_z_natury`
   Audytor fizycznie liczy towar na półce i wpisuje liczby. To jedyny sygnał, który
   wykrywa darmowe rozdawanie.
2. **Spójność księgowa (łapie błędy ewidencji w Glofox):**
   `rozbieżność = stan_Glofox_teraz − (stan_poprz + dostawy − sprzedaż)`

Granularność wszędzie **per wariant** (rozmiar/smak) — suma po wariantach ukryłaby manko.

## Architektura — most danych (ważne)

Samodzielny SPA nie ma tokenu sesji Glofox i odbije się o CORS, więc **nie zawoła API
wprost** (listview wymaga `Authorization: Bearer` + `x-glofox-branch-id`). Dane wchodzą
przez import:

```
app.glofox.com  ──[bookmarklet: fetch listview + sprzedaż]──►  snapshot.json
        │                                                            │
        └────────────────── zalogowana sesja ─────────────►  import w panelu (ten moduł)
```

Bookmarklet/skrypt: `src/bridge/glofox-grab.bookmarklet.js`.

## Uruchomienie

```bash
npm install
npm run dev        # panel na http://localhost:5173
npm test           # testy logiki rekonsyliacji (vitest)
npm run build      # produkcyjny build (statyczne pliki -> dist/)
```

## Przepływ pracy

1. **Pobierz snapshot** — na zalogowanym `app.glofox.com` odpal
   `src/bridge/glofox-grab.bookmarklet.js` (DevTools → Console, wklej, Enter).
   Pobierze `glofox-snapshot-RRRR-MM-DD.json`.
2. **Importuj** ten plik w panelu (przycisk „Importuj plik”). Zakładka
   *Stan / Snapshoty* pokaże katalog i bieżące stany.
3. **Dostawy** — wpisywane ręcznie z faktur: wyszukaj produkt po nazwie/EAN, wybierz,
   podaj ilość, datę i nr faktury. Kontrola krzyżowa względem stanu Glofox.
4. **Sprzedaż** — podgląd sprzedaży złączonej po nazwie: sztuki/wartość per produkt
   i per sprzedawca (`sold_by`).
5. **Audyt (spis)** — wybierz snapshot, ustaw próg tolerancji, wyszukaj produkt i wpisz
   **spis z natury**. Moduł na żywo liczy manko, wartość, „sprzedano w oknie” i rozbieżność
   księgową. Filtry „tylko policzone” / „tylko oznaczone”. „Zapisz audyt do raportu”.
6. **Eksportuj raport** (JSON) — to kanon. Następnym razem **zaimportuj** go, by
   wznowić wiedzę o wcześniejszych inwentaryzacjach.

> Snapshot i spis rób przy **zamkniętym sklepie** — sprzedaż w trakcie liczenia
> zaburza wynik.

## Endpointy Glofox (potwierdzone)

- **Stan:** `GET /products/listview/1/9999/null/1` — auth `Bearer` + `x-glofox-branch-id`.
  Cena jest na wariancie (`presentation.retail_price`), warianty bez nazw, EAN w `name`.
- **Sprzedaż:** `GET /data-api/v1/studios/{branchId}/sales/drilldown-by-item-net-sales?date_start&date_end&revenue_stream_type=Products`.
  **Brak ID produktu** — złączenie po `invoice_item_name` = `Product.name` (po normalizacji).
  Bookmarklet robi to złączenie i emituje już `{productId, presentationId, qty}`.

### Ważne zasady operacyjne sprzedaży
- Bierzemy tylko `revenue_stream_type === "Products"`; „Kaucja plastik", „Wejście
  jednorazowe", „Zamrożenie", opłaty członkowskie odpadają (nie matchują katalogu).
- **Zakres dat = od poprzedniego snapshotu do dziś.** Ustaw `SALES_DAYS_BACK` w bookmarkleta,
  by okno sprzedaży pokrywało okres między snapshotami — inaczej rozbieżność księgowa
  (prev + dostawy − sprzedaż) policzy się na złym oknie.
- Sprzedaż nie rozróżnia wariantu → przypisywana do pierwszego wariantu produktu.

Do szybkiego testu UI bez Glofox jest `src/fixtures/sample-snapshot.json`.

## Struktura

| Plik | Rola |
|------|------|
| `src/model/types.ts` | model domenowy (ledger, audyt, raport) |
| `src/model/ledger.ts` | ingest snapshotów, zdarzenia, okna czasowe |
| `src/model/reconcile.ts` | **rdzeń**: manko + bookDiscrepancy (czyste, testowane) |
| `src/storage/file.ts` | import/eksport JSON (kanon) |
| `src/storage/local.ts` | autosave localStorage (draft) |
| `src/bridge/glofox-grab.bookmarklet.js` | most danych z app.glofox.com |
| `src/ui/*` | zakładki: Stan, Dostawy, Audyt, Raport |
