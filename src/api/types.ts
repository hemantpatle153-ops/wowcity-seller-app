// =====================================================================================================
// WowCity mobile API (/api/v1/**) — TypeScript types extracted from the backend source
// (wow-city @ claude/affectionate-archimedes-8539fs). Derived from route handlers, loaders' return
// statements, Supabase select() column lists and SQL RPC jsonb_build_object keys.
//
// CONVENTIONS
// - Every /api/v1 route built with ok() returns `{ data: T }`; failures `{ error: { code, message } }`.
//   The types below describe `T` (the `data` payload) unless marked RAW.
// - RAW = route re-exported from a non-v1 web route (catalog/lookup, customers/search,
//   sales/original-bill, purchases/barcode-lookup) and /api/r2/product-image-upload. These return the
//   object directly (NO `{ data }` envelope) and fail with `{ error: string }` (plain string, not an
//   object). They DO accept `Authorization: Bearer` (guardApi -> getCurrentAppSession reads the header).
// - Postgres numeric columns returned by raw PostgREST selects / jsonb come back as JSON numbers.
// - "Form action" endpoints (runFormAction) return the action result minus `ok` and `submissionId`:
//   at minimum `{ message: string }` plus any extra fields noted. Failure => 422 `rejected` with message.
//   Zod parse failure in the route => 422 `invalid_input`; bad JSON => 400 `invalid_json`.
// - Booleans sent to form-action endpoints: `true` -> checkbox "on", `false` -> field omitted.
// - Dates: ISO timestamps (timestamptz) unless noted `YYYY-MM-DD` (IST business date).
// =====================================================================================================

export type UUID = string;
export type ISODateTime = string; // e.g. "2026-09-27T05:12:00.000Z" (or Postgres "+00:00" form from jsonb)
export type ISODate = string; // "YYYY-MM-DD"
/** Decimal accepted as string or number by the request schema (normalised with String()). */
export type DecimalInput = string | number;

// -----------------------------------------------------------------------------------------------------
// Envelopes
// -----------------------------------------------------------------------------------------------------
export interface ApiOk<T> {
  data: T;
}
export interface ApiFail {
  error: { code: ApiErrorCode | string; message: string };
}
export type ApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_json"
  | "invalid_input"
  | "rejected"
  | "server_error"
  | "sale_rejected"
  | "sync_failed"
  | "rate_limited"
  | "invalid_credentials"
  | "session_ended"
  | "invalid_identifier"
  | "otp_unavailable"
  | "invalid_code"
  | "no_shop"
  | "disabled"
  | "already_registered"
  | "email_taken"
  | "signup_failed";
/** RAW (non-v1) route failure shape: 401 "Sign in again to continue.", 403, 400, 409, 503. */
export interface RawFail {
  error: string;
}

/** Result of every runFormAction endpoint on success (ok/submissionId stripped). */
export interface FormActionOk {
  message: string;
}

// -----------------------------------------------------------------------------------------------------
// Permissions & actors (lib/auth/permissions.ts, lib/auth/session.ts)
// -----------------------------------------------------------------------------------------------------
export type ActorType = "seller" | "worker"; // "seller" = owner. DB actor_kind enum: 'seller_user' | 'worker'.

/** ownerPermissions — owners always get ALL of these. */
export type Permission =
  | "purchase.view"
  | "purchase.create"
  | "purchase.edit"
  | "purchase.return"
  | "purchase.post"
  | "purchase.view_cost"
  | "sale.view"
  | "sale.create"
  | "sale.return"
  | "sale.discount_override"
  | "sale.print_invoice"
  | "sale.download_invoice"
  | "stock.view"
  | "stock.transfer"
  | "stock.convert"
  | "stock.dump"
  | "stock.unhold"
  | "product.view"
  | "product.create"
  | "product.edit"
  | "product.images.manage"
  | "product.publication.manage"
  | "product.custom_columns.manage"
  | "worker.view"
  | "worker.create"
  | "worker.edit"
  | "worker.disable"
  | "worker.view_logs"
  | "barcode.view"
  | "barcode.print"
  | "reports.purchase"
  | "reports.sale"
  | "reports.stock"
  | "reports.gst"
  | "reports.pnl"
  | "reports.due"
  | "reports.customer"
  | "reports.salesman"
  | "reports.export"
  | "settings.store"
  | "settings.tax"
  | "settings.financial_year"
  | "settings.visibility_defaults"
  | "settings.roles";

/** The ONLY permissions a worker can hold (normalizeWorkerPermissions drops everything else). Order is canonical. */
export type WorkerGrantablePermission =
  | "sale.create"
  | "sale.view"
  | "sale.return"
  | "sale.discount_override"
  | "purchase.create"
  | "purchase.view"
  | "purchase.view_cost"
  | "product.view"
  | "product.edit"
  | "product.images.manage"
  | "stock.view"
  | "barcode.view"
  | "barcode.print"
  | "reports.sale"
  | "reports.stock"
  | "reports.due";
/** Implied on save: sale.create/return/discount_override -> sale.view; purchase.create/view_cost -> purchase.view;
 *  product.edit/images.manage -> product.view; barcode.print -> barcode.view. */
export const workerDefaultPermissions = ["sale.view", "sale.create", "purchase.view", "purchase.create"] as const;

export interface PermissionGroup {
  group: "Sales" | "Purchase & products" | "Stock & labels" | "Reports & money";
  items: Array<{ key: WorkerGrantablePermission; label: string; description: string }>;
}
export interface RolePreset {
  key: "cashier" | "stock" | "manager";
  label: string;
  description: string;
  permissions: string[];
}
// cashier: sale.view, sale.create, sale.return
// stock:   purchase.view, purchase.create, stock.view, product.view, barcode.view, barcode.print
// manager: all WorkerGrantablePermission

export type RoundingMode = "nearest_rupee" | "up_rupee" | "down_rupee" | "none";
export type PricingMode = "inclusive" | "exclusive";
export type DocumentStatus = "draft" | "posted" | "cancelled";

// =====================================================================================================
// AUTH (no bearer needed except logout)
// =====================================================================================================
export interface TokenPair {
  accessToken: string;
  refreshToken: string /* "wcr_..." */;
  tokenType: "Bearer";
  expiresIn: 900;
}

// POST /auth/owner-login
export interface OwnerLoginBody {
  email: string;
  password: string;
  deviceName?: string /*<=80*/;
  platform?: string; /*<=20*/
}
export type OwnerLoginResponse = TokenPair; // 201

// POST /auth/staff-login
export interface StaffLoginBody {
  shopCode: string /*3-20*/;
  username: string /*1-40*/;
  pin: string /*1-72*/;
  deviceName?: string;
  platform?: string;
}
export type StaffLoginResponse = TokenPair; // 201

// POST /auth/refresh
export interface RefreshBody {
  refreshToken: string;
}
export type RefreshResponse = TokenPair; // 200; 401 "session_ended"

// POST /auth/logout  (bearer)
export interface LogoutResponse {
  signedOut: true;
}

// POST /auth/otp/request
export interface OtpRequestBody {
  identifier: string /* email or 10-digit mobile */;
  purpose: "login" | "signup";
}
export interface OtpRequestResponse {
  sentTo: string;
  channel: "email" | "sms";
}

// POST /auth/otp/verify
export interface OtpSignupShop {
  ownerName: string;
  phone: string /* /^\+?[0-9 ]{10,15}$/ */;
  shopName: string;
  businessType?: string /* default "Clothing" */;
  gstin?: string;
  legalName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}
export interface OtpVerifyBody {
  identifier: string;
  code: string /*4-12*/;
  purpose: "login" | "signup";
  deviceName?: string;
  platform?: string;
  shop?: OtpSignupShop; /* required for signup */
}
export type OtpVerifyResponse = TokenPair /* login, 200 */ | (TokenPair & { shopCode: string }) /* signup, 201 */;

// POST /auth/signup
export interface SignupBody extends OtpSignupShop {
  email: string;
  password: string /*>=8*/;
  deviceName?: string;
  platform?: string;
}
export type SignupResponse = TokenPair & { shopCode: string }; // 201

