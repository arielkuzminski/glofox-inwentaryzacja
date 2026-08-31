import { useState } from "react";
import { BOOKMARKLET } from "../bridge/bookmarklet.generated";

// Zakładka „Pobierz dane": przeciągany bookmarklet zamiast wklejania do konsoli co cykl.
export function BridgeView() {
  const [clicked, setClicked] = useState(false);

  return (
    <>
      <div className="panel">
        <h2>Pobierz dane z Glofox</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Glofox jest na innym serwerze (CORS), więc panel nie pobierze stanu sam.
          Robi to bookmarklet odpalany na zalogowanym <code>app.glofox.com</code> —
          zrzuca <code>glofox-snapshot-RRRR-MM-DD.json</code>, który importujesz u góry.
        </p>

        <ol style={{ lineHeight: 1.8 }}>
          <li>
            <strong>Przeciągnij ten przycisk na pasek zakładek</strong> (raz):
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              {/*
                Kliknięcie TU odpalałoby bookmarklet na naszej stronie, gdzie nie ma
                tokenu Glofoxa — użytkownik dostawał wtedy mylące „potrzebuję świeżego
                tokenu" i szukał błędu w imporcie. href zostaje (bez niego nie da się
                przeciągnąć), ale klik blokujemy i tłumaczymy, co zrobić.
              */}
              <a
                className="bookmarklet"
                href={BOOKMARKLET}
                onClick={(e) => {
                  e.preventDefault();
                  setClicked(true);
                }}
              >
                Glofox → snapshot
              </a>
            </div>
            <span className="muted">
              Pasek <strong>zakładek</strong> (nie pasek adresu — Chrome wycina z niego{" "}
              <code>javascript:</code>): <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>.
              Link trzeba <em>przeciągnąć</em>, a potem kliknąć{" "}
              <strong>na karcie Glofoxa</strong>.
            </span>
            {clicked && (
              <p className="warn" style={{ marginTop: 8, marginBottom: 0 }}>
                <strong>Nie klikaj go tutaj</strong> — na tej stronie nie ma tokenu
                Glofoxa, więc skrypt poprosiłby o niego bez sensu. Przeciągnij ten
                przycisk na pasek zakładek, wejdź na <code>app.glofox.com</code>{" "}
                (zalogowany jako admin) i kliknij zakładkę <em>tam</em>.
              </p>
            )}
          </li>
          <li>
            Zaloguj się na <code>app.glofox.com</code> jako <strong>admin</strong> →
            dashboard → <strong>Store</strong>.
          </li>
          <li>
            Kliknij zakładkę <strong>„Glofox → snapshot"</strong>. Podaj, ile dni
            sprzedaży wstecz pobrać (okno musi pokryć czas od ostatniego snapshotu).
          </li>
          <li>
            Jeśli wyskoczy prośba o token — kliknij coś w menu Glofox (np.{" "}
            <strong>Members</strong>); skrypt złapie świeży token i ruszy dalej.
          </li>
          <li>
            Pobierze się <code>glofox-snapshot-…json</code> → wróć tu i kliknij u góry{" "}
            <strong>„Importuj snapshot z bookmarkletu"</strong>.
          </li>
        </ol>
      </div>

      <div className="panel">
        <h2>Wariant awaryjny (bez przeciągania)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Gdyby pasek zakładek był niedostępny: na karcie Glofox otwórz{" "}
          <strong>F12 → Console</strong>, wklej całą zawartość pliku{" "}
          <code>src/bridge/glofox-grab.bookmarklet.js</code> i naciśnij Enter.
        </p>
      </div>
    </>
  );
}
