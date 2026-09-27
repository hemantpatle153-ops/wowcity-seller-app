import type { MeResponse, StockItemDetail, StockListResponse } from "@/api/types";
import { can, isOwner } from "@/auth/permissions";
import type { IconName } from "@/ui/Icon";
import type { Tone } from "@/ui/Display";

/** Stock status as the API defines it: in = qty > 5, low = 0 < qty <= 5, out = qty <= 0. */
export const LOW_STOCK = 5;

export type StockStatus = "all" | "in" | "low" | "out";
export type StockSort = "name" | "stock_low" | "stock_high" | "newest" | "price_high";
export type FacetKey = "brand" | "size" | "colour" | "category";

export type StockFilters = {
  q: string;
  status: StockStatus;
  /** Store id, or null for every store the person works in. */
  store: string | null;
  sort: StockSort;
  brand: string | null;
  size: string | null;
  colour: string | null;
  category: string | null;
};

export const defaultStockFilters: StockFilters = { q: "", status: "all", store: null, sort: "name", brand: null, size: null, colour: null, category: null };

export const sortOptions: { key: StockSort; label: string; icon: IconName }[] = [
  { key: "name", label: "Name", icon: "text-outline" },
  { key: "stock_low", label: "Low stock first", icon: "trending-down" },
  { key: "stock_high", label: "High stock", icon: "trending-up" },
  { key: "newest", label: "Newest", icon: "sparkles-outline" },
  { key: "price_high", label: "Price high", icon: "pricetag-outline" }
];

export const facetDefs: { key: FacetKey; label: string; facet: keyof StockListResponse["facets"]; icon: IconName }[] = [
  { key: "category", label: "Category", facet: "categories", icon: "grid-outline" },
  { key: "brand", label: "Brand", facet: "brands", icon: "ribbon-outline" },
  { key: "size", label: "Size", facet: "sizes", icon: "resize-outline" },
  { key: "colour", label: "Colour", facet: "colours", icon: "color-palette-outline" }
];

/** Query for GET /stock. Defaults are left out so the server applies its own. */
export function stockQuery(filters: StockFilters, page = 1) {
  const q = filters.q.trim().slice(0, 80);
  return {
    q: q || undefined,
    store: filters.store ?? undefined,
    status: filters.status === "all" ? undefined : filters.status,
    sort: filters.sort === "name" ? undefined : filters.sort,
    brand: filters.brand ?? undefined,
    size: filters.size ?? undefined,
    colour: filters.colour ?? undefined,
    category: filters.category ?? undefined,
    page
  };
}

/** Active facet/sort filters as removable chips. Search, status and store have their own controls. */
export function activeFilterChips(filters: StockFilters): { key: FacetKey | "sort"; label: string }[] {
  const chips: { key: FacetKey | "sort"; label: string }[] = [];
  for (const def of facetDefs) {
    const value = filters[def.key];
    if (value) chips.push({ key: def.key, label: `${def.label}: ${value}` });
  }
  if (filters.sort !== "name") chips.push({ key: "sort", label: `Sort: ${sortOptions.find((s) => s.key === filters.sort)?.label ?? filters.sort}` });
  return chips;
}

export function clearFacets(filters: StockFilters): StockFilters {
  return { ...filters, brand: null, size: null, colour: null, category: null, sort: "name" };
}

export function facetCount(filters: StockFilters) {
  return facetDefs.filter((d) => filters[d.key]).length + (filters.sort !== "name" ? 1 : 0);
}

export function stockStatusOf(qty: number): Exclude<StockStatus, "all"> {
  if (qty <= 0) return "out";
  if (qty <= LOW_STOCK) return "low";
  return "in";
}

export function stockTone(qty: number): Tone {
  const status = stockStatusOf(qty);
  return status === "out" ? "danger" : status === "low" ? "warning" : "success";
}

export function stockLabel(qty: number, formatted: string) {
  const status = stockStatusOf(qty);
  return status === "out" ? (qty < 0 ? `${formatted} · Out` : "Out of stock") : status === "low" ? `${formatted} left · Low` : `${formatted} in stock`;
}

/** Chip counts from the (unfiltered) summary. */
export function statusCounts(summary: StockListResponse["summary"] | undefined) {
  if (!summary) return undefined;
  return { all: summary.skus, in: Math.max(0, summary.skus - summary.low - summary.out), low: summary.low, out: summary.out };
}

/** unitCost and cost values are only for owners and staff with purchase.view_cost. */
export function canSeeCost(me: MeResponse | null | undefined) {
  return isOwner(me) || can(me, "purchase.view_cost");
}

/** "Luzzan — MG Road" → "MG Road". */
export function shortStoreName(name: string) {
  const parts = name.split(/\s+[—–-]\s+/);
  return parts.length > 1 ? parts.slice(1).join(" – ") : name;
}

export function variantLine(item: { size?: string | null; colour?: string | null; style?: string | null }) {
  return [item.size, item.colour, item.style].filter((v) => v && String(v).trim()).join(" · ");
}

export type MovementType = StockItemDetail["movements"][number]["type"];

export const movementMeta: Record<MovementType, { label: string; icon: IconName; tone: Tone }> = {
  purchase: { label: "Purchase", icon: "cube-outline", tone: "success" },
  sale: { label: "Sale", icon: "cart-outline", tone: "accent" },
  purchase_return: { label: "Returned to supplier", icon: "return-up-back-outline", tone: "warning" },
  sale_return: { label: "Customer return", icon: "return-down-back-outline", tone: "info" },
  transfer: { label: "Transfer", icon: "swap-horizontal", tone: "info" },
  conversion: { label: "Conversion", icon: "git-compare-outline", tone: "neutral" },
  dump: { label: "Written off", icon: "trash-outline", tone: "danger" },
  adjustment: { label: "Adjustment", icon: "construct-outline", tone: "neutral" }
};

export const adjustReasons = [
  { value: "damaged", label: "Damaged", icon: "bandage-outline" },
  { value: "lost", label: "Lost or stolen", icon: "help-buoy-outline" },
  { value: "found", label: "Found", icon: "search-outline" },
  { value: "count_correction", label: "Count correction", icon: "calculator-outline" },
  { value: "returned_to_supplier", label: "Returned to supplier", icon: "return-up-back-outline" },
  { value: "sample", label: "Sample / display", icon: "shirt-outline" },
  { value: "other", label: "Other", icon: "ellipsis-horizontal" }
] as const satisfies readonly { value: string; label: string; icon: IconName }[];

export type AdjustReason = (typeof adjustReasons)[number]["value"];

/** Quantities go to the API as strings matching /^\d+(\.\d{1,3})?$/. */
export function qtyString(qty: number) {
  const rounded = Math.round(Math.abs(qty) * 1000) / 1000;
  return String(rounded);
}

/** Custom field values arrive as JSON (string, number, boolean, string[]). */
export function customValueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === "true") return "Yes";
  if (value === "false") return "No";
  return String(value);
}
