import { ApiError } from "@/api/errors";
import type { SaleRequest, SaleResponse, SyncCatalogItem } from "@/api/types";
import { createMemoryStore } from "@/offline/memoryStore";
import { createQueueProcessor, makeQueuedBill } from "@/offline/queue";
import { syncCatalog } from "@/offline/sync";

const payload = (key: string): SaleRequest => ({
  kind: "sale",
  storeId: "s1",
  taxType: "inclusive",
  idempotencyKey: key,
  rows: [{ variantId: "v1", itemName: "Kurta", qty: "1", mrp: "999", rate: "899" }],
  payments: [{ mode: "cash", amount: "899" }]
});
const summary = { total: 899, items: 1, customer: null, kind: "sale" as const, estimate: false };
const ok = (n: number): SaleResponse => ({ ok: true, message: "saved", invoiceId: `inv${n}`, billNumber: `MG/${n}`, estimate: false, changeDue: "0.00", printIntent: "none" });

describe("offline bill queue", () => {
  it("posts oldest first with offline: true and the original idempotency key", async () => {
    const store = createMemoryStore();
    const a = makeQueuedBill(payload("key-aaaaaaaaaaaa"), summary, new Date("2026-09-01T10:00:00Z"));
    const b = makeQueuedBill(payload("key-bbbbbbbbbbbb"), summary, new Date("2026-09-01T11:00:00Z"));
    await store.enqueue(b);
    await store.enqueue(a);
    const post = jest.fn().mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(2));
    const outcome = await createQueueProcessor(store, post).run();
    expect(post.mock.calls.map((c) => [c[0].idempotencyKey, c[0].offline])).toEqual([
      ["key-aaaaaaaaaaaa", true],
      ["key-bbbbbbbbbbbb", true]
    ]);
    expect(outcome.synced.map((s) => s.billNumber)).toEqual(["MG/1", "MG/2"]);
    expect((await store.listQueue()).every((q) => q.status === "synced")).toBe(true);
  });

  it("stops at a network error and keeps the bill pending for the next try", async () => {
    const store = createMemoryStore();
    await store.enqueue(makeQueuedBill(payload("key-111111111111"), summary, new Date(1)));
    await store.enqueue(makeQueuedBill(payload("key-222222222222"), summary, new Date(2)));
    const post = jest.fn().mockRejectedValue(new ApiError(0, "network", "offline"));
    const outcome = await createQueueProcessor(store, post).run();
    expect(outcome.stoppedOffline).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const queue = await store.listQueue();
    expect(queue.map((q) => q.status)).toEqual(["pending", "pending"]);
    expect(queue[0].attempts).toBe(1);
  });

  it("marks business-rule rejections as failed and carries on", async () => {
    const store = createMemoryStore();
    await store.enqueue(makeQueuedBill(payload("key-333333333333"), summary, new Date(1)));
    await store.enqueue(makeQueuedBill(payload("key-444444444444"), summary, new Date(2)));
    const post = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(422, "sale_rejected", "Customer needed for credit."))
      .mockResolvedValueOnce(ok(9));
    const outcome = await createQueueProcessor(store, post).run();
    expect(outcome.failed[0].lastError).toBe("Customer needed for credit.");
    expect(outcome.synced[0].billNumber).toBe("MG/9");
    // Failed bills are only retried when asked, with the same key.
    const again = jest.fn().mockResolvedValue(ok(10));
    await createQueueProcessor(store, again).run();
    expect(again).not.toHaveBeenCalled();
    await createQueueProcessor(store, again).run({ includeFailed: true });
    expect(again.mock.calls[0][0].idempotencyKey).toBe("key-333333333333");
  });

  it("gives offline receipts a temporary reference", () => {
    const bill = makeQueuedBill(payload("key-555555555555"), summary, new Date(2026, 8, 7));
    expect(bill.reference).toMatch(/^OFF-[A-Z2-9]{4}-0709$/);
  });

  it("prunes synced bills after a few days", async () => {
    const store = createMemoryStore();
    const old = { ...makeQueuedBill(payload("key-666666666666"), summary, new Date(0)), status: "synced" as const };
    await store.enqueue(old);
    await createQueueProcessor(store, jest.fn()).prune(1000, Date.now());
    expect(await store.listQueue()).toHaveLength(0);
  });
});

