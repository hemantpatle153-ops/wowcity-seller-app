import { useQuery } from "@tanstack/react-query";
import { api } from "@/api";
import { can, isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import type { EditableCustomField } from "@/features/products/editForm";

export function useStockItem(variantId: string | undefined) {
  return useQuery({ queryKey: ["stock", "item", variantId], queryFn: () => api.stock.item(variantId!), enabled: !!variantId });
}

/** GET /custom-fields (owner only), including archived columns. */
export function useCustomFields(enabled = true) {
  const owner = isOwner(useSession((s) => s.me));
  return useQuery({ queryKey: ["stock", "custom-fields"], queryFn: () => api.customFields.list(), enabled: owner && enabled });
}

/** Purchase setup carries GST slabs and custom columns for staff who can buy stock. */
function usePurchaseSetup(enabled: boolean) {
  return useQuery({ queryKey: ["purchases", "setup"], queryFn: () => api.purchases.setup(), enabled, staleTime: 5 * 60_000 });
}

/**
 * The custom columns this person can see and edit: owner → all active columns;
 * staff with purchase.create → the purchase-grid columns; anyone else → none.
 */
export function useEditableCustomFields() {
  const me = useSession((s) => s.me);
  const owner = isOwner(me);
  const staffSetup = !owner && can(me, "purchase.create");
  const fields = useCustomFields();
  const setup = usePurchaseSetup(staffSetup);
  if (owner) {
    const list: EditableCustomField[] = (fields.data?.fields ?? [])
      .filter((f) => f.is_active && !f.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({ id: f.id, name: f.name, type: f.field_type, options: f.options_json, required: f.is_required_on_purchase }));
    const names: Record<string, string> = Object.fromEntries((fields.data?.fields ?? []).map((f) => [f.id, f.name]));
    return { fields: list, names, isLoading: fields.isLoading, error: fields.error };
  }
  if (staffSetup) {
    const list: EditableCustomField[] = [...(setup.data?.customFields ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({ id: f.id, name: f.name, type: f.field_type, options: f.options_json, required: f.is_required_on_purchase }));
    return { fields: list, names: Object.fromEntries(list.map((f) => [f.id, f.name])), isLoading: setup.isLoading, error: setup.error };
  }
  return { fields: [] as EditableCustomField[], names: {} as Record<string, string>, isLoading: false, error: null };
}

/** GST slabs: owner → GET /settings; staff with purchase.create → purchase setup; others → null (keep current). */
export function useGstSlabs() {
  const me = useSession((s) => s.me);
  const owner = isOwner(me);
  const staffSetup = !owner && can(me, "purchase.create");
  const settings = useQuery({ queryKey: ["settings", "all"], queryFn: () => api.settings.get(), enabled: owner, staleTime: 5 * 60_000 });
  const setup = usePurchaseSetup(staffSetup);
  if (owner) return { slabs: settings.data?.gstSlabs ?? null, isLoading: settings.isLoading };
  if (staffSetup) return { slabs: setup.data?.gstSlabs ?? null, isLoading: setup.isLoading };
  return { slabs: null, isLoading: false };
}
