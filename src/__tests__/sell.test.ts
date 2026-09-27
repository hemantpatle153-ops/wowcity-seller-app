import { buildSalePayload, useCart } from "@/features/sell/cart";
import { computeTotals } from "@/features/sell/totals";
import { quickCash } from "@/features/sell/tender";
import { a4Html, receiptText, thermalHtml } from "@/printing/html";
import { encodeReceipt, EscPos } from "@/printing/printers/escpos";
import { receiptFromCart } from "@/printing/receipt";
import type { MeResponse } from "@/api/types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const me: MeResponse = {
  actor: "worker",
  userId: null,
  workerId: "w1",
  displayName: "Ravi",
  sellerId: "s",
  shopName: "Luzzan Fashions",
  shopCode: "LUZ482",
  permissions: ["sale.create"],
  storeIds: ["st1"],
  financialYear: "2026-2027",
  stores: [{ id: "st1", name: "MG Road", state: "Madhya Pradesh", city: "Indore" }],
  settings: { roundingMode: "nearest_rupee", gstin: "23ABCDE1234F1Z5", printFormat: "thermal", upiId: "luzzan@okaxis", terms: "No exchange without bill." }
};

const item = (id: string, rate: number, gstRate = 5) => ({ variantId: id, itemName: `Item ${id}`, detail: "M / Blue", barcode: `89${id}`, mrp: rate + 100, rate, gstRate, availableQty: 5 });

beforeEach(() => useCart.getState().reset("sale"));

describe("cart", () => {
  it("adds, increments, removes with undo", () => {
    const cart = useCart.getState();
    expect(cart.add(item("1", 999))).toBe("added");
    expect(useCart.getState().add(item("1", 999))).toBe("incremented");
    expect(useCart.getState().lines[0].qty).toBe(2);
    const key = useCart.getState().lines[0].key;
    useCart.getState().remove(key);
    expect(useCart.getState().lines).toHaveLength(0);
    useCart.getState().undoRemove();
    expect(useCart.getState().lines[0].qty).toBe(2);
  });

  it("keeps the idempotency key until the bill is reset", () => {
    const key = useCart.getState().idempotencyKey;
    useCart.getState().add(item("1", 100));
    expect(useCart.getState().idempotencyKey).toBe(key);
    useCart.getState().reset();
    expect(useCart.getState().idempotencyKey).not.toBe(key);
  });

  it("builds the POST /sales body, zeroing discounts without permission", () => {
    useCart.getState().add(item("1", 1199));
    const key = useCart.getState().lines[0].key;
    useCart.getState().updateLine(key, { discountPercent: 10 });
    useCart.getState().set({ extraDiscountAmount: "50" });
    useCart.getState().setPayments([
      { mode: "cash", amount: "500" },
      { mode: "upi", amount: "0" }
    ]);
    const noPerm = buildSalePayload(useCart.getState(), "st1", { canDiscount: false });
    expect(noPerm.rows[0]).toMatchObject({ variantId: "1", qty: "1", rate: "1199", discountPercent: "0", discountAmount: "0" });
    expect(noPerm.extraDiscountAmount).toBe("0");
    expect(noPerm.payments).toEqual([{ mode: "cash", amount: "500", referenceNo: undefined }]);
    expect(noPerm.idempotencyKey).toBe(useCart.getState().idempotencyKey);
    const withPerm = buildSalePayload(useCart.getState(), "st1", { canDiscount: true });
    expect(withPerm.rows[0].discountPercent).toBe("10");
    expect(withPerm.extraDiscountAmount).toBe("50");
  });

  it("totals match the server maths and track change/due", () => {
    useCart.getState().add(item("1", 1199));
    useCart.getState().add(item("2", 500, 12));
    useCart.getState().setPayments([{ mode: "cash", amount: "2000" }]);
    const totals = computeTotals(useCart.getState(), "Madhya Pradesh", "nearest_rupee", true);
    expect(totals.net).toBe(1699);
    expect(totals.change).toBe(301);
    expect(totals.due).toBe(0);
    expect(totals.interState).toBe(false);
  });
});

describe("quick cash", () => {
  it("offers exact and the next common notes", () => {
    expect(quickCash(1699)).toEqual([1699, 1700, 2000]);
    expect(quickCash(500)).toEqual([500, 600, 1000, 2000]);
  });
});

describe("receipts", () => {
  const build = () => {
    useCart.getState().add(item("1", 1199));
    useCart.getState().setCustomer({ name: "Asha <Verma>", mobile: "9826012345", state: "Madhya Pradesh" });
    useCart.getState().setPayments([{ mode: "cash", amount: "1000" }]);
    const cart = useCart.getState();
    return receiptFromCart(cart, computeTotals(cart, "Madhya Pradesh", "nearest_rupee", true), me, me.stores[0], "OFF-ABCD-2709", true);
  };

  it("offline receipts carry the temporary reference, due and a UPI link for the due", () => {
    const r = build();
    expect(r.provisional).toBe(true);
    expect(r.totals.due).toBe(199);
    expect(r.upi?.uri).toContain("am=199.00");
    expect(r.soldBy).toBe("Ravi");
  });

  it("renders escaped thermal and A4 HTML", () => {
    const r = build();
    const thermal = thermalHtml(r, 58);
    expect(thermal).toContain("58mm auto");
    expect(thermal).toContain("Asha &lt;Verma&gt;");
    expect(thermal).toContain("Saved offline");
    expect(thermal).toContain("<svg");
    expect(a4Html(r)).toContain("TAX INVOICE");
    expect(receiptText(r)).toContain("Balance due");
  });

  it("encodes ESC/POS for the paper width", () => {
    const bytes = encodeReceipt(build(), 58);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
    const p = new EscPos(32).pair("Total", "Rs.1,199.00");
    const text = String.fromCharCode(...Array.from(p.build()).slice(5, 5 + 32));
    expect(text.length).toBe(32);
    expect(text.endsWith("Rs.1,199.00")).toBe(true);
  });
});
