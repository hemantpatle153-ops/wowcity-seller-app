import type { CustomField, CustomFieldSaveBody, CustomFieldType, ProductListingBody, ProductListingResponse } from "@/api/types";
import type { IconName } from "@/ui/Icon";
import type { Tone } from "@/ui/Display";
import { normaliseTags } from "./editForm";

export const DESCRIPTION_MAX = 600;
export const LISTING_TAGS_MAX = 20;

export type ListingDraft = {
  enabled: boolean;
  storeIds: string[];
  fields: Record<string, boolean>;
  description: string;
  tags: string[];
};

export function draftFromListing(listing: ProductListingResponse): ListingDraft {
  const fields: Record<string, boolean> = {};
  for (const option of listing.fieldOptions) fields[option.key] = !!listing.fields[option.key];
  return { enabled: listing.enabled, storeIds: [...listing.listedStoreIds], fields, description: listing.description ?? "", tags: [...listing.tags] };
}

/** PUT body: fields as the list of shown keys (only keys from fieldOptions). */
export function buildListingBody(draft: ListingDraft, listing: ProductListingResponse): ProductListingBody {
  const valid = new Set(listing.fieldOptions.map((f) => f.key));
  const stores = new Set(listing.stores.map((s) => s.id));
  return {
    enabled: draft.enabled,
    storeIds: draft.storeIds.filter((id) => stores.has(id)),
    fields: listing.fieldOptions.filter((f) => draft.fields[f.key] && valid.has(f.key)).map((f) => f.key),
    description: draft.description.trim().slice(0, DESCRIPTION_MAX),
    tags: normaliseTags(draft.tags, LISTING_TAGS_MAX)
  };
}

export function listingProblems(draft: ListingDraft) {
  const problems: string[] = [];
  if (draft.description.trim().length > DESCRIPTION_MAX) problems.push(`Keep the description under ${DESCRIPTION_MAX} characters.`);
  if (draft.tags.length > LISTING_TAGS_MAX) problems.push(`Use at most ${LISTING_TAGS_MAX} tags.`);
  return problems;
}

export function isDirty(draft: ListingDraft, listing: ProductListingResponse) {
  return JSON.stringify(buildListingBody(draft, listing)) !== JSON.stringify(buildListingBody(draftFromListing(listing), listing));
}

export type PublicStatus = ProductListingResponse["variants"][number]["status"][string];
export const publicStatusMeta: Record<PublicStatus, { label: string; tone: Tone; icon: IconName }> = {
  in_stock: { label: "In stock", tone: "success", icon: "checkmark-circle" },
  out_of_stock: { label: "Out of stock", tone: "danger", icon: "close-circle" },
  paused: { label: "Paused", tone: "warning", icon: "pause-circle" },
  hidden: { label: "Hidden", tone: "neutral", icon: "eye-off-outline" }
};

/** What a buyer card shows, built from the fields the seller chose. */
export function buyerPreview(draft: ListingDraft, listing: ProductListingResponse) {
  const shown = (key: string) => !!draft.fields[key];
  const prices = listing.variants.map((v) => v.price);
  const mrps = listing.variants.map((v) => v.mrp);
  const options = [...new Set(listing.variants.map((v) => v.label).filter((l) => l && l !== "Standard"))];
  const inStock = listing.variants.some((v) => draft.storeIds.some((s) => (v.stock[s] ?? 0) > 0));
  return {
    title: shown("product_name") ? listing.product.name : null,
    brand: shown("brand") ? listing.product.brand || null : null,
    category: shown("category") ? listing.product.category || null : null,
    /** Variant labels ("M / Indigo") when size or colour is shown. */
    options: shown("size") || shown("colour") ? options : [],
    price: shown("sale_rate") && prices.length ? Math.min(...prices) : null,
    mrp: shown("mrp") && mrps.length ? Math.max(...mrps) : null,
    customLabels: listing.customColumns.filter((c) => shown(c.key)).map((c) => c.label),
    image: listing.images.find((i) => i.url)?.url ?? null,
    inStock,
    stores: listing.stores.filter((s) => draft.storeIds.includes(s.id))
  };
}

// ------------------------------------------------------------------ custom columns

