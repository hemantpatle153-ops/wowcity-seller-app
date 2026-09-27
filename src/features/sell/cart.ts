import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PricingMode, SaleRequest } from "@/api/types";
import { toNumber } from "@/lib/format";
import { uuid } from "@/lib/id";

export type PayMode = "cash" | "upi" | "card" | "other";

export type CartLine = {
  key: string;
  variantId: string;
  itemName: string;
  /** "M / Blue" */
  detail: string;
  barcode: string;
  qty: number;
  mrp: number;
  rate: number;
  gstRate: number;
  discountPercent: number;
  discountAmount: number;
  /** Stock at the store when added (null when unknown). */
  availableQty: number | null;
  /** Returns: the original bill line and how much can still come back. */
  originalItemId?: string;
  maxQty?: number;
  /** Returns: what the customer paid per unit on the original bill (after all discounts, with GST). */
  unitRefund?: number;
};

export type CartCustomer = { id?: string; name: string; mobile: string; state?: string; balance?: number };

export type CartPayment = { mode: PayMode; amount: string; referenceNo?: string };

export type ReturnSource = { invoiceId: string; billNumber: string; date: string; total: number };

export type CartState = {
  mode: "sale" | "return";
  billType: "invoice" | "estimate";
  taxType: PricingMode;
  lines: CartLine[];
  customer: CartCustomer | null;
  extraDiscountPercent: string;
  extraDiscountAmount: string;
  payments: CartPayment[];
  useAdvance: boolean;
  creditChangeToAccount: boolean;
  refundMode: "cash" | "credit_note";
  returnSource: ReturnSource | null;
  /** One key per bill; resent unchanged on retry so the server never double-posts. */
  idempotencyKey: string;
  /** Last removed line, for Undo. */
  lastRemoved: { line: CartLine; index: number } | null;
};

type Actions = {
  add: (line: Omit<CartLine, "key" | "qty" | "discountPercent" | "discountAmount"> & { qty?: number }) => "added" | "incremented" | "limit";
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  undoRemove: () => void;
  updateLine: (key: string, patch: Partial<Pick<CartLine, "rate" | "discountPercent" | "discountAmount" | "qty">>) => void;
  setCustomer: (customer: CartCustomer | null) => void;
  setPayments: (payments: CartPayment[]) => void;
  set: (patch: Partial<Pick<CartState, "billType" | "taxType" | "extraDiscountPercent" | "extraDiscountAmount" | "useAdvance" | "creditChangeToAccount" | "refundMode">>) => void;
  setMode: (mode: "sale" | "return") => void;
  startReturn: (source: ReturnSource, customer: CartCustomer | null, lines: CartLine[], taxType: PricingMode) => void;
  /** Clears the bill and starts a new idempotency key. */
  reset: (mode?: "sale" | "return") => void;
};

const fresh = (mode: "sale" | "return" = "sale"): CartState => ({
  mode,
  billType: "invoice",
  taxType: "inclusive",
  lines: [],
  customer: null,
  extraDiscountPercent: "",
  extraDiscountAmount: "",
  payments: [],
  useAdvance: false,
  creditChangeToAccount: false,
  refundMode: "cash",
  returnSource: null,
  idempotencyKey: uuid(),
  lastRemoved: null
});

export const useCart = create<CartState & Actions>()(
  persist(
    (set, get) => ({
      ...fresh(),
      add: (input) => {
        const existing = get().lines.find((l) => l.variantId === input.variantId && !l.originalItemId);
        const qty = input.qty ?? 1;
        if (existing) {
          const next = existing.qty + qty;
          if (existing.maxQty !== undefined && next > existing.maxQty) return "limit";
          set({ lines: get().lines.map((l) => (l.key === existing.key ? { ...l, qty: next } : l)) });
          return "incremented";
        }
        const line: CartLine = { ...input, key: uuid(), qty, discountPercent: 0, discountAmount: 0 };
        set({ lines: [line, ...get().lines] });
        return "added";
      },
      setQty: (key, qty) => {
        if (qty <= 0) return get().remove(key);
        set({ lines: get().lines.map((l) => (l.key === key ? { ...l, qty: l.maxQty !== undefined ? Math.min(qty, l.maxQty) : qty } : l)) });
      },
      remove: (key) => {
        const index = get().lines.findIndex((l) => l.key === key);
        if (index < 0) return;
        set({ lastRemoved: { line: get().lines[index], index }, lines: get().lines.filter((l) => l.key !== key) });
      },
      undoRemove: () => {
        const removed = get().lastRemoved;
        if (!removed) return;
        const lines = [...get().lines];
        lines.splice(Math.min(removed.index, lines.length), 0, removed.line);
        set({ lines, lastRemoved: null });
      },
      updateLine: (key, patch) => set({ lines: get().lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }),
      setCustomer: (customer) => set({ customer, useAdvance: customer?.id ? get().useAdvance : false, creditChangeToAccount: customer?.id ? get().creditChangeToAccount : false }),
      setPayments: (payments) => set({ payments }),
      set: (patch) => set(patch),
      setMode: (mode) => {
        if (mode === get().mode) return;
        set(fresh(mode));
      },
      startReturn: (source, customer, lines, taxType) => set({ ...fresh("return"), returnSource: source, customer, lines, taxType }),
      reset: (mode) => set(fresh(mode ?? get().mode))
    }),
    {
      name: "wowcity.cart.v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ lastRemoved: _lastRemoved, ...rest }) => rest
    }
  )
);

const money = (n: number) => String(Math.round(n * 100) / 100);

/** The POST /sales body for the current cart. */
export function buildSalePayload(cart: CartState, storeId: string, options: { printIntent?: SaleRequest["printIntent"]; canDiscount: boolean }): SaleRequest {
  const customer = cart.customer
    ? { id: cart.customer.id, name: cart.customer.name.trim() || undefined, mobile: cart.customer.mobile.trim() || undefined, state: cart.customer.state || undefined }
    : undefined;
  const payments =
    cart.mode === "sale" ? cart.payments.filter((p) => toNumber(p.amount) > 0).map((p) => ({ mode: p.mode, amount: money(toNumber(p.amount)), referenceNo: p.referenceNo?.trim() || undefined })) : [];
  return {
    kind: cart.mode,
    storeId,
    billType: cart.mode === "sale" ? cart.billType : "invoice",
    taxType: cart.taxType,
    idempotencyKey: cart.idempotencyKey,
    customer,
    rows: cart.lines.map((l) => ({
      variantId: l.variantId,
      barcode: l.barcode || undefined,
      itemName: l.itemName,
      qty: String(l.qty),
      mrp: money(l.mrp),
      rate: money(l.rate),
      discountPercent: options.canDiscount ? money(l.discountPercent) : "0",
      discountAmount: options.canDiscount ? money(l.discountAmount) : "0",
      originalItemId: l.originalItemId
    })),
    extraDiscountPercent: options.canDiscount && cart.mode === "sale" ? money(toNumber(cart.extraDiscountPercent)) : "0",
    extraDiscountAmount: options.canDiscount && cart.mode === "sale" ? money(toNumber(cart.extraDiscountAmount)) : "0",
    payments,
    useAdvance: cart.mode === "sale" && !!cart.customer?.id && cart.useAdvance,
    creditChangeToAccount: cart.mode === "sale" && !!cart.customer?.id && cart.creditChangeToAccount,
    refundMode: cart.mode === "return" ? cart.refundMode : undefined,
    originalSaleInvoiceId: cart.mode === "return" ? cart.returnSource?.invoiceId : undefined,
    printIntent: options.printIntent ?? "none"
  };
}
