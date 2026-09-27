// States and union territories with their GST state codes (first two digits of a GSTIN).
export const indianStates = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" }
] as const;

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

/** Resolves a state name, GST code or GSTIN to its two-digit GST state code. */
export function gstStateCode(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  if (/^[0-9]{2}[A-Z0-9]{13}$/i.test(text) || /^[0-9]{2}$/.test(text)) {
    const code = text.slice(0, 2);
    return indianStates.some((state) => state.code === code) ? code : null;
  }
  const key = normalize(text);
  const aliases: Record<string, string> = { newdelhi: "07", nctofdelhi: "07", orissa: "21", pondicherry: "34", jandk: "01" };
  return indianStates.find((state) => normalize(state.name) === key)?.code ?? aliases[key] ?? null;
}

/**
 * GST place of supply: inter-state when both sides resolve to different states. Unknown states are
 * treated as intra-state (CGST + SGST), matching a local walk-in sale.
 */
export function isInterState(a: string | null | undefined, b: string | null | undefined) {
  const left = gstStateCode(a);
  const right = gstStateCode(b);
  return Boolean(left && right && left !== right);
}

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
