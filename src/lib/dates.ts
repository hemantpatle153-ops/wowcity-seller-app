/** Calendar helpers on local YYYY-MM-DD strings (no time zones, no Date parsing surprises). */

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function isIsoDay(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m - 1);
}

export function toIso(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function parseIso(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

/** Move a YYYY-MM-DD by whole days. */
export function shiftDay(value: string, days: number) {
  const { year, month, day } = parseIso(value);
  const d = new Date(year, month, day + days);
  return toIso(d.getFullYear(), d.getMonth(), d.getDate());
}

export function shiftMonth(year: number, monthIndex: number, delta: number) {
  const d = new Date(year, monthIndex + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** "2026-09" for comparing months. */
export function monthKey(year: number, monthIndex: number) {
  return `${year}-${pad(monthIndex + 1)}`;
}

/** Cells for a month grid, Sunday first (null = padding). Always a multiple of 7. */
export function monthGrid(year: number, monthIndex: number): (string | null)[] {
  const first = new Date(year, monthIndex, 1).getDay();
  const days = daysInMonth(year, monthIndex);
  const cells: (string | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(toIso(year, monthIndex, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function inRange(day: string, from: string | null, to: string | null) {
  return !!from && !!to && day >= from && day <= to;
}

/** Building a range by tapping: first tap starts it, second tap ends it (swapping if earlier). */
export function nextRange(current: { from: string | null; to: string | null }, tapped: string): { from: string; to: string | null } {
  if (!current.from || current.to) return { from: tapped, to: null };
  return tapped < current.from ? { from: tapped, to: current.from } : { from: current.from, to: tapped };
}

export function daysBetween(from: string, to: string) {
  const a = parseIso(from);
  const b = parseIso(to);
  return Math.round((Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / 86400000);
}

/** "27 Sep 2026" */
export function prettyDay(value: string | null | undefined) {
  if (!isIsoDay(value)) return "";
  const { year, month, day } = parseIso(value);
  return `${day} ${MONTHS[month].slice(0, 3)} ${year}`;
}

/** Screen-reader label: "Sunday 27 September 2026". */
export function spokenDay(value: string) {
  const { year, month, day } = parseIso(value);
  return `${WEEKDAY_NAMES[new Date(year, month, day).getDay()]} ${day} ${MONTHS[month]} ${year}`;
}