// =====================================================================================================
// GET /me
// =====================================================================================================
export interface MeResponse {
  actor: ActorType;
  userId: UUID | null;
  workerId: UUID | null;
  displayName: string;
  sellerId: UUID;
  shopName: string;
  shopCode: string;
  permissions: string[]; // owner: every Permission; worker: normalized grantable subset
  storeIds: UUID[]; // active stores only (owner: all active; worker: assigned & active)
  financialYear: string; // e.g. "2026-2027"
  stores: Array<{ id: UUID; name: string; state: string; city: string }>; // active stores ∩ storeIds, ordered by name
  settings: {
    roundingMode: RoundingMode;
    gstin: string | null;
    printFormat: "a4" | "thermal";
    upiId: string | null;
    terms: string;
  };
}

// =====================================================================================================
// GET /dashboard?store=<uuid>   (store only honoured for owner)
// =====================================================================================================
export interface SalesSummary {
  amount: number;
  bills: number;
  quantity: number;
  averageBill: number;
  creditDue: number;
}
export interface DailyPoint {
  date: ISODate;
  amount: number;
  bills: number;
}
export type PaymentMix = Array<{ mode: "cash" | "upi" | "card" | "other" | "credit" | string; amount: number }>;
export interface StockAlert {
  variantId: UUID;
  storeName: string;
  quantity: number;
  name: string;
  detail: string /* "Size / Colour" */;
  barcode: string | null;
}
export interface DashboardBill {
  id: UUID;
  billNumber: string;
  time: ISODateTime;
  customer: string /* "Cash sale" if none */;
  store: string;
  quantity: number;
  amount: number;
  due: number;
}

export interface OwnerDashboard {
  kind: "owner";
  stores: Array<{ id: UUID; name: string; state: string; address_line_1: string | null; address_line_2: string | null; city: string | null; pincode: string | null }>; // snake_case!
  storeId?: UUID; // omitted when "All stores"
  storeName: string; // "All stores" when no filter
  todayDate: ISODate;
  today: SalesSummary;
  yesterday: SalesSummary;
  change: number | null; // % vs yesterday, 1 decimal; null if yesterday = 0
  trend: DailyPoint[]; // 14 days, oldest first
  paymentMix: PaymentMix;
  profit: { revenue: number; cost: number; profit: number; marginPercent: number | null; itemsWithoutCost: number };
  returns: { count: number; amount: number };
  purchases: { count: number; amount: number; due: number; quantity: number };
  dues: {
    customers: { due: number; advance: number; parties: number; top: Array<{ id: UUID; name: string; amount: number }> };
    suppliers: { due: number; advance: number; parties: number; top: Array<{ id: UUID; name: string; amount: number }> };
  };
  stock: { outOfStock: number; low: number /* 0<qty<=5 */; alerts: StockAlert[] /* max 8 */ };
  topItems: Array<{ variantId: UUID; quantity: number; amount: number; name: string; detail: string; barcode: string | null }>; // last 7 days, max 5
  team: {
    active: number;
    total: number;
    today: Array<{ key: string /* "worker:<id>" | "owner:<id>" */; actor: "worker" | "owner"; id: UUID | null; amount: number; bills: number; quantity: number; name: string }>;
  };
  listings: { public: number; inStock: number; outOfStock: number; discoverableStores: number };
  recentBills: Array<DashboardBill & { soldBy: string }>; // today, max 8
  activity: Array<{ id: UUID; action: string /* human label */; by: string; amount: number | null; at: ISODateTime }>; // max 6
}

export interface StaffDashboard {
  kind: "staff";
  todayDate: ISODate;
  stores: Array<{ id: UUID; name: string; is_active: boolean }>; // snake_case is_active
  today: SalesSummary; // own bills only
  trend: DailyPoint[]; // 7 days
  paymentMix: PaymentMix;
  stock: { outOfStock: number; low: number; alerts: StockAlert[] /* max 6 */ } | null; // null without stock.view
  recentBills: DashboardBill[]; // own last 12 (any day), no soldBy
}
export type DashboardResponse = OwnerDashboard | StaffDashboard;

// =====================================================================================================
// GET /catalog/lookup?q=&storeId=&inStock=false   RAW (no envelope). Perm any of sale.create|sale.view|sale.return
// q = exact barcode first, else product-name ilike (max 20 products/20 variants). inStock defaults true (filters qty>0).
// =====================================================================================================
export interface CatalogLookupItem {
  variantId: UUID;
  productId: UUID;
  barcodeId: string; // "" when no barcode
  barcode: string; // ""
  itemName: string;
  brand: string;
  size: string;
  colour: string;
  style: string; // "" when none
  hsnCode: string;
  gstRate: string; // STRING, e.g. "5", "12", "0"
  mrp: string; // STRING, e.g. "999" or "999.5" (String(numeric))
  rate: string; // STRING sale rate
  availableQty: number; // at storeId
}
export type CatalogLookupResponse = { items: CatalogLookupItem[]; exact: boolean } | { items: [] /* when q or storeId missing, or nothing matched: no `exact` key */ };

// =====================================================================================================
// GET /customers/search?q=   RAW (no envelope). Perm sale.create|sale.return. q < 2 chars -> {customers: []}. Max 8.
// =====================================================================================================
export interface CustomerSearchResponse {
  customers: Array<{ id: UUID; name: string; mobile: string | null; address: string | null; state: string | null; gstin: string | null; balance: number /* >0 owes shop, <0 advance */ }>;
}

// =====================================================================================================
// GET /sales/original-bill?billNumber=   RAW (no envelope). Perm sale.return. billNumber upper-cased.
// =====================================================================================================
export type OriginalBillResponse =
  | { found: false }
  | {
      found: true;
      invoice: { id: UUID; billNumber: string; storeId: UUID; date: ISODateTime; total: number /* raw numeric */; taxType: PricingMode };
      customer: { id: UUID; name: string; mobile: string | null; address: string | null; state: string | null } | null;
      items: Array<{
        originalItemId: UUID;
        variantId: UUID;
        barcode: string;
        itemName: string;
        size: string;
        colour: string;
        soldQty: number;
        returnableQty: number;
        mrp: string;
        rate: string;
        unitRefund: string /* toFixed(2) */;
        gstRate: string; // STRINGS
      }>;
    };

// =====================================================================================================
// POST /sales   (perm sale.create|sale.return; returns 201). Body = lib/sale/sale-service.ts payloadSchema
// Server recomputes all money; GST comes from catalogue. Without sale.discount_override, rate/mrp are reset
// to catalogue and line discounts zeroed; any bill discount > 0 => rejected.
// =====================================================================================================
export interface SaleLineInput {
  variantId: UUID;
  barcode?: string; // default ""
  itemName: string; // min 1
  qty: DecimalInput; // > 0, /^-?\d+(\.\d+)?$/
  mrp: DecimalInput;
  rate: DecimalInput; // >= 0
  discountPercent?: DecimalInput; // default "0"
  discountAmount?: DecimalInput; // default "0"
  originalItemId?: UUID; // returns: sale_invoice_items.id from /sales/original-bill
}
export interface SaleRequest {
  kind: "sale" | "return";
  storeId: UUID;
  billType?: "invoice" | "estimate"; // default "invoice"
  taxType: PricingMode;
  customer?: { id?: UUID; name?: string /*<=120*/; mobile?: string /*<=20*/; address?: string /*<=300*/; state?: string /*<=60*/ }; // default {}
  extraDiscountPercent?: DecimalInput; // default "0"
  extraDiscountAmount?: DecimalInput; // default "0"
  idempotencyKey: string; // 12..80
  printIntent?: "none" | "print" | "download"; // default "none"
  useAdvance?: boolean; // default false (needs customer.id)
  creditChangeToAccount?: boolean; // default false (needs customer.id)
  refundMode?: "cash" | "credit_note"; // returns only; default "cash"
  originalSaleInvoiceId?: UUID; // returns
  rows: SaleLineInput[]; // 1..300
  offline?: boolean; // default false; with a device session allows oversell (not for estimates)
  payments?: Array<{ mode: "cash" | "upi" | "card" | "other"; amount: DecimalInput; referenceNo?: string /*<=60*/ }>; // max 10, default []
}
/** NOTE: `ok: true` is NOT stripped here (route returns submitSale result verbatim). Failure => 422 sale_rejected. */
export interface SaleResponseSale {
  ok: true;
  message: string; // "Bill X saved." | "Bill X saved. ₹N added to the customer's dues." | "Estimate X saved. Stock was not changed." | "Bill X was already saved. No duplicate created."
  invoiceId: UUID;
  billNumber: string;
  estimate: boolean;
  changeDue: string; // STRING money "0.00"
  printIntent: "none" | "print" | "download";
}
export interface SaleResponseReturn {
  ok: true;
  message: string;
  returnId: UUID;
  returnNumber: string;
  creditNoteNumber?: string; // only for credit_note
  refundAmount: string; // STRING money
}
export type SaleResponse = SaleResponseSale | SaleResponseReturn;

