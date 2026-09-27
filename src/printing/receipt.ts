import type { MeResponse, SaleInvoice } from "@/api/types";
import type { CartState } from "@/features/sell/cart";
import type { CartTotals } from "@/features/sell/totals";

/** Everything a receipt needs, from a server invoice or from a bill made offline. */
export type ReceiptData = {
  kind: "sale" | "return" | "estimate";
  number: string;
  /** Offline bills print a temporary reference until the real number exists. */
  provisional: boolean;
  date: string;
  shop: { name: string; legalName: string; gstin: string };
  store: { name: string; address: string; state: string; phone: string };
  customer: { name: string; mobile: string; address: string; state: string; gstin: string } | null;
  soldBy: string | null;
  lines: { name: string; detail: string; hsn: string; qty: number; mrp: number; rate: number; discount: number; gstRate: number; net: number }[];
  gstSummary: { rate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
  interState: boolean;
  totals: { quantity: number; mrp: number; discount: number; taxable: number; gst: number; roundOff: number; net: number; paid: number; due: number; savings: number; change: number };
  payments: { mode: string; amount: number; reference: string }[];
  refundMode?: "cash" | "credit_note";
  terms: string;
  upi: { uri: string; amount: number; upiId: string; svg?: string } | null;
  bank: { name: string; accountName: string; accountNumber: string; ifsc: string } | null;
};

export function receiptFromInvoice(invoice: SaleInvoice): ReceiptData {
  const paid = invoice.totals.paid;
  return {
    kind: invoice.isEstimate ? "estimate" : "sale",
    number: invoice.billNumber,
    provisional: false,
    date: invoice.date,
    shop: invoice.shop,
    store: invoice.store,
    customer: invoice.customer,
    soldBy: invoice.soldBy,
    lines: invoice.lines.map((l) => ({
      name: l.name,
      detail: [l.brand, l.detail].filter(Boolean).join(" · "),
      hsn: l.hsn,
      qty: l.qty,
      mrp: l.mrp,
      rate: l.rate,
      discount: l.discount,
      gstRate: l.gstRate,
      net: l.net
    })),
    gstSummary: invoice.gstSummary,
    interState: invoice.interState,
    totals: { ...invoice.totals, mrp: invoice.lines.reduce((s, l) => s + l.mrp * l.qty, 0), change: Math.max(0, paid - invoice.totals.net) },
    payments: invoice.payments,
    terms: invoice.terms,
    upi: invoice.upi ? { uri: invoice.upi.uri, amount: invoice.upi.amount, upiId: invoice.upi.upiId, svg: invoice.upi.svg } : null,
    bank: invoice.bank
  };
}

export function upiUri(upiId: string, payee: string, amount: number, note: string) {
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
}

/** Receipt for a bill built on this phone (offline, or before the server copy is loaded). */
export function receiptFromCart(
  cart: CartState,
  totals: CartTotals,
  me: MeResponse,
  store: { name: string; state: string; city: string } | null,
  number: string,
  provisional: boolean,
  now = new Date()
): ReceiptData {
  const byRate = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  cart.lines.forEach((line, i) => {
    const calc = totals.lines[i];
    if (!calc) return;
    const entry = byRate.get(line.gstRate) ?? { rate: line.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    entry.taxable += Number(calc.taxableValue);
    entry.cgst += Number(calc.cgst);
    entry.sgst += Number(calc.sgst);
    entry.igst += Number(calc.igst);
    byRate.set(line.gstRate, entry);
  });
  const payments = cart.mode === "sale" ? cart.payments.filter((p) => Number(p.amount) > 0).map((p) => ({ mode: p.mode, amount: Number(p.amount), reference: p.referenceNo ?? "" })) : [];
  const paid = Math.min(totals.tendered, totals.net);
  const due = cart.mode === "sale" ? Math.max(0, totals.net - totals.tendered) : 0;
  const upiAmount = cart.billType === "estimate" ? totals.net : due;
  return {
    kind: cart.mode === "return" ? "return" : cart.billType === "estimate" ? "estimate" : "sale",
    number,
    provisional,
    date: now.toISOString(),
    shop: { name: me.shopName, legalName: "", gstin: me.settings.gstin ?? "" },
    store: { name: store?.name ?? me.shopName, address: store?.city ?? "", state: store?.state ?? "", phone: "" },
    customer: cart.customer ? { name: cart.customer.name, mobile: cart.customer.mobile, address: "", state: cart.customer.state ?? "", gstin: "" } : null,
    soldBy: me.actor === "worker" ? me.displayName : null,
    lines: cart.lines.map((l, i) => ({
      name: l.itemName,
      detail: l.detail,
      hsn: "",
      qty: l.qty,
      mrp: l.mrp,
      rate: l.rate,
      discount: Number(totals.lines[i]?.discountAmount ?? 0),
      gstRate: l.gstRate,
      net: Number(totals.lines[i]?.netAmount ?? 0)
    })),
    gstSummary: [...byRate.values()].sort((a, b) => a.rate - b.rate),
    interState: totals.interState,
    totals: {
      quantity: totals.quantity,
      mrp: totals.mrp,
      discount: totals.discount,
      taxable: totals.taxable,
      gst: totals.gst,
      roundOff: totals.roundOff,
      net: totals.net,
      paid,
      due,
      savings: totals.savings,
      change: totals.change
    },
    payments,
    refundMode: cart.mode === "return" ? cart.refundMode : undefined,
    terms: me.settings.terms,
    upi: me.settings.upiId && upiAmount > 0 && cart.mode === "sale" ? { uri: upiUri(me.settings.upiId, me.shopName, upiAmount, number), amount: upiAmount, upiId: me.settings.upiId } : null,
    bank: null
  };
}
