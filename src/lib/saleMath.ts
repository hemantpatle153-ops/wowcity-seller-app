/**
 * Bill maths, ported line for line from the server (wow-city lib/sale/calculations.ts and
 * lib/tax/tax-engine.ts) so the totals on screen always match the posted bill. The server still
 * recomputes everything; this is the preview.
 */
import Decimal from "decimal.js";
import { isInterState } from "./india";

export type PricingMode = "inclusive" | "exclusive";
export type SupplyPlace = "intra_state" | "inter_state";
export type RoundingMode = "nearest_rupee" | "up_rupee" | "down_rupee" | "none";

export function money(value: Decimal.Value): Decimal {
  try {
    return new Decimal(value === "" ? 0 : value);
  } catch {
    return new Decimal(0);
  }
}

export function toMoneyString(value: Decimal, places = 2): string {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
}

export function applyInvoiceRounding(value: Decimal, roundingMode: RoundingMode): Decimal {
  if (roundingMode === "none") return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (roundingMode === "up_rupee") return value.ceil();
  if (roundingMode === "down_rupee") return value.floor();
  return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/** Customer in another state than the store: IGST instead of CGST + SGST (same rule as the server). */
export function supplyPlaceFor(customerState: string | null | undefined, storeState: string | null | undefined): SupplyPlace {
  return isInterState(customerState, storeState) ? "inter_state" : "intra_state";
}

export type SaleCalcRow = {
  qty: string | number;
  mrp: string | number;
  rate: string | number;
  discountPercent?: string | number;
  /** Flat line discount in rupees (for the whole line, not per unit). */
  discountAmount?: string | number;
  gstRate: string | number;
};

export type SaleLineCalculation = {
  totalMrp: string;
  totalSale: string;
  /** Line discount (percent + flat) before the bill discount. */
  lineDiscount: string;
  /** Share of the bill-level discount allocated to this line. */
  billDiscountShare: string;
  /** Everything taken off this line: line discount + bill discount share. */
  discountAmount: string;
  taxableValue: string;
  gstAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
  grossRate: string;
  netAmount: string;
};

export type SaleTotals = {
  totalMrp: string;
  totalSale: string;
  lineDiscount: string;
  extraDiscountAmount: string;
  totalDiscount: string;
  taxableValue: string;
  gstAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
  grossSale: string;
  roundOff: string;
  totalQuantity: string;
  netSale: string;
  amountPaid: string;
  creditAmount: string;
  cashReturn: string;
  savings: string;
};

const ZERO = money(0);

function clampNonNegative(value: Decimal) {
  return Decimal.max(value, ZERO);
}

function lineDiscountOf(row: SaleCalcRow) {
  const gross = money(row.qty || 0).mul(money(row.rate || 0));
  const percent = Decimal.min(Decimal.max(money(row.discountPercent || 0), ZERO), money(100));
  const byPercent = gross.mul(percent).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const flat = clampNonNegative(money(row.discountAmount || 0));
  return Decimal.min(byPercent.plus(flat), gross).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Tax for one line after all discounts. The amount charged (`chargeable`) is the price the buyer
 * pays for the line: GST-inclusive for inclusive pricing, pre-tax for exclusive pricing.
 * CGST is rounded half-up and SGST takes the remainder, so CGST + SGST always equals the GST shown.
 */
function taxLine(chargeable: Decimal, gstRatePercent: string | number, pricingMode: PricingMode, supplyPlace: SupplyPlace) {
  const rate = money(gstRatePercent || 0).div(100);
  const taxable = (pricingMode === "inclusive" ? chargeable.div(money(1).plus(rate)) : chargeable).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const gst = (pricingMode === "inclusive" ? chargeable.minus(taxable) : taxable.mul(rate)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const cgst = supplyPlace === "intra_state" ? gst.div(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : ZERO;
  const sgst = supplyPlace === "intra_state" ? gst.minus(cgst) : ZERO;
  const igst = supplyPlace === "inter_state" ? gst : ZERO;
  return { taxable, gst, cgst, sgst, igst };
}

/**
 * Splits a bill-level discount across lines in proportion to each line's value after its own
 * discount. The last line absorbs the rounding remainder so the shares add up exactly.
 */
export function allocateBillDiscount(lineValues: Decimal[], billDiscount: Decimal) {
  const base = lineValues.reduce((total, value) => total.plus(value), ZERO);
  const discount = Decimal.min(clampNonNegative(billDiscount), base);
  if (base.lte(0) || discount.lte(0)) return lineValues.map(() => ZERO);
  let remaining = discount;
  let lastPositive = -1;
  lineValues.forEach((value, index) => {
    if (value.gt(0)) lastPositive = index;
  });
  return lineValues.map((value, index) => {
    if (value.lte(0)) return ZERO;
    if (index === lastPositive) return remaining;
    const share = Decimal.min(discount.mul(value).div(base).toDecimalPlaces(2, Decimal.ROUND_HALF_UP), remaining);
    remaining = remaining.minus(share);
    return share;
  });
}

function buildLine(row: SaleCalcRow, lineDiscount: Decimal, billShare: Decimal, pricingMode: PricingMode, supplyPlace: SupplyPlace): SaleLineCalculation {
  const qty = money(row.qty || 0);
  const gross = qty.mul(money(row.rate || 0));
  const chargeable = clampNonNegative(gross.minus(lineDiscount).minus(billShare));
  const tax = taxLine(chargeable, row.gstRate, pricingMode, supplyPlace);
  const net = tax.taxable.plus(tax.gst);
  return {
    totalMrp: toMoneyString(qty.mul(money(row.mrp || 0))),
    totalSale: toMoneyString(gross),
    lineDiscount: toMoneyString(lineDiscount),
    billDiscountShare: toMoneyString(billShare),
    discountAmount: toMoneyString(lineDiscount.plus(billShare)),
    taxableValue: toMoneyString(tax.taxable),
    gstAmount: toMoneyString(tax.gst),
    cgst: toMoneyString(tax.cgst),
    sgst: toMoneyString(tax.sgst),
    igst: toMoneyString(tax.igst),
    grossRate: toMoneyString(qty.eq(0) ? ZERO : net.div(qty)),
    netAmount: toMoneyString(net)
  };
}

/** A single line with no bill discount (used for previews and free-form returns). */
export function calculateSaleLine(row: SaleCalcRow, pricingMode: PricingMode, supplyPlace: SupplyPlace): SaleLineCalculation {
  return buildLine(row, lineDiscountOf(row), ZERO, pricingMode, supplyPlace);
}

export function calculateSaleBill(
  rows: SaleCalcRow[],
  pricingMode: PricingMode,
  supplyPlace: SupplyPlace,
  roundingMode: RoundingMode,
  extraDiscountPercent: string | number = 0,
  extraDiscountAmount: string | number = 0,
  payments: Array<{ amount: string | number }> = []
): { lines: SaleLineCalculation[]; totals: SaleTotals } {
  const lineDiscounts = rows.map(lineDiscountOf);
  const afterLine = rows.map((row, index) =>
    clampNonNegative(
      money(row.qty || 0)
        .mul(money(row.rate || 0))
        .minus(lineDiscounts[index])
    )
  );
  const afterLineTotal = afterLine.reduce((total, value) => total.plus(value), ZERO);
  const percent = Decimal.min(Decimal.max(money(extraDiscountPercent || 0), ZERO), money(100));
  const billDiscount = afterLineTotal
    .mul(percent)
    .div(100)
    .plus(clampNonNegative(money(extraDiscountAmount || 0)))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const shares = allocateBillDiscount(afterLine, billDiscount);
  const lines = rows.map((row, index) => buildLine(row, lineDiscounts[index], shares[index], pricingMode, supplyPlace));

  const sum = (selector: (line: SaleLineCalculation) => string) => lines.reduce((total, line) => total.plus(money(selector(line))), ZERO);
  const taxableValue = sum((line) => line.taxableValue);
  const gstAmount = sum((line) => line.gstAmount);
  const grossBeforeRound = taxableValue.plus(gstAmount);
  const rounded = applyInvoiceRounding(grossBeforeRound, roundingMode);
  const amountPaid = payments.reduce((total, payment) => total.plus(clampNonNegative(money(payment.amount || 0))), ZERO);
  const totalMrp = sum((line) => line.totalMrp);

  return {
    lines,
    totals: {
      totalMrp: toMoneyString(totalMrp),
      totalSale: toMoneyString(sum((line) => line.totalSale)),
      lineDiscount: toMoneyString(sum((line) => line.lineDiscount)),
      extraDiscountAmount: toMoneyString(sum((line) => line.billDiscountShare)),
      totalDiscount: toMoneyString(sum((line) => line.discountAmount)),
      taxableValue: toMoneyString(taxableValue),
      gstAmount: toMoneyString(gstAmount),
      cgst: toMoneyString(sum((line) => line.cgst)),
      sgst: toMoneyString(sum((line) => line.sgst)),
      igst: toMoneyString(sum((line) => line.igst)),
      grossSale: toMoneyString(grossBeforeRound),
      roundOff: toMoneyString(rounded.minus(grossBeforeRound)),
      totalQuantity: toMoneyString(
        rows.reduce((total, row) => total.plus(money(row.qty || 0)), ZERO),
        3
      ),
      netSale: toMoneyString(rounded),
      amountPaid: toMoneyString(amountPaid),
      creditAmount: toMoneyString(clampNonNegative(rounded.minus(amountPaid))),
      cashReturn: toMoneyString(clampNonNegative(amountPaid.minus(rounded))),
      savings: toMoneyString(clampNonNegative(totalMrp.minus(rounded)))
    }
  };
}

/** Backwards-compatible totals-only helper. */
export function calculateSaleTotals(...args: Parameters<typeof calculateSaleBill>): SaleTotals {
  return calculateSaleBill(...args).totals;
}

export type TenderInput = { mode: string; amount: string | number; referenceNo?: string };

/**
 * Turns what the cashier typed into what is recorded. Change handed back comes out of cash first,
 * so recorded payments never exceed the bill; whatever is still unpaid becomes the due amount.
 */
export function settleTender(netSale: string | number, tender: TenderInput[]) {
  const net = money(netSale || 0);
  const rows = tender
    .map((payment) => ({ mode: payment.mode, amount: clampNonNegative(money(payment.amount || 0)), referenceNo: payment.referenceNo?.trim() || undefined }))
    .filter((payment) => payment.amount.gt(0));
  const tendered = rows.reduce((total, payment) => total.plus(payment.amount), ZERO);
  let change = clampNonNegative(tendered.minus(net));
  const ordered = [...rows.filter((payment) => payment.mode === "cash"), ...rows.filter((payment) => payment.mode !== "cash")];
  const recorded = ordered.map((payment) => {
    const taken = Decimal.min(payment.amount, change);
    change = change.minus(taken);
    return { ...payment, amount: payment.amount.minus(taken) };
  });
  const paid = Decimal.min(tendered, net);
  return {
    tendered: toMoneyString(tendered),
    changeDue: toMoneyString(clampNonNegative(tendered.minus(net))),
    paid: toMoneyString(paid),
    due: toMoneyString(clampNonNegative(net.minus(tendered))),
    payments: recorded.filter((payment) => payment.amount.gt(0)).map((payment) => ({ mode: payment.mode, amount: toMoneyString(payment.amount), referenceNo: payment.referenceNo }))
  };
}
