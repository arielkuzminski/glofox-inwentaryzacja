/*
 * GLOFOX SNAPSHOT GRABBER — most danych dla modułu inwentaryzacji.
 *
 * DLACZEGO: samodzielny SPA (localhost / GitHub Pages) nie ma tokenu sesji Glofox
 * i odbije się o CORS. Ten skrypt odpalasz NA app.glofox.com (zalogowany jako ADMIN),
 * gdzie potrafi przechwycić JWT i zawołać API same-origin. Zrzuca snapshot.json,
 * który importujesz w panelu.
 *
 * UŻYCIE:
 *   1. Zaloguj się na https://app.glofox.com, wejdź na dashboard → Store.
 *   2. DevTools → Console, wklej całą zawartość pliku, Enter.
 *   3. Pobierze się glofox-snapshot-RRRR-MM-DD.json → zaimportuj w module.
 *
 * Albo bookmarklet: zminifikuj i poprzedź `javascript:`.
 *
 * AUTH (potwierdzone): listview WYMAGA `Authorization: Bearer <jwt>` + nagłówków
 * x-glofox-*. Token i branch_id czytamy z localStorage/sessionStorage (JWT payload
 * → user.branch_id). Wzorzec z glofox-users-manager/glofox-bulk-task-creator.js.
 */