// =====================================================================================================
// GET /sales?range=&from=&to=&view=bills|returns&q=&store=&staff=&page=   (perm sale.view|create|return)
// default range "today"; page size 30. Workers are ALWAYS limited to their own bills (staff forced).
// staff (owner only) = "owner:<profileId>" | "worker:<workerId>". No `status` filter via API (estimates never listed).
// =====================================================================================================
export interface HistoryRow {
  id: UUID; // invoice id (bills) or return id (returns)
  at: ISODateTime;
  number: string; // bill_number / return_number ("Return" if null)
  href: string | null; // WEB path "/app/sale/invoices/<invoiceId>" (returns: original invoice or null)
  customer: string | null;
  mobile: string | null;
  quantity: number;
  by: string; // bills: staff/owner name; returns: "Credit note" | "Cash refund"
  store: string; // "—" if unknown
  amount: number;
  due: number; // returns: 0
  badge?: { label: string; variant: "warning" | "secondary" | "brand" }; // "Estimate"/"Credit note"
}
export interface SalesListResponse {
  range: { from: ISODate; to: ISODate };
  page: number;
  total: number;
  summary: { sales: number; bills: number; items: number; due: number; returns: number; returnCount: number }; // whole period, not filtered by q/staff
  rows: HistoryRow[];
}

// =====================================================================================================
// GET /sales/{invoiceId}   (perm sale.view|create|return; store must be in session.storeIds)
// =====================================================================================================
export interface SaleInvoice {
  id: UUID;
  billNumber: string;
  date: ISODateTime;
  financialYear: string;
  isEstimate: boolean;
  status: DocumentStatus; // estimates are "draft"
  taxType: PricingMode;
  shop: { name: string; legalName: string; gstin: string /* store gstin || tax profile || seller, "" if none */ };
  store: { name: string; address: string /* "l1, l2, city, pincode" */; state: string; phone: string };
  customer: { name: string; mobile: string; address: string; state: string; gstin: string } | null; // "" for missing
  soldBy: string | null; // worker display name, null if owner
  lines: Array<{
    id: UUID;
    name: string;
    brand: string;
    detail: string /* "Size / Colour" */;
    hsn: string;
    barcode: string;
    qty: number;
    mrp: number;
    rate: number;
    discount: number;
    taxable: number;
    gstRate: number;
    cgst: number;
    sgst: number;
    igst: number;
    gst: number;
    net: number;
  }>;
  gstSummary: Array<{ rate: number; taxable: number; cgst: number; sgst: number; igst: number }>; // NOT rounded, sorted by rate
  interState: boolean;
  totals: { quantity: number; taxable: number; gst: number; discount: number; roundOff: number; net: number; paid: number; due: number; savings: number /* max(0, Σmrp*qty − net) */ };
  payments: Array<{ mode: string; amount: number; reference: string }>;
  terms: string;
  printFormat: "a4" | "thermal";
  bank: { name: string; accountName: string; accountNumber: string; ifsc: string } | null; // only if accountNumber && ifsc
  upi: { svg: string /* QR SVG markup */; uri: string /* upi://pay?... */; amount: number; upiId: string } | null; // amount = due (or net for estimates); null if 0/not configured
}

// =====================================================================================================
// GET /sync/catalog?storeId=&sinceAt=&sinceId=&limit=   (perm sale.create|view|return|stock.view; limit 1..2000, default 500)
// =====================================================================================================
export interface SyncCursor {
  sinceAt: ISODateTime;
  sinceId: UUID;
}
export interface SyncCatalogItem {
  variantId: UUID;
  productId: UUID;
  active: boolean; // variant AND product active; inactive rows are sent so the app can delete them
  itemName: string;
  brand: string | null;
  category: string | null;
  size: string | null;
  colour: string | null;
  style: string | null;
  hsnCode: string | null;
  gstRate: number; // NUMBER here (0 if none) — unlike /catalog/lookup
  mrp: number; // NUMBER
  rate: number; // NUMBER sale_rate
  availableQty: number; // at storeId (0 if no balance row)
  barcodes: string[]; // oldest first
  changedAt: ISODateTime;
}
export interface SyncCatalogResponse {
  items: SyncCatalogItem[];
  next: SyncCursor | null /* null when page empty */;
  hasMore: boolean;
  serverTime: ISODateTime;
}

// GET /sync/customers?sinceAt=&sinceId=&limit=   (perm sale.create|sale.return)
export interface SyncCustomer {
  id: UUID;
  name: string;
  mobile: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  gstin: string | null;
  balance: number /* round 2 */;
  changedAt: ISODateTime;
}
export interface SyncCustomersResponse {
  items: SyncCustomer[];
  next: SyncCursor | null;
  hasMore: boolean;
  serverTime: ISODateTime;
}

// =====================================================================================================
// STOCK
// GET /stock?q=&store=&status=&brand=&size=&colour=&category=&sort=&page=   (perm stock.view; page size 40)
// parseStockFilters: q (sliced 80); status in|low|out else "all" (in = qty > 5, low = 0<qty<=5, out = qty<=0);
// sort stock_low|stock_high|newest|price_high else "name"; brand/size/colour/category exact names (see facets);
// store ignored unless in session.storeIds; page >= 1.
// =====================================================================================================
export interface StockItem {
  id: UUID; // variantId
  productId: UUID;
  name: string;
  brand: string | null;
  category: string | null;
  size: string | null;
  colour: string | null;
  style: string | null;
  mrp: number;
  saleRate: number;
  barcode: string | null; // oldest barcode
  qty: number; // sum over selected stores
  byStore: Record<UUID, number>;
  unitCost: number | null; // latest purchase cost; null for staff without purchase.view_cost
  imageKey: string | null; // storage key; use `image` for display
  image: string | null; // thumbnail URL
  isPublic: boolean;
  createdAt: ISODateTime;
}
export interface StockListResponse {
  total: number;
  summary: { skus: number; units: number; costValue: number | null; mrpValue: number; low: number; out: number }; // over ALL items (not filtered)
  facets: { brands: string[]; sizes: string[]; colours: string[]; categories: string[] };
  items: StockItem[];
}

// GET /stock/items/{variantId}   (perm stock.view|product.view)
export interface StockItemDetail {
  variantId: UUID;
  productId: UUID;
  name: string;
  brand: string;
  category: string;
  size: string;
  colour: string;
  style: string; // "" if none
  hsnCode: string;
  gst: { code: string; label: string; rate: number } | null;
  mrp: number;
  price: number; // sale rate (note name: price, not saleRate)
  active: boolean;
  internalDescription: string | null; // null when caller can't see cost
  barcodes: Array<{ id: UUID; barcode: string }>;
  images: Array<{ id: UUID; url: string | null /* null if R2 public base not configured */; isPrimary: boolean; variantId: UUID | null }>;
  stock: Array<{ storeId: UUID; store: string; available: number; held: number }>;
  totalStock: number;
  movements: Array<{
    id: UUID;
    store: string;
    type: "purchase" | "sale" | "purchase_return" | "sale_return" | "transfer" | "conversion" | "dump" | "adjustment";
    documentId: UUID;
    qty: number /* signed */;
    at: ISODateTime;
  }>; // last 50
  customValues: Record<UUID /* fieldId */, unknown /* value_json: string | number | boolean | string[] */>;
  tags: string[];
  siblings: Array<{ variantId: UUID; label: string /* "Size / Colour" or "Standard" */ }>;
}

