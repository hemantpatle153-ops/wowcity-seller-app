/** Validation of the purchase form and the POST /purchases body built from it. */
import type { CustomFieldGridColumn, PurchaseImageRef, PurchaseRequest, PurchaseRowInput, PurchaseSetupResponse } from "@/api/types";
import { cleanDecimal, num } from "./math";
import type { ItemDraft, PurchaseDraft } from "./draft";

export type ItemErrors = {
  itemName?: string;
  qty?: string;
  gst?: string;
  hsnCode?: string;
  saleRate?: string;
  disc1Percent?: string;
  photos?: string;
  custom?: Record<string, string>;
};

type SetupLike = Pick<PurchaseSetupResponse, "customFields" | "gstSlabs">;

const DECIMAL = /^\d+(\.\d{1,3})?$/;

function badNumber(value: string) {
  const text = cleanDecimal(value);
  return value.trim() !== "" && !DECIMAL.test(text);
}

export function customFieldError(field: CustomFieldGridColumn, value: string | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return field.is_required_on_purchase && field.field_type !== "boolean" ? `${field.name} is required.` : null;
  switch (field.field_type) {
    case "number":
      return /^-?\d+$/.test(text) ? null : `${field.name} must be a whole number.`;
    case "decimal":
      return /^-?\d+(\.\d+)?$/.test(text) ? null : `${field.name} must be a number.`;
    case "url":
      return /^https?:\/\/\S+\.\S+/i.test(text) ? null : `${field.name} must be a link starting with https://`;
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(new Date(text).getTime()) ? null : `${field.name}: use YYYY-MM-DD.`;
    case "color":
      return text.length <= 40 ? null : `${field.name} is too long.`;
    default:
      return null;
  }
}

export function validateItem(item: ItemDraft, setup: SetupLike | null | undefined): ItemErrors {
  const errors: ItemErrors = {};
  if (!item.itemName.trim()) errors.itemName = "Enter the item name.";
  else if (item.itemName.trim().length > 160) errors.itemName = "Keep the name under 160 characters.";
  if (!(num(item.qty) > 0) || badNumber(item.qty)) errors.qty = "Quantity must be more than 0.";
  if (!item.gstCode && item.gstRate === "") errors.gst = "Pick a GST slab.";
  if (item.hsnCode && !/^\d{4,8}$/.test(item.hsnCode.trim())) errors.hsnCode = "HSN must be 4 to 8 digits.";
  if (num(item.disc1Percent) > 100) errors.disc1Percent = "Discount can't be more than 100%.";
  const mrp = num(item.mrp);
  const sale = num(item.saleRate);
  if (mrp > 0 && sale > mrp) errors.saleRate = "Sale rate can't be more than MRP.";
  for (const key of ["purchaseRate", "mrp", "saleRate", "disc1Amount", "disc2Amount"] as const) {
    if (badNumber(item[key])) errors.saleRate ??= "Use numbers only (up to 3 decimals).";
  }
  if (item.photos.some((p) => p.status === "uploading")) errors.photos = "Photos are still uploading.";
  const custom: Record<string, string> = {};
  for (const field of setup?.customFields ?? []) {
    const message = customFieldError(field, item.customValues[field.id]);
    if (message) custom[field.id] = message;
  }
  if (Object.keys(custom).length) errors.custom = custom;
  return errors;
}

export function hasErrors(errors: ItemErrors) {
  return Object.keys(errors).length > 0;
}

/** First message to show for a card (in field order). */
export function firstError(errors: ItemErrors): string | null {
  return errors.itemName ?? errors.qty ?? errors.gst ?? errors.hsnCode ?? errors.disc1Percent ?? errors.saleRate ?? (errors.custom ? Object.values(errors.custom)[0] : undefined) ?? errors.photos ?? null;
}

export type DraftValidation = { form: string | null; items: Record<string, ItemErrors>; firstInvalid: string | null };

