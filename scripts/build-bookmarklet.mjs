// Minifikuje most danych (src/bridge/glofox-grab.bookmarklet.js) i emituje
// gotowy do przeciągnięcia link `javascript:` jako moduł TS, którego używa
// zakładka „Pobierz dane". esbuild jest już w zależnościach (przez Vite).
import { transform } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "src/bridge/glofox-grab.bookmarklet.js");
const out = resolve(root, "src/bridge/bookmarklet.generated.ts");

const code = await readFile(src, "utf8");
const { code: min } = await transform(code, { minify: true, loader: "js" });
// javascript: URL jest URI-dekodowany przy odpaleniu, więc encodeURIComponent
// bezpiecznie chroni znaki specjalne w zminifikowanym kodzie.
const url = "javascript:" + encodeURIComponent(min.trim());

const ts =
  "// AUTO-GENEROWANE przez scripts/build-bookmarklet.mjs — NIE edytuj ręcznie.\n" +
  "// Źródło: src/bridge/glofox-grab.bookmarklet.js\n" +
  `export const BOOKMARKLET = ${JSON.stringify(url)};\n`;

await writeFile(out, ts, "utf8");
console.log(`[bookmarklet] ${min.length} B kodu → ${out}`);