describe("catalogue sync", () => {
  const item = (id: string, active = true, barcode = `89${id}`): SyncCatalogItem => ({
    variantId: id,
    productId: "p",
    active,
    itemName: `Item ${id}`,
    brand: "B",
    category: null,
    size: "M",
    colour: "Blue",
    style: null,
    hsnCode: null,
    gstRate: 5,
    mrp: 100,
    rate: 90,
    availableQty: 3,
    barcodes: [barcode],
    changedAt: "2026-01-01T00:00:00Z"
  });

  it("pages with the cursor until hasMore is false, then resumes from the saved cursor", async () => {
    const store = createMemoryStore();
    const pages = [
      { items: [item("1"), item("2")], next: { sinceAt: "t1", sinceId: "2" }, hasMore: true, serverTime: "" },
      { items: [item("3")], next: { sinceAt: "t2", sinceId: "3" }, hasMore: false, serverTime: "" },
      { items: [item("2", false)], next: { sinceAt: "t3", sinceId: "2" }, hasMore: false, serverTime: "" }
    ];
    const fetchPage = jest.fn().mockImplementation(async () => pages.shift());
    expect(await syncCatalog(store, fetchPage, "s1")).toBe(3);
    expect(fetchPage.mock.calls[1][0]).toMatchObject({ sinceAt: "t1", sinceId: "2" });
    expect(await store.catalogCount("s1")).toBe(3);
    await syncCatalog(store, fetchPage, "s1");
    expect(fetchPage.mock.calls[2][0]).toMatchObject({ sinceAt: "t2", sinceId: "3" });
    expect(await store.catalogCount("s1")).toBe(2);
    expect((await store.findByBarcode("s1", "893"))?.variantId).toBe("3");
    expect((await store.searchCatalog("s1", "item 3")).map((i) => i.variantId)).toEqual(["3"]);
  });
});

describe("shared phones", () => {
  it("only posts bills made by the person signed in", async () => {
    const store = createMemoryStore();
    const mine = { ...makeQueuedBill(payload("key-mine00000000"), summary, new Date(1)), owner: { shopCode: "LUZ482", actorKey: "LUZ482:worker:ravi", name: "Ravi" } };
    const theirs = { ...makeQueuedBill(payload("key-theirs000000"), summary, new Date(2)), owner: { shopCode: "LUZ482", actorKey: "LUZ482:worker:meena", name: "Meena" } };
    await store.enqueue(mine);
    await store.enqueue(theirs);
    const post = jest.fn().mockResolvedValue(ok(1));
    await createQueueProcessor(store, post, undefined, (e) => e.owner?.actorKey === "LUZ482:worker:ravi").run();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0].idempotencyKey).toBe("key-mine00000000");
    expect((await store.listQueue()).find((q) => q.id === theirs.id)?.status).toBe("pending");
  });

  it("keeps rate-limited bills pending instead of failing them", async () => {
    const store = createMemoryStore();
    await store.enqueue(makeQueuedBill(payload("key-429000000000"), summary, new Date(1)));
    await createQueueProcessor(store, jest.fn().mockRejectedValue(new ApiError(429, "rate_limited", "Too many"))).run();
    expect((await store.listQueue())[0].status).toBe("pending");
  });

  it("clearing the cache keeps waiting bills", async () => {
    const store = createMemoryStore();
    await store.enqueue(makeQueuedBill(payload("key-keep00000000"), summary, new Date(1)));
    await store.setMeta("customersCursor", "x");
    await store.clearCache();
    expect(await store.listQueue()).toHaveLength(1);
    expect(await store.getMeta("customersCursor")).toBeNull();
  });
});
