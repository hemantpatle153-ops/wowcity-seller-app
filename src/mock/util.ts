/**
 * Shared helpers for the in-app mock backend (src/mock): seeded PRNG, ids, dates and ranges, money,
 * HTTP-ish results and the permission catalogue. Nothing here touches the mock database.
 */
import type { PermissionGroup, RolePreset, WorkerGrantablePermission } from "@/api/types";

// ---------------------------------------------------------------------------------------------------
// PRNG + ids
// ---------------------------------------------------------------------------------------------------
export type Rng = () => number;

/** mulberry32: small, fast, deterministic. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function uuidFrom(rng: Rng): string {
  let hex = "";
  for (let i = 0; i < 32; i++) hex += Math.floor(rng() * 16).toString(16);
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Runtime ids (not seed data): seeded from the clock so every app launch gets fresh ids.
const runtimeRng = createRng(Date.now() % 2147483647);
export function newId(): string {
  return uuidFrom(runtimeRng);
}
export function randomToken(length = 32): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(runtimeRng() * alphabet.length)];
  return out;
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}
export function intBetween(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** EAN-13 with a valid check digit from a 12-digit body. */
export function ean13(body12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  return `${body12}${(10 - (sum % 10)) % 10}`;
}

// ---------------------------------------------------------------------------------------------------
// Dates (local time stands in for IST)
// ---------------------------------------------------------------------------------------------------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseIsoDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds());
}
export function dayLabel(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

export function financialYearOf(d: Date) {
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return {
    label: `${startYear}-${startYear + 1}`,
    short: `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`,
    start: new Date(startYear, 3, 1),
    end: new Date(startYear + 1, 2, 31)
  };
}

export interface ResolvedRange {
  key: string;
  from: string;
  to: string;
  label: string;
  start: number; // ms, inclusive
  end: number; // ms, exclusive
}

/** lib/date-range resolveRange: today|yesterday|7d|30d|month|last_month|fy|custom. */
export function resolveRange(range: string | null, fromParam: string | null, toParam: string | null, fallback: string, now = new Date()): ResolvedRange {
  const valid = ["today", "yesterday", "7d", "30d", "month", "last_month", "fy", "custom"];
  const key = range && valid.includes(range) ? range : fallback;
  const today = startOfDay(now);
  let from = today;
  let to = today;
  let label = "Today";
  switch (key) {
    case "yesterday":
      from = to = addDays(today, -1);
      label = "Yesterday";
      break;
    case "7d":
      from = addDays(today, -6);
      label = "Last 7 days";
      break;
    case "30d":
      from = addDays(today, -29);
      label = "Last 30 days";
      break;
    case "month":
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      label = "This month";
      break;
    case "last_month":
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0);
      label = "Last month";
      break;
    case "fy":
      from = financialYearOf(today).start;
      label = "This financial year";
      break;
    case "custom": {
      let a = parseIsoDate(fromParam) ?? addDays(today, -29);
      let b = parseIsoDate(toParam) ?? today;
      if (a > b) [a, b] = [b, a];
      from = a;
      to = b;
      label = `${dayLabel(a)} – ${dayLabel(b)}`;
      break;
    }
    default:
      break;
  }
  return { key, from: isoDate(from), to: isoDate(to), label, start: from.getTime(), end: addDays(startOfDay(to), 1).getTime() };
}

export function inRange(at: string, range: ResolvedRange): boolean {
  const t = new Date(at).getTime();
  return t >= range.start && t < range.end;
}