// POST /stock/adjust   (form action; action requires stock.dump => effectively OWNER ONLY, workers can't be granted it)
export interface StockAdjustBody {
  variantId: UUID;
  storeId: UUID;
  direction: "remove" | "add";
  qty: DecimalInput; // /^\d+(\.\d{1,3})?$/, > 0
  reason: "damaged" | "lost" | "found" | "count_correction" | "returned_to_supplier" | "sample" | "other";
  note?: string; // <=200
}
export type StockAdjustResponse = FormActionOk; // "Stock updated. N now in this store."

// POST /stock/transfer   (perm stock.transfer => effectively OWNER ONLY)
export interface StockTransferBody {
  variantId: UUID;
  fromStoreId: UUID;
  toStoreId: UUID;
  qty: DecimalInput;
  idempotencyKey: string; /*>=12*/
}
export type StockTransferResponse = FormActionOk; // "Moved N pcs. Challan XYZ."

// =====================================================================================================
// PURCHASES
// GET /purchases?range=&from=&to=&q=&store=&supplier=&status=due|paid&page=   (perm purchase.view|create; default 30d; page size 40)
// =====================================================================================================
export interface PurchaseListRow {
  id: UUID;
  date: ISODate; // purchase_date
  invoice: string; // supplier invoice no, "" if none
  supplier: string; // "No supplier" if none
  supplierId: UUID | null;
  store: string;
  qty: number;
  amount: number | null;
  gst: number | null;
  paid: number | null;
  due: number | null; // null without purchase.view_cost
}
export interface PurchaseListResponse {
  range: { from: ISODate; to: ISODate };
  total: number;
  summary: { amount: number; gst: number; due: number; qty: number; bills: number } | null; // null without view_cost; ignores q/supplier/status filters
  rows: PurchaseListRow[];
}

// GET /purchases/{purchaseId}   (perm purchase.view|create)
export interface PurchaseBill {
  id: UUID;
  date: ISODate;
  invoice: string;
  pricing: PricingMode; // gst_pricing_mode
  store: string;
  supplier: { id: UUID; name: string; mobile: string | null; gstin: string | null; state: string | null } | null;
  totals: {
    qty: number;
    gross: number;
    discount: number;
    taxable: number;
    gst: number;
    tcs: number;
    roundOff: number;
    total: number;
    mrp: number;
    paid: number;
    due: number;
    outstanding: number; // FIFO-allocated still-open amount of this bill
  } | null; // null without view_cost
  items: Array<{
    id: UUID /* purchase_invoice_items.id — use for returns */;
    variantId: UUID;
    barcode: string;
    name: string;
    detail: string /* "Brand · Size · Colour" */;
    qty: number;
    rate: number | null;
    discount: number | null;
    taxable: number | null;
    gstRate: number;
    gst: number | null;
    total: number | null; // nulls without view_cost
    mrp: number;
    price: number;
    returned: number;
    inStock: number /* at the bill's store */;
  }>;
  payments: Array<{ mode: string; amount: number; reference: string; at: ISODateTime }>; // [] without view_cost
  returns: Array<{ id: UUID; number: string; date: ISODate; amount: number; reason: string; qty: number }>; // NOT hidden without view_cost
  labelJobId?: UUID; // key omitted when no purchase print job
}

// GET /purchases/setup   (perm purchase.create)
export interface CustomFieldGridColumn {
  id: UUID;
  name: string;
  field_type: CustomFieldType;
  options_json: string[];
  is_public_eligible: boolean;
  is_required_on_purchase: boolean;
  default_public_enabled: boolean;
  show_in_sale_search: boolean;
  sort_order: number;
} // snake_case; only active, non-deleted, show_in_purchase_grid
export interface PurchaseSetupResponse {
  suppliers: Array<{ id: UUID; name: string; mobile: string | null; gstin: string | null; state: string | null }>; // active, max 1000
  stores: Array<{ id: UUID; name: string; state: string; address_line_1: string | null; address_line_2: string | null; city: string | null; pincode: string | null }>;
  gstSlabs: Array<{ code: string; label: string; rate: number; is_special: boolean }>;
  customFields: CustomFieldGridColumn[];
  publicFieldOptions: Array<{ key: BuiltInPublicField; label: string }>;
  publicFieldDefaults: Record<string, boolean>; // field_key -> enabled (may be {})
  roundingMode: RoundingMode;
  canPublish: boolean; // product.publication.manage (owner only in practice)
  canSeeCost: boolean;
  suggestions: { brands: string[]; sizes: string[]; colours: string[]; styles: string[]; categories: string[] }; // max 300 each
}

// GET /purchases/barcode-lookup?barcode=   RAW (no envelope). Perm purchase.create|view. barcode upper-cased, case-insensitive match.
export type PurchaseBarcodeLookupResponse =
  | { found: false }
  | {
      found: true;
      variantId: UUID;
      barcode: string;
      itemName: string;
      brand: string;
      category: string;
      size: string;
      colour: string;
      style: string;
      hsnCode: string;
      gstCode: string;
      gstRate: string /* "" if none */;
      mrp: string;
      saleRate: string; // STRINGS
      inStock: number; // across ALL stores (not store-scoped)
    };

// POST /purchases   (perm purchase.create; 201). Body is validated by savePurchaseAction payloadSchema
// (app/app/purchase/actions.ts). Route only checks idempotencyKey then passes the whole body as `payload`.
// Unknown keys (e.g. client `totals`) are stripped — ALL totals are recomputed server-side.
// `PurchaseNum` = string|number, String()'d, must be "" or /^\d+(\.\d{1,3})?$/ (no negatives).
export type PurchaseNum = string | number;
export interface PurchaseImageRef {
  bucket: string; // from product-image-upload response
  objectKey: string; // must start with "sellers/<sellerId>/"; <=300
  contentType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number; // int 1..5242880
  sortOrder: number; // int 0..3
  isPrimary: boolean;
}
export interface PurchaseRowInput {
  rowId: string; // 1..64 client id (web uses it as the draft productId for image upload)
  entry?: string; // scanned/typed barcode (<=64). Known barcode => RESTOCK that variant (refreshes mrp/saleRate/gst/hsn);
  // unknown non-empty => new variant keeps this as its barcode; empty => barcode auto-generated. Upper-cased.
  itemName: string; // 1..160 (required)
  brand?: string;
  category?: string;
  size?: string;
  colour?: string;
  style?: string; // <=80/80/40/40/60, default ""
  hsnCode?: string; // "" or 4-8 digits
  gstCode?: string; // gst_slabs.code (preferred) <=40
  gstRate: PurchaseNum; // e.g. "5"
  qty: PurchaseNum; // > 0
  purchaseRate: PurchaseNum; // cost price
  disc1Percent: PurchaseNum; // <= 100; "" allowed
  disc1Amount: PurchaseNum;
  disc2Amount: PurchaseNum;
  mrp: PurchaseNum;
  saleRate: PurchaseNum; // must be <= mrp when both set
  customValues?: Record<UUID /* custom fieldId */, string | number | boolean | null>; // "" => cleared/null
  publicEnabled?: boolean; // default false; ignored without product.publication.manage
  publicFields?: Record<string, boolean>; // keys lower-cased & whitelisted (product_name, brand, category, size, colour, color, style, hsn_code, mrp, sale_rate, description, tags, images, public_status, store_name, store_city, store_locality, "custom:<fieldId>")
  description?: string; // <=1000
  tags?: string[]; // <=25 × 40 chars
  images?: PurchaseImageRef[]; // max 4
  printLabels?: boolean; // default true (queues a label print job)
}
export interface PurchaseRequest {
  supplierId?: UUID;
  supplierName?: string; // <=120; used only when supplierId absent (free-text/new supplier)
  gstPricingMode: "exclusive" | "inclusive";
  purchaseDate: ISODate; // not more than 1 day in the future
  invoiceNumber?: string; // supplier invoice no, <=40
  storeId: UUID;
  extraDiscountPercent?: PurchaseNum; // default ""
  extraDiscountAmount?: PurchaseNum;
  tcsAmount?: PurchaseNum;
  idempotencyKey: string; // 12..80
  payments?: Array<{ mode: "cash" | "upi" | "bank" | "cheque" | "card" | "other"; amount: PurchaseNum; referenceNo?: string /*<=60*/ }>; // max 6; amount 0 rows dropped; needs a supplier
  rows: PurchaseRowInput[]; // 1..500
}
export interface PurchaseResponse {
  message: string; // "Purchase saved. N items added to stock." | "This purchase was already saved. No duplicate was created."
  purchaseId: UUID;
  printJobId?: UUID; // omitted when no labels queued
  itemCount: number;
  total: string; // STRING money (grossPurchasePrice), e.g. "12345.00"
  // rowErrors exists only on failure and is DROPPED by the API bridge (you get only the message, e.g. "Row 3: HSN must be 4 to 8 digits")
}

