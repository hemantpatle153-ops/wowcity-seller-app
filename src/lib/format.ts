/** Formatting for Indian retail: ₹ with lakh/crore grouping, quantities, dates in IST-friendly style. */

function groupIndian(integer: string) {
  if (integer.length <= 3) return integer;
  const last3 = integer.slice(-3);
  const rest = integer.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** ₹1,23,456.50 — pass `decimals: 0` for whole rupees, `decimals: "auto"` to drop .00. */
export function formatMoney(value: unknown, options: { decimals?: number | "auto"; symbol?: boolean; sign?: boolean } = {}) {
  const n = toNumber(value);
  const decimals = options.decimals ?? "auto";
  const places = decimals === "auto" ? (Math.round(n * 100) % 100 === 0 ? 0 : 2) : decimals;
  const fixed = Math.abs(n).toFixed(places);
  const [int, frac] = fixed.split(".");
  const body = groupIndian(int) + (frac ? "." + frac : "");
  const negative = n < 0 && Number(fixed) !== 0;
  const prefix = negative ? "−" : options.sign && n > 0 ? "+" : "";
  return `${prefix}${options.symbol === false ? "" : "₹"}${body}`;
}

/** Short money for charts and tiles: ₹1.2L, ₹3.4Cr, ₹12.5K. */
export function formatMoneyShort(value: unknown) {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

function trim(n: number) {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, "");
}

export function formatQty(value: unknown) {
  const n = toNumber(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatNumber(value: unknown) {
  const n = toNumber(value);
  return Number.isInteger(n) ? groupIndian(String(Math.abs(n))).replace(/^/, n < 0 ? "−" : "") : n.toFixed(2);
}

export function formatPercent(value: unknown, places = 0) {
  return `${toNumber(value).toFixed(places)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function asDate(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | number | Date | null | undefined) {
  const d = asDate(value);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "";
}

export function formatTime(value: string | number | Date | null | undefined) {
  const d = asDate(value);
  if (!d) return "";
  const h = d.getHours();
  return `${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function formatDateTime(value: string | number | Date | null | undefined) {
  const d = asDate(value);
  return d ? `${formatDate(d)}, ${formatTime(d)}` : "";
}

/** "Today 4:05 pm", "Yesterday", "12 Sep". */
export function formatRelative(value: string | number | Date | null | undefined, now = new Date()) {
  const d = asDate(value);
  if (!d) return "";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days === 0) return `Today ${formatTime(d)}`;
  if (days === 1) return `Yesterday ${formatTime(d)}`;
  if (days < 7 && days > 0) return `${days} days ago`;
  return d.getFullYear() === now.getFullYear() ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : formatDate(d);
}

/** YYYY-MM-DD in local time. */
export function isoDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

export function maskMobile(mobile: string | null | undefined) {
  const digits = (mobile ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? `${digits.slice(-10, -5)} ${digits.slice(-5)}` : (mobile ?? "");
}
