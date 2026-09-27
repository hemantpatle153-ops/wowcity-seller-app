/** Staff working hours: the editable week, validation, and conversion to the PUT /staff/{id}/shifts body. */
import type { ShiftWindow, StaffShiftsBody } from "@/api/types";

export type ShiftDay = { day: number; enabled: boolean; start: string; end: string };

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DEFAULT_START = "10:00";
export const DEFAULT_END = "20:00";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTime(value: string) {
  return TIME.test(value);
}

export function toMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number) {
  const t = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** "09:30" → "9:30 am". */
export function formatClock(value: string) {
  if (!isTime(value)) return value;
  const [h, m] = value.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** Always seven days, Sun..Sat, from whatever the server sent (it may send none when unrestricted). */
export function weekFromShifts(shifts: readonly ShiftWindow[]): ShiftDay[] {
  return DAY_NAMES.map((_, day) => {
    const found = shifts.find((s) => s.day_of_week === day);
    return found
      ? { day, enabled: found.enabled, start: (found.start_time ?? DEFAULT_START).slice(0, 5), end: (found.end_time ?? DEFAULT_END).slice(0, 5) }
      : { day, enabled: day !== 0, start: DEFAULT_START, end: DEFAULT_END };
  });
}

/** Restricted when the server holds any enabled window. */
export function isRestricted(shifts: readonly ShiftWindow[]) {
  return shifts.some((s) => s.enabled);
}

/** Per-day problem, or null. */
export function dayError(day: ShiftDay): string | null {
  if (!day.enabled) return null;
  if (!isTime(day.start) || !isTime(day.end)) return "Enter times like 09:30.";
  if (toMinutes(day.end) <= toMinutes(day.start)) return "End time must be after the start time.";
  return null;
}

export function weekErrors(restricted: boolean, week: readonly ShiftDay[]): { days: (string | null)[]; form: string | null } {
  if (!restricted) return { days: week.map(() => null), form: null };
  const days = week.map(dayError);
  const form = !week.some((d) => d.enabled) ? "Pick at least one working day." : days.some(Boolean) ? "Fix the highlighted days." : null;
  return { days, form };
}

export function shiftsBody(restricted: boolean, week: readonly ShiftDay[]): StaffShiftsBody {
  if (!restricted) return { restricted: false };
  return { restricted: true, days: week.filter((d) => d.enabled).map((d) => ({ dayOfWeek: d.day, start: d.start, end: d.end })) };
}

/** Copies Monday's on/off and hours to Tuesday..Saturday (Sunday is left alone). */
export function copyMondayToWeekdays(week: readonly ShiftDay[]): ShiftDay[] {
  const monday = week.find((d) => d.day === 1);
  if (!monday) return [...week];
  return week.map((d) => (d.day >= 2 && d.day <= 6 ? { ...d, enabled: monday.enabled, start: monday.start, end: monday.end } : d));
}

/** "Hours" in a short line: "Any time", "Mon–Sat, 10:00 am – 8:00 pm", or "5 days a week". */
export function shiftSummary(shifts: readonly ShiftWindow[]) {
  const on = shifts.filter((s) => s.enabled);
  if (!on.length) return "Any time";
  const same = on.every((s) => s.start_time === on[0].start_time && s.end_time === on[0].end_time);
  const days = on.map((s) => s.day_of_week).sort((a, b) => a - b);
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const dayText = days.length === 7 ? "Every day" : consecutive && days.length > 2 ? `${DAY_SHORT[days[0]]}–${DAY_SHORT[days[days.length - 1]]}` : days.map((d) => DAY_SHORT[d]).join(", ");
  return same ? `${dayText}, ${formatClock(on[0].start_time.slice(0, 5))} – ${formatClock(on[0].end_time.slice(0, 5))}` : `${days.length} days a week`;
}

export function sameWeek(a: readonly ShiftDay[], b: readonly ShiftDay[]) {
  return a.length === b.length && a.every((d, i) => d.enabled === b[i].enabled && d.start === b[i].start && d.end === b[i].end);
}
