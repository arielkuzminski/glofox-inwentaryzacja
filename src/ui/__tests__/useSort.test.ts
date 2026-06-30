// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSort } from "../useSort";

type Row = { name: string; units: number };

const rows: Row[] = [
  { name: "Banana", units: 5 },
  { name: "Apple", units: 10 },
  { name: "Cherry", units: 1 },
];

const accessors = {
  name: (r: Row) => r.name,
  units: (r: Row) => r.units,
};

describe("useSort", () => {
  it("zwraca dane bez zmiany kolejności przed kliknięciem", () => {
    const { result } = renderHook(() => useSort(rows, accessors));
    expect(result.current.sorted.map((r) => r.name)).toEqual([
      "Banana",
      "Apple",
      "Cherry",
    ]);
  });

  it("sortuje rosnąco po pierwszym kliknięciu kolumny tekstowej", () => {
    const { result } = renderHook(() => useSort(rows, accessors));
    act(() => result.current.toggle("name"));
    expect(result.current.sorted.map((r) => r.name)).toEqual([
      "Apple",
      "Banana",
      "Cherry",
    ]);
    expect(result.current.sortDir).toBe("asc");
  });

  it("odwraca kierunek po drugim kliknięciu tej samej kolumny", () => {
    const { result } = renderHook(() => useSort(rows, accessors));
    act(() => result.current.toggle("units"));
    act(() => result.current.toggle("units"));
    expect(result.current.sorted.map((r) => r.units)).toEqual([10, 5, 1]);
    expect(result.current.sortDir).toBe("desc");
  });

  it("resetuje kierunek do asc po przełączeniu na inną kolumnę", () => {
    const { result } = renderHook(() => useSort(rows, accessors));
    act(() => result.current.toggle("units"));
    act(() => result.current.toggle("units"));
    act(() => result.current.toggle("name"));
    expect(result.current.sortKey).toBe("name");
    expect(result.current.sortDir).toBe("asc");
    expect(result.current.sorted.map((r) => r.name)).toEqual([
      "Apple",
      "Banana",
      "Cherry",
    ]);
  });

  it("wartości null zawsze lądują na końcu", () => {
    type WithNull = { label: string; val: number | null };
    const withNulls: WithNull[] = [
      { label: "a", val: 2 },
      { label: "b", val: null },
      { label: "c", val: 1 },
    ];
    const { result } = renderHook(() =>
      useSort(withNulls, { val: (r: WithNull) => r.val }),
    );
    act(() => result.current.toggle("val"));
    expect(result.current.sorted.map((r) => r.label)).toEqual(["c", "a", "b"]);
    act(() => result.current.toggle("val"));
    expect(result.current.sorted.map((r) => r.label)).toEqual(["a", "c", "b"]);
  });
});