(async function glofoxGrab() {
  // listview działa jak infinity scroll → duży pageSize pobiera wszystko naraz.
  const STOCK_URL = "https://app.glofox.com/products/listview/1/9999/null/1";

  // Sprzedaż: drilldown po pozycjach. Okno = od poprzedniego snapshotu do dziś —
  // inaczej rozbieżność księgowa (prev + dostawy − sprzedaż) liczy się na złym oknie.
  // Domyślnie 14 dni: sieć wymaga spisu co tydzień (niedziela), więc dwa tygodnie
  // z zapasem pokrywają przerwę. Zakres trafia do snapshotu, żeby panel ostrzegł,
  // gdy jednak nie pokrywa przerwy między snapshotami.
  const DEFAULT_DAYS_BACK = 14;
  let SALES_DAYS_BACK = DEFAULT_DAYS_BACK;
  {
    const ans = prompt(
      "Sprzedaż — ile dni wstecz pobrać?\n" +
        "Okno musi pokryć czas od ostatniego spisu (przy rytmie tygodniowym 14 dni wystarczy).",
      String(DEFAULT_DAYS_BACK),
    );
    const n = ans === null ? DEFAULT_DAYS_BACK : parseInt(ans, 10);
    if (!Number.isNaN(n) && n > 0) SALES_DAYS_BACK = n;
  }

  // --- Auth: token z ŻYWEGO ruchu Glofox -------------------------------
  // Glofox trzyma świeży token w pamięci (refresh flow); localStorage bywa
  // NIEAKTUALNY → wcześniejsze skanowanie storage dawało 401. Łapiemy token
  // z requestów, które Glofox wysyła sam (patch fetch + XHR), a storage to fallback.
  const auth = { token: "", branchId: "" };

  function jwtPayload(token) {
    const p = String(token || "").split(".");
    if (p.length < 2) return null;
    try {
      const b64 = p[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }
  function pickJwt(raw) {
    const s = String(raw || "");
    const m =
      s.match(/Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)/i) ||
      s.match(/\b([\w-]+\.[\w-]+\.[\w-]+)\b/);
    return m && m[1] ? m[1] : "";
  }
  function isExpired(token) {
    const p = jwtPayload(token);
    if (!p || !p.exp) return false; // brak exp → nie odrzucamy
    return Date.now() / 1000 >= p.exp - 30; // 30 s zapasu
  }
  function setToken(raw) {
    const t = pickJwt(raw);
    if (!t || isExpired(t)) return false;
    const p = jwtPayload(t);
    const b = p && p.user ? p.user.branch_id : "";
    if (!b) return false;
    auth.token = t;
    auth.branchId = String(b);
    return true;
  }
  function readHeaders(h) {
    try {
      if (!h) return;
      if (h instanceof Headers) return void setToken(h.get("authorization"));
      if (Array.isArray(h))
        return void h.forEach((pair) => {
          if (String(pair[0]).toLowerCase() === "authorization") setToken(pair[1]);
        });
      if (typeof h === "object")
        Object.keys(h).forEach((k) => {
          if (k.toLowerCase() === "authorization") setToken(h[k]);
        });
    } catch {
      /* noop */
    }
  }
  // Patch: łap Authorization z requestów Glofox (axios używa XHR → setRequestHeader).
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      readHeaders(init && init.headers);
      if (input && input.headers) readHeaders(input.headers);
    } catch {
      /* noop */
    }
    return _fetch.apply(this, arguments);
  };
  const _setHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (String(k).toLowerCase() === "authorization") setToken(v);
    return _setHeader.apply(this, arguments);
  };

  function scanStorage() {
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i += 1) {
        const val = store.getItem(store.key(i));
        if (!val) continue;
        if (setToken(val)) return true;
        try {
          const o = JSON.parse(val);
          if (setToken(o.token || o.accessToken || o.access_token || o.id_token))
            return true;
        } catch {
          /* not json */
        }
      }
    }
    return false;
  }
  function waitForToken(ms) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (auth.token || Date.now() - t0 > ms) {
          clearInterval(iv);
          resolve(!!auth.token);
        }
      }, 250);
    });
  }

  // Najpierw spróbuj niewygasłego tokenu ze storage (szybka ścieżka).
  scanStorage();

  async function ensureToken() {
    if (auth.token) return;
    alert(
      "glofox-grab: potrzebuję świeżego tokenu. Kliknij dowolną pozycję w menu " +
        "Glofox (np. Members / Reports) — złapię token i ruszę dalej (do 25 s).",
    );
    if (!(await waitForToken(25000))) {
      throw new Error(
        "Brak tokenu. Upewnij się, że jesteś zalogowany, kliknij coś w Glofox i spróbuj ponownie.",
      );
    }
  }

  async function getJson(url) {
    const call = () =>
      fetch(url, {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "x-glofox-branch-id": auth.branchId,
          "x-glofox-source": "dashboard",
          Accept: "application/json, text/plain, */*",
        },
      });
    await ensureToken();
    let res = await call();
    if (res.status === 401) {
      auth.token = ""; // token padł → poczekaj na świeży z żywego ruchu
      await ensureToken();
      res = await call();
    }
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.json();
  }

  function mapProducts(raw) {
    // Odpowiedź to goła tablica { Product: {...} } (potwierdzone 2026-06-30).
    const arr = Array.isArray(raw) ? raw : raw?.data ?? raw?.products ?? [];
    const out = [];
    for (const item of arr) {
      const p = item.Product || item;
      if (!p || !p._id || !Array.isArray(p.presentations)) continue;
      out.push({
        productId: p._id,
        name: p.name ?? p._id, // EAN bywa wbity w name; brak osobnego SKU
        presentations: p.presentations.map((pr) => ({
          presentationId: String(pr.id ?? pr._id ?? ""),
          name: pr.name ?? "", // Glofox nie nazywa wariantów
          stock: Number(pr.stock ?? 0),
          price: Number(pr.retail_price ?? 0),
          wholesalePrice: Number(pr.wholesale_price ?? 0),
        })),
      });
    }
    return out;
  }

  // Endpoint sprzedaży nie zwraca ID produktu/wariantu — łączymy po NAZWIE.
  function normName(s) {
    return String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  }
  function buildNameIndex(products) {
    const idx = new Map();
    for (const p of products) {
      const pres = p.presentations[0]; // sprzedaż nie rozróżnia wariantu → bierzemy pierwszy
      if (!pres) continue;
      idx.set(normName(p.name), {
        productId: p.productId,
        presentationId: pres.presentationId,
      });
    }
    return idx;
  }
  function mapSales(raw, nameIndex) {
    const rows = raw?.drilldown ?? [];
    const out = [];
    let unmatched = 0;
    for (const r of rows) {
      if (r.revenue_stream_type !== "Products") continue; // pomiń usługi/opłaty
      const match = nameIndex.get(normName(r.invoice_item_name));
      if (!match) {
        unmatched += 1; // kaucje, wejścia, zamrożenia, towar spoza katalogu
        continue;
      }
      out.push({
        orderId: String(r.invoice_item_id),
        productId: match.productId,
        presentationId: match.presentationId,
        qty: Number(r.invoice_item_quantity ?? 0),
        soldAt: r.invoice_created_at
          ? `${r.invoice_created_at}T12:00:00.000Z`
          : new Date().toISOString(),
        staffId: r.sold_by || undefined,
      });
    }
    if (unmatched) {
      console.log(
        `[glofox-grab] sprzedaż: ${unmatched} linii bez dopasowania do katalogu ` +
          "(kaucje/usługi/towar spoza listy) — pominięto.",
      );
    }
    return out;
  }

  function ymd(d) {
    return d.toISOString().slice(0, 10);
  }
  const now = Date.now();
  const salesFrom = ymd(new Date(now - SALES_DAYS_BACK * 86400000));
  const salesTo = ymd(new Date(now + 86400000)); // +1 dzień, by objąć dziś
  function salesUrl() {
    return (
      `https://app.glofox.com/data-api/v1/studios/${auth.branchId}` +
      `/sales/drilldown-by-item-net-sales?date_start=${salesFrom}&date_end=${salesTo}` +
      "&revenue_stream_type=Products"
    );
  }

  try {
    const productsRaw = await getJson(STOCK_URL);
    const products = mapProducts(productsRaw);

    const salesRaw = await getJson(salesUrl());
    const sales = mapSales(salesRaw, buildNameIndex(products));

    const snapshot = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      branchId: auth.branchId,
      products,
      sales,
      salesFrom,
      salesTo,
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `glofox-snapshot-${snapshot.capturedAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    console.log(
      `[glofox-grab] OK: ${snapshot.products.length} produktów, ` +
        `${snapshot.sales.length} linii sprzedaży (branch ${auth.branchId}).`,
    );
  } catch (e) {
    console.error("[glofox-grab] Błąd:", e);
    alert("glofox-grab: " + (e && e.message ? e.message : e));
  }
})();
