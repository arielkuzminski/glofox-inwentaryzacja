# Instrukcja krok po kroku — Inwentaryzacja Glofox

> **Rytm:** sieć wymaga spisu **raz w tygodniu, najlepiej w niedzielę** (po zamknięciu
> lub przed otwarciem). Ten moduł robi jednym przejściem to, co trzeba oddać sieci
> (plik „WZÓR INWENTARYZACJA”) **oraz** kontrolę ubytków, której w tamtym pliku nie ma.

Panel otwierasz z linku, a **dane zapisują się same do wskazanego folderu** na dysku —
bez ręcznego eksportu co sesję i bez instalowania czegokolwiek. Folder jest kanonem;
w środku panel trzyma `inwentaryzacja.json` i podfolder `backups/` z kopiami dziennymi.
Folder wskazujesz **raz** (część A) — przeglądarka pamięta go po odświeżeniu.

> Auto-zapis działa w **Chrome/Edge** na `http://localhost` (lub https). W innych
> przeglądarkach (np. Firefox) panel wraca do trybu ręcznego eksportu/importu JSON —
> wszystko działa, tylko zapis nie jest automatyczny.

> Zasada nadrzędna: **manko = stan w Glofox − policzony stan z półki.** Darmowe rozdawanie
> jest niewidoczne dla Glofox (stan zostaje zawyżony), więc bez fizycznego policzenia
> towaru nic nie wykryjesz. Snapshoty i sprzedaża są tylko wsparciem.

---

## CZĘŚĆ A. Uruchomienie panelu (raz na stanowisku)

1. Otwórz w **Chrome lub Edge**:
   **https://arielkuzminski.github.io/glofox-inwentaryzacja/**
   (dodaj do zakładek — to cały „instalator”). Panel zostaw otwarty na czas pracy.
2. **Raz** kliknij u góry **„Wybierz folder danych"** i wskaż folder na dysku, np.
   `Dokumenty\Inwentaryzacja` (może być w OneDrive/Dropbox — wtedy masz jeszcze kopię
   w chmurze). Od tej pory każda zmiana zapisuje się tam sama, a badge u góry pokazuje
   **„Zapisywane do folderu … ✓"**.
   - W folderze powstaną: `inwentaryzacja.json` (bieżące dane) i `backups/`
     (kopie dzienne, ostatnie 8).
   - Następnym razem, jeśli przeglądarka poprosi o zgodę, kliknij
     **„Wznów zapis do folderu"**.
   - Masz już folder z poprzedniej sesji albo z innego komputera? Wskaż go tym samym
     przyciskiem — panel wczyta to, co w nim jest.
3. **Raz:** zakładka **Ustawienia** → wpisz **nazwę klubu** (trafia do nagłówka pliku
   dla sieci), **próg krótkiej daty** (domyślnie 30 dni) i **domyślną tolerancję** spisu.

> **Firefox/Safari** nie umieją zapisywać do folderu. Panel tam działa, ale dane
> siedzą tylko w przeglądarce — wymiana i kopie idą przez „Eksportuj kopię (JSON)”
> i „Importuj”.

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
3. W okienku podaj **ile dni sprzedaży wstecz** pobrać (domyślnie 14 — przy spisie co
   niedzielę to z zapasem). Okno musi pokryć czas **od ostatniego snapshotu** — inaczej panel ostrzeże, że rozbieżność księgowa
   policzy się na za krótkim oknie.
4. **Jeśli wyskoczy prośba o token** — kliknij dowolną pozycję w menu Glofox (np.
   **Members**). Skrypt złapie świeży token z ruchu i ruszy dalej (do 25 s).
5. Pobierze się **`glofox-snapshot-RRRR-MM-DD.json`**. Gotowe.

> Wariant awaryjny (bez paska zakładek): na karcie Glofox **F12 → Console**, wklej całą
> zawartość `src/bridge/glofox-grab.bookmarklet.js`, Enter. Patrz zakładka „Pobierz dane".

