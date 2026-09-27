/** Staff permissions: role presets, implied permissions, and friendly labels for status and activity. */
import type { RolePreset, StaffMember, WorkerGrantablePermission } from "@/api/types";
import type { IconName, Tone } from "@/ui";

export type PresetKey = RolePreset["key"];
export type RoleKey = PresetKey | "custom";

/** Canonical order of the permissions a worker can hold. */
export const GRANTABLE: WorkerGrantablePermission[] = [
  "sale.create",
  "sale.view",
  "sale.return",
  "sale.discount_override",
  "purchase.create",
  "purchase.view",
  "purchase.view_cost",
  "product.view",
  "product.edit",
  "product.images.manage",
  "stock.view",
  "barcode.view",
  "barcode.print",
  "reports.sale",
  "reports.stock",
  "reports.due"
];

/** Saving X also grants Y (the server adds these). */
export const IMPLIED: Partial<Record<WorkerGrantablePermission, WorkerGrantablePermission>> = {
  "sale.create": "sale.view",
  "sale.return": "sale.view",
  "sale.discount_override": "sale.view",
  "purchase.create": "purchase.view",
  "purchase.view_cost": "purchase.view",
  "product.edit": "product.view",
  "product.images.manage": "product.view",
  "barcode.print": "barcode.view"
};

/** Only grantable keys, with implied ones added, in canonical order. */
export function normalizePermissions(input: readonly string[]): WorkerGrantablePermission[] {
  const set = new Set(input.filter((p): p is WorkerGrantablePermission => (GRANTABLE as string[]).includes(p)));
  for (const p of [...set]) {
    const implied = IMPLIED[p];
    if (implied) set.add(implied);
  }
  return GRANTABLE.filter((p) => set.has(p));
}

/** The chosen permissions that force `key` on, e.g. sale.view ← ["sale.create"]. */
export function impliedBy(key: string, selected: readonly string[]): WorkerGrantablePermission[] {
  return (Object.keys(IMPLIED) as WorkerGrantablePermission[]).filter((from) => IMPLIED[from] === key && selected.includes(from));
}

/** Toggle one permission: turning one on adds what it needs; turning off a needed one is refused (returns the same list). */
export function togglePermission(selected: readonly string[], key: WorkerGrantablePermission): WorkerGrantablePermission[] {
  const current = normalizePermissions(selected);
  if (current.includes(key)) {
    if (impliedBy(key, current).length) return current;
    return current.filter((p) => p !== key);
  }
  return normalizePermissions([...current, key]);
}

export function samePermissions(a: readonly string[], b: readonly string[]) {
  const x = normalizePermissions(a);
  const y = normalizePermissions(b);
  return x.length === y.length && x.every((p, i) => p === y[i]);
}

/** Which preset these permissions are exactly, or "custom". */
export function matchPreset(permissions: readonly string[], presets: readonly RolePreset[]): RoleKey {
  return presets.find((p) => samePermissions(p.permissions, permissions))?.key ?? "custom";
}

export function roleLabel(permissions: readonly string[], presets: readonly RolePreset[]) {
  const key = matchPreset(permissions, presets);
  if (key === "custom") return "Custom";
  return presets.find((p) => p.key === key)?.label ?? "Custom";
}

export const roleIcons: Record<RoleKey, IconName> = {
  cashier: "cash-outline",
  stock: "cube-outline",
  manager: "shield-checkmark-outline",
  custom: "options-outline"
};

export function statusBadge(status: StaffMember["status"]): { label: string; tone: Tone; icon: IconName } {
  switch (status) {
    case "active":
      return { label: "Active", tone: "success", icon: "checkmark-circle" };
    case "disabled":
      return { label: "Disabled", tone: "danger", icon: "ban-outline" };
    case "locked":
      return { label: "Locked (emergency)", tone: "warning", icon: "lock-closed" };
    case "off_shift":
      return { label: "Off shift", tone: "info", icon: "moon-outline" };
  }
}

const ACTIVITY: Record<string, { label: string; icon: IconName }> = {
  sale_created: { label: "Made a bill", icon: "receipt-outline" },
  sale_return_created: { label: "Took a return", icon: "return-down-back-outline" },
  estimate_created: { label: "Made an estimate", icon: "document-outline" },
  purchase_created: { label: "Entered a purchase", icon: "cube-outline" },
  purchase_return_created: { label: "Returned to a supplier", icon: "arrow-undo-outline" },
  stock_adjusted: { label: "Adjusted stock", icon: "swap-vertical-outline" },
  stock_transferred: { label: "Moved stock", icon: "swap-horizontal-outline" },
  due_payment_recorded: { label: "Recorded a payment", icon: "wallet-outline" },
  customer_updated: { label: "Updated a customer", icon: "person-outline" },
  product_updated: { label: "Edited a product", icon: "pricetag-outline" },
  labels_printed: { label: "Printed labels", icon: "barcode-outline" },
  worker_created: { label: "Added staff", icon: "person-add-outline" },
  signed_in: { label: "Signed in", icon: "log-in-outline" },
  signed_out: { label: "Signed out", icon: "log-out-outline" }
};

/** "sale_created" → "Made a bill"; unknown codes become sentence case. */
export function activityLabel(action: string): { label: string; icon: IconName } {
  const known = ACTIVITY[action];
  if (known) return known;
  const words = action.replace(/[._-]+/g, " ").trim();
  return { label: words ? words[0].toUpperCase() + words.slice(1) : "Activity", icon: "ellipse-outline" };
}

/** Icon for a signed-in device platform ("ios", "android", "web"). */
export function platformIcon(platform: string | null) {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("ios") || p.includes("iphone")) return "logo-apple" as const;
  if (p.includes("android")) return "logo-android" as const;
  if (p.includes("web")) return "globe-outline" as const;
  return "phone-portrait-outline" as const;
}

