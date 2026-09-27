import type { MeResponse } from "@/api/types";

/** Permission helpers. Owners implicitly hold everything. */
export function can(me: MeResponse | null | undefined, ...permissions: string[]) {
  if (!me) return false;
  if (me.actor === "seller") return true;
  return permissions.some((permission) => me.permissions.includes(permission));
}

export function isOwner(me: MeResponse | null | undefined) {
  return me?.actor === "seller";
}

/** Which bottom tabs this person sees (docs/mobile-app-spec.md §4). */
export function tabsFor(me: MeResponse | null | undefined) {
  if (isOwner(me)) return ["home", "sell", "purchase", "stock", "more"] as const;
  const tabs: string[] = [];
  if (can(me, "sale.create", "sale.return")) tabs.push("sell");
  if (can(me, "sale.view", "sale.create", "sale.return")) tabs.push("bills");
  if (can(me, "purchase.create")) tabs.push("purchase");
  if (can(me, "stock.view")) tabs.push("stock");
  tabs.push("profile");
  return tabs;
}

/** Stable key for "who is signed in", e.g. "LUZ482:worker:<id>". */
export function actorKey(me: MeResponse | null | undefined) {
  if (!me) return "";
  return `${me.shopCode}:${me.actor === "seller" ? `owner:${me.userId ?? me.sellerId}` : `worker:${me.workerId}`}`;
}
