import type { SyncCatalogItem, SyncCustomer } from "@/api/types";
import type { OfflineStore, QueuedBill } from "./types";

function norm(text: string | null | undefined) {
  return (text ?? "").toLowerCase();
}

/** Ranks name matches: whole-word prefix first, then substring. */
export function matchesQuery(item: SyncCatalogItem, q: string) {
  const needle = norm(q).trim();
  if (!needle) return true;
  const hay = [item.itemName, item.brand, item.size, item.colour, item.style, item.category, ...item.barcodes].map(norm).join(" ");
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

type Persist = { load(): Record<string, unknown> | null; save(data: Record<string, unknown>): void };

/**
 * In-memory store used on web (mock demo) and in tests. Optionally persists to a key-value backend
 * (localStorage on web) so queued bills survive a reload.
 */
export function createMemoryStore(persist?: Persist): OfflineStore {
  let catalog = new Map<string, Map<string, SyncCatalogItem>>();
  let customers = new Map<string, SyncCustomer>();
  let meta = new Map<string, string>();
  let queue = new Map<string, QueuedBill>();

  const save = () => {
    if (!persist) return;
    persist.save({
      catalog: [...catalog.entries()].map(([store, items]) => [store, [...items.values()]]),
      customers: [...customers.values()],
      meta: [...meta.entries()],
      queue: [...queue.values()]
    });
  };

  const storeMap = (storeId: string) => {
    let map = catalog.get(storeId);
    if (!map) {
      map = new Map();
      catalog.set(storeId, map);
    }
    return map;
  };

  return {
    async init() {
      const data = persist?.load();
      if (!data) return;
      catalog = new Map(((data.catalog as [string, SyncCatalogItem[]][]) ?? []).map(([store, items]) => [store, new Map(items.map((i) => [i.variantId, i]))]));
      customers = new Map(((data.customers as SyncCustomer[]) ?? []).map((c) => [c.id, c]));
      meta = new Map((data.meta as [string, string][]) ?? []);
      queue = new Map(((data.queue as QueuedBill[]) ?? []).map((q) => [q.id, q]));
    },
    async upsertCatalog(storeId, items) {
      const map = storeMap(storeId);
      for (const item of items) {
        if (item.active) map.set(item.variantId, item);
        else map.delete(item.variantId);
      }
      save();
    },
    async findByBarcode(storeId, barcode) {
      const code = barcode.trim().toUpperCase();
      for (const item of storeMap(storeId).values()) if (item.barcodes.some((b) => b.toUpperCase() === code)) return item;
      return null;
    },
    async searchCatalog(storeId, q, limit = 30) {
      const out: SyncCatalogItem[] = [];
      for (const item of storeMap(storeId).values()) {
        if (matchesQuery(item, q)) out.push(item);
      }
      out.sort((a, b) => a.itemName.localeCompare(b.itemName));
      return out.slice(0, limit);
    },
    async catalogCount(storeId) {
      return storeMap(storeId).size;
    },
    async adjustLocalStock(storeId, variantId, delta) {
      const item = storeMap(storeId).get(variantId);
      if (item) storeMap(storeId).set(variantId, { ...item, availableQty: item.availableQty + delta });
      save();
    },
    async upsertCustomers(items) {
      for (const item of items) customers.set(item.id, item);
      save();
    },
    async searchCustomers(q, limit = 8) {
      const needle = norm(q).trim();
      const digits = needle.replace(/\D/g, "");
      return [...customers.values()]
        .filter((c) => (digits.length >= 3 && norm(c.mobile).replace(/\D/g, "").includes(digits)) || norm(c.name).includes(needle))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, limit);
    },
    async customerCount() {
      return customers.size;
    },
    async getMeta(key) {
      return meta.get(key) ?? null;
    },
    async setMeta(key, value) {
      if (value === null) meta.delete(key);
      else meta.set(key, value);
      save();
    },
    async enqueue(bill) {
      queue.set(bill.id, bill);
      save();
    },
    async updateQueued(id, patch) {
      const current = queue.get(id);
      if (current) queue.set(id, { ...current, ...patch });
      save();
    },
    async removeQueued(id) {
      queue.delete(id);
      save();
    },
    async listQueue() {
      return [...queue.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async clear() {
      catalog = new Map();
      customers = new Map();
      meta = new Map();
      queue = new Map();
      save();
    }
  };
}
