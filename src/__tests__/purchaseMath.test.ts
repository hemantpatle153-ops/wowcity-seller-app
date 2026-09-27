import { blankItem, emptyDraft, restockItem } from "@/features/purchase/draft";
import { calculatePurchase, cleanDecimal, marginPercent, num, purchaseDue, typingDecimal } from "@/features/purchase/math";
import { buildPurchaseRequest, validateDraft, validateItem } from "@/features/purchase/payload";
import type { CustomFieldGridColumn, PurchaseSetupResponse } from "@/api/types";

jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));


const setup: Pick<PurchaseSetupResponse, "customFields" | "gstSlabs" | "publicFieldDefaults" | "canPublish"> = {
  gstSlabs: [
    { code: "GST0", label: "0%", rate: 0, is_special: false },
    { code: "GST5", label: "5%", rate: 5, is_special: false },
    { code: "GST12", label: "12%", rate: 12, is_special: false }
  ],
  customFields: [],
  publicFieldDefaults: { product_name: true, mrp: true },
  canPublish: true
};

describe("calculatePurchase", () => {
  it("exclusive pricing adds GST on top of the discounted value", () => {
    const t = calculatePurchase([{ qty: "10", purchaseRate: "100", disc1Percent: "10", gstRate: "5" }], { mode: "exclusive" });
    expect(t.gross).toBe(1000);
    expect(t.lineDiscount).toBe(100);
    expect(t.taxable).toBe(900);
    expect(t.gst).toBe(45);
    expect(t.total).toBe(945);
    expect(t.qty).toBe(10);
  });

  it("inclusive pricing takes GST out of the value", () => {
    const t = calculatePurchase([{ qty: 1, purchaseRate: 1120, gstRate: 12 }], { mode: "inclusive" });
    expect(t.taxable).toBe(1000);
    expect(t.gst).toBe(120);
    expect(t.total).toBe(1120);
  });

  it("caps line discounts at the gross and never goes negative", () => {
    const t = calculatePurchase([{ qty: 2, purchaseRate: 50, disc1Percent: 50, disc1Amount: 40, disc2Amount: 40, gstRate: 5 }], { mode: "exclusive" });
    expect(t.lineDiscount).toBe(100);
    expect(t.taxable).toBe(0);
    expect(t.total).toBe(0);
  });

  it("shares the bill discount by value with the last row taking the remainder", () => {
    const t = calculatePurchase(
      [
        { qty: 1, purchaseRate: 100, gstRate: 0 },
        { qty: 1, purchaseRate: 200, gstRate: 0 },
        { qty: 1, purchaseRate: 33.33, gstRate: 0 }
      ],
      { mode: "exclusive", extraDiscountAmount: "10" }
    );
    const shares = t.rows.map((r) => r.extraShare);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 5);
    expect(t.extraDiscount).toBe(10);
    expect(t.taxable).toBe(323.33);
  });

  it("adds TCS and applies invoice rounding", () => {
    const t = calculatePurchase([{ qty: 3, purchaseRate: "99.99", gstRate: 5 }], { mode: "exclusive", tcsAmount: "1.25" });
    // 299.97 + 15.00 (14.9985 → 15.00) + 1.25 = 316.22 → 316
    expect(t.gst).toBe(15);
    expect(t.total).toBe(316);
    expect(t.roundOff).toBe(-0.22);
    const none = calculatePurchase([{ qty: 3, purchaseRate: "99.99", gstRate: 5 }], { mode: "exclusive", roundingMode: "none" });
    expect(none.total).toBe(314.97);
  });

  it("treats blanks and junk as zero", () => {
    expect(num("")).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num("-5")).toBe(0);
    expect(num("1,200.5")).toBe(1200.5);
    const t = calculatePurchase([{ qty: "", purchaseRate: "", gstRate: "" }], { mode: "exclusive" });
    expect(t.total).toBe(0);
  });
});

describe("helpers", () => {
  it("due, over-payment and margin", () => {
    expect(purchaseDue(1000, [{ amount: "400" }, { amount: "" }])).toEqual({ paid: 400, due: 600, over: 0 });
    expect(purchaseDue(1000, [{ amount: 1200 }])).toEqual({ paid: 1200, due: 0, over: 200 });
    expect(marginPercent(60, 100)).toBe(40);
    expect(marginPercent(0, 100)).toBeNull();
  });

  it("cleans decimals for the API", () => {
    expect(cleanDecimal("1,200.5678")).toBe("1200.567");
    expect(cleanDecimal("007")).toBe("7");
    expect(cleanDecimal(".5")).toBe("0.5");
    expect(cleanDecimal("12.")).toBe("12");
    expect(cleanDecimal("")).toBe("");
    expect(typingDecimal("12.3.4a5", 2)).toBe("12.34");
    expect(typingDecimal("₹ 450")).toBe("450");
  });
});

