import { api } from "@/api";

/**
 * Finds the variant a scanned or typed barcode belongs to. Tries the exact catalogue lookup
 * (RAW endpoint, needs a sale permission) and falls back to the stock search.
 */
export async function findVariantByCode(code: string, storeId: string | null): Promise<string | null> {
  const term = code.trim();
  if (!term) return null;
  if (storeId) {
    try {
      const result = await api.catalog.lookup(term, storeId, false);
      if ("exact" in result && result.exact && result.items[0]) return result.items[0].variantId;
    } catch {
      // No sale permission or offline: try the stock search below.
    }
  }
  const list = await api.stock.list({ q: term });
  const upper = term.toUpperCase();
  const exact = list.items.find((item) => item.barcode?.toUpperCase() === upper);
  if (exact) return exact.id;
  return list.items.length === 1 ? list.items[0].id : null;
}
