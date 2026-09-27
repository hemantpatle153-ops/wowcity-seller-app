import type { CustomFieldType, ProductVariantUpdateBody, StockItemDetail } from "@/api/types";

/** A custom column the edit form knows how to render (from GET /custom-fields or /purchases/setup). */
export type EditableCustomField = { id: string; name: string; type: CustomFieldType; options: string[]; required?: boolean };

export type VariantForm = {
  productName: string;
  brand: string;
  category: string;
  size: string;
  colour: string;
  style: string;
  hsnCode: string;
  /** "" keeps the current slab. */
  gstCode: string;
  mrp: string;
  saleRate: string;
  internalDescription: string;
  publicDescription: string;
  tags: string[];
  /** fieldId -> string value ("" clears). */
  custom: Record<string, string>;
};

export type FormErrors = Partial<Record<keyof VariantForm | `custom_${string}`, string>>;

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

/** Custom value JSON → the string the form edits (and the API accepts). */
export function customValueToInput(value: unknown, type: CustomFieldType): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(", ");
  if (type === "boolean") return value === true || value === "true" ? "true" : value === false || value === "false" ? "false" : "";
  return String(value);
}

/** Start from every loaded value: PATCH variant is a full replace. */
export function formFromDetail(detail: StockItemDetail, fields: EditableCustomField[], publicDescription = ""): VariantForm {
  const custom: Record<string, string> = {};
  for (const field of fields) custom[field.id] = customValueToInput(detail.customValues[field.id], field.type);
  return {
    productName: detail.name ?? "",
    brand: detail.brand ?? "",
    category: detail.category ?? "",
    size: detail.size ?? "",
    colour: detail.colour ?? "",
    style: detail.style ?? "",
    hsnCode: detail.hsnCode ?? "",
    gstCode: detail.gst?.code ?? "",
    mrp: money(detail.mrp),
    saleRate: money(detail.price),
    internalDescription: detail.internalDescription ?? "",
    publicDescription,
    tags: [...(detail.tags ?? [])],
    custom
  };
}

const DECIMAL_2 = /^\d+(\.\d{1,2})?$/;

export function cleanDecimal(text: string) {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const [int, ...rest] = cleaned.split(".");
  return rest.length ? `${int}.${rest.join("").slice(0, 2)}` : int;
}

export function validateForm(form: VariantForm, fields: EditableCustomField[]): FormErrors {
  const errors: FormErrors = {};
  const name = form.productName.trim();
  if (!name) errors.productName = "Enter a product name.";
  else if (name.length > 160) errors.productName = "Keep the name under 160 characters.";
  if (!DECIMAL_2.test(form.mrp.trim())) errors.mrp = "Enter the MRP, e.g. 999 or 999.50.";
  if (!DECIMAL_2.test(form.saleRate.trim())) errors.saleRate = "Enter the price.";
  else if (!errors.mrp && Number(form.saleRate) > Number(form.mrp)) errors.saleRate = "Price can't be more than MRP.";
  if (form.hsnCode.trim() && !/^\d{4,8}$/.test(form.hsnCode.trim())) errors.hsnCode = "HSN is 4 to 8 digits.";
  if (form.internalDescription.length > 1000) errors.internalDescription = "Keep it under 1000 characters.";
  if (form.publicDescription.length > 1000) errors.publicDescription = "Keep it under 1000 characters.";
  for (const field of fields) {
    const value = (form.custom[field.id] ?? "").trim();
    if (!value) continue;
    const key = `custom_${field.id}` as const;
    if ((field.type === "number" && !/^-?\d+$/.test(value)) || (field.type === "decimal" && !/^-?\d+(\.\d+)?$/.test(value))) errors[key] = "Enter a number.";
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[key] = "Use YYYY-MM-DD.";
    if (field.type === "url" && !/^https?:\/\/\S+$/i.test(value)) errors[key] = "Enter a link starting with https://";
  }
  return errors;
}

/** Normalise a tag list: trimmed, no commas, unique (case-insensitive), max 25. */
export function normaliseTags(tags: string[], max = 25) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Full PATCH body: every built-in field is sent (omitted ones would be cleared), tags as a
 * comma-separated string, and custom_<fieldId> for each known column ("" deletes the value).
 */
export function buildVariantPatch(
  form: VariantForm,
  fields: EditableCustomField[],
  options: { canPublish: boolean; canSeeInternal: boolean }
): ProductVariantUpdateBody {
  const body: ProductVariantUpdateBody = {
    productName: form.productName.trim(),
    mrp: form.mrp.trim(),
    saleRate: form.saleRate.trim(),
    brand: form.brand.trim(),
    category: form.category.trim(),
    size: form.size.trim(),
    colour: form.colour.trim(),
    style: form.style.trim(),
    hsnCode: form.hsnCode.trim(),
    gstCode: form.gstCode,
    internalDescription: options.canSeeInternal ? form.internalDescription.trim() : ""
  };
  if (options.canPublish) {
    body.publicDescription = form.publicDescription.trim();
    body.tags = normaliseTags(form.tags).join(",");
  }
  for (const field of fields) {
    const value = (form.custom[field.id] ?? "").trim();
    body[`custom_${field.id}`] = field.type === "multi_select" ? splitList(value).join(",") : value;
  }
  return body;
}

export function splitList(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