describe("validation", () => {
  const sizeField: CustomFieldGridColumn = {
    id: "f1",
    name: "Fabric",
    field_type: "select",
    options_json: ["Cotton", "Silk"],
    is_public_eligible: true,
    is_required_on_purchase: true,
    default_public_enabled: false,
    show_in_sale_search: false,
    sort_order: 1
  };

  it("flags the required fields on a card", () => {
    const item = blankItem(setup, { qty: "0", mrp: "500", saleRate: "600", hsnCode: "12" });
    const errors = validateItem(item, { ...setup, customFields: [sizeField] });
    expect(errors.itemName).toBeTruthy();
    expect(errors.qty).toBeTruthy();
    expect(errors.saleRate).toMatch(/MRP/);
    expect(errors.hsnCode).toBeTruthy();
    expect(errors.custom?.f1).toMatch(/Fabric/);
  });

  it("accepts a complete card and a sale rate equal to MRP", () => {
    const item = blankItem(setup, { itemName: "Kurta", qty: "2", mrp: "999", saleRate: "999", hsnCode: "6204", customValues: { f1: "Cotton" } });
    expect(validateItem(item, { ...setup, customFields: [sizeField] })).toEqual({});
  });

  it("reports form problems before item problems", () => {
    const draft = emptyDraft({ storeId: null });
    expect(validateDraft(draft, setup).form).toMatch(/store/);
    const noItems = emptyDraft({ storeId: "s1" });
    expect(validateDraft(noItems, setup).form).toMatch(/at least one/);
    const future = emptyDraft({ storeId: "s1", date: "2999-01-01", items: [blankItem(setup, { itemName: "A" })] });
    expect(validateDraft(future, setup).form).toMatch(/future/);
    const bad = emptyDraft({ storeId: "s1", items: [blankItem(setup, { itemName: "A" }), blankItem(setup)] });
    const result = validateDraft(bad, setup);
    expect(result.form).toMatch(/^Item 2:/);
    expect(result.firstInvalid).toBe(bad.items[1].key);
    const pay = emptyDraft({ storeId: "s1", items: [blankItem(setup, { itemName: "A" })], payments: [{ key: "p", mode: "cash", amount: "10", referenceNo: "" }] });
    expect(validateDraft(pay, setup).form).toMatch(/supplier/);
  });
});

describe("buildPurchaseRequest", () => {
  it("builds the POST /purchases body with strings and only finished photos", () => {
    const item = blankItem(setup, {
      itemName: " Cotton kurta ",
      qty: "3",
      purchaseRate: "1,250",
      mrp: "2499",
      saleRate: "1999",
      entry: "abc123",
      tags: ["summer", "festive"],
      publicEnabled: true,
      photos: [
        { id: "a", uri: "file://a", fileName: "a.jpg", contentType: "image/jpeg", sizeBytes: 100, status: "done", bucket: "b", objectKey: "sellers/x/a.jpg" },
        { id: "b", uri: "file://b", fileName: "b.jpg", contentType: "image/jpeg", sizeBytes: 100, status: "failed" }
      ]
    });
    const draft = emptyDraft({ storeId: "store-1", supplier: { id: "sup-1", name: "Rangoli" }, items: [item], payments: [{ key: "p", mode: "upi", amount: "500", referenceNo: " UTR1 " }] });
    const body = buildPurchaseRequest(draft, setup);
    expect(body.supplierId).toBe("sup-1");
    expect(body.supplierName).toBeUndefined();
    expect(body.idempotencyKey).toBe(draft.idempotencyKey);
    expect(body.payments).toEqual([{ mode: "upi", amount: "500", referenceNo: "UTR1" }]);
    const row = body.rows[0];
    expect(row.itemName).toBe("Cotton kurta");
    expect(row.entry).toBe("ABC123");
    expect(row.purchaseRate).toBe("1250");
    expect(row.gstCode).toBe("GST5");
    expect(row.images).toHaveLength(1);
    expect(row.images?.[0]).toMatchObject({ sortOrder: 0, isPrimary: true, objectKey: "sellers/x/a.jpg" });
    expect(row.publicEnabled).toBe(true);
    expect(row.publicFields).toEqual({ product_name: true, mrp: true });
  });

  it("uses a free-text supplier name and drops payments without a supplier", () => {
    const draft = emptyDraft({ storeId: "s", supplier: { id: null, name: "New Traders" }, items: [blankItem(setup, { itemName: "A" })] });
    expect(buildPurchaseRequest(draft, setup).supplierName).toBe("New Traders");
    const none = emptyDraft({ storeId: "s", items: [blankItem(setup, { itemName: "A" })], payments: [{ key: "p", mode: "cash", amount: "10", referenceNo: "" }] });
    expect(buildPurchaseRequest(none, setup).payments).toBeUndefined();
  });

  it("omits listing fields for people who can't publish", () => {
    const draft = emptyDraft({ storeId: "s", items: [blankItem(setup, { itemName: "A", publicEnabled: true })] });
    const row = buildPurchaseRequest(draft, { ...setup, canPublish: false }).rows[0];
    expect(row.publicEnabled).toBeUndefined();
    expect(row.publicFields).toBeUndefined();
  });

  it("prefills a restock card from a barcode lookup", () => {
    const item = restockItem(setup, {
      found: true,
      variantId: "v1",
      barcode: "8901234500017",
      itemName: "Denim jeans",
      brand: "Levi's",
      category: "Jeans",
      size: "32",
      colour: "Blue",
      style: "Slim",
      hsnCode: "6203",
      gstCode: "GST12",
      gstRate: "12",
      mrp: "2999.00",
      saleRate: "2499.00",
      inStock: 7
    });
    expect(item.restock).toEqual({ variantId: "v1", barcode: "8901234500017", inStock: 7 });
    expect(item.entry).toBe("8901234500017");
    expect(item.gstRate).toBe("12");
    expect(item.saleRate).toBe("2499.00");
  });
});
