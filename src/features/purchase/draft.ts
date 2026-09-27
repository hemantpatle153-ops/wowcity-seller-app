import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PurchaseBarcodeLookupResponse, PurchaseSetupResponse } from "@/api/types";
import { isoDay } from "@/lib/format";
import { uuid } from "@/lib/id";

export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

export type PhotoDraft = {
  id: string;
  uri: string;
  fileName: string;
  contentType: PhotoType;
  sizeBytes: number;
  status: "uploading" | "done" | "failed";
  error?: string;
  bucket?: string;
  objectKey?: string;
};

export type ItemDraft = {
  /** Client row id: sent as rowId and used as the draft productId for photo uploads. */
  key: string;
  /** Scanned/typed barcode ("" = server generates one). */
  entry: string;
  /** Set when the barcode is already in the catalogue: saving restocks that variant. */
  restock: { variantId: string; barcode: string; inStock: number } | null;
  itemName: string;
  brand: string;
  category: string;
  size: string;
  colour: string;
  style: string;
  hsnCode: string;
  gstCode: string;
  gstRate: string;
  qty: string;
  purchaseRate: string;
  disc1Percent: string;
  disc1Amount: string;
  disc2Amount: string;
  mrp: string;
  saleRate: string;
  /** Custom field id → value as typed (multi-select comma separated, boolean "true"/"false"). */
  customValues: Record<string, string>;
  publicEnabled: boolean;
  publicFields: Record<string, boolean>;
  description: string;
  tags: string[];
  photos: PhotoDraft[];
  printLabels: boolean;
  collapsed: boolean;
};

export type PayMode = "cash" | "upi" | "bank" | "cheque" | "card" | "other";
export type PaymentDraft = { key: string; mode: PayMode; amount: string; referenceNo: string };

export type PurchaseDraft = {
  shopCode: string | null;
  supplier: { id: string | null; name: string } | null;
  storeId: string | null;
  mode: "inclusive" | "exclusive";
  date: string;
  invoice: string;
  items: ItemDraft[];
  extraDiscountPercent: string;
  extraDiscountAmount: string;
  tcsAmount: string;
  payments: PaymentDraft[];
  /** One per purchase form, reused on every retry; renewed after a successful save or discard. */
  idempotencyKey: string;
  updatedAt: number;
};

type Actions = {
  set: (patch: Partial<PurchaseDraft>) => void;
  addItem: (item: ItemDraft, after?: string) => void;
  updateItem: (key: string, patch: Partial<ItemDraft>) => void;
  removeItem: (key: string) => { item: ItemDraft; index: number } | null;
  restoreItem: (item: ItemDraft, index: number) => void;
  duplicateItem: (key: string, patch?: Partial<ItemDraft>) => string | null;
  updatePhoto: (itemKey: string, photoId: string, patch: Partial<PhotoDraft> | null) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  reset: (keep?: Partial<PurchaseDraft>) => void;
};

export function emptyDraft(keep: Partial<PurchaseDraft> = {}): PurchaseDraft {
  return {
    shopCode: null,
    supplier: null,
    storeId: null,
    mode: "exclusive",
    date: isoDay(),
    invoice: "",
    items: [],
    extraDiscountPercent: "",
    extraDiscountAmount: "",
    tcsAmount: "",
    payments: [],
    idempotencyKey: uuid(),
    updatedAt: Date.now(),
    ...keep
  };
}

export function blankItem(setup?: Pick<PurchaseSetupResponse, "publicFieldDefaults" | "gstSlabs" | "customFields"> | null, patch: Partial<ItemDraft> = {}): ItemDraft {
  const customValues: Record<string, string> = {};
  const publicFields: Record<string, boolean> = { ...(setup?.publicFieldDefaults ?? {}) };
  for (const field of setup?.customFields ?? []) if (field.is_public_eligible && field.default_public_enabled) publicFields[`custom:${field.id}`] = true;
  const slab = setup?.gstSlabs.find((s) => !s.is_special && s.rate === 5) ?? setup?.gstSlabs[0];
  return {
    key: uuid(),
    entry: "",
    restock: null,
    itemName: "",
    brand: "",
    category: "",
    size: "",
    colour: "",
    style: "",
    hsnCode: "",
    gstCode: slab?.code ?? "",
    gstRate: slab ? String(slab.rate) : "",
    qty: "1",
    purchaseRate: "",
    disc1Percent: "",
    disc1Amount: "",
    disc2Amount: "",
    mrp: "",
    saleRate: "",
    customValues,
    publicEnabled: false,
    publicFields,
    description: "",
    tags: [],
    photos: [],
    printLabels: true,
    collapsed: false,
    ...patch
  };
}

