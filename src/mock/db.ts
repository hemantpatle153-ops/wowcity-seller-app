/**
 * Shape of the mock backend's in-memory database plus small pure helpers over it. The singleton
 * lives in state.ts; everything here takes the db as an argument so there are no import cycles.
 */
import type { CustomField, LabelTemplate, PricingMode, SettingsResponse, ShiftWindow, WorkerGrantablePermission } from "@/api/types";
import { sum } from "./util";

export interface ActorRef {
  kind: "owner" | "worker";
  id: string;
}

export interface DbStore {
  id: string;
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
  invoice_prefix: string;
  createdAt: string;
  billCounter: number;
  estimateCounter: number;
}

export interface DbProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  hsnCode: string;
  active: boolean;
  createdAt: string;
  listing: { enabled: boolean; storeIds: string[]; fields: string[]; description: string; tags: string[] };
  images: Array<{ id: string; url: string | null; variantId: string | null; isPrimary: boolean }>;
}

export interface DbVariant {
  id: string;
  productId: string;
  size: string;
  colour: string;
  style: string;
  mrp: number;
  saleRate: number;
  gstCode: string;
  active: boolean;
  barcodes: Array<{ id: string; barcode: string }>;
  unitCost: number | null;
  internalDescription: string | null;
  customValues: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  changedAt: string;
}

export type MovementType = "purchase" | "sale" | "purchase_return" | "sale_return" | "transfer" | "conversion" | "dump" | "adjustment";
export interface DbMovement {
  id: string;
  variantId: string;
  storeId: string;
  type: MovementType;
  documentId: string;
  qty: number;
  at: string;
}

export interface DbCustomer {
  id: string;
  name: string;
  mobile: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  gstin: string | null;
  createdAt: string;
  changedAt: string;
}
export interface DbSupplier {
  id: string;
  name: string;
  mobile: string;
  gstin: string;
  state: string;
  address: string;
  active: boolean;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  party: "customer" | "supplier";
  partyId: string;
  at: string;
  type: string;
  label: string;
  reference: string | null;
  mode: string | null;
  increase: number;
  decrease: number;
  href: string | null;
  requestId?: string;
}

export interface DbInvoiceLine {
  id: string;
  variantId: string;
  productId: string;
  name: string;
  brand: string;
  detail: string;
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
  unitCost: number | null;
  returned: number;
}
export interface DbInvoice {
  id: string;
  billNumber: string;
  storeId: string;
  at: string;
  financialYear: string;
  isEstimate: boolean;
  taxType: PricingMode;
  customerId: string | null;
  customer: { name: string; mobile: string; address: string; state: string; gstin: string } | null;
  by: ActorRef;
  lines: DbInvoiceLine[];
  totals: { quantity: number; taxable: number; gst: number; discount: number; roundOff: number; net: number; paid: number; due: number; savings: number; mrp: number };
  payments: Array<{ mode: string; amount: number; reference: string }>;
  interState: boolean;
  offline: boolean;
}
export interface DbReturn {
  id: string;
  returnNumber: string;
  creditNoteNumber: string | null;
  invoiceId: string | null;
  storeId: string;
  at: string;
  customerId: string | null;
  customerName: string | null;
  customerMobile: string | null;
  refundMode: "cash" | "credit_note";
  amount: number;
  qty: number;
  by: ActorRef;
  lines: Array<{ originalItemId: string | null; variantId: string; name: string; qty: number; amount: number; gstRate: number; taxable: number; gst: number }>;
}

export interface DbPurchaseItem {
  id: string;
  variantId: string;
  barcode: string;
  name: string;
  detail: string;
  qty: number;
  rate: number;
  discount: number;
  taxable: number;
  gstRate: number;
  gst: number;
  total: number;
  mrp: number;
  price: number;
  returned: number;
}
export interface DbPurchase {
  id: string;
  date: string; // YYYY-MM-DD
  invoice: string;
  supplierId: string | null;
  storeId: string;
  pricing: PricingMode;
  items: DbPurchaseItem[];
  totals: { qty: number; gross: number; discount: number; taxable: number; gst: number; tcs: number; roundOff: number; total: number; mrp: number };
  payments: Array<{ mode: string; amount: number; reference: string; at: string }>;
  returns: Array<{ id: string; number: string; date: string; amount: number; reason: string; qty: number }>;
  labelJobId: string | null;
  createdAt: string;
  by: ActorRef;
}

export interface DbWorker {
  id: string;
  username: string;
  displayName: string;
  mobile: string | null;
  pin: string;
  disabled: boolean;
  permissions: WorkerGrantablePermission[];
  storeIds: string[];
  restricted: boolean;
  shifts: ShiftWindow[];
  createdAt: string;
  lastLoginAt: string | null;
}

