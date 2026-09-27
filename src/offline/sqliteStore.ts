import * as SQLite from "expo-sqlite";
import type { SyncCatalogItem, SyncCustomer } from "@/api/types";
import type { OfflineStore, QueuedBill } from "./types";

type CatalogRow = { data: string };
type QueueRow = { data: string };

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS catalog (
  store_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  search TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (store_id, variant_id)
);
CREATE TABLE IF NOT EXISTS catalog_barcodes (
  store_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  PRIMARY KEY (store_id, barcode)
);
CREATE INDEX IF NOT EXISTS catalog_barcodes_variant ON catalog_barcodes (store_id, variant_id);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY NOT NULL,
  search TEXT NOT NULL,
  mobile TEXT,
  name TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bill_queue (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL
);
`;

function searchText(item: SyncCatalogItem) {
  return [item.itemName, item.brand, item.size, item.colour, item.style, item.category, ...item.barcodes].filter(Boolean).join(" ").toLowerCase();
}

/** Offline catalogue, customers and bill queue in SQLite on the phone. */
export function createSqliteStore(name = "wowcity-offline.db"): OfflineStore {
  let db: SQLite.SQLiteDatabase | null = null;
  const get = async () => {
    if (!db) {
      db = await SQLite.openDatabaseAsync(name);
      await db.execAsync(SCHEMA);
    }
    return db;
  };

  return {
    async init() {
      await get();
    },
    async upsertCatalog(storeId, items) {
      const d = await get();
      await d.withTransactionAsync(async () => {
        for (const item of items) {
          await d.runAsync("DELETE FROM catalog_barcodes WHERE store_id = ? AND variant_id = ?", storeId, item.variantId);
          if (!item.active) {
            await d.runAsync("DELETE FROM catalog WHERE store_id = ? AND variant_id = ?", storeId, item.variantId);
            continue;
          }
          await d.runAsync(
            "INSERT OR REPLACE INTO catalog (store_id, variant_id, search, name, data) VALUES (?, ?, ?, ?, ?)",
            storeId,
            item.variantId,
            searchText(item),
            item.itemName,
            JSON.stringify(item)
          );
          for (const barcode of item.barcodes)
            await d.runAsync("INSERT OR REPLACE INTO catalog_barcodes (store_id, barcode, variant_id) VALUES (?, ?, ?)", storeId, barcode.toUpperCase(), item.variantId);
        }
      });
    },
    async findByBarcode(storeId, barcode) {
      const d = await get();
      const row = await d.getFirstAsync<CatalogRow>(
        "SELECT c.data FROM catalog_barcodes b JOIN catalog c ON c.store_id = b.store_id AND c.variant_id = b.variant_id WHERE b.store_id = ? AND b.barcode = ?",
        storeId,
        barcode.trim().toUpperCase()
      );
      return row ? (JSON.parse(row.data) as SyncCatalogItem) : null;
    },
    async searchCatalog(storeId, q, limit = 30) {
      const d = await get();
      const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 5);
      const where = words.map(() => "search LIKE ?").join(" AND ");
      const rows = await d.getAllAsync<CatalogRow>(`SELECT data FROM catalog WHERE store_id = ?${where ? ` AND ${where}` : ""} ORDER BY name LIMIT ?`, storeId, ...words.map((w) => `%${w}%`), limit);
      return rows.map((r) => JSON.parse(r.data) as SyncCatalogItem);
    },
    async catalogCount(storeId) {
      const d = await get();
      const row = await d.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM catalog WHERE store_id = ?", storeId);
      return row?.n ?? 0;
    },
    async adjustLocalStock(storeId, variantId, delta) {
      const d = await get();
      const row = await d.getFirstAsync<CatalogRow>("SELECT data FROM catalog WHERE store_id = ? AND variant_id = ?", storeId, variantId);
      if (!row) return;
      const item = JSON.parse(row.data) as SyncCatalogItem;
      item.availableQty += delta;
      await d.runAsync("UPDATE catalog SET data = ? WHERE store_id = ? AND variant_id = ?", JSON.stringify(item), storeId, variantId);
    },
    async upsertCustomers(items) {
      const d = await get();
      await d.withTransactionAsync(async () => {
        for (const c of items) {
          await d.runAsync(
            "INSERT OR REPLACE INTO customers (id, search, mobile, name, data) VALUES (?, ?, ?, ?, ?)",
            c.id,
            `${c.name} ${c.mobile ?? ""}`.toLowerCase(),
            (c.mobile ?? "").replace(/\D/g, ""),
            c.name,
            JSON.stringify(c)
          );
        }
      });
    },
    async searchCustomers(q, limit = 8) {
      const d = await get();
      const needle = q.toLowerCase().trim();
      const digits = needle.replace(/\D/g, "");
      const rows = await d.getAllAsync<CatalogRow>(
        "SELECT data FROM customers WHERE search LIKE ? OR (? <> '' AND mobile LIKE ?) ORDER BY name LIMIT ?",
        `%${needle}%`,
        digits.length >= 3 ? digits : "",
        `%${digits}%`,
        limit
      );
      return rows.map((r) => JSON.parse(r.data) as SyncCustomer);
    },
    async customerCount() {
      const d = await get();
      return (await d.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM customers"))?.n ?? 0;
    },
    async getMeta(key) {
      const d = await get();
      return (await d.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", key))?.value ?? null;
    },
    async setMeta(key, value) {
      const d = await get();
      if (value === null) await d.runAsync("DELETE FROM meta WHERE key = ?", key);
      else await d.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", key, value);
    },
    async enqueue(bill) {
      const d = await get();
      await d.runAsync("INSERT OR REPLACE INTO bill_queue (id, created_at, status, data) VALUES (?, ?, ?, ?)", bill.id, bill.createdAt, bill.status, JSON.stringify(bill));
    },
    async updateQueued(id, patch) {
      const d = await get();
      const row = await d.getFirstAsync<QueueRow>("SELECT data FROM bill_queue WHERE id = ?", id);
      if (!row) return;
      const next = { ...(JSON.parse(row.data) as QueuedBill), ...patch };
      await d.runAsync("UPDATE bill_queue SET status = ?, data = ? WHERE id = ?", next.status, JSON.stringify(next), id);
    },
    async removeQueued(id) {
      const d = await get();
      await d.runAsync("DELETE FROM bill_queue WHERE id = ?", id);
    },
    async listQueue() {
      const d = await get();
      const rows = await d.getAllAsync<QueueRow>("SELECT data FROM bill_queue ORDER BY created_at");
      return rows.map((r) => JSON.parse(r.data) as QueuedBill);
    },
    async clearCache() {
      const d = await get();
      await d.execAsync("DELETE FROM catalog; DELETE FROM catalog_barcodes; DELETE FROM customers; DELETE FROM meta;");
    },
    async clear() {
      const d = await get();
      await d.execAsync("DELETE FROM catalog; DELETE FROM catalog_barcodes; DELETE FROM customers; DELETE FROM meta; DELETE FROM bill_queue;");
    }
  };
}