/** A card prefilled from GET /purchases/barcode-lookup (found). Saving restocks that variant. */
export function restockItem(setup: Parameters<typeof blankItem>[0], hit: Extract<PurchaseBarcodeLookupResponse, { found: true }>): ItemDraft {
  const slab = setup?.gstSlabs.find((s) => s.code === hit.gstCode) ?? setup?.gstSlabs.find((s) => String(s.rate) === hit.gstRate);
  return blankItem(setup, {
    entry: hit.barcode,
    restock: { variantId: hit.variantId, barcode: hit.barcode, inStock: hit.inStock },
    itemName: hit.itemName,
    brand: hit.brand,
    category: hit.category,
    size: hit.size,
    colour: hit.colour,
    style: hit.style,
    hsnCode: hit.hsnCode,
    gstCode: slab?.code ?? hit.gstCode,
    gstRate: slab ? String(slab.rate) : hit.gstRate,
    mrp: hit.mrp,
    saleRate: hit.saleRate
  });
}

/** Anything worth keeping (so the draft banner and "Discard draft" make sense). */
export function draftHasContent(d: Pick<PurchaseDraft, "items" | "supplier" | "invoice">) {
  return d.items.length > 0 || !!d.supplier || !!d.invoice.trim();
}

export const usePurchaseDraft = create<PurchaseDraft & Actions>()(
  persist(
    (set, get) => ({
      ...emptyDraft(),
      set: (patch) => set({ ...patch, updatedAt: Date.now() }),
      addItem: (item, after) =>
        set((s) => {
          const index = after ? s.items.findIndex((i) => i.key === after) : -1;
          const items = [...s.items];
          if (index >= 0) items.splice(index + 1, 0, item);
          else items.push(item);
          // First item of a new purchase: date it today (the empty draft may be from yesterday).
          const startingFresh = !draftHasContent(s);
          return { items, updatedAt: Date.now(), ...(startingFresh ? { date: isoDay() } : {}) };
        }),
      updateItem: (key, patch) => set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, ...patch } : i)), updatedAt: Date.now() })),
      removeItem: (key) => {
        const index = get().items.findIndex((i) => i.key === key);
        if (index < 0) return null;
        const item = get().items[index];
        set((s) => ({ items: s.items.filter((i) => i.key !== key), updatedAt: Date.now() }));
        return { item, index };
      },
      restoreItem: (item, index) =>
        set((s) => {
          const items = [...s.items];
          items.splice(Math.min(index, items.length), 0, item);
          return { items, updatedAt: Date.now() };
        }),
      duplicateItem: (key, patch = {}) => {
        const source = get().items.find((i) => i.key === key);
        if (!source) return null;
        // A copy is a new variant (e.g. same kurta in another size): new barcode, no photos of its own.
        const copy: ItemDraft = { ...source, key: uuid(), entry: "", restock: null, photos: [], collapsed: false, ...patch };
        get().addItem(copy, key);
        get().updateItem(key, { collapsed: true });
        return copy.key;
      },
      updatePhoto: (itemKey, photoId, patch) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.key !== itemKey ? i : { ...i, photos: patch === null ? i.photos.filter((p) => p.id !== photoId) : i.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) }
          ),
          updatedAt: Date.now()
        })),
      setAllCollapsed: (collapsed) => set((s) => ({ items: s.items.map((i) => ({ ...i, collapsed })) })),
      reset: (keep) => set(emptyDraft(keep))
    }),
    {
      name: "wowcity.purchase-draft.v1",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s): PurchaseDraft => ({
        shopCode: s.shopCode,
        supplier: s.supplier,
        storeId: s.storeId,
        mode: s.mode,
        date: s.date,
        invoice: s.invoice,
        items: s.items,
        extraDiscountPercent: s.extraDiscountPercent,
        extraDiscountAmount: s.extraDiscountAmount,
        tcsAmount: s.tcsAmount,
        payments: s.payments,
        idempotencyKey: s.idempotencyKey,
        updatedAt: s.updatedAt
      }),
      // A photo that was mid-upload when the app closed has to be retried.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PurchaseDraft>;
        const items = (saved.items ?? []).map((i) => ({
          ...i,
          photos: (i.photos ?? []).map((p) => (p.status === "uploading" ? { ...p, status: "failed" as const, error: "Upload was interrupted." } : p))
        }));
        return { ...current, ...saved, items };
      }
    }
  )
);
