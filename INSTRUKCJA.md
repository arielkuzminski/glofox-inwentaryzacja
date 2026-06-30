# Instrukcja krok po kroku — Inwentaryzacja Glofox

Moduł nie ma backendu, ale **dane zapisują się same do wybranego pliku** na dysku
(File System Access API) — bez ręcznego eksportu/importu co sesję. Plik jest kanonem;
localStorage trzyma kopię awaryjną. Wskazanie pliku robisz **raz** (patrz część A),
a uchwyt do niego pamięta nawet przeglądarka po odświeżeniu.

> Auto-zapis działa w **Chrome/Edge** na `http://localhost` (lub https). W innych
> przeglądarkach (np. Firefox) panel wraca do trybu ręcznego eksportu/importu JSON —
> wszystko działa, tylko zapis nie jest automatyczny.

> Zasada nadrzędna: **manko = stan w Glofox − policzony stan z półki.** Darmowe rozdawanie
> jest niewidoczne dla Glofox (stan zostaje zawyżony), więc bez fizycznego policzenia
> towaru nic nie wykryjesz. Snapshoty i sprzedaża są tylko wsparciem.

---

## CZĘŚĆ A. Uruchomienie panelu (raz na stanowisku)

1. Zainstaluj **Node.js 18+** (jeśli nie ma).
2. W folderze projektu uruchom raz:
   ```bash
   npm install
   ```
3. Wystartuj panel:
   ```bash
   npm run dev
   ```
4. Otwórz w przeglądarce adres, który wypisze (domyślnie **http://localhost:5173**).
   Panel zostaw otwarty na czas pracy.
5. **Raz** kliknij u góry **„Utwórz plik danych"** i wskaż miejsce na plik (np.
   `inwentaryzacja.json` w folderze chmury/Dropbox dla automatycznej kopii). Od tej pory
   każda zmiana zapisuje się tam sama — badge u góry pokazuje **„Zapisywane do … ✓"**.
   - Następnym razem, jeśli przeglądarka poprosi o zgodę, kliknij **„Wznów zapis do pliku"**.
   - Masz już plik z poprzedniej sesji? Użyj **„Otwórz plik danych"** zamiast „Utwórz".

> Panel i Glofox to dwie różne karty — panel **nie łączy się** z Glofox sam. Dane
> przenosisz plikiem `snapshot.json` (część B).

---

## CZĘŚĆ B. Pobranie danych z Glofox (snapshot)

Robisz to za każdym razem, gdy chcesz świeży stan + sprzedaż (np. przy każdej dostawie
i przy każdym spisie).

**Raz na stanowisku:** wejdź w panelu na zakładkę **„Pobierz dane"** i **przeciągnij**
przycisk **„Glofox → snapshot"** na pasek zakładek przeglądarki
(<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>, jeśli pasek schowany).

Potem za każdym razem:
1. Zaloguj się na **https://app.glofox.com** jako **ADMIN** → dashboard → **Store**.
2. Kliknij zakładkę **„Glofox → snapshot"** na pasku.
3. W okienku podaj **ile dni sprzedaży wstecz** pobrać (domyślnie 60). Okno musi pokryć
   czas **od ostatniego snapshotu** — inaczej panel ostrzeże, że rozbieżność księgowa
   policzy się na za krótkim oknie.
4. **Jeśli wyskoczy prośba o token** — kliknij dowolną pozycję w menu Glofox (np.
   **Members**). Skrypt złapie świeży token z ruchu i ruszy dalej (do 25 s).
5. Pobierze się **`glofox-snapshot-RRRR-MM-DD.json`**. Gotowe.

> Wariant awaryjny (bez paska zakładek): na karcie Glofox **F12 → Console**, wklej całą
> zawartość `src/bridge/glofox-grab.bookmarklet.js`, Enter. Patrz zakładka „Pobierz dane".

---

## CZĘŚĆ C. Pierwsza inwentaryzacja (stan bazowy)

1. Upewnij się, że masz podłączony plik danych (część A, krok 5) — badge „Zapisywane do … ✓".
2. Kliknij u góry **„Importuj snapshot z bookmarkletu"** i wskaż `glofox-snapshot-...json`.
3. Zakładka **Stan / Snapshoty** — sprawdź, że produkty i stany się wczytały
   (wyszukiwarka po nazwie lub kodzie EAN).

