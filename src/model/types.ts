// Model domenowy modułu inwentaryzacji Glofox.
// Granularność wszędzie per WARIANT (productId + presentationId) — sumowanie po
// presentations ukryłoby manko na pojedynczym rozmiarze/smaku.

export const SCHEMA_VERSION = 1;

export interface Presentation {
  presentationId: string;
  /** Glofox nie nazywa wariantów — bywa pusty (produkt jednowariantowy). */
  name: string;
  /** Stan magazynowy wg Glofox dla tego wariantu w chwili snapshotu. */
  stock: number;
  /** Cena detaliczna (retail_price) — używana do wyceny manka (mankoValue). */
  price: number;
  /** Cena hurtowa/zakupu (wholesale_price) — opcjonalna wycena straty po koszcie. */
  wholesalePrice?: number;
}

export interface Product {
  productId: string;
  /** Nazwa Glofox; często zawiera prefiks EAN (brak osobnego pola SKU). */
  name: string;
  presentations: Presentation[];
}

export interface SaleLine {
  orderId?: string;
  productId: string;
  presentationId: string;
  qty: number;
  soldAt: string; // ISO
  staffId?: string;
}

/** Surowy zrzut z companion-bookmarkletu odpalanego na app.glofox.com. */
export interface GlofoxSnapshot {
  schemaVersion: number;
  capturedAt: string; // ISO
  branchId?: string;
  products: Product[];
  sales: SaleLine[];
  /** Zakres dat okna sprzedaży użytego przy pobraniu (YYYY-MM-DD) — do kontroli pokrycia. */
  salesFrom?: string;
  salesTo?: string;
}

export type LedgerEventType =
  | "SNAPSHOT" // absolutny stan Glofox dla wariantu w chwili capturedAt
  | "DELIVERY" // dostawa (delta dodatnia)
  | "SALES_IMPORT" // sprzedaż z endpointu (delta ujemna)
  | "PHYSICAL_COUNT" // spis z natury (absolutny)
  | "COUNT_NOTE" // uwaga do pozycji spisu (qty=0, nie rusza stanu)
  | "ADJUSTMENT"; // ręczna korekta (delta)

export interface LedgerEvent {
  id: string;
  type: LedgerEventType;
  at: string; // ISO — moment, którego dotyczy zdarzenie
  productId: string;
  presentationId: string;
  /**
   * SNAPSHOT / PHYSICAL_COUNT → wartość ABSOLUTNA (zaobserwowany stan).
   * DELIVERY / SALES_IMPORT / ADJUSTMENT → DELTA (sprzedaż ujemna).
   * COUNT_NOTE → zawsze 0; treść jest w `note`.
   */
  qty: number;
  unitPrice?: number;
  /** Kto sprzedał (sold_by) — wypełniane dla SALES_IMPORT. */
  staffId?: string;
  note?: string;
  /** Pochodzenie: capturedAt snapshotu, "manual", itd. — ślad audytu. */
  source: string;
}

export interface AuditLine {
  productId: string;
  presentationId: string;
  productName: string;
  presentationName: string;
  unitPrice: number;
  /** Stan wg Glofox w chwili snapshotu audytu. */
  systemStock: number;
  /** Sprzedano w oknie (poprz. snapshot → ten); null gdy brak poprzedniego. */
  soldInWindow: number | null;
  /** Spis z natury; null = jeszcze nie policzono. */
  physicalCount: number | null;
  /** manko = systemStock - physicalCount (dodatnie = brakuje na półce). */
  manko: number | null;
  /** mankoValue = manko * unitPrice. */
  mankoValue: number | null;
  /** Oczekiwany stan z księgi: poprz. snapshot + dostawy - sprzedaż. */
  expectedFromBook: number | null;
  /** bookDiscrepancy = systemStock - expectedFromBook (błąd ewidencji w Glofox). */
  bookDiscrepancy: number | null;
  /** Uwaga wpisana przy spisie (kolumna „Uwagi" wzoru sieci). */
  note: string | null;
  /** Czy |manko| przekracza próg tolerancji. */
  flagged: boolean;
}

export interface Audit {
  id: string;
  openedAt: string;
  closedAt?: string;
  /** source snapshotu użytego jako stan systemowy audytu. */
  snapshotSource: string;
  toleranceUnits: number;
  lines: AuditLine[];
}

/**
 * Partia towaru z krótką datą ważności. ŚWIADOMIE POZA LEDGEREM: nie zmienia stanu
 * magazynowego, a jeden wariant może mieć wiele partii o różnych datach — wzorzec
 * append-only „latest wins" (jak PHYSICAL_COUNT) by tu nie zadziałał.
 */
export interface ExpiryBatch {
  id: string;
  productId: string;
  presentationId: string;
  /** YYYY-MM-DD — data z opakowania. */
  expiryDate: string;
  qty: number;
  note?: string;
  createdAt: string; // ISO
  /** Wycofane ze sprzedaży / sprzedane — soft delete, ślad audytu zostaje. */
  removedAt?: string;
}

export interface Settings {
  /** Nazwa klubu do nagłówka wzoru sieci (komórka B2). Wpisywana ręcznie. */
  clubName?: string;
  /** Ile dni przed datą ważności traktujemy partię jako „krótką datę". */
  expiryWarnDays: number;
  /** Domyślny próg tolerancji audytu (szt). */
  toleranceUnits: number;
}

/** Kanoniczny, trwały stan modułu — eksportowany do JSON i importowany z powrotem. */
export interface ReportState {
  schemaVersion: number;
  generatedAt: string;
  branchId?: string;
  /** Ostatni znany katalog produktów + wariantów (do nazw/cen). */
  catalog: Product[];
  /** Append-only ślad audytu. */
  ledger: LedgerEvent[];
  audits: Audit[];
  /** Okno sprzedaży per snapshot (source → zakres dat) — do kontroli pokrycia. */
  snapshotWindows?: Record<string, { from?: string; to?: string }>;
  /** Partie z datami ważności (kolumny F/G wzoru sieci). */
  expiryBatches: ExpiryBatch[];
  /** variantKey -> stan minimalny, na którym opiera się rekomendacja zamówienia. */
  minStock: Record<string, number>;
  settings: Settings;
}

/**
 * Kształt raportu wczytanego z pliku: starsze pliki nie mają pól dodanych później.
 * `normalizeReport` (storage/file.ts) jest granicą, za którą ReportState jest kompletny.
 */
export type LoadedReport = Omit<
  ReportState,
  "expiryBatches" | "minStock" | "settings"
> &
  Partial<Pick<ReportState, "expiryBatches" | "minStock" | "settings">>;

export function emptyReport(): ReportState {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    catalog: [],
    ledger: [],
    audits: [],
    expiryBatches: [],
    minStock: {},
    settings: { expiryWarnDays: 30, toleranceUnits: 0 },
  };
}

/** Klucz wariantu używany jako identyfikator w mapach. */
export function variantKey(productId: string, presentationId: string): string {
  return `${productId}::${presentationId}`;
}
