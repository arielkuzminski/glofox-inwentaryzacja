// Porównanie dwóch kolejnych spisów. Najmocniejszy sygnał rozdawania towaru:
// pomyłka w liczeniu zdarza się raz, a manko na TYM SAMYM produkcie tydzień
// po tygodniu to wzorzec. Excel sieci tego nie pokaże — porównuje się tam ręcznie.

import { Audit, variantKey } from "./types";

export interface CompareLine {
  productId: string;
  presentationId: string;
  productName: string;
  mankoPrev: number | null;
  mankoCurr: number | null;
  /** Manko ponad próg w OBU spisach i w tym samym kierunku. */
  recurring: boolean;
}

export function compareAudits(
  prev: Audit,
  curr: Audit,
  toleranceUnits: number,
): CompareLine[] {
  const prevByKey = new Map(
    prev.lines.map((l) => [variantKey(l.productId, l.presentationId), l]),
  );

  const out: CompareLine[] = [];
  for (const l of curr.lines) {
    const key = variantKey(l.productId, l.presentationId);
    const before = prevByKey.get(key);
    if (!before) continue; // wariant pojawił się dopiero teraz — nie ma czego porównać

    const a = before.manko;
    const b = l.manko;
    const beyond = (m: number | null) => m !== null && Math.abs(m) > toleranceUnits;
    const sameDirection = a !== null && b !== null && Math.sign(a) === Math.sign(b);

    out.push({
      productId: l.productId,
      presentationId: l.presentationId,
      productName: l.productName,
      mankoPrev: a,
      mankoCurr: b,
      recurring: beyond(a) && beyond(b) && sameDirection,
    });
  }

  return out.sort(
    (x, y) =>
      Math.abs(y.mankoCurr ?? 0) + Math.abs(y.mankoPrev ?? 0) -
      (Math.abs(x.mankoCurr ?? 0) + Math.abs(x.mankoPrev ?? 0)),
  );
}
