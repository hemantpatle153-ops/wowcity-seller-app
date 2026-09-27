import type { SyncCatalogResponse, SyncCustomersResponse } from "@/api/types";
import type { OfflineStore } from "./types";

type FetchCatalog = (query: { storeId: string; sinceAt?: string; sinceId?: string; limit?: number }) => Promise<SyncCatalogResponse>;
type FetchCustomers = (query: { sinceAt?: string; sinceId?: string; limit?: number }) => Promise<SyncCustomersResponse>;

const MAX_PAGES = 200;

/**
 * Pull catalogue changes for one store into the offline store. First run downloads everything;
 * later runs send the saved cursor and receive only changed rows (docs/api.md "Offline sync").
 */
export async function syncCatalog(store: OfflineStore, fetchPage: FetchCatalog, storeId: string, limit = 1000) {
  const key = `catalogCursor:${storeId}`;
  let cursor = parseCursor(await store.getMeta(key));
  let received = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchPage({ storeId, sinceAt: cursor?.sinceAt, sinceId: cursor?.sinceId, limit });
    await store.upsertCatalog(storeId, data.items);
    received += data.items.length;
    if (data.next) {
      cursor = data.next;
      await store.setMeta(key, JSON.stringify(cursor));
    }
    if (!data.hasMore || !data.next) break;
  }
  await store.setMeta(`catalogSyncedAt:${storeId}`, new Date().toISOString());
  return received;
}

export async function syncCustomers(store: OfflineStore, fetchPage: FetchCustomers, limit = 1000) {
  const key = "customersCursor";
  let cursor = parseCursor(await store.getMeta(key));
  let received = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchPage({ sinceAt: cursor?.sinceAt, sinceId: cursor?.sinceId, limit });
    await store.upsertCustomers(data.items);
    received += data.items.length;
    if (data.next) {
      cursor = data.next;
      await store.setMeta(key, JSON.stringify(cursor));
    }
    if (!data.hasMore || !data.next) break;
  }
  await store.setMeta("customersSyncedAt", new Date().toISOString());
  return received;
}

function parseCursor(raw: string | null): { sinceAt: string; sinceId: string } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { sinceAt?: string; sinceId?: string };
    return value.sinceAt && value.sinceId ? { sinceAt: value.sinceAt, sinceId: value.sinceId } : null;
  } catch {
    return null;
  }
}
