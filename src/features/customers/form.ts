import type { CustomerDetailResponse, CustomerUpdateBody } from "@/api/types";
import { GSTIN_PATTERN, gstStateCode, indianStates } from "@/lib/india";

/** Customer edit form: values, validation and the FULL-REPLACE request body. */
export type CustomerForm = { name: string; mobile: string; address: string; city: string; state: string; gstin: string };
export type CustomerFormErrors = Partial<Record<keyof CustomerForm, string>>;

export function formFromCustomer(c: CustomerDetailResponse["customer"]): CustomerForm {
  const digits = (c.mobile ?? "").replace(/\D/g, "");
  return {
    name: c.name ?? "",
    mobile: digits.length > 10 ? digits.slice(-10) : digits,
    address: c.address ?? "",
    city: c.city ?? "",
    // Saved states like "DELHI" or "Orissa" map to the list name, so old customers stay editable.
    state: indianStates.find((s) => s.code === gstStateCode(c.state ?? ""))?.name ?? "",
    gstin: (c.gstin ?? "").toUpperCase()
  };
}

export function validateCustomer(form: CustomerForm): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Enter the customer's name.";
  else if (name.length > 120) errors.name = "Keep the name under 120 characters.";
  const mobile = form.mobile.replace(/\D/g, "");
  if (mobile && mobile.length !== 10) errors.mobile = "Enter a 10-digit mobile number, or leave it empty.";
  const gstin = form.gstin.trim().toUpperCase();
  if (gstin && !GSTIN_PATTERN.test(gstin)) errors.gstin = "That doesn't look like a GSTIN (15 characters, e.g. 23ABCDE1234F1Z5).";
  if (form.state && !indianStates.some((s) => s.name === form.state)) errors.state = "Choose a state from the list.";
  return errors;
}

/** Typed or pasted mobile: drop a +91 / 0 prefix, keep the last 10 digits. */
export function cleanMobileInput(text: string) {
  const digits = text.replace(/\D/g, "");
  if (digits.length > 10 && (digits.startsWith("91") || digits.startsWith("0"))) return digits.slice(-10);
  return digits.slice(0, 10);
}

/** GSTIN state differs from the chosen state: a gentle hint, not an error. */
export function gstinStateHint(form: CustomerForm): string | null {
  const gstin = form.gstin.trim().toUpperCase();
  if (!gstin || !GSTIN_PATTERN.test(gstin) || !form.state) return null;
  const fromGstin = gstStateCode(gstin);
  const chosen = gstStateCode(form.state);
  if (!fromGstin || !chosen || fromGstin === chosen) return null;
  const name = indianStates.find((s) => s.code === fromGstin)?.name;
  return name ? `This GSTIN is registered in ${name}.` : null;
}

/** PATCH /customers/{id} replaces the record: every key is sent ("" clears a field; mobile is required). */
export function customerBody(form: CustomerForm): CustomerUpdateBody {
  return {
    name: form.name.trim(),
    mobile: form.mobile.replace(/\D/g, ""),
    address: form.address.trim(),
    city: form.city.trim(),
    state: form.state,
    gstin: form.gstin.trim().toUpperCase()
  };
}

export function sameForm(a: CustomerForm, b: CustomerForm) {
  return (Object.keys(a) as (keyof CustomerForm)[]).every((k) => a[k] === b[k]);
}
