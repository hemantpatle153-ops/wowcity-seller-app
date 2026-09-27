import type { MeResponse } from "@/api/types";
import { can, isOwner, tabsFor } from "@/auth/permissions";

const base: Omit<MeResponse, "actor" | "permissions"> = {
  userId: null,
  workerId: "w",
  displayName: "X",
  sellerId: "s",
  shopName: "Shop",
  shopCode: "ABC",
  storeIds: [],
  financialYear: "2026-2027",
  stores: [],
  settings: { roundingMode: "nearest_rupee", gstin: null, printFormat: "thermal", upiId: null, terms: "" }
};

describe("permissions and tabs", () => {
  it("owners can do everything and get the owner tabs", () => {
    const owner = { ...base, actor: "seller" as const, permissions: [] };
    expect(isOwner(owner)).toBe(true);
    expect(can(owner, "anything")).toBe(true);
    expect(tabsFor(owner)).toEqual(["home", "sell", "purchase", "stock", "more"]);
  });

  it("a cashier gets Sell, Bills and Profile", () => {
    const cashier = { ...base, actor: "worker" as const, permissions: ["sale.view", "sale.create", "sale.return"] };
    expect(tabsFor(cashier)).toEqual(["sell", "bills", "profile"]);
    expect(can(cashier, "sale.discount_override")).toBe(false);
  });

  it("stock staff get Purchase and Stock but not Sell", () => {
    const stock = { ...base, actor: "worker" as const, permissions: ["purchase.view", "purchase.create", "stock.view", "product.view"] };
    expect(tabsFor(stock)).toEqual(["purchase", "stock", "profile"]);
  });

  it("nobody signed in can do nothing", () => {
    expect(can(null, "sale.create")).toBe(false);
  });
});
