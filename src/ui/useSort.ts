import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
export type SortAccessors<T> = Record<string, (row: T) => string | number | null>;

export function useSort<T>(rows: T[], accessors: SortAccessors<T>) {
  const [key, setKey] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>("asc");

  function toggle(k: string) {
    if (k === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setKey(k);
      setDir("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!key) return rows;
    const accessor = accessors[key];
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "pl");
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, key, dir, accessors]);

  function arrow(k: string) {
    if (k !== key) return null;
    return dir === "asc" ? " ▲" : " ▼";
  }

  return { sorted, sortKey: key, sortDir: dir, toggle, arrow };
}