// POST /api/r2/product-image-upload   RAW, NOT under /v1. Accepts bearer (guardApi). Perm product.images.manage|purchase.create.
// Flow: POST here -> PUT file bytes to uploadUrl with header Content-Type = contentType (exact sizeBytes; URL valid 5 min)
//       -> include {bucket, objectKey, contentType, sizeBytes, sortOrder, isPrimary} in PurchaseRowInput.images.
// There is NO v1 endpoint to attach images to an existing product outside a purchase.
export interface ProductImageUploadRequest {
  productId: UUID; // existing product id, or any fresh UUID for a product being created in a purchase
  variantId?: UUID;
  fileName: string; // 1..200
  contentType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number; // int, <= 5 MB
}
export interface ProductImageUploadResponse {
  uploadUrl: string;
  bucket: string;
  objectKey: string /* sellers/<seller>/products/<productId>/(product|variants/<variantId>)/<uuid>.<ext> */;
  maxImagesPerProduct: 4;
}
// errors: 400 {error} invalid body, 403, 409 "A product can have at most 4 images.", 503 storage not configured

// POST /purchases/{purchaseId}/returns   (form action; 201). Action requires purchase.return => OWNER ONLY in practice.
export interface PurchaseReturnBody {
  requestId: UUID /* idempotency */;
  reason?: string /*<=200*/;
  lines: Array<{ purchaseItemId: UUID; qty: number /* >0 */ }>; /*min 1*/
}
export interface PurchaseReturnResponse {
  message: string /* "Debit note DN-.. saved for ₹1,234.00." */;
  returnNumber: string;
}

// =====================================================================================================
// SUPPLIERS
// GET /suppliers?q=   (perm purchase.view|create; max 500, includes inactive)
// =====================================================================================================
export interface SupplierRow {
  id: UUID;
  name: string;
  mobile: string;
  gstin: string;
  state: string;
  address: string; // "" when empty
  active: boolean;
  bills: number;
  purchased: number | null; // null without view_cost
  lastPurchase: ISODate | null;
  balance: number | null; // >0 shop owes supplier; null without view_cost
}
export interface SuppliersResponse {
  suppliers: SupplierRow[];
}

// POST /suppliers   (perm purchase.create) create, or update when supplierId given
export interface SupplierSaveBody {
  supplierId?: UUID;
  name: string /*2..120*/;
  mobile?: string /* 10-13 digits */;
  gstin?: string;
  state?: string /*<=60*/;
  address?: string; /*<=300*/
}
export type SupplierSaveResponse = FormActionOk; // "Supplier updated." | "<name> added."  (no id returned!)

// =====================================================================================================
// PRODUCTS
// GET /products?q=&filter=all|live|listed|unlisted|nophoto|instock&page=   (perm product.view; page size 40)
// =====================================================================================================
export interface ProductListItem {
  id: UUID;
  name: string;
  brand: string | null;
  category: string | null;
  variants: number;
  stock: number;
  minPrice: number | null;
  maxPrice: number | null;
  image: string | null; // public URL
  listed: number;
  live: number; // counts of publications
}
export interface ProductListResponse {
  total: number;
  summary: { products: number; listed: number; live: number; noPhoto: number; unlistedInStock: number };
  items: ProductListItem[];
}

// GET /products/{productId}/listing   (perm product.view)
export type BuiltInPublicField = "product_name" | "brand" | "category" | "size" | "colour" | "style" | "mrp" | "sale_rate";
export interface ProductListingResponse {
  product: { id: UUID; name: string; brand: string; category: string };
  enabled: boolean;
  listedStoreIds: UUID[];
  description: string;
  fields: Record<string, boolean>; // field key -> shown
  tags: string[];
  images: Array<{ id: UUID; url: string | null }>; // max 8
  stores: Array<{ id: UUID; name: string; city: string; discoverable: boolean }>;
  customColumns: Array<{ key: string /* "custom:<fieldId>" */; label: string }>;
  variants: Array<{
    id: UUID;
    label: string;
    barcode: string;
    mrp: number;
    price: number;
    stock: Record<UUID /* storeId */, number>;
    status: Record<UUID /* storeId */, "hidden" | "in_stock" | "out_of_stock" | "paused">;
  }>;
  fieldOptions: Array<{ key: string; label: string }>; // built-ins + customColumns
}
// PUT /products/{productId}/listing   (owner or product.publication.manage)
export interface ProductListingBody {
  enabled: boolean;
  storeIds: UUID[];
  fields: string[] /* keys from fieldOptions */;
  description?: string /*<=600*/;
  tags?: string[]; /*<=20*/
}
export type ProductListingSaveResponse = FormActionOk; // "Listed on WowCity in N stores." | "Removed from WowCity." | "Saved. Nothing is live yet: ..."

// PATCH /products/{productId}/variants/{variantId}   (perm product.edit)
// WARNING: this is a FULL REPLACE, not a patch — omitted optional fields default to "" and CLEAR the value
// (brand, category, size, colour, style, hsnCode, internalDescription; publicDescription/tags too when caller has publication perm).
export interface ProductVariantUpdateBody {
  productName: string; // 1..160
  mrp: DecimalInput; // /^\d+(\.\d{1,2})?$/
  saleRate: DecimalInput; // <= mrp
  brand?: string;
  category?: string;
  size?: string;
  colour?: string;
  style?: string;
  hsnCode?: string; // "" or 4-8 digits
  gstCode?: string; // gst_slabs.code; "" keeps current slab
  internalDescription?: string; // <=1000
  publicDescription?: string; // <=1000 (needs product.publication.manage)
  tags?: string; // COMMA-SEPARATED string (not array), max 25 kept
  [customField: `custom_${string}`]: string; // custom_<fieldId>: string value; "" deletes. Fields not sent are left alone.
}
export type ProductVariantUpdateResponse = FormActionOk; // "Changes saved."

// =====================================================================================================
// CUSTOM FIELDS (owner only)
// =====================================================================================================
export type CustomFieldType = "text" | "number" | "decimal" | "select" | "multi_select" | "boolean" | "date" | "color" | "url" | "dropdown" /* legacy DB enum value, cannot be saved */;
// GET /custom-fields
export interface CustomField {
  id: UUID;
  name: string;
  field_type: CustomFieldType;
  options_json: string[];
  is_public_eligible: boolean;
  is_required_on_purchase: boolean;
  default_public_enabled: boolean;
  show_in_purchase_grid: boolean;
  show_in_sale_search: boolean;
  is_active: boolean;
  deleted_at: ISODateTime | null;
  sort_order: number;
} // snake_case, includes archived
export interface CustomFieldsResponse {
  fields: CustomField[];
}
// POST /custom-fields  (create, or update when fieldId). Same-name archived column is restored.
export interface CustomFieldSaveBody {
  fieldId?: UUID;
  name: string; // 1..48
  fieldType: Exclude<CustomFieldType, "dropdown">; // route accepts any string; action enforces enum
  options?: string; // COMMA-SEPARATED; required (>=1) for select/multi_select; max 50
  isRequiredOnPurchase?: boolean; // default false
  showInPurchaseGrid?: boolean; // default true
  showInSaleSearch?: boolean; // default false
  isPublicEligible?: boolean; // forced false if name looks private (cost, supplier, margin...)
  defaultPublicEnabled?: boolean;
}
export type CustomFieldSaveResponse = FormActionOk; // "<name> added|updated|restored.[ note]"
// POST /custom-fields/{fieldId}/archive
export interface CustomFieldArchiveBody {
  restore?: boolean;
}
// POST /custom-fields/{fieldId}/move
export interface CustomFieldMoveBody {
  direction: "up" | "down";
}
export interface CustomFieldUpdatedResponse {
  updated: true;
} // archive & move (no message)

