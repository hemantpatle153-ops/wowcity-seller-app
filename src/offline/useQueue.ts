import { create } from "zustand";
import { api } from "@/api";
import { actorKey } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useConnectivity } from "@/state/connectivity";
import { createQueueProcessor } from "./queue";
import { offlineStore } from "./store";
import { syncCatalog, syncCustomers } from "./sync";
import type { QueuedBill } from "./types";

type OfflineState = {
  ready: boolean;
  queue: QueuedBill[];
  catalogCount: number;
  customerCount: number;
  lastCatalogSync: string | null;
  syncing: boolean;
  syncError: string | null;
  reload: () => Promise<void>;
};

export const useOffline = create<OfflineState>((set) => ({
  ready: false,
  queue: [],
  catalogCount: 0,
  customerCount: 0,
  lastCatalogSync: null,
  syncing: false,
  syncError: null,
  reload: async () => {
    const queue = await offlineStore.listQueue();
    set({ queue, ready: true });
  }
}));

/** Bills made by the person signed in now (bills from before owners were recorded count as theirs). */
export function isMine(entry: QueuedBill, key = actorKey(useSession.getState().me)) {
  return !entry.owner || entry.owner.actorKey === key;
}

export const queueProcessor = createQueueProcessor(
  offlineStore,
  (payload) => api.sales.post(payload),
  () => void useOffline.getState().reload(),
  (entry) => isMine(entry)
);

/** This person's queued bills (others on a shared phone stay hidden and unsent until they sign in). */
export function useMyQueue() {
  const queue = useOffline((s) => s.queue);
  const key = useSession((s) => actorKey(s.me));
  return queue.filter((entry) => isMine(entry, key));
}

/** Bills other people made on this phone that are still waiting for them to sign in. */
export function useOthersWaiting() {
  const queue = useOffline((s) => s.queue);
  const key = useSession((s) => actorKey(s.me));
  return queue.filter((entry) => !isMine(entry, key) && entry.status !== "synced");
}

/** Bills still waiting to reach the server (pending, syncing or needing attention). */
export function useQueueCount() {
  return useMyQueue().filter((q) => q.status !== "synced").length;
}

export async function initOffline() {
  await offlineStore.init();
  await useOffline.getState().reload();
}

/** Refresh catalogue + customers for the store and push any queued bills. Safe to call often. */
export async function syncNow(storeId: string | null, options: { catalog?: boolean; customers?: boolean } = {}) {
  if (useOffline.getState().syncing) return;
  useOffline.setState({ syncing: true, syncError: null });
  try {
    const outcome = await queueProcessor.run();
    if (outcome.synced.length || outcome.failed.length) await queueProcessor.prune();
    if (storeId && options.catalog !== false) await syncCatalog(offlineStore, api.sync.catalog, storeId);
    if (options.customers !== false) await syncCustomers(offlineStore, api.sync.customers).catch(() => 0);
    const [catalogCount, customerCount, lastCatalogSync] = await Promise.all([
      storeId ? offlineStore.catalogCount(storeId) : Promise.resolve(0),
      offlineStore.customerCount(),
      storeId ? offlineStore.getMeta(`catalogSyncedAt:${storeId}`) : Promise.resolve(null)
    ]);
    useOffline.setState({ catalogCount, customerCount, lastCatalogSync });
  } catch (error) {
    useOffline.setState({ syncError: error instanceof Error ? error.message : "Sync failed" });
  } finally {
    useOffline.setState({ syncing: false });
  }
}

/** Retry one bill that needs attention (or all when no id). */
export async function retryQueued(id?: string) {
  const outcome = await queueProcessor.run({ includeFailed: true, onlyId: id });
  await useOffline.getState().reload();
  return outcome;
}

export async function discardQueued(id: string) {
  await offlineStore.removeQueued(id);
  await useOffline.getState().reload();
}

/** Push queued bills whenever the network comes back. */
export function startQueueAutoSync(getStoreId: () => string | null) {
  let wasOnline = useConnectivity.getState().online;
  const unsubscribe = useConnectivity.subscribe((state) => {
    if (state.online && !wasOnline) void syncNow(getStoreId(), { catalog: true });
    wasOnline = state.online;
  });
  const timer = setInterval(() => {
    const pending = useOffline.getState().queue.some((q) => q.status === "pending" && isMine(q));
    if (pending && !queueProcessor.busy) void queueProcessor.run();
  }, 30000);
  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}