> Nie musisz nic „eksportować" — od momentu podłączenia pliku wszystko zapisuje się tam
> samo. (Przycisk **„Eksportuj kopię (JSON)"** robi jedynie dodatkową kopię na wszelki wypadek.)

---

## CZĘŚĆ D. Bieżąca praca między spisami

### Gdy przyjdzie dostawa
1. Zakładka **Dostawy**.
2. W polu wyszukiwania wpisz nazwę lub **EAN** z faktury → **Wybierz** produkt.
3. Wpisz **ilość**, **datę dostawy** i w notatce **numer faktury** → **Dodaj dostawę**.
4. Powtórz dla kolejnych pozycji z faktury. Wszystko zapisuje się samo.

> **Pomyłka?** W historii dostaw kliknij **„cofnij"** — dopisze korektę (−ilość) i poprawi
> rozbieżność księgową. Nic nie znika z ewidencji (ślad audytu zostaje); korekty widać
> w sekcji **„Korekty"** pod historią.

> Dostawy wpisuj też normalnie do Glofox (Glofox = księga główna). Nasz moduł jest
> niezależną kontrolą — jeśli liczby się rozjadą, wyłapie to „rozbieżność księgowa".

### Podgląd sprzedaży (opcjonalnie)
- Zakładka **Sprzedaż**: ile sztuk i za ile zeszło per produkt oraz **per sprzedawca**
  (`sold_by`). Pamiętaj: to kontekst (rotacja, kto stał na kasie), **nie dowód manka** —
  darmowe rozdawanie nie tworzy linii sprzedaży.

---

## CZĘŚĆ E. Przeprowadzenie spisu (wykrycie manka)

Najlepiej **przy zamkniętym sklepie** (sprzedaż w trakcie liczenia zaburza wynik).

1. Pobierz **świeży snapshot** (część B) i **zaimportuj** go („Importuj snapshot…").
   Plik danych masz podłączony cały czas — historia wraca sama.
2. Zakładka **Audyt (spis)**.
3. Wybierz **najnowszy snapshot** i ustaw **próg tolerancji** (np. 0 = każde manko liczy się;
   2 = drobne pomyłki liczenia ignorujemy). Jeśli okno sprzedaży snapshotu nie pokrywa
   przerwy — pojawi się **ostrzeżenie** (pobierz snapshot z większym zakresem dni).
4. **Licz ze skanerem (najszybciej):** ustaw kursor w polu **„Skanuj / szukaj"** (jest
   sfokusowane samo) i zeskanuj kod EAN z produktu:
   - skan ustawi fokus na polu spisu danego wariantu → wpisz policzoną liczbę → **Enter**
     (zatwierdza i wraca do skanowania),
   - albo włącz **„tryb +1"** — wtedy każdy skan dolicza 1 sztukę (dobre przy małych ilościach).
   Bez skanera: wpisz nazwę/EAN, Enter znajdzie wiersz; wpisuj ilości i przeskakuj Enterem.
   - Licznik **„policzono X / N"** pokazuje postęp; filtry **„tylko policzone"** /
     **„tylko oznaczone"** zawężają widok.
   - **Spis zapisuje się na bieżąco do pliku — F5 ani zamknięcie karty nic nie kasuje**,
     możesz przerwać i wrócić (wybierz ten sam snapshot).
5. Moduł na żywo liczy: **Manko** (stan Glofox − spis), **Wartość (zł)**, **Sprzedano
   (okno)**, **Rozbieżność księgowa**.
6. Gdy skończysz — **„Zapisz audyt do raportu"** (zamraża wynik jako dowód). Opcjonalnie
   **„Eksportuj CSV"** — czytelny plik do Excela dla szefa/księgowej.

---

## CZĘŚĆ F. Następny raz

1. Otwórz panel (część A, krok 3). Jeśli badge pokazuje **„Wznów zapis do pliku"** —
   kliknij go (przeglądarka prosi o zgodę na zapis). Dane wczytają się z pliku same.
2. Dalej normalnie: pobierz snapshot (B), dostawy (D), spis (E). Nic nie eksportujesz —
   wszystko zapisuje się na bieżąco do pliku.

> Tylko w przeglądarce bez auto-zapisu (np. Firefox): wracasz przyciskiem **„Importuj"**
> do ostatniego raportu i na końcu **„Eksportuj kopię (JSON)"**, jak w starym trybie.

---

## Jak czytać wyniki

| Sygnał | Co znaczy | Co robić |
|--------|-----------|----------|
| **Manko dodatnie** ⚠ | Na półce jest mniej niż mówi Glofox | Realny ubytek: kradzież / rozdawanie / stłuczka / błąd liczenia |
| Manko ujemne | Na półce jest więcej niż w Glofox | Niewbita sprzedaż, niewprowadzona dostawa, pomyłka w liczeniu |
| **Rozbieżność księgowa ≠ 0** | Stan Glofox ruszył inaczej niż (poprz. + dostawy − sprzedaż) | Błąd ewidencji w samym Glofox (ręczna korekta stanu, write-off) |
| Dużo „linii bez dopasowania" w Console | Nazwy sprzedaży nie pasują do katalogu | Sprawdź, czy nie zmieniono nazw produktów; zgłoś do dostrojenia |

---

## Najczęstsze problemy

- **401 / okienko o token** → token w localStorage był nieaktualny. Kliknij coś w menu
  Glofox (np. Members), żeby skrypt złapił świeży token z żywego ruchu. Jeśli dalej nie idzie
  — wyloguj się i zaloguj ponownie do Glofox.
- **Pusto po imporcie** → zaimportowano zły plik. Snapshot zaczyna się od `capturedAt`,
  raport od `generatedAt`. Panel sam rozpoznaje typ — sprawdź komunikat u góry.
- **Stary stan po odświeżeniu** → to autosave (localStorage). „Wyczyść stan" zaczyna od zera
  (najpierw wyeksportuj raport, jeśli chcesz go zachować!).
- **Spis robisz na kilku stanowiskach** → moduł działa na jednym. Każde stanowisko ma własny
  autosave; scalanie tylko przez ręczny eksport/import raportów.
