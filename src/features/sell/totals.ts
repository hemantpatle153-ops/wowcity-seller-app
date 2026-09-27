import { useMemo } from "react";
import { useCurrentStore, useSession } from "@/auth/session";
import { toNumber } from "@/lib/format";
import { calculateSaleBill, settleTender, supplyPlaceFor, type RoundingMode } from "@/lib/saleMath";
import { useCart, type CartState } from "./cart";

export function computeTotals(
  cart: Pick<CartState, "lines" | "taxType" | "extraDiscountPercent" | "extraDiscountAmount" | "payments" | "customer" | "mode">,
  storeState: string | null | undefined,
  rounding: RoundingMode,
  canDiscount: boolean
) {
  // Returns against a bill refund what was actually paid per unit (the server refunds original net x
  // qty / sold), so preview them as GST-inclusive lines at that price, with no extra rounding.
  const refundPreview = cart.mode === "return" && cart.lines.length > 0 && cart.lines.every((l) => l.unitRefund !== undefined);
  const rows = cart.lines.map((l) =>
    refundPreview
      ? { qty: l.qty, mrp: l.mrp, rate: l.unitRefund ?? l.rate, gstRate: l.gstRate, discountPercent: 0, discountAmount: 0 }
      : { qty: l.qty, mrp: l.mrp, rate: l.rate, gstRate: l.gstRate, discountPercent: canDiscount ? l.discountPercent : 0, discountAmount: canDiscount ? l.discountAmount : 0 }
  );
  const place = supplyPlaceFor(cart.customer?.state, storeState);
  const bill = calculateSaleBill(
    rows,
    refundPreview ? "inclusive" : cart.taxType,
    place,
    refundPreview ? "none" : rounding,
    canDiscount && cart.mode === "sale" ? cart.extraDiscountPercent || 0 : 0,
    canDiscount && cart.mode === "sale" ? cart.extraDiscountAmount || 0 : 0
  );
  const net = toNumber(bill.totals.netSale);
  const tender = settleTender(net, cart.payments);
  return {
    lines: bill.lines,
    net,
    quantity: toNumber(bill.totals.totalQuantity),
    mrp: toNumber(bill.totals.totalMrp),
    discount: toNumber(bill.totals.totalDiscount),
    taxable: toNumber(bill.totals.taxableValue),
    gst: toNumber(bill.totals.gstAmount),
    cgst: toNumber(bill.totals.cgst),
    sgst: toNumber(bill.totals.sgst),
    igst: toNumber(bill.totals.igst),
    roundOff: toNumber(bill.totals.roundOff),
    savings: toNumber(bill.totals.savings),
    interState: place === "inter_state",
    tendered: toNumber(tender.tendered),
    change: toNumber(tender.changeDue),
    due: toNumber(tender.due)
  };
}

export type CartTotals = ReturnType<typeof computeTotals>;

/** Live bill preview (same maths as the server; the server still has the final say). */
export function useCartTotals(canDiscount: boolean) {
  const cart = useCart();
  const store = useCurrentStore();
  const rounding = (useSession((s) => s.me?.settings.roundingMode) ?? "nearest_rupee") as RoundingMode;
  const { lines, taxType, extraDiscountPercent, extraDiscountAmount, payments, customer, mode } = cart;
  return useMemo(
    () => computeTotals({ lines, taxType, extraDiscountPercent, extraDiscountAmount, payments, customer, mode }, store?.state, rounding, canDiscount),
    [lines, taxType, extraDiscountPercent, extraDiscountAmount, payments, customer, mode, store?.state, rounding, canDiscount]
  );
}
