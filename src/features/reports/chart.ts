import type { ReportColumn, ReportTableOut } from "@/api/types";
import { toNumber } from "@/lib/format";
import { dayKey, MAIN_FIGURE_KEYS, shortDay } from "./format";

export type ReportChart =
  | { kind: "bars"; title: string; format: "money" | "qty"; data: { label: string; fullLabel: string; value: number }[] }
  | { kind: "hbars"; title: string; format: "money" | "qty"; data: { label: string; value: number; detail?: string }[] };

function pickValueColumn(columns: ReportColumn[]): ReportColumn | null {
  const money = columns.filter((c) => c.format === "money");
  const byName = MAIN_FIGURE_KEYS.map((k) => money.find((c) => c.key === k)).find(Boolean);
  if (byName) return byName;
  const totalledMoney = money.find((c) => c.total);
  if (totalledMoney) return totalledMoney;
  if (money[0]) return money[0];
  return columns.find((c) => c.format === "qty" && c.total) ?? null;
}

/**
 * A simple chart for a report when one makes sense (kept generic and safe):
 * - rows with a date column (dated reports) → value per day as vertical bars (2..62 days);
 * - rows with a name column → top 8 names as horizontal bars (only when all values are ≥ 0
 *   and the table is not a statement-style summary with emphasised rows).
 * Returns null when nothing sensible can be drawn.
 */
export function pickReportChart(table: ReportTableOut | undefined, options: { dated?: boolean } = {}): ReportChart | null {
  if (!table || table.rows.length < 2) return null;
  const valueCol = pickValueColumn(table.columns);
  if (!valueCol) return null;
  const format = valueCol.format === "qty" ? "qty" : "money";
  // Undated reports (dues, stock) are "as of now": their dates are ages, so rank names instead.
  const dateCol = options.dated === false ? undefined : table.columns.find((c) => c.format === "date" || c.format === "datetime");

  if (dateCol) {
    const sums = new Map<string, number>();
    for (const row of table.rows) {
      const raw = row[dateCol.key];
      if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") continue;
      const key = dayKey(raw);
      if (!key) continue;
      sums.set(key, (sums.get(key) ?? 0) + toNumber(row[valueCol.key]));
    }
    if (sums.size < 2 || sums.size > 62) return null;
    const days = [...sums.keys()].sort();
    return {
      kind: "bars",
      title: `${valueCol.label} by day`,
      format,
      data: days.map((d) => ({ label: shortDay(d), fullLabel: shortDay(d), value: Math.round((sums.get(d) ?? 0) * 100) / 100 }))
    };
  }

  const labelCol = table.columns.find((c) => (c.format ?? "text") === "text" && !c.hideOnMobile) ?? table.columns.find((c) => (c.format ?? "text") === "text");
  if (!labelCol) return null;
  if (table.rows.some((r) => r.emphasis)) return null;
  const sums = new Map<string, number>();
  for (const row of table.rows) {
    const label = row[labelCol.key];
    if (label === null || label === undefined || label === "") continue;
    const value = toNumber(row[valueCol.key]);
    if (value < 0) return null;
    sums.set(String(label), (sums.get(String(label)) ?? 0) + value);
  }
  if (sums.size < 2) return null;
  const top = [...sums.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .filter(([, v]) => v > 0);
  if (top.length < 2) return null;
  return { kind: "hbars", title: `Top by ${valueCol.label.toLowerCase()}`, format, data: top.map(([label, value]) => ({ label, value })) };
}
