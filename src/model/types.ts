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
}

export type LedgerEventType =
  | "SNAPSHOT" // absolutny stan Glofox dla wariantu w chwili capturedAt
  | "DELIVERY" // dostawa (delta dodatnia)
  | "SALES_IMPORT" // sprzedaż z endpointu (delta ujemna)
  | "PHYSICAL_COUNT" // spis z natury (absolutny)
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
}

export function emptyReport(): ReportState {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    catalog: [],
    ledger: [],
    audits: [],
  };
}

/** Klucz wariantu używany jako identyfikator w mapach. */
export function variantKey(productId: string, presentationId: string): string {
  return `${productId}::${presentationId}`;
}