// =====================================================================================================
// LABELS
// GET /labels/search?q=   (perm barcode.print; q < 2 chars -> items [])
// =====================================================================================================
export interface LabelItem {
  variantId: UUID;
  barcodeId: UUID;
  barcode: string;
  name: string;
  brand: string;
  size: string;
  color: string; // NOTE "color" (US) here vs "colour" elsewhere
  mrp: number;
  price: number;
  stock: number; // owner: all stores; worker: own stores
}
export interface LabelTemplate {
  key: "a4-3x4" | "a4-3x8" | "a4-4x10" | "roll-50x25";
  name: string;
  description: string;
  page: { width: number; height: number };
  columns: number;
  rows: number;
  label: { width: number; height: number };
  margin: { top: number; left: number };
  gap: { x: number; y: number };
  radius: number; // all mm
}
export type LabelFieldKey = "shop" | "name" | "variant" | "mrp" | "price" | "code";
export interface LabelSearchResponse {
  items: LabelItem[];
  templates: LabelTemplate[];
  fields: Array<{ key: LabelFieldKey; label: string }>;
}

// GET /labels/jobs?range=&from=&to=&source=purchase|manual&page=   (perm barcode.view|print; default 30d; page size 25)
export interface LabelJobsResponse {
  total: number;
  rows: Array<{ id: UUID; at: ISODateTime; source: "purchase" | "manual"; title: string; store: string | null; items: number; labels: number }>;
}
// GET /labels/jobs/{jobId}   (perm barcode.print)
export interface LabelJobResponse {
  items: Array<LabelItem & { copies: number }>;
}
// POST /labels/prints   (perm barcode.print; 201)
export interface LabelPrintBody {
  template: string /*<=40*/;
  items: Array<{ barcodeId: UUID; copies: number /* int 1..2000 */ }>; /* 1..500 */
}
export interface LabelPrintResponse {
  jobId: UUID;
}

// =====================================================================================================
// DUES (perm reports.due)
// GET /dues?party=customer|supplier&filter=owing|advance|settled|all&q=&page=   (defaults customer / owing; page size 50)
// Workers with reports.due CAN list supplier balances here (only statement is owner-only).
// =====================================================================================================
export interface PartyBalanceRow {
  id: UUID;
  name: string;
  mobile: string | null;
  balance: number /* >0 party owes (customer) / shop owes (supplier) */;
  lastActivity: ISODateTime | null;
  entries: number;
}
export interface DuesListResponse {
  total: number;
  summary: { owing: number; owingCount: number; advance: number; advanceCount: number; settledCount: number };
  items: PartyBalanceRow[];
}

// GET /dues/{party}/{partyId}   (supplier: owner only)
export interface StatementEntry {
  id: UUID;
  at: ISODateTime;
  type: string; // sale | sale_settlement | customer_advance_used | sale_return | customer_due_settlement | manual_customer_due | purchase | purchase_payment | supplier_due_payment | manual_supplier_due | ...
  label: string;
  reference: string | null;
  mode: string | null;
  increase: number;
  decrease: number;
  balance: number; // running, oldest first
  href: string | null; // WEB path for sale-linked rows
}
export interface DuesStatementResponse {
  party: { id: UUID; name: string; mobile: string | null; gstin: string | null; city?: string | null /* customer */; state?: string | null /* supplier */ };
  entries: StatementEntry[];
  balance: number;
  totals: { increase: number; decrease: number };
  reminder: { text: string; whatsappUrl: string } | null; // customers with balance > 0 only
}

// POST /dues/entries   (201). Staff may only record party=customer & kind=payment; everything else owner only.
export interface DueEntryBody {
  requestId: UUID; // idempotent (duplicate => success)
  party: "customer" | "supplier";
  partyId: UUID;
  kind: "payment" | "due";
  amount: DecimalInput; // > 0, <= 1e8, max 2 decimals; "₹", commas, spaces stripped
  mode?: "cash" | "upi" | "card" | "bank" | "cheque"; // required for kind=payment
  date?: ISODate; // not future; back-dated => noon IST
  reference?: string; // <=60
  note?: string; // <=120 (becomes the ledger label)
}
export type DueEntryResponse = FormActionOk; // "₹1,234.00 received from X." | "... paid to X." | "... due added for X."

// =====================================================================================================
// CUSTOMERS (owner only)
// GET /customers?q=&segment=all|repeat|new|lapsed|dues|top&sort=spent|recent|visits|dues|name&page=   (page size 50)
// =====================================================================================================
export interface CustomerRow {
  id: UUID;
  name: string;
  mobile: string | null;
  city: string | null;
  address: string | null;
  bills: number;
  spent: number;
  items: number;
  firstVisit: ISODateTime | null;
  lastVisit: ISODateTime | null;
  balance: number;
  createdAt: ISODateTime;
}
export interface CustomersResponse {
  total: number;
  summary: { customers: number; buyers: number; repeat: number; newThisMonth: number; lapsed: number; withDues: number; dues: number; spent: number }; // over all customers matching q (not segment)
  items: CustomerRow[];
}
// GET /customers/{customerId}
export interface CustomerDetailResponse {
  customer: { id: UUID; name: string; mobile: string | null; address: string | null; city: string | null; state: string | null; gstin: string | null; created_at: ISODateTime }; // snake_case
  stats: CustomerRow | null;
  bills: Array<{ id: UUID; bill_number: string; invoice_datetime: ISODateTime; net_sale_amount: number; amount_due: number; total_quantity: number }>; // snake_case, last 30 posted
}
// PATCH /customers/{customerId}  — FULL REPLACE (omitted fields cleared). `mobile` is effectively REQUIRED
// (route marks it optional but the action's schema requires the key; send "" to clear).
export interface CustomerUpdateBody {
  name: string /*1..120*/;
  mobile: string;
  address?: string;
  city?: string;
  state?: string;
  gstin?: string;
}
export type CustomerUpdateResponse = FormActionOk; // "Customer updated."

