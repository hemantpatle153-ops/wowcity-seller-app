/** Building blocks for mock reports (lib/reports/*). */
import type { CellFormat, ReportColumn, ReportRow, ReportStat, ReportTableOut } from "@/api/types";
import type { Db, DbInvoice, DbReturn } from "../db";
import { postedInvoices } from "../db";
import type { EngineActor } from "../engine/common";
import { includesText, inRange, r3, type ResolvedRange } from "../util";

export interface ReportCtx {
  db: Db;
  range: ResolvedRange | null;
  stores: string[];
  view: string | null;
  q: string;
  isOwner: boolean;
  actor: EngineActor;
}

export interface ReportBody {
  stats: ReportStat[];
  notes: string[];
  tables: ReportTableOut[];
}

export function col(key: string, label: string, format?: CellFormat, extra: Partial<ReportColumn> = {}): ReportColumn {
  return { key, label, ...(format ? { format } : {}), ...extra };
}
/** Numeric column summed into the totals row. */
export function num(key: string, label: string, format: "money" | "qty" | "percent" = "money", hideOnMobile = false): ReportColumn {
  return { key, label, format, total: format !== "percent", ...(hideOnMobile ? { hideOnMobile: true } : {}) };
}
export function minor(key: string, label: string, format?: CellFormat): ReportColumn {
  return { key, label, ...(format ? { format } : {}), hideOnMobile: true };
}

export function table(key: string, columns: ReportColumn[], rows: ReportRow[], options: { title?: string; description?: string; totals?: ReportRow | null; emptyText?: string } = {}): ReportTableOut {
  let totals: ReportRow | null = null;
  if (options.totals !== undefined) totals = options.totals;
  else if (rows.length && columns.some((c) => c.total)) {
    totals = {};
    columns.forEach((c, index) => {
      if (c.total) totals![c.key] = r3(rows.reduce((t, row) => t + (typeof row[c.key] === "number" ? (row[c.key] as number) : 0), 0));
      else if (index === 0) totals![c.key] = "Total";
    });
  }
  return {
    key,
    ...(options.title ? { title: options.title } : {}),
    ...(options.description ? { description: options.description } : {}),
    columns,
    rows: rows.slice(0, 5000),
    truncated: rows.length > 5000,
    totals,
    emptyText: options.emptyText ?? "Nothing in this period."
  };
}

export const stat = (label: string, value: number | string, format?: CellFormat, extra: Partial<ReportStat> = {}): ReportStat => ({ label, value, ...(format ? { format } : {}), ...extra });

export function periodInvoices(rc: ReportCtx): DbInvoice[] {
  return postedInvoices(rc.db)
    .filter((i) => rc.stores.includes(i.storeId) && (!rc.range || inRange(i.at, rc.range)))
    .sort((a, b) => b.at.localeCompare(a.at));
}
export function periodReturns(rc: ReportCtx): DbReturn[] {
  return rc.db.returns.filter((r) => rc.stores.includes(r.storeId) && (!rc.range || inRange(r.at, rc.range))).sort((a, b) => b.at.localeCompare(a.at));
}
export function matches(rc: ReportCtx, ...values: Array<string | null | undefined>): boolean {
  return includesText([values.filter(Boolean).join(" ")], rc.q);
}
export const invoiceHref = (id: string) => `/app/sale/invoices/${id}`;
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