export const fieldTypes: { value: Exclude<CustomFieldType, "dropdown">; label: string; icon: IconName; hint: string }[] = [
  { value: "text", label: "Text", icon: "text-outline", hint: "Any words, e.g. fabric blend" },
  { value: "number", label: "Whole number", icon: "keypad-outline", hint: "e.g. pieces per pack" },
  { value: "decimal", label: "Decimal number", icon: "calculator-outline", hint: "e.g. weight 1.25" },
  { value: "select", label: "Pick one", icon: "radio-button-on-outline", hint: "One option from a list" },
  { value: "multi_select", label: "Pick many", icon: "checkbox-outline", hint: "Several options from a list" },
  { value: "boolean", label: "Yes / No", icon: "toggle-outline", hint: "A simple switch" },
  { value: "date", label: "Date", icon: "calendar-outline", hint: "e.g. launch date" },
  { value: "color", label: "Colour", icon: "color-palette-outline", hint: "A colour name or code" },
  { value: "url", label: "Link", icon: "link-outline", hint: "A web address" }
];

export function fieldTypeMeta(type: CustomFieldType) {
  return fieldTypes.find((t) => t.value === type) ?? { value: "select" as const, label: type === "dropdown" ? "Pick one (old)" : type, icon: "list-outline" as IconName, hint: "" };
}

export const needsOptions = (type: CustomFieldType) => type === "select" || type === "multi_select" || type === "dropdown";

export type CustomFieldDraft = {
  fieldId?: string;
  name: string;
  fieldType: Exclude<CustomFieldType, "dropdown">;
  options: string[];
  isRequiredOnPurchase: boolean;
  showInPurchaseGrid: boolean;
  showInSaleSearch: boolean;
  isPublicEligible: boolean;
  defaultPublicEnabled: boolean;
};

export const emptyFieldDraft: CustomFieldDraft = {
  name: "",
  fieldType: "text",
  options: [],
  isRequiredOnPurchase: false,
  showInPurchaseGrid: true,
  showInSaleSearch: false,
  isPublicEligible: false,
  defaultPublicEnabled: false
};

export function draftFromField(field: CustomField): CustomFieldDraft {
  return {
    fieldId: field.id,
    name: field.name,
    fieldType: field.field_type === "dropdown" ? "select" : field.field_type,
    options: [...field.options_json],
    isRequiredOnPurchase: field.is_required_on_purchase,
    showInPurchaseGrid: field.show_in_purchase_grid,
    showInSaleSearch: field.show_in_sale_search,
    isPublicEligible: field.is_public_eligible,
    defaultPublicEnabled: field.default_public_enabled
  };
}

/** Names that look like internal data stay private on the server. */
export const looksPrivate = (name: string) => /cost|supplier|margin|purchase|profit/i.test(name);

export function fieldDraftError(draft: CustomFieldDraft) {
  const name = draft.name.trim();
  if (!name) return "Enter a column name.";
  if (name.length > 48) return "Keep the name under 48 characters.";
  if (needsOptions(draft.fieldType) && !draft.options.length) return "Add at least one option.";
  if (draft.options.length > 50) return "A column can have at most 50 options.";
  return null;
}

export function buildFieldBody(draft: CustomFieldDraft): CustomFieldSaveBody {
  const options = needsOptions(draft.fieldType) ? normaliseTags(draft.options, 50) : [];
  return {
    ...(draft.fieldId ? { fieldId: draft.fieldId } : null),
    name: draft.name.trim(),
    fieldType: draft.fieldType,
    ...(options.length ? { options: options.join(",") } : null),
    isRequiredOnPurchase: draft.isRequiredOnPurchase,
    showInPurchaseGrid: draft.showInPurchaseGrid,
    showInSaleSearch: draft.showInSaleSearch,
    isPublicEligible: draft.isPublicEligible,
    defaultPublicEnabled: draft.isPublicEligible && draft.defaultPublicEnabled
  };
}

export function sortFields(fields: CustomField[]) {
  const ordered = [...fields].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return { active: ordered.filter((f) => !f.deleted_at && f.is_active), archived: ordered.filter((f) => f.deleted_at || !f.is_active) };
}
