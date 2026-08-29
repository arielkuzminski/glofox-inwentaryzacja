/*
 * Smoke test end-to-end w prawdziwej przeglądarce: przechodzi tygodniową ścieżkę
 * menadżera klubu i sprawdza, że plik dla sieci wychodzi z aplikacji poprawny.
 *
 * UŻYCIE:
 *   npm run dev          # w osobnym terminalu (panel na :5173)
 *   npm run e2e
 *
 * Zmienne: BASE_URL (domyślnie http://localhost:5173), OUT (katalog na pobrany plik).
 *
 * UWAGA: `chromium.launch()` bez executablePath odpala `chrome-headless-shell`,
 * który w WSL nie startuje mimo kompletu bibliotek — dlatego szukamy pełnej binarki
 * (katalog `chrome-linux64`, nie `chrome-linux`). Wymagane pakiety systemowe:
 * `sudo apt install -y libnspr4 libnss3 libasound2`.
 */
import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";
const OUT = process.env.OUT ?? tmpdir();
const SNAP = resolve(ROOT, "real_data/glofox-snapshot-2026-06-30.json");

const log = (...a) => console.log("•", ...a);

/** Pełny chromium z cache Playwrighta; null → domyślna binarka (może być shell). */
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(homedir(), ".cache/ms-playwright");
  if (!existsSync(base)) return null;
  const dir = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .pop();
  if (!dir) return null;
  const bin = resolve(base, dir, "chrome-linux64/chrome");
  return existsSync(bin) ? bin : null;
}

if (!existsSync(SNAP)) {
  console.error(`Brak snapshotu ${SNAP} — test potrzebuje realnych danych z real_data/.`);
  process.exit(1);
}

const executablePath = findChromium() ?? undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ acceptDownloads: true });
page.on("pageerror", (e) => {
  console.error("!! błąd na stronie:", e.message);
  process.exitCode = 1;
});

try {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  // 1) Ustawienia klubu — nazwa trafia do nagłówka pliku dla sieci.
  await page.getByRole("button", { name: "Ustawienia" }).click();
  await page.getByPlaceholder("np. XFG Lębork").fill("XFG Lębork");
  log("nazwa klubu ustawiona");

  // 2) Import realnego snapshotu.
  await page.setInputFiles('input[type="file"]', SNAP);
  const imported = (await page.locator("p.ok").first().textContent())?.trim();
  assert.match(imported ?? "", /Zaimportowano snapshot/, "import snapshotu nie powiódł się");
  log(imported);

  // 3) Spis: policz pozycję i dopisz uwagę.
  await page.getByRole("button", { name: "Spis (audyt)" }).click();
  await page.getByPlaceholder("zeskanuj kod albo wpisz: woda 0.75").fill("woda kropla 0.75");
  const row = page.locator("tbody tr").first();
  await row.locator('input[type="number"]').fill("30");
  await row.locator('input[placeholder="uwaga…"]').fill("kontrola e2e");
  await row.locator('input[placeholder="uwaga…"]').blur();
  await page.waitForTimeout(300);
  assert.equal(await row.locator("td").nth(4).textContent(), "8", "manko ≠ 38 − 30");
  log("spis: stan 38, policzone 30 → manko 8");

  // 4) Krótka data ważności.
  await page.getByRole("button", { name: "Daty ważności" }).click();
  await page.getByPlaceholder("np. baton albo 5900617013064").fill("woda kropla 0.75");
  await page.getByRole("button", { name: "Wybierz" }).first().click();
  await page.locator("#exp-date").fill("2026-07-05");
  await page.locator("#exp-qty").fill("3");
  await page.getByRole("button", { name: "Dodaj partię" }).click();
  await page.waitForTimeout(300);
  assert.match(
    (await page.locator(".stat").first().textContent()) ?? "",
    /1\s*partii do pilnowania/,
    "partia z krótką datą nie doszła",
  );
  log("data ważności dodana");

  // 5) Zamówienia — bez ustawionych minimów nic nie rekomendujemy.
  await page.getByRole("button", { name: "Zamówienia" }).click();
  await page.waitForTimeout(300);
  log("zamówienia:", (await page.locator(".stat").first().textContent())?.replace(/\s+/g, " "));

  // 6) F5 — spis musi przeżyć odświeżenie (autosave).
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Spis (audyt)" }).click();
  await page.getByPlaceholder("zeskanuj kod albo wpisz: woda 0.75").fill("woda kropla 0.75");
  await page.waitForTimeout(300);
  assert.equal(
    await page.locator("tbody tr").first().locator("td").nth(4).textContent(),
    "8",
    "spis nie przeżył odświeżenia strony",
  );
  log("po F5 spis na miejscu");

  // 7) Eksport dla sieci + weryfikacja zawartości pobranego pliku.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Wzór sieci (XLSX)" }).click(),
  ]);
  const path = resolve(OUT, download.suggestedFilename());
  await download.saveAs(path);
  const sheet = await readSheet(await download.createReadStream());
  assert.match(sheet, /XFG Lębork/, "brak nazwy klubu w B2");
  assert.match(sheet, /<f>D\d+-C\d+<\/f><v>-8<\/v>/, "brak formuły Różnicy z wynikiem -8");
  assert.match(sheet, /2026-07-05/, "brak daty ważności w kolumnie F");
  assert.match(sheet, /kontrola e2e/, "brak uwagi w kolumnie H");
  log("pobrano i zweryfikowano:", download.suggestedFilename());

  console.log("\n✓ E2E przeszedł");
} finally {
  await browser.close();
}

/** Wyciąga sheet1.xml z pobranego .xlsx (wpisy zapisujemy metodą „stored"). */
function readSheet(stream) {
  return new Promise((res, rej) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("error", rej);
    stream.on("end", () => {
      const buf = Buffer.concat(chunks);
      const start = buf.indexOf("<worksheet");
      const end = buf.indexOf("</worksheet>") + "</worksheet>".length;
      if (start < 0 || end < start) rej(new Error("nie znaleziono arkusza w pliku"));
      else res(buf.subarray(start, end).toString("utf8"));
    });
  });
}
