import { BOOKMARKLET } from "../bridge/bookmarklet.generated";

// Zakładka „Pobierz dane": przeciągany bookmarklet zamiast wklejania do konsoli co cykl.
export function BridgeView() {
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
              <a className="bookmarklet" href={BOOKMARKLET}>
                Glofox → snapshot
              </a>
            </div>
            <span className="muted">
              Pasek zakładek: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>. Kliknięcie
              tutaj nic nie zrobi — link trzeba <em>przeciągnąć</em>.
            </span>
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
