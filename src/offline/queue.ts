import { ApiError } from "@/api/errors";
import type { SaleRequest, SaleResponse } from "@/api/types";
import { offlineReference, uuid } from "@/lib/id";
import type { OfflineStore, QueuedBill } from "./types";

export type PostSale = (payload: SaleRequest) => Promise<SaleResponse>;

export type SyncOutcome = { synced: QueuedBill[]; failed: QueuedBill[]; stoppedOffline: boolean };

/** Build the queue entry for a bill that could not reach the server. Keeps its idempotency key. */
export function makeQueuedBill(payload: SaleRequest, summary: QueuedBill["summary"], now = new Date()): QueuedBill {
  return {
    id: uuid(),
    idempotencyKey: payload.idempotencyKey,
    reference: offlineReference(now),
    createdAt: now.toISOString(),
    storeId: payload.storeId,
    payload,
    status: "pending",
    attempts: 0,
    lastError: null,
    invoiceId: null,
    billNumber: null,
    summary
  };
}

/**
 * Posts queued bills oldest first with `offline: true` and the original idempotency key, so a retry
 * after a dropped connection never creates a duplicate. Stops at the first network error (still
 * offline). Business-rule rejections (4xx) are marked failed with the server's message for the
 * person to review; they don't block the bills behind them.
 */
export function createQueueProcessor(store: OfflineStore, post: PostSale, onChange?: () => void) {
  let running: Promise<SyncOutcome> | null = null;

  async function processOnce(options: { includeFailed?: boolean; onlyId?: string } = {}): Promise<SyncOutcome> {
    const outcome: SyncOutcome = { synced: [], failed: [], stoppedOffline: false };
    const entries = (await store.listQueue()).filter(
      (e) => (options.onlyId ? e.id === options.onlyId : true) && (e.status === "pending" || e.status === "syncing" || (options.includeFailed && e.status === "failed"))
    );
    for (const entry of entries) {
      await store.updateQueued(entry.id, { status: "syncing" });
      onChange?.();
      try {
        const result = await post({ ...entry.payload, idempotencyKey: entry.idempotencyKey, offline: entry.payload.billType === "estimate" ? undefined : true });
        const invoiceId = "invoiceId" in result ? result.invoiceId : result.returnId;
        const billNumber = "billNumber" in result ? result.billNumber : result.returnNumber;
        const synced: QueuedBill = { ...entry, status: "synced", attempts: entry.attempts + 1, lastError: null, invoiceId, billNumber };
        await store.updateQueued(entry.id, synced);
        outcome.synced.push(synced);
      } catch (error) {
        const network = error instanceof ApiError ? error.isNetwork || error.status >= 500 || error.status === 401 : true;
        const message = error instanceof ApiError ? error.message : "Could not send this bill.";
        if (network) {
          await store.updateQueued(entry.id, { status: "pending", attempts: entry.attempts + 1, lastError: message });
          outcome.stoppedOffline = true;
          onChange?.();
          break;
        }
        const failed: QueuedBill = { ...entry, status: "failed", attempts: entry.attempts + 1, lastError: message };
        await store.updateQueued(entry.id, failed);
        outcome.failed.push(failed);
      }
      onChange?.();
    }
    return outcome;
  }

  return {
    /** Send everything pending. Concurrent calls share one run. */
    run(options?: { includeFailed?: boolean; onlyId?: string }) {
      if (!running) running = processOnce(options).finally(() => (running = null));
      return running;
    },
    get busy() {
      return running !== null;
    },
    /** Drop synced entries older than `maxAgeMs` (kept a while so receipts can link to the real bill). */
    async prune(maxAgeMs = 3 * 24 * 3600 * 1000, now = Date.now()) {
      for (const entry of await store.listQueue()) {
        if (entry.status === "synced" && now - Date.parse(entry.createdAt) > maxAgeMs) await store.removeQueued(entry.id);
      }
      onChange?.();
    }
  };
}
