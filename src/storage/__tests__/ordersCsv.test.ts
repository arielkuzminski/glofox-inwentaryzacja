import { describe, it, expect } from "vitest";
import { ordersToCsv, ORDERS_HEADERS } from "../ordersCsv";
import { OrderLine } from "../../model/orders";

function line(over: Partial<OrderLine> = {}): OrderLine {
  return {
    productId: "P1",
    presentationId: "V1",
    productName: "5900617013064 Baton; proteinowy",
    currentStock: 8,
    basis: "spis",
    weeklyUsage: 10,
    minStock: 20,
    toOrder: 12,
    weeksOfCover: 0.8,
    unitPrice: 5,
    ...over,
  };
}

describe("ordersToCsv", () => {
  it("eksportuje tylko pozycje do zamówienia, z nazwą bez kodu EAN", () => {
    const csv = ordersToCsv([line(), line({ toOrder: 0 }), line({ toOrder: null })]);
    const rows = csv.split("\r\n");

    expect(rows[0]).toBe(ORDERS_HEADERS.join(";"));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe('"Baton; proteinowy";8;10;20;12');
  });
});