// =====================================================================================================
// REPORTS
// GET /reports
// =====================================================================================================
export type ReportGroup = "Sales" | "Purchase" | "Stock" | "GST" | "Profit" | "Dues & customers" | "Staff";
export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "month" | "last_month" | "fy" | "custom";
export interface ReportsIndexResponse {
  groups: Array<{
    group: ReportGroup;
    reports: Array<{
      slug: ReportSlug;
      title: string;
      description: string;
      dated: boolean;
      defaultRange: Exclude<RangePreset, "yesterday" | "custom"> | null;
      views: Array<{ key: string; label: string }>;
      searchable: string | null; /* search placeholder */
    }>;
  }>; // only groups with visible reports
}
// GET /reports/{slug}?range=&from=&to=&store=&view=&q=
export type CellFormat = "text" | "money" | "qty" | "percent" | "date" | "datetime" | "mono" | "badge";
// No explicit `align` field: numeric formats (money|qty|percent) are right-aligned on web (isNumeric()).
export interface ReportColumn {
  key: string;
  label: string;
  format?: CellFormat /* default "text" */;
  total?: boolean; // summed into totals row
  href?: string;
  hrefKey?: string; // row[hrefKey] holds a WEB path ("/app/sale/invoices/..", "/app/dues/..", "/app/insights/..")
  hideOnMobile?: boolean;
}
/** Row may carry `<columnKey>Format: CellFormat` overrides and `emphasis: true` (bold). */
export type ReportRow = Record<string, string | number | boolean | null | undefined>;
export interface ReportStat {
  label: string;
  value: number | string;
  format?: CellFormat;
  hint?: string;
  tone?: "positive" | "negative" | "warning";
}
export interface ReportTableOut {
  key: string;
  title?: string;
  description?: string;
  columns: ReportColumn[];
  rows: ReportRow[]; // capped at 5000
  truncated: boolean;
  totals: ReportRow | null; // explicit totals, else sum (3dp) of `total` columns, null when none/no rows
  emptyText?: string;
}
export interface ReportResponse {
  slug: ReportSlug;
  title: string;
  period: { from: ISODate; to: ISODate; label: string } | null; // null for undated reports
  view: string | null; // resolved view (invalid/absent -> first view)
  stats: ReportStat[];
  notes: string[];
  tables: ReportTableOut[];
}
/**
 * All reports (lib/reports/registry.ts). ownerOnly => workers never see them. perms = any-of.
 * slug                  | title                    | group            | dated | defaultRange | views                                   | perms (any)                | ownerOnly
 * sale                  | Sale report              | Sales            | yes   | 7d           | bills, items                            | reports.sale               |
 * sale-return           | Sale return report       | Sales            | yes   | 30d          | returns, items                          | reports.sale               |
 * sale-r                | Sales & returns (R)      | Sales            | yes   | 7d           | all, sales, returns                     | reports.sale               |
 * fast-moving           | Fast & slow movers       | Sales            | yes   | 30d          | fast, slow                              | reports.sale, reports.stock|
 * salesman-summary      | Staff sales summary      | Staff            | yes   | month        | -                                       | reports.salesman           | (not grantable => owner)
 * salesman              | Staff sales detail       | Staff            | yes   | 7d           | -                                       | reports.salesman           | (owner)
 * purchase              | Purchase report          | Purchase         | yes   | 30d          | bills, items                            | reports.purchase           | (owner)
 * stock                 | Stock report             | Stock            | no    | -            | in, products, stores, out, all          | reports.stock              |
 * stock-analysis        | Stock movement           | Stock            | yes   | month        | -                                       | reports.stock              |
 * dumped-stock          | Dumped stock             | Stock            | yes   | 30d          | out, all                                | reports.stock              |
 * stock-transfer        | Stock transfers          | Stock            | yes   | 30d          | challans, items                         | reports.stock              |
 * stock-hold            | Stock on hold            | Stock            | no    | -            | active, all                             | reports.stock, stock.unhold|
 * stock-conversion      | Stock conversion         | Stock            | yes   | 30d          | -                                       | reports.stock              |
 * gstr1                 | GSTR-1                   | GST              | yes   | last_month   | -                                       | reports.gst                | yes
 * gstr2                 | GSTR-2 (purchases)       | GST              | yes   | last_month   | -                                       | reports.gst                | yes
 * gstr3b                | GSTR-3B summary          | GST              | yes   | last_month   | -                                       | reports.gst                | yes
 * profit-loss-summary   | Profit & loss summary    | Profit           | yes   | month        | -                                       | reports.pnl                | yes
 * profit-loss-detailed  | Profit by bill or item   | Profit           | yes   | month        | bills, items                            | reports.pnl                | yes
 * customer-due          | Customer dues            | Dues & customers | no    | -            | any, 30, 60, 90                         | reports.due                |
 * customer-outstanding  | Customer outstanding     | Dues & customers | yes   | month        | open, all                               | reports.due                |
 * supplier-due          | Supplier dues            | Dues & customers | no    | -            | any, 30, 60, 90                         | reports.due, reports.purchase | yes
 * supplier-outstanding  | Supplier outstanding     | Dues & customers | yes   | month        | open, all                               | reports.due, reports.purchase | yes
 * customer              | Customer report          | Dues & customers | no    | -            | top, lapsed, new, all                   | reports.customer           | yes
 * Group order: Sales, Purchase, Stock, GST, Profit, Dues & customers, Staff.
 * Range (lib/date-range resolveRange): range = today|yesterday|7d|30d|month|last_month|fy|custom (IST dates).
 *   from/to (YYYY-MM-DD) are ONLY used when range=custom (swapped if reversed; defaults last 30 days).
 *   Unknown/absent range => the endpoint's fallback (report.defaultRange ?? "30d"; /sales "today"; /purchases & /labels/jobs "30d").
 *   Labels: "Today","Yesterday","Last 7 days","Last 30 days","This month","Last month","This financial year", custom "D Mon YYYY – D Mon YYYY".
 */
export type ReportSlug =
  | "sale"
  | "sale-return"
  | "sale-r"
  | "fast-moving"
  | "salesman-summary"
  | "salesman"
  | "purchase"
  | "stock"
  | "stock-analysis"
  | "dumped-stock"
  | "stock-transfer"
  | "stock-hold"
  | "stock-conversion"
  | "gstr1"
  | "gstr2"
  | "gstr3b"
  | "profit-loss-summary"
  | "profit-loss-detailed"
  | "customer-due"
  | "customer-outstanding"
  | "supplier-due"
  | "supplier-outstanding"
  | "customer";

// =====================================================================================================
// STAFF (owner only)
// GET /staff
// =====================================================================================================
export interface ShiftWindow {
  day_of_week: number /* 0=Sun */;
  start_time: string /* "HH:MM" */;
  end_time: string;
  enabled: boolean;
} // snake_case
export interface StaffMember {
  id: UUID;
  username: string;
  displayName: string;
  mobile: string | null;
  status: "active" | "disabled" | "locked" /* emergency lockdown */ | "off_shift";
  permissions: WorkerGrantablePermission[];
  stores: Array<{ id: UUID; name: string }>; // active stores only
  shifts: ShiftWindow[];
  createdAt: ISODateTime;
  lastLoginAt: ISODateTime | null;
  sales30d: { amount: number; bills: number };
  salesToday: { amount: number; bills: number };
}
export interface StaffListResponse {
  staff: StaffMember[];
  permissionGroups: PermissionGroup[];
  rolePresets: RolePreset[];
}

// GET /staff/{workerId}
export interface DeviceRow {
  id: UUID;
  name: string /* "Phone" default */;
  platform: string | null;
  createdAt: ISODateTime;
  lastUsedAt: ISODateTime;
}
export interface StaffDetailResponse {
  member: StaffMember;
  activity: Array<{
    id: UUID;
    action: string /* RAW code e.g. "sale_created", NOT the label */;
    amount: number | null;
    document_type: string | null;
    document_id: UUID | null;
    created_at: ISODateTime;
  }>; // last 25, snake_case
  bills: Array<{ id: UUID; number: string; at: ISODateTime; amount: number; due: number; customer: string | null }>; // last 10
  devices: DeviceRow[];
}
// POST /staff  (201)
export interface StaffCreateBody {
  displayName: string; // 2..80
  username: string; // 3..32, [a-z0-9._-], lower-cased
  password: string; // 6..72 (PIN or password)
  mobile?: string;
  preset?: "cashier" | "stock" | "manager"; // when given, OVERRIDES permissions
  permissions?: string[]; // default []; must yield >=1 grantable permission if no preset
  storeIds: UUID[]; // >=1, active stores
}
export interface StaffCreateResponse {
  message: string /* "<name> can now sign in." */;
  workerId: UUID;
}
// PATCH /staff/{workerId}
export interface StaffProfileBody {
  displayName: string;
  mobile?: string;
} // -> { message: "Details saved." }
// PUT /staff/{workerId}/access
export interface StaffAccessBody {
  permissions: string[] /*>=1*/;
  storeIds: UUID[]; /*>=1*/
} // -> "Access updated. It applies on their next tap."
// PUT /staff/{workerId}/shifts   (IST; end must be after start; restricted=true needs >=1 day)
export interface StaffShiftsBody {
  restricted: boolean;
  days?: Array<{ dayOfWeek: number /*0-6, 0=Sun*/; start: string /*HH:MM*/; end: string }>;
} // -> "Working hours saved. ..." | "They can now sign in any time."
// POST /staff/{workerId}/pin
export interface StaffPinBody {
  password: string; /*6..72*/
} // -> "Password changed. They were signed out everywhere."
// POST /staff/{workerId}/status
export interface StaffStatusBody {
  disabled: boolean;
} // -> "Account disabled and signed out." | "Account enabled."
// POST /staff/{workerId}/sign-out   body {}                                       // -> "Signed out on every device."
// POST /staff/lockdown
export interface StaffLockdownBody {
  lock: boolean;
} // -> "All staff are locked out and signed off." | "Staff locked by the emergency switch can sign in again."
export type StaffMutationResponse = FormActionOk;

// =====================================================================================================
// DEVICES (owner only)
// GET /devices   — owner's own active phone sessions (max 20)
export interface DevicesResponse {
  devices: DeviceRow[];
  currentDeviceId: UUID;
}
// DELETE /devices/{deviceId}   (owner's own or any staff device)  -> { message: "Phone signed out." }

