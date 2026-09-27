import type { DueEntryBody } from "@/api/types";
import { formatMoney } from "@/lib/format";
import type { Tone } from "@/ui";

/** Pure dues logic (tested in src/__tests__/dues.test.ts). */

export type Party = "customer" | "supplier";
export type DuesFilter = "owing" | "advance" | "settled" | "all";
export type PayMode = NonNullable<DueEntryBody["mode"]>;

export const payModes: { key: PayMode; label: string; icon: "cash-outline" | "qr-code-outline" | "card-outline" | "business-outline" | "document-text-outline" }[] = [
  { key: "cash", label: "Cash", icon: "cash-outline" },
  { key: "upi", label: "UPI", icon: "qr-code-outline" },
  { key: "card", label: "Card", icon: "card-outline" },
  { key: "bank", label: "Bank", icon: "business-outline" },
  { key: "cheque", label: "Cheque", icon: "document-text-outline" }
];

export function isParty(value: unknown): value is Party {
  return value === "customer" || value === "supplier";
}

/** Balance > 0: the customer owes the shop / the shop owes the supplier. < 0: advance. */
export function balanceState(balance: number): "owing" | "advance" | "settled" {
  if (Math.abs(balance) < 0.005) return "settled";
  return balance > 0 ? "owing" : "advance";
}

export function balanceTone(balance: number): Tone {
  const state = balanceState(balance);
  return state === "owing" ? "warning" : state === "advance" ? "info" : "success";
}

/** Short badge text: "Owes ₹1,200", "You owe ₹5,000", "Advance ₹500", "Settled". */
export function balanceLabel(balance: number, party: Party): string {
  const state = balanceState(balance);
  const amount = formatMoney(Math.abs(balance), { decimals: "auto" });
  if (state === "settled") return "Settled";
  if (state === "advance") return `Advance ${amount}`;
  return party === "customer" ? `Owes ${amount}` : `You owe ${amount}`;
}

/** Headline for the statement hero. */
export function balanceHeadline(balance: number, party: Party, name: string): string {
  const state = balanceState(balance);
  if (state === "settled") return "All settled";
  if (party === "customer") return state === "owing" ? `${name} owes you` : `${name} has an advance`;
  return state === "owing" ? `You owe ${name}` : `You paid ${name} in advance`;
}

/** Amount text as typed ("₹1,234.50", "1 234") → number, or null when not a valid amount. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** Quick amount chips: the full balance first, then round amounts below it. */
export function quickAmounts(balance: number): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  if (balance > 0) out.push({ label: `Full ${formatMoney(balance, { decimals: "auto" })}`, value: Math.round(balance * 100) / 100 });
  if (balance > 0 && balance >= 1000) out.push({ label: `Half ${formatMoney(Math.round(balance / 2), { decimals: 0 })}`, value: Math.round(balance / 2) });
  for (const v of [500, 1000, 2000, 5000]) {
    if (out.length >= 5) break;
    if (balance <= 0 || v < balance) if (!out.some((o) => o.value === v)) out.push({ label: formatMoney(v, { decimals: 0 }), value: v });
  }
  return out;
}

export type EntryDraft = { amount: string; date: string; reference: string; note: string; mode: PayMode | null };
export type EntryErrors = Partial<Record<"amount" | "date" | "reference" | "note" | "mode", string>>;

/** Validate a payment/due entry. `today` is YYYY-MM-DD (the date may not be in the future). */
export function validateEntry(draft: EntryDraft, kind: "payment" | "due", today: string): EntryErrors {
  const errors: EntryErrors = {};
  const amount = parseAmount(draft.amount);
  if (!draft.amount.trim()) errors.amount = "Enter the amount.";
  else if (amount === null) errors.amount = "Use numbers only, up to 2 decimals.";
  else if (amount <= 0) errors.amount = "The amount must be more than zero.";
  else if (amount > 1e8) errors.amount = "That amount is too large.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(new Date(`${draft.date}T12:00:00`).getTime())) errors.date = "Enter the date as YYYY-MM-DD.";
  else if (draft.date > today) errors.date = "The date can't be in the future.";
  if (draft.reference.length > 60) errors.reference = "Keep the reference under 60 characters.";
  if (draft.note.length > 120) errors.note = "Keep the note under 120 characters.";
  if (kind === "payment" && !draft.mode) errors.mode = "Choose how it was paid.";
  return errors;
}

/** Request body for POST /dues/entries (amount sent as a string, empty optionals left out). */
export function entryBody(input: { requestId: string; party: Party; partyId: string; kind: "payment" | "due"; draft: EntryDraft; today: string }): DueEntryBody {
  const { draft } = input;
  const amount = parseAmount(draft.amount);
  const body: DueEntryBody = {
    requestId: input.requestId,
    party: input.party,
    partyId: input.partyId,
    kind: input.kind,
    amount: amount !== null ? amount.toFixed(2) : draft.amount
  };
  if (input.kind === "payment" && draft.mode) body.mode = draft.mode;
  if (draft.date && draft.date !== input.today) body.date = draft.date;
  if (draft.reference.trim()) body.reference = draft.reference.trim();
  if (draft.note.trim()) body.note = draft.note.trim();
  return body;
}

/** WhatsApp link for a mobile number (India default country code). */
export function telUrl(mobile: string | null | undefined): string | null {
  const digits = (mobile ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? `tel:${digits.length === 10 ? digits : `+${digits}`}` : null;
}

export function whatsappUrl(mobile: string | null | undefined, text?: string): string | null {
  const digits = (mobile ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const phone = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
