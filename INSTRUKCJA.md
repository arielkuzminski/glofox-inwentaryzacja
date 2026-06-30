# Instrukcja krok po kroku — Inwentaryzacja Glofox

Moduł nie ma backendu. **Trwałym zapisem jest plik raportu `.json`**, który eksportujesz
i importujesz. localStorage trzyma tylko roboczą kopię (chroni przed przypadkowym F5).

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

> Panel i Glofox to dwie różne karty — panel **nie łączy się** z Glofox sam. Dane
> przenosisz plikiem `snapshot.json` (część B).

---

## CZĘŚĆ B. Pobranie danych z Glofox (snapshot)

Robisz to za każdym razem, gdy chcesz świeży stan + sprzedaż (np. przy każdej dostawie
i przy każdym spisie).

1. Zaloguj się na **https://app.glofox.com** jako **ADMIN** i wejdź na dashboard → **Store**.
2. (Tylko jeśli od ostatniego snapshotu minęło **więcej niż 31 dni**) otwórz plik
   `src/bridge/glofox-grab.bookmarklet.js` i zwiększ `SALES_DAYS_BACK`, żeby okno
   sprzedaży objęło cały okres od poprzedniego snapshotu.
3. W przeglądarce na karcie Glofox naciśnij **F12** → zakładka **Console**.
4. Otwórz plik `src/bridge/glofox-grab.bookmarklet.js`, **skopiuj całą zawartość**,
   wklej do Console i naciśnij **Enter**.
5. **Jeśli wyskoczy okienko z prośbą o token** — kliknij dowolną pozycję w menu Glofox
   (np. **Members** albo **Reports**). Skrypt złapie świeży token z ruchu i ruszy dalej
   automatycznie (do 25 s). To normalne — Glofox trzyma token w pamięci, nie w pliku.
6. Pobierze się plik **`glofox-snapshot-RRRR-MM-DD.json`**. Gotowe.
   W Console pojawi się też ile produktów i linii sprzedaży pobrano.

---

## CZĘŚĆ C. Pierwsza inwentaryzacja (stan bazowy)

1. W panelu kliknij **„Importuj plik"** i wskaż `glofox-snapshot-...json` z części B.
2. Zakładka **Stan / Snapshoty** — sprawdź, że produkty i stany się wczytały
   (wyszukiwarka po nazwie lub kodzie EAN).
3. **Eksportuj raport** (przycisk u góry) → zapisz pierwszy plik raportu w bezpiecznym
   miejscu. To Twój punkt odniesienia.

---

## CZĘŚĆ D. Bieżąca praca między spisami

### Gdy przyjdzie dostawa
1. Zakładka **Dostawy**.
2. W polu wyszukiwania wpisz nazwę lub **EAN** z faktury → **Wybierz** produkt.
3. Wpisz **ilość**, **datę dostawy** i w notatce **numer faktury** → **Dodaj dostawę**.
4. Powtórz dla kolejnych pozycji z faktury.
5. Na koniec **Eksportuj raport** (nadpisz/zapisz nowy plik).

> Dostawy wpisuj też normalnie do Glofox (Glofox = księga główna). Nasz moduł jest
> niezależną kontrolą — jeśli liczby się rozjadą, wyłapie to „rozbieżność księgowa".

### Podgląd sprzedaży (opcjonalnie)
- Zakładka **Sprzedaż**: ile sztuk i za ile zeszło per produkt oraz **per sprzedawca**
  (`sold_by`). Pamiętaj: to kontekst (rotacja, kto stał na kasie), **nie dowód manka** —
  darmowe rozdawanie nie tworzy linii sprzedaży.

---

## CZĘŚĆ E. Przeprowadzenie spisu (wykrycie manka)

Najlepiej **przy zamkniętym sklepie** (sprzedaż w trakcie liczenia zaburza wynik).

1. Pobierz **świeży snapshot** (część B) i **zaimportuj** go (część C, krok 1).
   Jeśli wracasz po przerwie — najpierw zaimportuj **ostatni raport**, potem snapshot.
2. Zakładka **Audyt (spis)**.
3. Wybierz **najnowszy snapshot** i ustaw **próg tolerancji** (np. 0 = każde manko liczy się;
   2 = drobne pomyłki liczenia ignorujemy).
4. Wyszukaj produkt (nazwa / EAN) i w kolumnie **Spis fizyczny** wpisz, ile **realnie**
   jest na półce. Rób to dla wszystkich liczonych produktów.
   - Filtr **„tylko policzone"** pokaże, co już zrobiłeś.
   - Filtr **„tylko oznaczone"** pokaże tylko pozycje z mankiem powyżej progu.
5. Moduł na żywo liczy:
   - **Manko** = stan Glofox − spis fizyczny (dodatnie ⚠ = brakuje na półce),
   - **Wartość (zł)** = manko × cena,
   - **Sprzedano (okno)** = ile zeszło od poprzedniego snapshotu,
   - **Rozbieżność księgowa** = czy stan Glofox domyka się z dostawami i sprzedażą.
6. Gdy skończysz liczyć — **„Zapisz audyt do raportu"**.
7. **Eksportuj raport** → zapisz plik. To dowód i baza do następnego spisu.

---

## CZĘŚĆ F. Następny raz

1. Otwórz panel (część A, krok 3).
2. **Importuj** ostatni **raport** (`glofox-inwentaryzacja-raport-...json`) — wraca cała
   historia dostaw i audytów.
3. Dalej normalnie: dostawy (D), spis (E). Zawsze na końcu **eksportuj raport**.

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
