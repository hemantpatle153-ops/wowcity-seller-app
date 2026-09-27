import { useQuery } from "@tanstack/react-query";
import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { CatalogLookupItem, SyncCatalogItem } from "@/api/types";
import { toNumber } from "@/lib/format";
import { offlineStore } from "@/offline/store";
import { useConnectivity } from "@/state/connectivity";

/** One item as the POS shows it, whether it came from the server or the offline catalogue. */
export type CatalogHit = {
  variantId: string;
  itemName: string;
  brand: string;
  detail: string;
  barcode: string;
  mrp: number;
  rate: number;
  gstRate: number;
  availableQty: number;
  source: "server" | "offline";
};

const detailOf = (size?: string | null, colour?: string | null, style?: string | null) => [size, colour, style].filter(Boolean).join(" / ");

export function fromLookup(item: CatalogLookupItem): CatalogHit {
  return {
    variantId: item.variantId,
    itemName: item.itemName,
    brand: item.brand,
    detail: detailOf(item.size, item.colour, item.style),
    barcode: item.barcode,
    mrp: toNumber(item.mrp),
    rate: toNumber(item.rate),
    gstRate: toNumber(item.gstRate),
    availableQty: item.availableQty,
    source: "server"
  };
}

export function fromSync(item: SyncCatalogItem): CatalogHit {
  return {
    variantId: item.variantId,
    itemName: item.itemName,
    brand: item.brand ?? "",
    detail: detailOf(item.size, item.colour, item.style),
    barcode: item.barcodes[0] ?? "",
    mrp: item.mrp,
    rate: item.rate,
    gstRate: item.gstRate,
    availableQty: item.availableQty,
    source: "offline"
  };
}

/**
 * Resolve a scanned or typed barcode. The phone's catalogue answers instantly (and offline); the
 * server is asked only when the code isn't known locally.
 */
export async function resolveBarcode(storeId: string, code: string): Promise<CatalogHit | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const local = await offlineStore.findByBarcode(storeId, trimmed);
  if (local) return fromSync(local);
  if (!useConnectivity.getState().online) return null;
  try {
    const result = await api.catalog.lookup(trimmed, storeId, false);
    if ("exact" in result && result.exact && result.items[0]) return fromLookup(result.items[0]);
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.isNetwork) return null;
    throw error;
  }
}

/** Name/brand/barcode search: server when online (fresh stock), phone catalogue otherwise. */
export function useCatalogSearch(storeId: string | null, q: string) {
  const online = useConnectivity((s) => s.online);
  const term = q.trim();
  return useQuery({
    queryKey: ["catalog-search", storeId, term, online],
    enabled: !!storeId && term.length >= 2,
    staleTime: 15_000,
    queryFn: async (): Promise<{ items: CatalogHit[]; source: "server" | "offline" }> => {
      if (online) {
        try {
          const result = await api.catalog.lookup(term, storeId!, false);
          return { items: result.items.map(fromLookup), source: "server" };
        } catch (error) {
          if (!(error instanceof ApiError && error.isNetwork)) throw error;
        }
      }
      return { items: (await offlineStore.searchCatalog(storeId!, term, 30)).map(fromSync), source: "offline" };
    }
  });
}
