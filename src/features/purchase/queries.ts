import { useSession } from "@/auth/session";
import { syncNow } from "@/offline/useQueue";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "@/api";

export const purchaseKeys = {
  all: ["purchases"] as const,
  setup: ["purchases", "setup"] as const,
  list: (filters: Record<string, unknown>) => ["purchases", "list", filters] as const,
  bill: (id: string) => ["purchases", "bill", id] as const,
  suppliers: (q: string) => ["purchases", "suppliers", q] as const
};

/** Suppliers, stores, GST slabs, custom columns and suggestions for the purchase form. */
export function usePurchaseSetup(enabled = true) {
  return useQuery({ queryKey: purchaseKeys.setup, queryFn: () => api.purchases.setup(), staleTime: 5 * 60_000, enabled });
}

export function useSuppliers(q: string) {
  return useQuery({ queryKey: purchaseKeys.suppliers(q), queryFn: () => api.suppliers.list(q || undefined), placeholderData: (previous) => previous });
}

/** After a purchase, stock, labels, dues and the dashboard all change. */
export function invalidateAfterPurchase(qc: QueryClient) {
  for (const area of ["purchases", "stock", "labels", "dues", "dashboard", "reports", "products", "catalog-search"]) void qc.invalidateQueries({ queryKey: [area] });
  // New items and prices should scan at the counter straight away, not after the next timed sync.
  void syncNow(useSession.getState().storeId, { customers: false });
}

export const payModes = [
  { key: "cash", label: "Cash", icon: "cash-outline" },
  { key: "upi", label: "UPI", icon: "qr-code-outline" },
  { key: "bank", label: "Bank", icon: "business-outline" },
  { key: "cheque", label: "Cheque", icon: "document-text-outline" },
  { key: "card", label: "Card", icon: "card-outline" },
  { key: "other", label: "Other", icon: "ellipsis-horizontal" }
] as const;

export function payModeLabel(mode: string) {
  return payModes.find((m) => m.key === mode)?.label ?? mode;
}
