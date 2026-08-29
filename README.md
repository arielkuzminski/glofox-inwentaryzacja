# Glofox — Moduł Inwentaryzacji

Panel do prowadzenia inwentaryzacji sklepu w klubie: **spis, krótkie daty, zamówienia
i kontrola ubytków** w jednym miejscu. Realizuje jednocześnie obowiązek wobec sieci
franczyzowej (cotygodniowy spis do pliku „WZÓR INWENTARYZACJA”) i naszą kontrolę
ubytków. **Bez backendu** — kanonem jest plik na dysku z
**auto-zapisem** (File System Access API; uchwyt pliku w IndexedDB). localStorage to
kopia awaryjna; w przeglądarkach bez tego API panel wraca do ręcznego eksportu/importu JSON.

## Po co to (logika biznesowa)

Moduł obsługuje **dwa cele naraz**:

| Cel | Czyj | Co daje |
|-----|------|---------|
| Zatowarowanie: stan, krótkie daty, zamówienia | sieć (spis co niedzielę) | eksport w układzie wzoru, plan zamówień |
| Kontrola ubytków (loss prevention) | nasz | manko, rozbieżność księgowa, powtarzalność |

Cel kontrolny: wykryć, że pracownik **rozdaje towar za darmo / nie wbija sprzedaży**.
Taki ubytek jest **niewidoczny dla Glofox** — bez wbitej sprzedaży stan w systemie
zostaje zawyżony. Dlatego moduł opiera się na **dwóch niezależnych równaniach**:

1. **Prawda fizyczna (łapie kradzież/rozdawanie):**
   `manko = stan_Glofox − spis_z_natury`
   Audytor fizycznie liczy towar na półce i wpisuje liczby. To jedyny sygnał, który
   wykrywa darmowe rozdawanie.
2. **Spójność księgowa (łapie błędy ewidencji w Glofox):**
   `rozbieżność = stan_Glofox_teraz − (stan_poprz + dostawy − sprzedaż)`

Granularność wszędzie **per wariant** (rozmiar/smak) — suma po wariantach ukryłaby manko.

Trzeci sygnał, którego nie da się dostać z Excela sieci: **powtarzalność**. Pomyłka
w liczeniu zdarza się raz; manko na tym samym produkcie dwa spisy z rzędu to wzorzec
(zakładka *Raport* → „Powtarzające się manka”).

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

## Zgodność z wzorem sieci („WZÓR INWENTARYZACJA 2026”)

Eksport odtwarza plik sieci kolumna w kolumnę (nagłówek B2 = nazwa klubu z *Ustawień*,
C2 = data i godzina spisu, nagłówki w wierszu 6, dane od wiersza 7, w kolumnie E
formuła `=D−C` jak w oryginale):

| Wzór sieci | Skąd u nas |
|------------|------------|
| A `Lp.` | numeracja po posortowaniu nazwami |
| B `Nazwa produktu ze sklepu` | nazwa z Glofoxa **bez kodu EAN** (`stripEan`) |
| C `Stan w sklepie XFG` | stan ze snapshotu — automat, nie przepisywanie ręczne |
| D `Stan faktyczny` | spis z natury (skaner) |
| E `Różnica` | **`D − C`, odwrotnie niż nasze `manko`** |
| F `Krótka data ważności` | najbliższa data z zakładki *Daty ważności* |
| G `Ilość sztuk z krótką datą` | suma sztuk w progu z *Ustawień* (domyślnie 30 dni) |
| H `Uwagi` | uwaga wpisana w wierszu spisu |

> **Uwaga na znak.** U nas `manko = stan Glofox − spis` (dodatnie = brakuje).
> Sieć liczy odwrotnie: `Różnica = spis − stan` (minus = brakuje). Rdzeń liczy po
> naszemu, znak odwraca się wyłącznie w eksporcie (`storage/franchise.ts`) — pilnuje
> tego osobny test.

Pozycje niepoliczone eksportujemy z pustym D i E (formuła `=D−C` przy pustym D
pokazałaby fałszywe „−stan”). Domyślnie eksport pomija pozycje bez stanu, spisu,
daty i uwagi — checkbox „także pozycje bez stanu” dokłada resztę katalogu.

## Przepływ pracy

0. **Raz:** kliknij „Utwórz plik danych" (auto-zapis) i uzupełnij *Ustawienia*
   (nazwa klubu, próg krótkiej daty, domyślna tolerancja).
