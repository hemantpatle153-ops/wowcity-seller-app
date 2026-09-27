import { calculateSaleBill, calculateSaleLine, settleTender, supplyPlaceFor } from "@/lib/saleMath";

const row = (rate: number, gstRate: number, qty = 1, extra: Partial<{ mrp: number; discountPercent: number; discountAmount: number }> = {}) => ({
  qty,
  rate,
  mrp: extra.mrp ?? rate,
  gstRate,
  discountPercent: extra.discountPercent ?? 0,
  discountAmount: extra.discountAmount ?? 0
});

describe("sale maths (parity with the server)", () => {
  it("GST inclusive: tax is carved out of the price", () => {
    const line = calculateSaleLine(row(1199, 5), "inclusive", "intra_state");
    expect(line.taxableValue).toBe("1141.90");
    expect(line.gstAmount).toBe("57.10");
    expect(line.cgst).toBe("28.55");
    expect(line.sgst).toBe("28.55");
    expect(line.netAmount).toBe("1199.00");
  });

  it("GST exclusive: tax is added on top", () => {
    const line = calculateSaleLine(row(1000, 12), "exclusive", "intra_state");
    expect(line.taxableValue).toBe("1000.00");
    expect(line.gstAmount).toBe("120.00");
    expect(line.netAmount).toBe("1120.00");
  });

  it("inter-state bills use IGST", () => {
    const line = calculateSaleLine(row(1000, 12), "exclusive", "inter_state");
    expect(line.igst).toBe("120.00");
    expect(line.cgst).toBe("0.00");
    expect(supplyPlaceFor("Maharashtra", "Madhya Pradesh")).toBe("inter_state");
    expect(supplyPlaceFor("", "Madhya Pradesh")).toBe("intra_state");
    expect(supplyPlaceFor("23ABCDE1234F1Z5", "Madhya Pradesh")).toBe("intra_state");
  });

  it("odd GST splits keep CGST + SGST equal to GST", () => {
    const line = calculateSaleLine(row(99.99, 5), "exclusive", "intra_state");
    expect((Number(line.cgst) + Number(line.sgst)).toFixed(2)).toBe(line.gstAmount);
  });

  it("line discounts: percent then flat, never above the line value", () => {
    expect(calculateSaleLine(row(1000, 0, 2, { discountPercent: 10 }), "inclusive", "intra_state").lineDiscount).toBe("200.00");
    expect(calculateSaleLine(row(1000, 0, 1, { discountPercent: 10, discountAmount: 50 }), "inclusive", "intra_state").lineDiscount).toBe("150.00");
    expect(calculateSaleLine(row(100, 0, 1, { discountAmount: 500 }), "inclusive", "intra_state").netAmount).toBe("0.00");
  });

  it("bill discount is shared across lines and adds up exactly", () => {
    const bill = calculateSaleBill([row(333, 5), row(333, 5), row(334, 12)], "inclusive", "intra_state", "none", 0, 100);
    const shares = bill.lines.map((l) => Number(l.billDiscountShare));
    expect(shares.reduce((a, b) => a + b, 0).toFixed(2)).toBe("100.00");
    expect(bill.totals.extraDiscountAmount).toBe("100.00");
    expect(bill.totals.grossSale).toBe("900.00");
  });

  it("rounding modes", () => {
    const rows = [row(99.5, 0)];
    expect(calculateSaleBill(rows, "inclusive", "intra_state", "nearest_rupee").totals.netSale).toBe("100.00");
    expect(calculateSaleBill(rows, "inclusive", "intra_state", "down_rupee").totals.netSale).toBe("99.00");
    expect(calculateSaleBill([row(99.2, 0)], "inclusive", "intra_state", "up_rupee").totals.netSale).toBe("100.00");
    expect(calculateSaleBill(rows, "inclusive", "intra_state", "none").totals.netSale).toBe("99.50");
    expect(calculateSaleBill(rows, "inclusive", "intra_state", "nearest_rupee").totals.roundOff).toBe("0.50");
  });

  it("totals: quantity, MRP savings, credit and change", () => {
    const bill = calculateSaleBill([row(900, 5, 2, { mrp: 1000 })], "inclusive", "intra_state", "nearest_rupee", 0, 0, [{ amount: 2000 }]);
    expect(bill.totals.totalQuantity).toBe("2.000");
    expect(bill.totals.savings).toBe("200.00");
    expect(bill.totals.cashReturn).toBe("200.00");
    expect(bill.totals.creditAmount).toBe("0.00");
  });

  it("settleTender: change comes out of cash first; shortfall becomes due", () => {
    const paid = settleTender(1800, [
      { mode: "upi", amount: 1000 },
      { mode: "cash", amount: 1000 }
    ]);
    expect(paid.changeDue).toBe("200.00");
    expect(paid.payments).toEqual([
      { mode: "cash", amount: "800.00", referenceNo: undefined },
      { mode: "upi", amount: "1000.00", referenceNo: undefined }
    ]);
    const credit = settleTender(1800, [{ mode: "cash", amount: 500 }]);
    expect(credit.due).toBe("1300.00");
  });
});
