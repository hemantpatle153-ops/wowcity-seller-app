/** Field validators for owner admin forms. Each returns a friendly message, or null when the value is fine (empty optional fields are fine). */
import { GSTIN_PATTERN, gstStateCode, indianStates } from "@/lib/india";

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UPI_PATTERN = /^[\w.-]{2,}@[a-zA-Z][\w]{1,}$/;
export const PINCODE_PATTERN = /^[0-9]{6}$/;
export const ACCOUNT_NUMBER_PATTERN = /^[0-9]{6,20}$/;
export const MAPS_PATTERN = /^https:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i;

/** What the person typed, cleaned the way the server stores it. */
export function cleanUsername(value: string) {
  return value.trim().toLowerCase();
}

export function usernameError(value: string, taken: readonly string[] = []): string | null {
  const v = cleanUsername(value);
  if (!v) return "Pick a username.";
  if (/[^a-z0-9._-]/.test(v)) return "Use only letters, numbers, dots, dashes or underscores.";
  if (v.length < 3) return "At least 3 characters.";
  if (v.length > 32) return "At most 32 characters.";
  if (taken.includes(v)) return "Someone in your shop already uses this username.";
  return null;
}

/** Suggests a username from a person's name: "Ravi Kumar" → "ravi.kumar". */
export function suggestUsername(name: string, taken: readonly string[] = []) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9 ]/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(".")
      .slice(0, 28) || "";
  if (base.length < 3) return base;
  let candidate = base;
  let n = 2;
  while (taken.includes(candidate)) candidate = `${base}${n++}`;
  return candidate;
}

export function nameError(value: string, what = "their name"): string | null {
  const v = value.trim();
  if (v.length < 2) return `Enter ${what}.`;
  if (v.length > 80) return "Keep it under 80 characters.";
  return null;
}

export function secretError(value: string, min = 6): string | null {
  if (value.length < min) return `At least ${min} characters.`;
  if (value.length > 72) return "At most 72 characters.";
  return null;
}

/** Indian mobile: 10 digits, optionally with +91 / spaces. Optional. */
export function mobileError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const digits = v.replace(/[\s-]/g, "");
  if (!/^(\+?91)?[0-9]{10}$/.test(digits)) return "Enter a 10-digit mobile number.";
  return null;
}

/** Business phone (landline or mobile), as the server accepts it. Optional. */
export function phoneError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\+?[0-9 ]{10,15}$/.test(v)) return "Enter a valid phone number.";
  return null;
}

export function gstinError(value: string, state?: string | null): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return null;
  if (v.length !== 15) return "A GSTIN has 15 characters.";
  if (!GSTIN_PATTERN.test(v)) return "That GSTIN does not look right.";
  const code = gstStateCode(v);
  if (!code) return "The first two digits are not a state code.";
  if (state) {
    const stateCode = gstStateCode(state);
    if (stateCode && stateCode !== code) return `This GSTIN is from ${stateNameFor(code) ?? "another state"}, not ${state}.`;
  }
  return null;
}

export function stateNameFor(code: string | null | undefined) {
  return indianStates.find((s) => s.code === code)?.name ?? null;
}

export function panError(value: string): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return null;
  return PAN_PATTERN.test(v) ? null : "PAN looks like ABCDE1234F.";
}

export function ifscError(value: string): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return null;
  return IFSC_PATTERN.test(v) ? null : "IFSC looks like HDFC0001234.";
}

export function upiError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return UPI_PATTERN.test(v) ? null : "UPI ID looks like name@bank.";
}

export function accountNumberError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return ACCOUNT_NUMBER_PATTERN.test(v) ? null : "Account number is 6 to 20 digits.";
}

export function pincodeError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter the pincode.";
  return PINCODE_PATTERN.test(v) ? null : "Pincode is 6 digits.";
}

export function mapsUrlError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return MAPS_PATTERN.test(v) ? null : "Paste a Google Maps link that starts with https://.";
}

/** Latitude/longitude are optional, but both or neither. */
export function coordinatesError(lat: string, lng: string): { lat: string | null; lng: string | null } {
  const a = lat.trim();
  const b = lng.trim();
  if (!a && !b) return { lat: null, lng: null };
  const la = Number(a);
  const lo = Number(b);
  return {
    lat: !a ? "Add the latitude too, or clear both." : !Number.isFinite(la) || la < -90 || la > 90 ? "Latitude is between -90 and 90." : null,
    lng: !b ? "Add the longitude too, or clear both." : !Number.isFinite(lo) || lo < -180 || lo > 180 ? "Longitude is between -180 and 180." : null
  };
}

/** 0–4 score with a label, for the new password meter. */
export function passwordStrength(value: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!value) return { score: 0, label: "" };
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  if (value.length < 8) score = Math.min(score, 1);
  if (/^(.)\1+$/.test(value) || /^(password|12345678|qwerty)/i.test(value)) score = 1;
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: ["Too short", "Weak", "Fair", "Good", "Strong"][s] };
}

/** A random numeric PIN (6 digits by default) that avoids trivial runs like 111111 or 123456. */
export function generatePin(length = 6, random: () => number = defaultRandom): string {
  for (;;) {
    let pin = "";
    for (let i = 0; i < length; i++) pin += Math.floor(random() * 10).toString();
    if (!isTrivialPin(pin)) return pin;
  }
}

export function isTrivialPin(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = pin.split("").map(Number);
  const up = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const down = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  return up || down;
}

function defaultRandom() {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}