---

## CZĘŚĆ C. Pierwsza inwentaryzacja (stan bazowy)

1. Upewnij się, że masz podpięty folder danych (część A, krok 2) — badge „Zapisywane do folderu … ✓".
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

## CZĘŚĆ E2. Krótkie daty ważności

Sieć wymaga kolumn „Krótka data ważności” i „Ilość sztuk z krótką datą”. Wpisujesz je
w osobnej zakładce — **spis zostaje czysty**, żeby skanowanie szło szybko.

1. Zakładka **Daty ważności** → wyszukaj produkt → **Wybierz**.
2. Wpisz **datę z opakowania** i **ilość sztuk**, opcjonalnie uwagę (np. „przecena −30%”)
   → **Dodaj partię**.
3. Lista pokazuje status: **przeterminowane** / **krótka data** (w progu z Ustawień) / **ok**.
4. Gdy towar zejdzie albo go wycofasz — kliknij **„wycofano"**. Partia znika z listy,
   ale ślad zostaje w pliku danych.

> Do eksportu dla sieci trafia **najbliższa data** i **suma sztuk** w progu — dokładnie
> jak w kolumnach F i G wzoru.

---

## CZĘŚĆ E3. Zamówienia (ile domówić)

Zakładka **Zamówienia** odpowiada na krok 4 instrukcji sieci („porównaj z poprzednim
tygodniem i oceń, czy złożyć zamówienie”).

- **Stan bieżący** = spis z natury, a gdy pozycji nie policzono — stan z Glofoxa
  (oznaczone dopiskiem; przy ubytkach Glofox zawyża).
- **Zużycie / tydz.** = sprzedaż z okna między dwoma ostatnimi snapshotami przeliczona
  na 7 dni. Przy pierwszym spisie jeszcze go nie ma — pojawi się po następnym.
- **Minimum** wpisujesz raz na produkt. Szybciej: **„min = zużycie tyg. (wszystkie)"**
  ustawi minima na poziomie tygodniowej rotacji; potem korygujesz ręcznie.
- **Do zamówienia** = minimum − stan bieżący. **Pokrycie < 1 tygodnia** (na czerwono)
  znaczy, że towar skończy się przed następną niedzielą.
- **Eksportuj zamówienie (CSV)** — lista tylko z pozycjami do domówienia.

---

## CZĘŚĆ E4. Oddanie wyników do sieci

W zakładce **Spis (audyt)** (albo później w **Raporcie**, przy zapisanym audycie):

- **„Wzór sieci (XLSX)"** — gotowy plik w układzie „WZÓR INWENTARYZACJA”: nazwa klubu
  i data w nagłówku, kolumny A–H, formuła w kolumnie „Różnica”. Otwierasz w Excelu
  i wysyłasz.
- **„Wzór sieci (CSV)"** — gdy sieć każe wklejać do arkusza online.
- Checkbox **„także pozycje bez stanu"** dokłada resztę katalogu (domyślnie eksport
  pomija pozycje, które mają stan 0 i nie były liczone).

> **Uwaga na znak!** W naszym panelu **manko dodatnie = brakuje na półce**.
> W pliku sieci jest odwrotnie: **„Różnica” ujemna = brakuje**. Eksport przelicza to
> automatycznie — nie poprawiaj ręcznie.

---

## CZĘŚĆ E5. Kopie zapasowe i drugi komputer

**Kopie robią się same.** Przy pierwszym zapisie danego dnia panel odkłada
`backups/inwentaryzacja-RRRR-MM-DD.json` i trzyma **8 ostatnich**. Przycisk
**„Zrób kopię teraz"** wymusza kopię poza kolejnością (nadpisuje dzisiejszą).

**Chcesz wrócić do stanu sprzed tygodnia?** Kliknij **„Importuj"**, wskaż plik
z `backups/` — panel **scali** go z bieżącym stanem (nic nie przepadnie).

