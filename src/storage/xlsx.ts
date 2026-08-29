// Minimalny writer XLSX — tyle formatu OOXML, ile potrzeba do odtworzenia pliku
// „WZÓR INWENTARYZACJA 2026". Bez zależności: archiwum ZIP zapisujemy metodą
// „stored" (bez kompresji), teksty jako inlineStr (bez sharedStrings).
// Przy ~230 wierszach brak kompresji nie ma znaczenia, a znika cały łańcuch dostaw.

import { FRANCHISE_HEADERS, FranchiseRow } from "./franchise";

export interface XlsxOptions {
  clubName: string;
  /** ISO czasu spisu — w nagłówku pokazujemy czas LOKALNY klubu. */
  countedAt: string;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Archiwum ZIP bez kompresji (metoda 0). Kolejność wpisów = kolejność wejścia. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);

    const local = new Uint8Array(30 + name.length + e.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // wersja
    lv.setUint16(6, 0x0800, true); // flaga: nazwy w UTF-8
    lv.setUint16(8, 0, true); // metoda: stored
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(e.data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, eocd];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function text(ref: string, value: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
}

function num(ref: string, value: number): string {
  return `<c r="${ref}"><v>${value}</v></c>`;
}

/** „YYYY-MM-DD HH:MM" w czasie lokalnym klubu — nagłówek C2 wzoru. */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}`
  );
}

const COLS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
const HEADER_ROW = 6;

export function sheetXml(rows: FranchiseRow[], opts: XlsxOptions): string {
  const out: string[] = [];

  out.push(
    `<row r="2">${text("B2", opts.clubName)}${text(
      "C2",
      formatStamp(opts.countedAt),
    )}</row>`,
  );

  out.push(
    `<row r="${HEADER_ROW}">` +
      FRANCHISE_HEADERS.map((h, i) => text(`${COLS[i]}${HEADER_ROW}`, h)).join("") +
      "</row>",
  );

  rows.forEach((r, i) => {
    const n = HEADER_ROW + 1 + i;
    const cells: string[] = [num(`A${n}`, r.lp), text(`B${n}`, r.name), num(`C${n}`, r.systemStock)];
    // Pozycji niepoliczonej nie zgadujemy: puste D zostawia puste E (formuła =D−C
    // dałaby fałszywe „−stan").
    if (r.physicalCount !== null) {
      cells.push(num(`D${n}`, r.physicalCount));
      cells.push(`<c r="E${n}"><f>D${n}-C${n}</f><v>${r.difference}</v></c>`);
    }
    if (r.expiryDate) cells.push(text(`F${n}`, r.expiryDate));
    if (r.expiryQty !== null) cells.push(num(`G${n}`, r.expiryQty));
    if (r.note) cells.push(text(`H${n}`, r.note));
    out.push(`<row r="${n}">${cells.join("")}</row>`);
  });

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<cols><col min="1" max="1" width="5"/><col min="2" max="2" width="46"/>' +
    '<col min="3" max="5" width="14"/><col min="6" max="6" width="22"/>' +
    '<col min="7" max="7" width="18"/><col min="8" max="8" width="30"/></cols>' +
    `<sheetData>${out.join("")}</sheetData></worksheet>`
  );
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  "</Types>";

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const WORKBOOK =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Arkusz1" sheetId="1" r:id="rId1"/></sheets></workbook>';

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  "</Relationships>";

export function buildXlsx(rows: FranchiseRow[], opts: XlsxOptions): Blob {
  const enc = new TextEncoder();
  const zip = zipStore([
    { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc.encode(WORKBOOK) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(WORKBOOK_RELS) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml(rows, opts)) },
  ]);
  // Blob chce ArrayBuffer, a Uint8Array jest typowany jako ArrayBufferLike.
  return new Blob([zip.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
