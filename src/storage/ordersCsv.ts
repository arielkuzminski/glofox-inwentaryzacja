// Lista zakupowa do wysłania dostawcy / wklejenia w zamówienie.

import { OrderLine } from "../model/orders";
import { csvCell, downloadBlob } from "./file";
import { stripEan } from "./franchise";

export const ORDERS_HEADERS = [
  "Produkt",
  "Stan bieżący",
  "Zużycie / tydzień",
  "Minimum",
  "Do zamówienia",
] as const;

/** Tylko pozycje, które faktycznie trzeba domówić. */
export function ordersToCsv(lines: OrderLine[]): string {
  const body = lines
    .filter((l) => l.toOrder !== null && l.toOrder > 0)
    .map((l) =>
      [
        stripEan(l.productName),
        l.currentStock,
        l.weeklyUsage,
        l.minStock,
        l.toOrder,
      ]
        .map(csvCell)
        .join(";"),
    );
  return [ORDERS_HEADERS.join(";"), ...body].join("\r\n");
}

export function exportOrdersCsv(lines: OrderLine[]): void {
  downloadBlob(
    `zamowienie-${new Date().toISOString().slice(0, 10)}.csv`,
    new Blob(["﻿" + ordersToCsv(lines)], { type: "text/csv;charset=utf-8" }),
  );
}