export interface DbDevice {
  id: string;
  actor: ActorRef;
  name: string;
  platform: string | null;
  createdAt: string;
  lastUsedAt: string;
  revoked: boolean;
}
export interface DbLabelJob {
  id: string;
  at: string;
  source: "purchase" | "manual";
  title: string;
  storeId: string | null;
  template: string;
  items: Array<{ variantId: string; barcodeId: string; copies: number }>;
}
export interface DbActivity {
  id: string;
  by: ActorRef;
  action: string;
  label: string;
  amount: number | null;
  documentType: string | null;
  documentId: string | null;
  at: string;
}
export interface DbTransfer {
  id: string;
  challan: string;
  variantId: string;
  fromStoreId: string;
  toStoreId: string;
  qty: number;
  at: string;
  by: ActorRef;
}
export interface DbAdjustment {
  id: string;
  variantId: string;
  storeId: string;
  direction: "add" | "remove";
  qty: number;
  reason: string;
  note: string;
  at: string;
  by: ActorRef;
}

export interface Session {
  id: string;
  actor: ActorRef;
  deviceId: string;
  refreshToken: string;
  revoked: boolean;
}

export interface Db {
  seededAt: Date;
  sellerId: string;
  owner: { id: string; name: string; email: string; password: string };
  lockdown: boolean;
  settings: SettingsResponse;
  stores: DbStore[];
  products: DbProduct[];
  variants: DbVariant[];
  stock: Record<string, Record<string, number>>;
  movements: DbMovement[];
  customers: DbCustomer[];
  suppliers: DbSupplier[];
  ledger: LedgerEntry[];
  invoices: DbInvoice[];
  returns: DbReturn[];
  purchases: DbPurchase[];
  workers: DbWorker[];
  devices: DbDevice[];
  customFields: CustomField[];
  labelTemplates: LabelTemplate[];
  labelJobs: DbLabelJob[];
  activity: DbActivity[];
  transfers: DbTransfer[];
  adjustments: DbAdjustment[];
  sessions: Map<string, Session>;
  accessTokens: Map<string, string>; // token -> session id
  refreshTokens: Map<string, { sessionId: string; current: boolean }>;
  idempotency: Map<string, unknown>;
  counters: { saleReturn: number; creditNote: number; debitNote: number; challan: number; barcode: number; token: number };
  lastTouch: number;
}

// ---------------------------------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------------------------------
export const findStore = (db: Db, id: string | null | undefined) => db.stores.find((s) => s.id === id);
export const findVariant = (db: Db, id: string | null | undefined) => db.variants.find((v) => v.id === id);
export const findProduct = (db: Db, id: string | null | undefined) => db.products.find((p) => p.id === id);
export const findCustomer = (db: Db, id: string | null | undefined) => db.customers.find((c) => c.id === id);
export const findSupplier = (db: Db, id: string | null | undefined) => db.suppliers.find((s) => s.id === id);
export const findWorker = (db: Db, id: string | null | undefined) => db.workers.find((w) => w.id === id);

export function productOf(db: Db, variant: DbVariant): DbProduct {
  return findProduct(db, variant.productId) as DbProduct;
}
export function variantDetail(variant: DbVariant): string {
  return [variant.size, variant.colour].filter(Boolean).join(" / ");
}
export function variantLabel(variant: DbVariant): string {
  return variantDetail(variant) || "Standard";
}
export function primaryBarcode(variant: DbVariant): string | null {
  return variant.barcodes[0]?.barcode ?? null;
}
export function gstSlab(db: Db, code: string) {
  return db.settings.gstSlabs.find((s) => s.code === code) ?? null;
}
export function gstRateOf(db: Db, variant: DbVariant): number {
  return gstSlab(db, variant.gstCode)?.rate ?? 0;
}
export function gstCodeForRate(rate: number): string {
  return `GST${rate}`;
}

export function qtyAt(db: Db, variantId: string, storeId: string): number {
  return db.stock[variantId]?.[storeId] ?? 0;
}
export function qtyIn(db: Db, variantId: string, storeIds: string[]): number {
  return sum(storeIds, (storeId) => qtyAt(db, variantId, storeId));
}

/** Monotonic ISO timestamp so sync cursors never skip a change made in the same millisecond. */
export function touchTime(db: Db): string {
  const t = Math.max(Date.now(), db.lastTouch + 1);
  db.lastTouch = t;
  return new Date(t).toISOString();
}

export function addStock(db: Db, variantId: string, storeId: string, delta: number, type: MovementType, documentId: string, at: string, id: string) {
  const byStore = (db.stock[variantId] ??= {});
  byStore[storeId] = Math.round(((byStore[storeId] ?? 0) + delta) * 1000) / 1000;
  db.movements.push({ id, variantId, storeId, type, documentId, qty: delta, at });
  const variant = findVariant(db, variantId);
  if (variant) variant.changedAt = touchTime(db);
}

export function partyBalance(db: Db, party: "customer" | "supplier", partyId: string): number {
  let balance = 0;
  for (const entry of db.ledger) if (entry.party === party && entry.partyId === partyId) balance += entry.increase - entry.decrease;
  return Math.round(balance * 100) / 100;
}

export function actorName(db: Db, actor: ActorRef): string {
  if (actor.kind === "owner") return db.owner.name;
  return findWorker(db, actor.id)?.displayName ?? "Staff";
}

export function storeAddress(store: DbStore): string {
  return [store.address_line_1, store.address_line_2, store.city, store.pincode].filter(Boolean).join(", ");
}

export function postedInvoices(db: Db): DbInvoice[] {
  return db.invoices.filter((invoice) => !invoice.isEstimate);
}