**Praca na dwóch komputerach (np. recepcja + biuro):**
1. Na komputerze A: **„Eksportuj kopię (JSON)"** albo po prostu skopiuj
   `inwentaryzacja.json` z folderu danych (pendrive, OneDrive, mail).
2. Na komputerze B: **„Importuj"** i wskaż ten plik.
3. Panel pokaże, co doszło: *„Scalono plik z 2026-08-30: +280 zdarzeń, +1 audytów,
   +3 partie"*. Praca z obu komputerów jest razem — nic się nie nadpisuje.
4. Ten sam plik możesz zaimportować drugi raz; wyjdzie **+0 zdarzeń**.

> Jedyny wyjątek: partia z krótką datą **wycofana** na jednym komputerze zostaje
> wycofana po scaleniu (import starszego pliku nie „wskrzesi” zdjętego towaru).

---

## CZĘŚĆ F. Następny raz

1. Otwórz link do panelu. Jeśli badge pokazuje **„Wznów zapis do folderu"** —
   kliknij go (przeglądarka prosi o zgodę). Dane wczytają się z folderu same.
2. Dalej normalnie: pobierz snapshot (B), dostawy (D), spis (E), daty ważności (E2),
   zamówienia (E3), plik dla sieci (E4). Nic nie eksportujesz „na zapas” — wszystko
   zapisuje się na bieżąco do pliku danych.

> Tylko w przeglądarce bez auto-zapisu (np. Firefox): wracasz przyciskiem **„Importuj"**
> do ostatniego raportu i na końcu **„Eksportuj kopię (JSON)"**, jak w starym trybie.

---

## Jak czytać wyniki

| Sygnał | Co znaczy | Co robić |
|--------|-----------|----------|
| **Manko dodatnie** ⚠ | Na półce jest mniej niż mówi Glofox | Realny ubytek: kradzież / rozdawanie / stłuczka / błąd liczenia |
| Manko ujemne | Na półce jest więcej niż w Glofox | Niewbita sprzedaż, niewprowadzona dostawa, pomyłka w liczeniu |
| **Rozbieżność księgowa ≠ 0** | Stan Glofox ruszył inaczej niż (poprz. + dostawy − sprzedaż) | Błąd ewidencji w samym Glofox (ręczna korekta stanu, write-off) |
| **Powtarzające się manko** ⚠⚠ | Ten sam produkt znika dwa spisy z rzędu (Raport) | Najmocniejszy sygnał: pomyłka w liczeniu się nie powtarza. Sprawdź, kto stał na kasie (Sprzedaż) |
| Pokrycie < 1 tyg. (Zamówienia) | Towar skończy się przed następną niedzielą | Domów przy najbliższym zamówieniu |
| Dużo „linii bez dopasowania" w Console | Nazwy sprzedaży nie pasują do katalogu | Sprawdź, czy nie zmieniono nazw produktów; zgłoś do dostrojenia |

---

## Najczęstsze problemy

- **401 / okienko o token** → token w localStorage był nieaktualny. Kliknij coś w menu
  Glofox (np. Members), żeby skrypt złapił świeży token z żywego ruchu. Jeśli dalej nie idzie
  — wyloguj się i zaloguj ponownie do Glofox.
- **Pusto po imporcie** → zaimportowano zły plik. Snapshot zaczyna się od `capturedAt`,
  raport od `generatedAt`. Panel sam rozpoznaje typ — sprawdź komunikat u góry.
- **Stary stan po odświeżeniu** → to kopia awaryjna z przeglądarki. „Wyczyść stan" zaczyna
  od zera (najpierw zrób kopię, jeśli chcesz go zachować!).
- **Spis na kilku stanowiskach** → licz, gdzie chcesz, a potem przenieś plik i zaimportuj —
  panel scala pracę z obu komputerów (część E5).
- **Nie widzę przycisku „Wybierz folder danych"** → jesteś w Firefoksie/Safari. Wejdź
  w Chrome lub Edge, albo pracuj na eksporcie/imporcie JSON.
