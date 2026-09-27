import type { RangePreset } from "@/api/types";

/** Date ranges for dated reports (the server resolves them in IST; labels match the server's). */
export const rangePresets: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "fy", label: "This FY" },
  { key: "custom", label: "Custom" }
];

export function isRangePreset(value: unknown): value is RangePreset {
  return typeof value === "string" && rangePresets.some((r) => r.key === value);
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day in YYYY-MM-DD form. */
export function isValidDay(value: string): boolean {
  const m = DAY.exec(value);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** Validate a custom from/to pair. Returns a message for the person, or null when fine. */
export function customRangeError(from: string, to: string, today: string): string | null {
  if (!isValidDay(from)) return "Pick a start date.";
  if (!isValidDay(to)) return "Pick an end date.";
  if (from > to) return "The start date is after the end date.";
  if (to > today) return "The end date can't be in the future.";
  return null;
}

/** Shift a YYYY-MM-DD day by `days`. */
export function addDays(day: string, days: number): string {
  const m = DAY.exec(day);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
