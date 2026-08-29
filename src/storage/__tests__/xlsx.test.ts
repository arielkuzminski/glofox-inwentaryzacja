import { describe, it, expect } from "vitest";
import { sheetXml, zipStore, buildXlsx, crc32 } from "../xlsx";
import { FranchiseRow } from "../franchise";

/** Minimalny czytnik ZIP „stored" — pozwala sprawdzić roundtrip bez zależności. */
function readStoredZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of Central Directory: sygnatura 0x06054b50, szukana od końca.
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error("brak End of Central Directory");

  const total = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();

  for (let i = 0; i < total; i += 1) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("zły wpis CD");
    const size = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

    if (view.getUint32(localOffset, true) !== 0x04034b50)
      throw new Error("zły nagłówek lokalny");
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    out.set(name, dec.decode(bytes.subarray(dataStart, dataStart + size)));

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const OPTS = { clubName: "XFG Lębork", countedAt: "2026-08-30T19:05:00" };

function row(over: Partial<FranchiseRow> = {}): FranchiseRow {
  return {
    lp: 1,
    name: "Woda Kropla Beskidu 0.75L",
    systemStock: 12,
    physicalCount: 10,
    difference: -2,
    expiryDate: null,
    expiryQty: null,
    note: null,
    ...over,
  };
}

describe("crc32", () => {
  it("liczy znaną sumę kontrolną", () => {
    // CRC-32 of "123456789" — standardowy wektor testowy.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("sheetXml", () => {
  it("wpisuje nazwę klubu w B2 i datę spisu w C2", () => {
    const xml = sheetXml([row()], OPTS);
    expect(xml).toContain('<c r="B2" t="inlineStr"><is><t>XFG Lębork</t></is></c>');
    expect(xml).toContain('<c r="C2" t="inlineStr"><is><t>2026-08-30 19:05</t></is></c>');
  });

  it("stawia nagłówki wzoru w wierszu 6, a dane od wiersza 7", () => {
    const xml = sheetXml([row()], OPTS);
    expect(xml).toContain('<c r="A6" t="inlineStr"><is><t>Lp.</t></is></c>');
    expect(xml).toContain("<t>Nazwa produktu ze sklepu</t>");
    expect(xml).toContain('<c r="A7"><v>1</v></c>');
    expect(xml).toContain("<t>Woda Kropla Beskidu 0.75L</t>");
    expect(xml).toContain('<c r="C7"><v>12</v></c>');
    expect(xml).toContain('<c r="D7"><v>10</v></c>');
  });

  it("w kolumnie Różnica zapisuje formułę wzoru z wartością cache", () => {
    const xml = sheetXml([row()], OPTS);
    expect(xml).toContain('<c r="E7"><f>D7-C7</f><v>-2</v></c>');
  });

  it("pozycji niepoliczonej nie wypełnia — brak komórek D i E", () => {
    const xml = sheetXml([row({ physicalCount: null, difference: null })], OPTS);
    expect(xml).not.toContain('r="D7"');
    expect(xml).not.toContain('r="E7"');
  });

  it("escapuje znaki specjalne XML w nazwie", () => {
    const xml = sheetXml([row({ name: 'Sok "Jabłko" & mięta <0.3L>' })], OPTS);
    expect(xml).toContain("<t>Sok &quot;Jabłko&quot; &amp; mięta &lt;0.3L&gt;</t>");
    expect(xml).not.toContain("& mięta");
  });

  it("wypełnia kolumny krótkiej daty i uwag", () => {
    const xml = sheetXml(
      [row({ expiryDate: "2026-09-10", expiryQty: 3, note: "stłuczka" })],
      OPTS,
    );
    expect(xml).toContain("<t>2026-09-10</t>");
    expect(xml).toContain('<c r="G7"><v>3</v></c>');
    expect(xml).toContain("<t>stłuczka</t>");
  });
});

describe("zipStore", () => {
  it("tworzy archiwum, z którego da się odczytać zapisane pliki", () => {
    const enc = new TextEncoder();
    const zip = zipStore([
      { name: "a.txt", data: enc.encode("alfa") },
      { name: "dir/b.xml", data: enc.encode("<x>ą</x>") },
    ]);

    const files = readStoredZip(zip);
    expect(files.get("a.txt")).toBe("alfa");
    expect(files.get("dir/b.xml")).toBe("<x>ą</x>");
  });
});

describe("buildXlsx", () => {
  it("składa poprawny skoroszyt z arkuszem i częściami OPC", async () => {
    const blob = buildXlsx([row()], OPTS);
    const files = readStoredZip(new Uint8Array(await blob.arrayBuffer()));

    expect([...files.keys()]).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/worksheets/sheet1.xml",
      ]),
    );
    expect(files.get("xl/worksheets/sheet1.xml")).toBe(sheetXml([row()], OPTS));
    expect(files.get("xl/workbook.xml")).toContain("<sheet ");
  });
});