export function validateDraft(draft: PurchaseDraft, setup: SetupLike | null | undefined, today = new Date()): DraftValidation {
  const items: Record<string, ItemErrors> = {};
  let firstInvalid: string | null = null;
  for (const item of draft.items) {
    const errors = validateItem(item, setup);
    if (!hasErrors(errors)) continue;
    items[item.key] = errors;
    firstInvalid ??= item.key;
  }
  let form: string | null = null;
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? new Date(`${draft.date}T00:00:00`) : null;
  if (!draft.storeId) form = "Pick the store this stock goes to.";
  else if (!date || Number.isNaN(date.getTime())) form = "Enter the purchase date as YYYY-MM-DD.";
  else if (date > tomorrow) form = "The purchase date can't be in the future.";
  else if (!draft.items.length) form = "Add at least one item.";
  else if (draft.items.length > 500) form = "A purchase can have at most 500 items.";
  else if (draft.payments.some((p) => num(p.amount) > 0) && !draft.supplier) form = "Pick a supplier to record a payment.";
  else if (num(draft.extraDiscountPercent) > 100) form = "Bill discount can't be more than 100%.";
  else if (firstInvalid) {
    const index = draft.items.findIndex((i) => i.key === firstInvalid);
    form = `Item ${index + 1}: ${firstError(items[firstInvalid]!)}`;
  }
  return { form, items, firstInvalid };
}

function customValue(field: CustomFieldGridColumn, value: string | undefined): string | number | boolean | null {
  const text = (value ?? "").trim();
  if (field.field_type === "boolean") return text === "true" ? true : text === "false" ? false : "";
  if (!text) return "";
  if (field.field_type === "number" || field.field_type === "decimal") return Number(text);
  return text;
}

export function buildRow(item: ItemDraft, setup: SetupLike | null | undefined, canPublish: boolean): PurchaseRowInput {
  const images: PurchaseImageRef[] = item.photos
    .filter((p) => p.status === "done" && p.bucket && p.objectKey)
    .slice(0, 4)
    .map((p, index, list) => ({
      bucket: p.bucket!,
      objectKey: p.objectKey!,
      contentType: p.contentType,
      sizeBytes: p.sizeBytes,
      sortOrder: index,
      isPrimary: index === 0 && list.length > 0
    }));
  const customValues: PurchaseRowInput["customValues"] = {};
  for (const field of setup?.customFields ?? []) {
    if (item.customValues[field.id] === undefined) continue;
    customValues[field.id] = customValue(field, item.customValues[field.id]);
  }
  const row: PurchaseRowInput = {
    rowId: item.key.slice(0, 64),
    entry: item.entry.trim().toUpperCase().slice(0, 64),
    itemName: item.itemName.trim(),
    brand: item.brand.trim(),
    category: item.category.trim(),
    size: item.size.trim(),
    colour: item.colour.trim(),
    style: item.style.trim(),
    hsnCode: item.hsnCode.trim(),
    gstCode: item.gstCode,
    gstRate: cleanDecimal(item.gstRate),
    qty: cleanDecimal(item.qty),
    purchaseRate: cleanDecimal(item.purchaseRate),
    disc1Percent: cleanDecimal(item.disc1Percent),
    disc1Amount: cleanDecimal(item.disc1Amount),
    disc2Amount: cleanDecimal(item.disc2Amount),
    mrp: cleanDecimal(item.mrp),
    saleRate: cleanDecimal(item.saleRate),
    customValues,
    description: item.description.trim().slice(0, 1000),
    tags: item.tags.slice(0, 25).map((t) => t.slice(0, 40)),
    images,
    printLabels: item.printLabels
  };
  if (canPublish) {
    row.publicEnabled = item.publicEnabled;
    row.publicFields = item.publicFields;
  }
  return row;
}

export function buildPurchaseRequest(draft: PurchaseDraft, setup: (SetupLike & { canPublish: boolean }) | null | undefined): PurchaseRequest {
  const supplier = draft.supplier;
  const body: PurchaseRequest = {
    gstPricingMode: draft.mode,
    purchaseDate: draft.date,
    invoiceNumber: draft.invoice.trim().slice(0, 40),
    storeId: draft.storeId ?? "",
    extraDiscountPercent: cleanDecimal(draft.extraDiscountPercent),
    extraDiscountAmount: cleanDecimal(draft.extraDiscountAmount),
    tcsAmount: cleanDecimal(draft.tcsAmount),
    idempotencyKey: draft.idempotencyKey,
    rows: draft.items.map((item) => buildRow(item, setup, !!setup?.canPublish))
  };
  if (supplier?.id) body.supplierId = supplier.id;
  else if (supplier?.name.trim()) body.supplierName = supplier.name.trim().slice(0, 120);
  const payments = draft.payments
    .filter((p) => num(p.amount) > 0)
    .slice(0, 6)
    .map((p) => ({ mode: p.mode, amount: cleanDecimal(p.amount, 2), ...(p.referenceNo.trim() ? { referenceNo: p.referenceNo.trim().slice(0, 60) } : {}) }));
  if (supplier && payments.length) body.payments = payments;
  return body;
}