// ---------------------------------------------------------------------------------------------------
// Money & numbers
// ---------------------------------------------------------------------------------------------------
export function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function r3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}
/** Parses a DecimalInput ("1,234.5", "₹ 99", 12) to a number; NaN when not numeric. */
export function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const cleaned = value.replace(/[₹,\s]/g, "");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}
/** ₹1,23,456.00 (Indian digit grouping). */
export function inr(n: number): string {
  const negative = n < 0;
  const [whole, fraction] = Math.abs(n).toFixed(2).split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${negative ? "-" : ""}₹${grouped}.${fraction}`;
}
export function sum<T>(list: readonly T[], pick: (item: T) => number): number {
  return list.reduce((total, item) => total + pick(item), 0);
}
/** "12" / "999.5" — like String(numeric) on the server. */
export function numStr(n: number): string {
  return String(r2(n));
}

// ---------------------------------------------------------------------------------------------------
// Results & errors
// ---------------------------------------------------------------------------------------------------
export interface MockResult {
  status: number;
  body: unknown; // object -> JSON; string -> text as is
  contentType?: string;
}

export class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const ok = (data: unknown, status = 200): MockResult => ({ status, body: { data } });
export const raw = (body: unknown, status = 200): MockResult => ({ status, body });
export const csvResult = (text: string): MockResult => ({ status: 200, body: text, contentType: "text/csv; charset=utf-8" });

export function reject(message: string): never {
  throw new MockHttpError(422, "rejected", message);
}
export function invalid(message: string): never {
  throw new MockHttpError(422, "invalid_input", message);
}
export function forbidden(message = "You do not have permission for this."): never {
  throw new MockHttpError(403, "forbidden", message);
}
export function notFound(message = "Not found."): never {
  throw new MockHttpError(404, "not_found", message);
}

export function paginate<T>(list: T[], page: number, size: number): T[] {
  return list.slice((page - 1) * size, page * size);
}
export function pageParam(value: string | null): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function str(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : typeof value === "number" ? String(value) : "";
}
export function includesText(haystack: Array<string | null | undefined>, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return haystack.some((value) => (value ?? "").toLowerCase().includes(needle));
}

// ---------------------------------------------------------------------------------------------------
// Permissions (lib/auth/permissions.ts)
// ---------------------------------------------------------------------------------------------------
export const ALL_PERMISSIONS = [
  "purchase.view",
  "purchase.create",
  "purchase.edit",
  "purchase.return",
  "purchase.post",
  "purchase.view_cost",
  "sale.view",
  "sale.create",
  "sale.return",
  "sale.discount_override",
  "sale.print_invoice",
  "sale.download_invoice",
  "stock.view",
  "stock.transfer",
  "stock.convert",
  "stock.dump",
  "stock.unhold",
  "product.view",
  "product.create",
  "product.edit",
  "product.images.manage",
  "product.publication.manage",
  "product.custom_columns.manage",
  "worker.view",
  "worker.create",
  "worker.edit",
  "worker.disable",
  "worker.view_logs",
  "barcode.view",
  "barcode.print",
  "reports.purchase",
  "reports.sale",
  "reports.stock",
  "reports.gst",
  "reports.pnl",
  "reports.due",
  "reports.customer",
  "reports.salesman",
  "reports.export",
  "settings.store",
  "settings.tax",
  "settings.financial_year",
  "settings.visibility_defaults",
  "settings.roles"
] as const;

export const GRANTABLE: WorkerGrantablePermission[] = [
  "sale.create",
  "sale.view",
  "sale.return",
  "sale.discount_override",
  "purchase.create",
  "purchase.view",
  "purchase.view_cost",
  "product.view",
  "product.edit",
  "product.images.manage",
  "stock.view",
  "barcode.view",
  "barcode.print",
  "reports.sale",
  "reports.stock",
  "reports.due"
];

const IMPLIED: Record<string, string> = {
  "sale.create": "sale.view",
  "sale.return": "sale.view",
  "sale.discount_override": "sale.view",
  "purchase.create": "purchase.view",
  "purchase.view_cost": "purchase.view",
  "product.edit": "product.view",
  "product.images.manage": "product.view",
  "barcode.print": "barcode.view"
};

export function normalizeWorkerPermissions(input: readonly string[]): WorkerGrantablePermission[] {
  const set = new Set(input.filter((p) => (GRANTABLE as string[]).includes(p)));
  for (const p of [...set]) if (IMPLIED[p]) set.add(IMPLIED[p]);
  return GRANTABLE.filter((p) => set.has(p));
}

export const permissionGroups: PermissionGroup[] = [
  {
    group: "Sales",
    items: [
      { key: "sale.create", label: "Make bills", description: "Scan items, take payment and save bills." },
      { key: "sale.view", label: "See bills", description: "Open past bills and reprint them." },
      { key: "sale.return", label: "Take returns", description: "Accept returns and give refunds or credit notes." },
      { key: "sale.discount_override", label: "Change prices & discounts", description: "Edit the rate and give discounts on a bill." }
    ]
  },
  {
    group: "Purchase & products",
    items: [
      { key: "purchase.create", label: "Enter purchases", description: "Add supplier bills and new stock." },
      { key: "purchase.view", label: "See purchases", description: "Open purchase bills and suppliers." },
      { key: "purchase.view_cost", label: "See cost prices", description: "See purchase rates, margins and supplier dues." },
      { key: "product.view", label: "See products", description: "Browse products and their details." },
      { key: "product.edit", label: "Edit products", description: "Change names, prices and details." },
      { key: "product.images.manage", label: "Manage photos", description: "Add and remove product photos." }
    ]
  },
  {
    group: "Stock & labels",
    items: [
      { key: "stock.view", label: "See stock", description: "Check stock in their stores." },
      { key: "barcode.view", label: "See label jobs", description: "See barcode label print history." },
      { key: "barcode.print", label: "Print labels", description: "Print barcode labels for items." }
    ]
  },
  {
    group: "Reports & money",
    items: [
      { key: "reports.sale", label: "Sales reports", description: "Sales, returns and fast movers." },
      { key: "reports.stock", label: "Stock reports", description: "Stock, movement and transfers." },
      { key: "reports.due", label: "Dues", description: "See customer dues and record payments." }
    ]
  }
];

export const rolePresets: RolePreset[] = [
  { key: "cashier", label: "Cashier", description: "Bills and returns at the counter.", permissions: ["sale.view", "sale.create", "sale.return"] },
  {
    key: "stock",
    label: "Stock keeper",
    description: "Purchases, stock and labels.",
    permissions: ["purchase.view", "purchase.create", "stock.view", "product.view", "barcode.view", "barcode.print"]
  },
  { key: "manager", label: "Manager", description: "Everything staff can be given.", permissions: [...GRANTABLE] }
];
