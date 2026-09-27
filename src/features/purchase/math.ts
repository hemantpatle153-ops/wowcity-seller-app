/**
 * Purchase bill maths (client-side preview). Mirrors the server's savePurchaseAction:
 *  - row gross = qty × purchase rate
 *  - row discount = gross × disc1% + disc1 ₹ + disc2 ₹ (capped at gross)
 *  - bill (extra) discount = base × extra% + extra ₹ (capped at base), shared across rows by value,
 *    the last row taking the remainder so the shares add up exactly
 *  - inclusive pricing: taxable = value / (1 + rate); exclusive: GST = taxable × rate
 *  - total = taxable + GST + TCS, rounded per the shop's invoice rounding
 * The server recomputes everything; this only has to agree to the paisa for the preview.
 */
import Decimal from "decimal.js";
import { applyInvoiceRounding, money, type PricingMode, type RoundingMode } from "@/lib/saleMath";

export type PurchaseCalcRow = {
  qty: string | number;
  purchaseRate: string | number;
  disc1Percent?: string | number;
  disc1Amount?: string | number;
  disc2Amount?: string | number;
  gstRate: string | number;
  mrp?: string | number;
};

export type PurchaseCalcOptions = {
  mode: PricingMode;
  extraDiscountPercent?: string | number;
  extraDiscountAmount?: string | number;
  tcsAmount?: string | number;
  roundingMode?: RoundingMode;
};

export type PurchaseRowCalc = { gross: number; discount: number; extraShare: number; value: number; taxable: number; gst: number; total: number };

export type PurchaseTotals = {
  rows: PurchaseRowCalc[];
  qty: number;
  gross: number;
  lineDiscount: number;
  extraDiscount: number;
  discount: number;
  taxable: number;
  gst: number;
  tcs: number;
  roundOff: number;
  total: number;
  mrpValue: number;
};

/** Parse a form value: "" or junk → 0, never negative, never NaN. */
export function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value !== "string") return 0;
  const text = value.trim().replace(/,/g, "");
  if (!text) return 0;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Round half-up to 2 places without float drift (1.005 → 1.01). */
export function r2(n: number) {
  return Number(money(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2));
}

export function calculatePurchase(rows: PurchaseCalcRow[], options: PurchaseCalcOptions): PurchaseTotals {
  const parsed = rows.map((row) => {
    const qty = num(row.qty);
    const gross = r2(qty * num(row.purchaseRate));
    const discount = Math.min(gross, r2(gross * (Math.min(100, num(row.disc1Percent)) / 100) + num(row.disc1Amount) + num(row.disc2Amount)));
    return { qty, gross, discount, afterDisc: r2(gross - discount), rate: num(row.gstRate), mrp: num(row.mrp) };
  });
  const base = r2(parsed.reduce((t, p) => t + p.afterDisc, 0));
  const extra = Math.min(base, r2(base * (Math.min(100, num(options.extraDiscountPercent)) / 100) + num(options.extraDiscountAmount)));
  let remaining = extra;
  const calc: PurchaseRowCalc[] = parsed.map((p, index) => {
    const share = index === parsed.length - 1 ? remaining : base > 0 ? r2((extra * p.afterDisc) / base) : 0;
    remaining = r2(remaining - share);
    const value = Math.max(0, r2(p.afterDisc - share));
    const fraction = p.rate / 100;
    const taxable = options.mode === "inclusive" ? r2(value / (1 + fraction)) : value;
    const gst = options.mode === "inclusive" ? r2(value - taxable) : r2(taxable * fraction);
    return { gross: p.gross, discount: p.discount, extraShare: share, value, taxable, gst, total: r2(taxable + gst) };
  });
  const taxable = r2(calc.reduce((t, c) => t + c.taxable, 0));
  const gst = r2(calc.reduce((t, c) => t + c.gst, 0));
  const tcs = r2(num(options.tcsAmount));
  const exact = r2(taxable + gst + tcs);
  const total = Number(applyInvoiceRounding(money(exact), options.roundingMode ?? "nearest_rupee").toFixed(2));
  const lineDiscount = r2(calc.reduce((t, c) => t + c.discount, 0));
  return {
    rows: calc,
    qty: Math.round(parsed.reduce((t, p) => t + p.qty, 0) * 1000) / 1000,
    gross: r2(parsed.reduce((t, p) => t + p.gross, 0)),
    lineDiscount,
    extraDiscount: extra,
    discount: r2(lineDiscount + extra),
    taxable,
    gst,
    tcs,
    roundOff: r2(total - exact),
    total,
    mrpValue: r2(parsed.reduce((t, p) => t + p.mrp * p.qty, 0))
  };
}

/** Paid now and still due on the bill (never negative). */
export function purchaseDue(total: number, payments: { amount: string | number }[]) {
  const paid = r2(payments.reduce((t, p) => t + num(p.amount), 0));
  return { paid, due: Math.max(0, r2(total - paid)), over: Math.max(0, r2(paid - total)) };
}

/** Margin of the sale rate over the landed unit cost, as a percent (null when unknown). */
export function marginPercent(unitCost: number, saleRate: number): number | null {
  if (!(unitCost > 0) || !(saleRate > 0)) return null;
  return Math.round(((saleRate - unitCost) / saleRate) * 1000) / 10;
}

/** API numbers are "" or /^\d+(\.\d{1,3})?$/. Normalises what people type ("1,200.5" → "1200.5"). */
export function cleanDecimal(value: string, places = 3): string {
  const text = value.replace(/,/g, "").trim();
  if (!text) return "";
  const match = /^(\d*)(?:\.(\d*))?/.exec(text);
  if (!match) return "";
  const int = (match[1] || "0").replace(/^0+(?=\d)/, "");
  const frac = (match[2] ?? "").slice(0, places);
  return frac ? `${int}.${frac}` : int;
}

/** Keeps only what a decimal field can hold while typing ("12.", "0.5" stay as typed). */
export function typingDecimal(value: string, places = 3): string {
  const text = value.replace(/[^0-9.]/g, "");
  const [int, ...rest] = text.split(".");
  if (!rest.length) return int;
  return `${int}.${rest.join("").slice(0, places)}`;
}
