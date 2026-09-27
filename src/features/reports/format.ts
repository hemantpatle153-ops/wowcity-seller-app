import type { CellFormat, ReportColumn, ReportRow, ReportStat, ReportTableOut } from "@/api/types";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatQty, toNumber } from "@/lib/format";
import type { Tone } from "@/ui";

/** Formatting for report cells, stats and exports (pure; tested in src/__tests__/reports.test.ts). */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const EMPTY_CELL = "—";

export function isNumericFormat(format: CellFormat | undefined | null): boolean {
  return format === "money" || format === "qty" || format === "percent";
}

/** A row may override a column's format with `<key>Format` (e.g. `modeFormat: "badge"`). */
export function cellFormat(row: ReportRow, column: ReportColumn): CellFormat {
  const override = row[`${column.key}Format`];
  if (typeof override === "string" && ["text", "money", "qty", "percent", "date", "datetime", "mono", "badge"].includes(override)) return override as CellFormat;
  return column.format ?? "text";
}

/** Parse "YYYY-MM-DD" as a local calendar day (not UTC midnight, which can shift the day). */
export function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** "27 Sep" */
export function shortDay(value: string | Date): string {
  const d = typeof value === "string" ? (parseDay(value) ?? new Date(value)) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Local YYYY-MM-DD for a timestamp or day string. */
export function dayKey(value: string | number | Date): string | null {
  if (typeof value === "string" && parseDay(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatPercentValue(value: unknown): string {
  const n = toNumber(value);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

/** Format one value for display. Empty values render as an em dash. */
export function formatCell(value: unknown, format: CellFormat = "text"): string {
  if (value === null || value === undefined || value === "") return EMPTY_CELL;
  switch (format) {
    case "money":
      return formatMoney(value, { decimals: "auto" });
    case "qty": {
      const n = toNumber(value);
      return Number.isInteger(n) ? formatNumber(n) : formatQty(n);
    }
    case "percent":
      return formatPercentValue(value);
    case "date": {
      if (typeof value === "string") {
        const day = parseDay(value);
        if (day) return formatDate(day);
      }
      return formatDate(value as string) || String(value);
    }
    case "datetime":
      return formatDateTime(value as string) || String(value);
    default:
      if (typeof value === "boolean") return value ? "Yes" : "No";
      return String(value);
  }
}

/** Plain value for CSV/HTML exports and screen readers (no em dash for empties). */
export function exportCell(value: unknown, format: CellFormat = "text"): string {
  const text = formatCell(value, format);
  return text === EMPTY_CELL ? "" : text;
}

export function formatStat(stat: ReportStat): string {
  if (typeof stat.value === "string" && !isNumericFormat(stat.format)) return stat.value;
  return formatCell(stat.value, stat.format ?? (typeof stat.value === "number" ? "qty" : "text"));
}

export function statTone(tone: ReportStat["tone"]): Tone {
  if (tone === "positive") return "success";
  if (tone === "negative") return "danger";
  if (tone === "warning") return "warning";
  return "accent";
}

/** Tone for a badge cell from its words (status is always shown as text too). */
export function badgeTone(text: string): Tone {
  const t = text.toLowerCase();
  if (/(return|refund|lost|damage|dump|cancel|overdue|expired|out)/.test(t)) return "danger";
  if (/(hold|pending|due|credit|low|draft)/.test(t)) return "warning";
  if (/(sale|paid|active|posted|in stock|owner|settled|received)/.test(t)) return "success";
  if (/(upi|card|bank|cheque|manager|transfer)/.test(t)) return "info";
  return "neutral";
}

export function visibleColumns(columns: ReportColumn[], mobileOnly: boolean): ReportColumn[] {
  return mobileOnly ? columns.filter((c) => !c.hideOnMobile) : columns;
}

/** Column keys that usually hold a table's main money figure, most important first. */
export const MAIN_FIGURE_KEYS = ["net", "amount", "total", "sales", "spent", "balance", "closing", "profit", "revenue", "value"];

/**
 * Card layout for a row: the first text/mono column is the title (else the first column), the
 * first date column is shown as a caption, the main figure is the last totalled money column
 * (else the last money/numeric one); the rest are details.
 */
export function cardLayout(columns: ReportColumn[]) {
  const isText = (c: ReportColumn) => (c.format ?? "text") === "text" || c.format === "mono";
  const isDate = (c: ReportColumn) => c.format === "date" || c.format === "datetime";
  const title = columns.find(isText) ?? columns[0] ?? null;
  const date = columns.find((c) => c !== title && isDate(c)) ?? null;
  const numeric = columns.filter((c) => isNumericFormat(c.format));
  const preferred = MAIN_FIGURE_KEYS.map((k) => numeric.find((c) => c.key === k && c.format === "money")).find(Boolean);
  const totalled = numeric.filter((c) => c.total && c.format === "money");
  const value = preferred ?? totalled[totalled.length - 1] ?? numeric.filter((c) => c.format === "money").pop() ?? numeric[numeric.length - 1] ?? null;
  const details = columns.filter((c) => c !== title && c !== value && c !== date);
  return { title, date, value, details };
}

/** Width (dp, before font scaling) of a column in table mode. */
export function columnWidth(format: CellFormat | undefined): number {
  switch (format) {
    case "money":
      return 108;
    case "qty":
      return 72;
    case "percent":
      return 76;
    case "date":
      return 104;
    case "datetime":
      return 148;
    case "mono":
      return 128;
    case "badge":
      return 108;
    default:
      return 168;
  }
}

function slugPart(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "sale-bills-2026-09-21-to-2026-09-27.csv" */
export function exportFileName(slug: string, tableKey: string, period: { from: string; to: string } | null, ext: "csv" | "pdf" = "csv"): string {
  const parts = [slugPart(slug), slugPart(tableKey)].filter(Boolean);
  if (period) parts.push(period.from === period.to ? period.from : `${period.from}-to-${period.to}`);
  return `${parts.join("-")}.${ext}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Simple printable HTML for one report table (PDF export). */
export function tableHtml(input: { title: string; shopName?: string; periodLabel?: string | null; table: ReportTableOut; stats?: ReportStat[] }): string {
  const { table } = input;
  const cols = table.columns;
  const align = (c: ReportColumn) => (isNumericFormat(c.format) ? "right" : "left");
  const head = cols.map((c) => `<th style="text-align:${align(c)}">${escapeHtml(c.label)}</th>`).join("");
  const body = table.rows
    .map((row) => {
      const cells = cols.map((c) => `<td style="text-align:${align(c)}">${escapeHtml(exportCell(row[c.key], cellFormat(row, c)))}</td>`).join("");
      return `<tr${row.emphasis ? ' class="em"' : ""}>${cells}</tr>`;
    })
    .join("");
  const totals = table.totals
    ? `<tfoot><tr>${cols.map((c, i) => `<td style="text-align:${align(c)}">${escapeHtml(i === 0 && (table.totals?.[c.key] === undefined || table.totals?.[c.key] === null) ? "Total" : exportCell(table.totals?.[c.key], cellFormat(table.totals!, c)))}</td>`).join("")}</tr></tfoot>`
    : "";
  const stats = (input.stats ?? []).map((s) => `<div class="stat"><span>${escapeHtml(s.label)}</span><b>${escapeHtml(formatStat(s))}</b></div>`).join("");
  const heading = [input.shopName, input.title, table.title].filter(Boolean).map((t) => escapeHtml(String(t))).join(" · ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#1C1A17;margin:24px;font-size:11px}
h1{font-size:16px;margin:0 0 4px}p{margin:0 0 12px;color:#5E5850}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.stat{border:1px solid #E6E2DC;border-radius:6px;padding:6px 8px}.stat span{display:block;color:#5E5850}
table{border-collapse:collapse;width:100%}th,td{padding:5px 6px;border-bottom:1px solid #E6E2DC;font-variant-numeric:tabular-nums}
th{background:#F2F0EC;font-weight:700}tfoot td{font-weight:700;border-top:2px solid #1C1A17}tr.em td{font-weight:700}
</style></head><body><h1>${heading}</h1>${input.periodLabel ? `<p>${escapeHtml(input.periodLabel)}</p>` : ""}${stats ? `<div class="stats">${stats}</div>` : ""}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${totals}</table>${
    table.truncated ? "<p>Only the first rows are included. Narrow the dates for the full list.</p>" : ""
  }</body></html>`;
}
