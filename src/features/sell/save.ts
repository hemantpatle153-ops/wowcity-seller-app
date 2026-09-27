import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { MeResponse, SaleRequest, SaleResponse } from "@/api/types";
import { offlineStore } from "@/offline/store";
import { makeQueuedBill } from "@/offline/queue";
import { useOffline } from "@/offline/useQueue";
import type { QueuedBill } from "@/offline/types";
import { receiptFromCart, type ReceiptData } from "@/printing/receipt";
import { useConnectivity } from "@/state/connectivity";
import { queryClient } from "@/state/queryClient";
import { buildSalePayload, useCart } from "./cart";
import type { CartTotals } from "./totals";

export type SaveResult =
  | { status: "saved"; response: SaleResponse; invoiceId: string; number: string; receipt: ReceiptData; message: string }
  | { status: "queued"; entry: QueuedBill; receipt: ReceiptData };

type Context = { me: MeResponse; store: { id: string; name: string; state: string; city: string }; totals: CartTotals; canDiscount: boolean; printIntent?: SaleRequest["printIntent"] };

/**
 * Save the current bill. Online: POST /sales. No network (or the request never got an answer):
 * the bill goes into the phone's queue with the same idempotency key and a temporary reference,
 * and is posted with `offline: true` when the connection returns. The customer never waits.
 */
export async function saveCurrentBill({ me, store, totals, canDiscount, printIntent }: Context): Promise<SaveResult> {
  const cart = useCart.getState();
  const payload = buildSalePayload(cart, store.id, { canDiscount, printIntent });
  const summary = { total: totals.net, items: totals.quantity, customer: cart.customer?.name || null, kind: cart.mode, estimate: cart.billType === "estimate" } as const;

  const queue = async (): Promise<SaveResult> => {
    const entry = makeQueuedBill(payload, summary);
    const receipt = receiptFromCart(cart, totals, me, store, entry.reference, true);
    await offlineStore.enqueue({ ...entry, receipt });
    if (cart.billType !== "estimate") {
      const sign = cart.mode === "return" ? 1 : -1;
      for (const line of cart.lines) await offlineStore.adjustLocalStock(store.id, line.variantId, sign * line.qty);
    }
    await useOffline.getState().reload();
    useCart.getState().reset();
    return { status: "queued", entry, receipt };
  };

  if (!useConnectivity.getState().online) return queue();

  let response: SaleResponse;
  try {
    response = await api.sales.post(payload);
  } catch (error) {
    // No answer: we can't know if it posted, so queue it; the idempotency key prevents a duplicate.
    if (error instanceof ApiError && (error.isNetwork || error.status >= 500)) return queue();
    throw error;
  }
  const invoiceId = "invoiceId" in response ? response.invoiceId : response.returnId;
  const number = "billNumber" in response ? response.billNumber : response.returnNumber;
  const receipt = receiptFromCart(cart, totals, me, store, number, false);
  useCart.getState().reset();
  void queryClient.invalidateQueries({ queryKey: ["sales"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["catalog-search"] });
  return { status: "saved", response, invoiceId, number, receipt, message: response.message };
}
