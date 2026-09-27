import type { SaleRequest, SyncCatalogItem, SyncCursor, SyncCustomer } from "@/api/types";
import type { ReceiptData } from "@/printing/receipt";

export type QueueStatus = "pending" | "syncing" | "failed" | "synced";

/** A bill saved on this phone that has not reached the server yet. */
export type QueuedBill = {
  id: string;
  idempotencyKey: string;
  /** Temporary reference printed on the offline receipt until the real bill number exists. */
  reference: string;
  createdAt: string;
  storeId: string;
  payload: SaleRequest;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
  /** Filled after sync. */
  invoiceId: string | null;
  billNumber: string | null;
  summary: { total: number; items: number; customer: string | null; kind: "sale" | "return"; estimate: boolean };
  /** Snapshot for reprinting the provisional receipt. */
  receipt?: ReceiptData;
  /** Who made the bill: only that person's session may post it (shared counter phones). */
  owner?: { shopCode: string; actorKey: string; name: string };
};

export interface OfflineStore {
  init(): Promise<void>;
  // Catalogue (per store)
  upsertCatalog(storeId: string, items: SyncCatalogItem[]): Promise<void>;
  findByBarcode(storeId: string, barcode: string): Promise<SyncCatalogItem | null>;
  searchCatalog(storeId: string, q: string, limit?: number): Promise<SyncCatalogItem[]>;
  catalogCount(storeId: string): Promise<number>;
  /** Reduce local stock after an offline sale so the next lookup is closer to reality. */
  adjustLocalStock(storeId: string, variantId: string, delta: number): Promise<void>;
  // Customers
  upsertCustomers(items: SyncCustomer[]): Promise<void>;
  searchCustomers(q: string, limit?: number): Promise<SyncCustomer[]>;
  customerCount(): Promise<number>;
  // Cursors and small values
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;
  // Bill queue
  enqueue(bill: QueuedBill): Promise<void>;
  updateQueued(id: string, patch: Partial<QueuedBill>): Promise<void>;
  removeQueued(id: string): Promise<void>;
  listQueue(): Promise<QueuedBill[]>;
  /** Remove catalogue, customers and sync cursors, keeping queued bills (sign-out, troubleshooting). */
  clearCache(): Promise<void>;
  /** Wipe everything, including queued bills. */
  clear(): Promise<void>;
}

export type { SyncCursor };