// =====================================================================================================
// STORES
// GET /stores   (any signed-in; owner sees ALL stores incl. closed; staff only assigned ones)
// =====================================================================================================
export interface StoreRow {
  id: UUID;
  name: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  contact_phone: string | null;
  gstin: string | null;
  google_maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  is_discoverable: boolean;
  public_address_enabled: boolean;
  public_contact_enabled: boolean;
  is_active: boolean;
  invoice_prefix: string | null; // snake_case
  stats: { units: number; skus: number; salesToday: number; billsToday: number; staff: number } | null; // null for staff callers
}
export interface StoresResponse {
  stores: StoreRow[];
} // ordered by created_at
// POST /stores  (owner; create, or update when storeId)
export interface StoreSaveBody {
  storeId?: UUID;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string /* must be a GST state name */;
  pincode: string /* 6 digits */;
  contactPhone?: string;
  gstin?: string /* must match state */;
  googleMapsUrl?: string /* https Google Maps only */;
  latitude?: number;
  longitude?: number; // both needed to be stored
  isDiscoverable?: boolean;
  publicAddressEnabled?: boolean;
  publicContactEnabled?: boolean; // default false — full replace
}
export type StoreSaveResponse = FormActionOk; // "<name> saved." | "<name> added. Its bills will be numbered <prefix>." (no id returned!)
// POST /stores/{storeId}/close
export interface StoreCloseBody {
  mode?: "temporary" | "merge";
  targetStoreId?: UUID; /* required for merge */
} // -> "Store closed and its stock moved." | "Store closed. Its stock stays where it is."
// POST /stores/{storeId}/reopen
export interface StoreReopenBody {
  recallInventory?: boolean;
} // -> "Store reopened."

// =====================================================================================================
// SETTINGS (owner only)
// GET /settings
// =====================================================================================================
export interface InvoiceSettings {
  terms: string;
  upiId: string;
  payeeName: string;
  showUpiQr: boolean;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  printFormat: "a4" | "thermal";
}
export interface SettingsResponse {
  profile: { displayName: string; businessType: string; ownerName: string; phone: string; email: string; shopCode: string };
  tax: { legalName: string; gstin: string; stateCode: string | null; state: string; pan: string; roundingMode: RoundingMode };
  invoice: InvoiceSettings;
  gstSlabs: Array<{ code: string; label: string; rate: number; is_special: boolean }>;
  financialYears: Array<{ label: string; starts_on: ISODate; ends_on: ISODate; is_active: boolean }>; // snake_case
}
// NOTE: there is NO "PUT /settings". Updates are split:
// PUT /settings/profile
export interface SettingsProfileBody {
  displayName: string /*2..80*/;
  businessType: string /*2..60*/;
  ownerName: string /*2..80*/;
  phone?: string;
} // -> "Business profile saved."
// PUT /settings/tax
export interface SettingsTaxBody {
  legalName?: string;
  gstin?: string;
  state?: string;
  pan?: string;
  roundingMode: RoundingMode;
} // -> "Tax settings saved."
// PUT /settings/invoice  (full replace; omitted -> defaults, showUpiQr omitted => true in route but false if sent false)
export interface SettingsInvoiceBody {
  terms?: string /*<=500*/;
  upiId?: string /* name@bank */;
  payeeName?: string /*<=60*/;
  showUpiQr?: boolean;
  bankName?: string;
  accountName?: string;
  accountNumber?: string /* 6-20 digits */;
  ifsc?: string /* AAAA0XXXXXX */;
  printFormat?: "a4" | "thermal";
} // -> "Invoice settings saved."
// POST /settings/password  (revokes ALL owner device sessions incl. this one)
export interface SettingsPasswordBody {
  currentPassword: string;
  newPassword: string /*8..72*/;
  confirmPassword: string;
} // -> "Password changed. Your phones were signed out."
export type SettingsMutationResponse = FormActionOk;

// =====================================================================================================
// NOT PRESENT
// - DELETE /api/v1/account (or any account/shop deletion) does not exist anywhere in the backend.
// - No v1 endpoint for: supplier detail, sale estimates list, held bills, stock conversion/hold, image
//   upload/delete for existing products (only via purchase rows), financial-year changes.
// =====================================================================================================

/* AMBIGUITIES / NOTES
 * 1. Money types are inconsistent: /catalog/lookup, /sales/original-bill, /purchases/barcode-lookup return
 *    mrp/rate/gstRate as STRINGS (String(numeric) — "999", not "999.00"; unitRefund is toFixed(2)); POST /sales
 *    returns changeDue/refundAmount as "0.00" strings; POST /purchases returns total as string. Everything else
 *    (loaders, SQL RPCs) returns numbers. /sync/catalog gstRate/mrp/rate are numbers.
 * 2. RAW routes (catalog/lookup, customers/search, sales/original-bill, purchases/barcode-lookup, r2 upload) have
 *    no {data} envelope, error is {error: string}, no Cache-Control header, and they also accept cookies.
 * 3. Raw PostgREST numeric columns are assumed to serialise as JSON numbers (supabase-js default). timestamptz from
 *    PostgREST look like "2026-09-27T05:12:00.123+00:00"; jsonb RPC timestamps similar.
 * 4. /stock unitCost & summary.costValue are NOT masked for workers lacking purchase.view_cost (purchase routes mask).
 * 5. /stock status "in" means qty > 5 (LOW_STOCK_LEVEL), not qty > 0.
 * 6. stock.dump / stock.transfer / purchase.return / reports.purchase / reports.salesman / stock.unhold are not
 *    worker-grantable, so stock adjust/transfer, purchase returns and those reports are owner-only in practice.
 * 7. PATCH variant, PATCH customer, POST stores, PUT settings/invoice are full replaces; omitted fields are cleared.
 * 8. POST /suppliers and POST /stores do not return the created id (message only).
 * 9. Failure details like purchase rowErrors / product fieldErrors are dropped by runFormAction (message only).
 * 10. Custom-field archive/move return {updated:true} even if the id doesn't exist; errors map to 422 "rejected".
 * 11. POST /sales success includes `ok: true` (not stripped like form actions).
 * 12. OwnerDashboard.storeId is omitted (undefined) rather than null when no store filter.
 * 13. customValues value_json in StockItemDetail may be string (PATCH always stores strings) or number/boolean
 *     (purchase rows keep the JSON type). multi_select representation is whatever the client sent.
 * 14. HistoryRow.href / StatementEntry.href / report hrefKey values are web paths ("/app/..."), not API paths.
 * 15. GET /sales always restricts workers to their own bills, but GET /sales/{id} lets a worker open ANY bill in
 *     their stores.
 * 16. GET /dues lets workers with reports.due list supplier balances; only the supplier statement is owner-only.
 * 17. Label items use `color`; every other endpoint uses `colour`. Stock item uses `price` for sale rate while
 *     /stock uses `saleRate` and lookup uses `rate`.
 * 18. /purchases/barcode-lookup inStock sums ALL stores, not just the caller's.
 * 19. Custom field DB enum also contains legacy "dropdown" (cannot be saved via API).
 * 20. PurchaseRowInput.rowId is only an echo key for errors; image upload `productId` just needs to be any UUID
 *     (the web uses a per-row UUID) since the object key is validated only by the "sellers/<sellerId>/" prefix.
 */

// GET/POST /products/{productId}/images, PATCH/DELETE /products/{productId}/images/{imageId} (product.images.manage).
export interface ProductImage {
  id: UUID;
  url: string | null;
  isPrimary: boolean; // the cover buyers see first
  sortOrder: number;
  variantId: UUID | null;
}
export interface ProductImageAddBody {
  objectKey: string; // from POST /api/r2/product-image-upload, after the PUT succeeded
  contentType: "image/jpeg" | "image/png" | "image/webp";
  variantId?: UUID;
}

// ---------------------------------------------------------------------------------------------
// AI assistant (POST /assistant): answers from this shop's data only, through server-side tools.
export type AssistantTurn = { role: "user" | "assistant"; content: string };
export type AssistantStatus = { enabled: boolean; questionsToday: number; dailyLimit: number };
export type AssistantAskBody = { messages: AssistantTurn[] };
export type AssistantAnswer = { answer: string; toolsUsed: string[]; questionsToday: number | null; dailyLimit: number };