1. **Pobierz snapshot** — zakładka *Pobierz dane*: przeciągnij bookmarklet „Glofox →
   snapshot" na pasek zakładek (raz), potem na zalogowanym `app.glofox.com` kliknij go.
   Podaj okno sprzedaży (dni). Pobierze `glofox-snapshot-RRRR-MM-DD.json`.
2. **Importuj snapshot** w panelu. Zakładka *Stan / Snapshoty* pokaże katalog i stany.
3. **Dostawy** — ręcznie z faktur (nazwa/EAN, ilość, data, nr faktury). „cofnij" =
   korekta (ADJUSTMENT) z zachowaniem śladu audytu.
4. **Sprzedaż** — podgląd złączony po nazwie: sztuki/wartość per produkt i per `sold_by`.
5. **Audyt (spis)** — wybierz snapshot, próg tolerancji. **Skanuj EAN** (fokus pola →
   wpisz ilość → Enter; albo „tryb +1") lub wpisuj ręcznie. Licznik postępu „X / N",
   filtry „tylko policzone / oznaczone". **Spis zapisuje się na żywo do pliku (przeżywa
   F5)** jako zdarzenia `PHYSICAL_COUNT`. „Zapisz audyt", „Eksportuj CSV".
6. **Daty ważności** — osobna zakładka: produkt, data z opakowania, ilość. Statusy
   „przeterminowane / krótka data / ok”, „wycofano” zdejmuje partię (ślad zostaje).
7. **Zamówienia** — stan bieżący (spis, a gdy nie policzono — Glofox), zużycie
   tygodniowe z realnej sprzedaży, minimum (ręcznie lub „min = zużycie tyg.”),
   „do zamówienia” i pokrycie w tygodniach. Eksport listy zakupowej do CSV.
8. **Eksport dla sieci** — w *Spisie* i w *Raporcie*: „Wzór sieci (XLSX)" (gotowy plik)
   albo „(CSV)" (do wklejenia w arkusz online).
9. **Auto-zapis do pliku** jest kanonem — nic nie eksportujesz ręcznie. Po reloadzie
   ewentualnie „Wznów zapis do pliku". Ostrzeżenie, gdy okno sprzedaży nie pokrywa przerwy.

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
- **Zakres dat = od poprzedniego snapshotu do dziś.** Bookmarklet pyta o liczbę dni
  (domyślnie 14 — rytm sieci jest tygodniowy) i zapisuje zakres (`salesFrom`/`salesTo`) w snapshocie; panel **ostrzega**
  w Audycie, gdy okno nie pokrywa przerwy między snapshotami (rozbieżność księgowa
  policzyłaby się na złym oknie).
- Sprzedaż nie rozróżnia wariantu → przypisywana do pierwszego wariantu produktu.

Do szybkiego testu UI bez Glofox jest `src/fixtures/sample-snapshot.json`.

## Struktura

| Plik | Rola |
|------|------|
| `src/model/types.ts` | model domenowy (ledger, audyt, raport, okno sprzedaży) |
| `src/model/ledger.ts` | ingest, dostawy, spis (PHYSICAL_COUNT), korekty (ADJUSTMENT), okna |
| `src/model/reconcile.ts` | **rdzeń**: manko + bookDiscrepancy (czyste, testowane) |
| `src/model/expiry.ts` | partie z krótką datą (poza ledgerem — nie ruszają stanu) |
| `src/model/orders.ts` | zużycie tygodniowe, minima, rekomendacja zamówienia |
| `src/model/compare.ts` | porównanie dwóch spisów → powtarzające się manka |
| `src/storage/franchise.ts` | wiersze wzoru sieci (**odwrócenie znaku**) + CSV |
| `src/storage/xlsx.ts` | minimalny writer XLSX (ZIP „stored" + inlineStr, bez zależności) |
| `src/storage/ordersCsv.ts` | lista zakupowa do CSV |
| `src/storage/fileSystem.ts` | **auto-zapis do pliku** (File System Access) + WriteQueue |
| `src/storage/handleStore.ts` | uchwyt pliku w IndexedDB (przeżywa reload) |
| `src/storage/file.ts` | import/eksport JSON + eksport CSV audytu |
| `src/storage/local.ts` | localStorage (fallback / kopia awaryjna) |
| `scripts/build-bookmarklet.mjs` | minifikuje most → `bookmarklet.generated.ts` (link `javascript:`) |
| `src/bridge/glofox-grab.bookmarklet.js` | most danych z app.glofox.com |
| `src/ui/*` | zakładki: Pobierz dane, Stan, Dostawy, Sprzedaż, Spis, Daty ważności, Zamówienia, Raport, Ustawienia |
