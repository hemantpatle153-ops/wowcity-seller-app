import { useCart } from "@/features/sell/cart";
import { useLastReceipt } from "@/features/sell/lastReceipt";
import { usePurchaseDraft } from "@/features/purchase/draft";
import { usePrintList } from "@/features/labels/printList";
import { offlineStore } from "@/offline/store";
import { useOffline } from "@/offline/useQueue";
import { queryClient } from "@/state/queryClient";

/**
 * Forget everything that belonged to the person who just signed out, so the next person on a shared
 * counter phone starts clean: cart, drafts, cached screens, the offline catalogue and customers.
 * Bills still waiting to sync are kept (they are tied to their maker and post when that person signs in).
 */
export async function resetLocalData() {
  useCart.getState().reset("sale");
  usePurchaseDraft.getState().reset();
  usePrintList.getState().clear();
  useLastReceipt.setState({ result: null, change: 0 });
  queryClient.clear();
  try {
    await offlineStore.clearCache();
  } finally {
    useOffline.setState({ catalogCount: 0, customerCount: 0, lastCatalogSync: null, syncError: null });
    await useOffline.getState().reload();
  }
}
