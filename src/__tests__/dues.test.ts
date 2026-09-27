import { balanceHeadline, balanceLabel, balanceState, balanceTone, entryBody, isParty, parseAmount, quickAmounts, telUrl, validateEntry, whatsappUrl } from "@/features/dues/logic";

const draft = { amount: "1200", date: "2026-09-27", reference: "", note: "", mode: "cash" as const };

describe("balances", () => {
  it("classifies balances", () => {
    expect(balanceState(10)).toBe("owing");
    expect(balanceState(-10)).toBe("advance");
    expect(balanceState(0.001)).toBe("settled");
    expect(balanceTone(5)).toBe("warning");
    expect(balanceTone(-5)).toBe("info");
    expect(balanceTone(0)).toBe("success");
  });

  it("labels balances from the shop's point of view", () => {
    expect(balanceLabel(3450, "customer")).toBe("Owes ₹3,450");
    expect(balanceLabel(3450, "supplier")).toBe("You owe ₹3,450");
    expect(balanceLabel(-2000, "customer")).toBe("Advance ₹2,000");
    expect(balanceLabel(0, "supplier")).toBe("Settled");
    expect(balanceHeadline(10, "customer", "Anjali")).toBe("Anjali owes you");
    expect(balanceHeadline(-10, "customer", "Anjali")).toBe("Anjali has an advance");
    expect(balanceHeadline(10, "supplier", "Levi")).toBe("You owe Levi");
    expect(balanceHeadline(0, "supplier", "Levi")).toBe("All settled");
  });

  it("recognises parties", () => {
    expect(isParty("customer")).toBe(true);
    expect(isParty("supplier")).toBe(true);
    expect(isParty("staff")).toBe(false);
  });
});

describe("amounts", () => {
  it("parses typed amounts", () => {
    expect(parseAmount("₹1,234.50")).toBe(1234.5);
    expect(parseAmount(" 500 ")).toBe(500);
    expect(parseAmount("12.345")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });

  it("offers the full balance first, then round amounts below it", () => {
    const chips = quickAmounts(3450);
    expect(chips[0]).toEqual({ label: "Full ₹3,450", value: 3450 });
    expect(chips.map((c) => c.value)).toEqual([3450, 1725, 500, 1000, 2000]);
    expect(quickAmounts(0).map((c) => c.value)).toEqual([500, 1000, 2000, 5000]);
    expect(quickAmounts(300).map((c) => c.value)).toEqual([300]);
  });
});

describe("entry validation", () => {
  it("accepts a valid payment", () => {
    expect(validateEntry(draft, "payment", "2026-09-27")).toEqual({});
  });

  it("rejects bad amounts, future dates, long text and missing mode", () => {
    expect(validateEntry({ ...draft, amount: "" }, "payment", "2026-09-27").amount).toBeDefined();
    expect(validateEntry({ ...draft, amount: "0" }, "payment", "2026-09-27").amount).toMatch(/more than zero/);
    expect(validateEntry({ ...draft, amount: "1.234" }, "payment", "2026-09-27").amount).toBeDefined();
    expect(validateEntry({ ...draft, amount: "200000000" }, "payment", "2026-09-27").amount).toMatch(/too large/);
    expect(validateEntry({ ...draft, date: "2026-09-28" }, "payment", "2026-09-27").date).toMatch(/future/);
    expect(validateEntry({ ...draft, date: "27/09/2026" }, "payment", "2026-09-27").date).toBeDefined();
    expect(validateEntry({ ...draft, reference: "x".repeat(61) }, "payment", "2026-09-27").reference).toBeDefined();
    expect(validateEntry({ ...draft, note: "x".repeat(121) }, "payment", "2026-09-27").note).toBeDefined();
    expect(validateEntry({ ...draft, mode: null }, "payment", "2026-09-27").mode).toBeDefined();
    // A due needs no mode.
    expect(validateEntry({ ...draft, mode: null }, "due", "2026-09-27")).toEqual({});
  });

  it("builds the request body", () => {
    expect(entryBody({ requestId: "r1", party: "customer", partyId: "c1", kind: "payment", draft: { ...draft, amount: "₹1,200", reference: " UPI123 " }, today: "2026-09-27" })).toEqual({
      requestId: "r1",
      party: "customer",
      partyId: "c1",
      kind: "payment",
      amount: "1200.00",
      mode: "cash",
      reference: "UPI123"
    });
    const due = entryBody({ requestId: "r2", party: "customer", partyId: "c1", kind: "due", draft: { ...draft, date: "2026-09-20", note: "Opening balance" }, today: "2026-09-27" });
    expect(due).toMatchObject({ kind: "due", date: "2026-09-20", note: "Opening balance" });
    expect(due.mode).toBeUndefined();
  });
});

describe("contact links", () => {
  it("builds tel and WhatsApp links", () => {
    expect(telUrl("98412 78983")).toBe("tel:9841278983");
    expect(telUrl("919841278983")).toBe("tel:+919841278983");
    expect(telUrl("123")).toBeNull();
    expect(whatsappUrl("9841278983", "Hi")).toBe("https://wa.me/919841278983?text=Hi");
    expect(whatsappUrl(null)).toBeNull();
  });
});
