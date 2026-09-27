import { formatMoney } from "@/lib/format";
import { useConnectivity } from "@/state/connectivity";
import { useCart } from "./cart";
import type { CatalogHit } from "./catalog";

/** Add a catalogue item to the cart; returns scanner feedback. Blocks sold-out items only when online. */
export function addHitToCart(hit: CatalogHit): { ok: boolean; title: string; subtitle?: string } {
  const online = useConnectivity.getState().online;
  const cart = useCart.getState();
  const existing = cart.lines.find((l) => l.variantId === hit.variantId);
  const wanted = (existing?.qty ?? 0) + 1;
  if (online && hit.source === "server" && hit.availableQty < wanted && cart.mode === "sale" && cart.billType === "invoice") {
    return { ok: false, title: hit.availableQty <= 0 ? `${hit.itemName} is out of stock` : `Only ${hit.availableQty} of ${hit.itemName} in stock`, subtitle: hit.detail };
  }
  const result = cart.add({
    variantId: hit.variantId,
    itemName: hit.itemName,
    detail: hit.detail,
    barcode: hit.barcode,
    mrp: hit.mrp,
    rate: hit.rate,
    gstRate: hit.gstRate,
    availableQty: hit.availableQty
  });
  if (result === "limit") return { ok: false, title: "That's all that can be returned", subtitle: hit.itemName };
  return { ok: true, title: result === "incremented" ? `${hit.itemName} × ${wanted}` : hit.itemName, subtitle: [hit.detail, formatMoney(hit.rate)].filter(Boolean).join(" · ") };
}
