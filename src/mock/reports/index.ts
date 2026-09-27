/** Report registry (lib/reports/registry.ts), GET /reports, GET /reports/{slug} and the CSV export. */
import type { RangePreset, ReportGroup, ReportResponse, ReportRow, ReportSlug, ReportTableOut, ReportsIndexResponse } from "@/api/types";
import { forbidden, csvResult, notFound, ok, resolveRange } from "../util";
import { q, route, storeFilter, type Ctx, type Route } from "../http";
import { fastMovingReport, profitDetailReport, profitSummaryReport, purchaseReport, saleAndReturnReport, saleReport, saleReturnReport, salesmanDetailReport, salesmanSummaryReport } from "./sales";
import type { ReportBody, ReportCtx } from "./shared";
import {
  customerReport,
  dumpedStockReport,
  emptyStockReport,
  gstr1Report,
  gstr2Report,
  gstr3bReport,
  partyDueReport,
  partyOutstandingReport,
  stockAnalysisReport,
  stockReport,
  stockTransferReport
} from "./stock";

interface ReportDef {
  slug: ReportSlug;
  title: string;
  group: ReportGroup;
  description: string;
  dated: boolean;
  defaultRange: Exclude<RangePreset, "yesterday" | "custom"> | null;
  views: Array<{ key: string; label: string }>;
  perms: string[];
  ownerOnly?: boolean;
  searchable: string | null;
  build: (rc: ReportCtx) => ReportBody;
}

const v = (...pairs: Array<[string, string]>) => pairs.map(([key, label]) => ({ key, label }));

const REPORTS: ReportDef[] = [
  {
    slug: "sale",
    title: "Sale report",
    group: "Sales",
    description: "Every bill or every item sold, with GST and dues.",
    dated: true,
    defaultRange: "7d",
    views: v(["bills", "Bills"], ["items", "Items"]),
    perms: ["reports.sale"],
    searchable: "Bill no., customer or item",
    build: saleReport
  },
  {
    slug: "sale-return",
    title: "Sale return report",
    group: "Sales",
    description: "Returns, refunds and credit notes.",
    dated: true,
    defaultRange: "30d",
    views: v(["returns", "Returns"], ["items", "Items"]),
    perms: ["reports.sale"],
    searchable: "Return no. or customer",
    build: saleReturnReport
  },
  {
    slug: "sale-r",
    title: "Sales & returns (R)",
    group: "Sales",
    description: "Sales and returns together, returns as negatives.",
    dated: true,
    defaultRange: "7d",
    views: v(["all", "All"], ["sales", "Sales"], ["returns", "Returns"]),
    perms: ["reports.sale"],
    searchable: "Number or customer",
    build: saleAndReturnReport
  },
  {
    slug: "fast-moving",
    title: "Fast & slow movers",
    group: "Sales",
    description: "What sells quickly and what is sitting on the shelf.",
    dated: true,
    defaultRange: "30d",
    views: v(["fast", "Fast"], ["slow", "Slow"]),
    perms: ["reports.sale", "reports.stock"],
    searchable: "Item or brand",
    build: fastMovingReport
  },
  {
    slug: "purchase",
    title: "Purchase report",
    group: "Purchase",
    description: "Supplier bills or items bought, with GST and dues.",
    dated: true,
    defaultRange: "30d",
    views: v(["bills", "Bills"], ["items", "Items"]),
    perms: ["reports.purchase"],
    searchable: "Invoice, supplier or item",
    build: purchaseReport
  },
  {
    slug: "stock",
    title: "Stock report",
    group: "Stock",
    description: "What is in stock and what it is worth.",
    dated: false,
    defaultRange: null,
    views: v(["in", "In stock"], ["products", "By product"], ["stores", "By store"], ["out", "Out of stock"], ["all", "All"]),
    perms: ["reports.stock"],
    searchable: "Item, brand or barcode",
    build: stockReport
  },
  {
    slug: "stock-analysis",
    title: "Stock movement",
    group: "Stock",
    description: "Opening, in, sold and closing stock for each item.",
    dated: true,
    defaultRange: "month",
    views: [],
    perms: ["reports.stock"],
    searchable: "Item or brand",
    build: stockAnalysisReport
  },
  {
    slug: "dumped-stock",
    title: "Dumped stock",
    group: "Stock",
    description: "Damaged, lost and corrected stock.",
    dated: true,
    defaultRange: "30d",
    views: v(["out", "Written off"], ["all", "All changes"]),
    perms: ["reports.stock"],
    searchable: "Item or note",
    build: dumpedStockReport
  },
  {
    slug: "stock-transfer",
    title: "Stock transfers",
    group: "Stock",
    description: "Stock moved between your stores.",
    dated: true,
    defaultRange: "30d",
    views: v(["challans", "Challans"], ["items", "Items"]),
    perms: ["reports.stock"],
    searchable: "Challan or item",
    build: stockTransferReport
  },
  {
    slug: "stock-hold",
    title: "Stock on hold",
    group: "Stock",
    description: "Items kept aside for customers.",
    dated: false,
    defaultRange: null,
    views: v(["active", "On hold"], ["all", "All"]),
    perms: ["reports.stock", "stock.unhold"],
    searchable: null,
    build: emptyStockReport("holds", "Nothing is on hold.")
  },
  {
    slug: "stock-conversion",
    title: "Stock conversion",
    group: "Stock",
    description: "Items converted into other items (sets, cut pieces).",
    dated: true,
    defaultRange: "30d",
    views: [],
    perms: ["reports.stock"],
    searchable: null,
    build: emptyStockReport("conversions", "No stock was converted in this period.")
  },
  {
    slug: "gstr1",
    title: "GSTR-1",
    group: "GST",
    description: "Outward supplies: B2B, B2C, HSN and credit notes.",
    dated: true,
    defaultRange: "last_month",
    views: [],
    perms: ["reports.gst"],
    ownerOnly: true,
    searchable: null,
    build: gstr1Report
  },
  {
    slug: "gstr2",
    title: "GSTR-2 (purchases)",
    group: "GST",
    description: "Purchase bills and input tax credit.",
    dated: true,
    defaultRange: "last_month",
    views: [],
    perms: ["reports.gst"],
    ownerOnly: true,
    searchable: "Supplier, GSTIN or invoice",
    build: gstr2Report
  },
  {
    slug: "gstr3b",
    title: "GSTR-3B summary",
    group: "GST",
    description: "Tax on sales minus input credit.",
    dated: true,
    defaultRange: "last_month",
    views: [],
    perms: ["reports.gst"],
    ownerOnly: true,
    searchable: null,
    build: gstr3bReport
  },
  {
    slug: "profit-loss-summary",
    title: "Profit & loss summary",
    group: "Profit",
    description: "Sales, cost of goods and gross profit.",
    dated: true,
    defaultRange: "month",
    views: [],
    perms: ["reports.pnl"],
    ownerOnly: true,
    searchable: null,
    build: profitSummaryReport
  },
  {
    slug: "profit-loss-detailed",
    title: "Profit by bill or item",
    group: "Profit",
    description: "Which bills and items made money.",
    dated: true,
    defaultRange: "month",
    views: v(["bills", "Bills"], ["items", "Items"]),
    perms: ["reports.pnl"],
    ownerOnly: true,
    searchable: "Bill, customer or item",
    build: profitDetailReport
  },
  {
    slug: "customer-due",
    title: "Customer dues",
    group: "Dues & customers",
    description: "Who owes you money and for how long.",
    dated: false,
    defaultRange: null,
    views: v(["any", "All dues"], ["30", "30+ days"], ["60", "60+ days"], ["90", "90+ days"]),
    perms: ["reports.due"],
    searchable: "Name or mobile",
    build: partyDueReport("customer")
  },
  {
    slug: "customer-outstanding",
    title: "Customer outstanding",
    group: "Dues & customers",
    description: "Opening, billed, received and closing balances.",
    dated: true,
    defaultRange: "month",
    views: v(["open", "With balance"], ["all", "All"]),
    perms: ["reports.due"],
    searchable: "Name",
    build: partyOutstandingReport("customer")
  },
  {
    slug: "supplier-due",
    title: "Supplier dues",
    group: "Dues & customers",
    description: "What you owe suppliers.",
    dated: false,
    defaultRange: null,
    views: v(["any", "All dues"], ["30", "30+ days"], ["60", "60+ days"], ["90", "90+ days"]),
    perms: ["reports.due", "reports.purchase"],
    ownerOnly: true,
    searchable: "Name or mobile",
    build: partyDueReport("supplier")
  },
  {
    slug: "supplier-outstanding",
    title: "Supplier outstanding",
    group: "Dues & customers",
    description: "Opening, purchased, paid and closing balances.",
    dated: true,
    defaultRange: "month",
    views: v(["open", "With balance"], ["all", "All"]),
    perms: ["reports.due", "reports.purchase"],
    ownerOnly: true,
    searchable: "Name",
    build: partyOutstandingReport("supplier")
  },
  {
    slug: "customer",
    title: "Customer report",
    group: "Dues & customers",
    description: "Top, new and lapsed customers.",
    dated: false,
    defaultRange: null,
    views: v(["top", "Top"], ["lapsed", "Lapsed"], ["new", "New"], ["all", "All"]),
    perms: ["reports.customer"],
    ownerOnly: true,
    searchable: "Name, mobile or city",
    build: customerReport
  },
  {
    slug: "salesman-summary",
    title: "Staff sales summary",
    group: "Staff",
    description: "Sales by each person this month.",
    dated: true,
    defaultRange: "month",
    views: [],
    perms: ["reports.salesman"],
    searchable: "Staff name",
    build: salesmanSummaryReport
  },
  {
    slug: "salesman",
    title: "Staff sales detail",
    group: "Staff",
    description: "Every bill with who made it.",
    dated: true,
    defaultRange: "7d",
    views: [],
    perms: ["reports.salesman"],
    searchable: "Staff, bill or customer",
    build: salesmanDetailReport
  }
];

const GROUP_ORDER: ReportGroup[] = ["Sales", "Purchase", "Stock", "GST", "Profit", "Dues & customers", "Staff"];

function canSee(ctx: Ctx, report: ReportDef): boolean {
  if (ctx.auth.isOwner) return true;
  if (report.ownerOnly) return false;
  return report.perms.some((p) => ctx.auth.actor.permissions.has(p));
}

function runReport(ctx: Ctx, slug: string): ReportResponse {
  const report = REPORTS.find((r) => r.slug === slug);
  if (!report) notFound("Report not found.");
  if (!canSee(ctx, report)) forbidden();
  const range = report.dated ? resolveRange(q(ctx, "range"), q(ctx, "from"), q(ctx, "to"), report.defaultRange ?? "30d") : null;
  const requestedView = q(ctx, "view");
  const view = report.views.length ? (report.views.find((x) => x.key === requestedView)?.key ?? report.views[0].key) : null;
  const rc: ReportCtx = { db: ctx.db, range, stores: storeFilter(ctx), view, q: (q(ctx, "q") ?? "").slice(0, 80), isOwner: ctx.auth.isOwner, actor: ctx.auth.actor };
  const built = report.build(rc);
  return { slug: report.slug, title: report.title, period: range ? { from: range.from, to: range.to, label: range.label } : null, view, ...built };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(Math.round(value * 1000) / 1000) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function tableToCsv(table: ReportTableOut): string {
  const header = table.columns.map((c) => csvCell(c.label)).join(",");
  const line = (row: ReportRow) => table.columns.map((c) => csvCell(row[c.key])).join(",");
  return [header, ...table.rows.map(line), ...(table.totals ? [line(table.totals)] : [])].join("\n") + "\n";
}

export const reportRoutes: Route[] = [
  route("GET", "/reports", (ctx) => {
    const visible = REPORTS.filter((r) => canSee(ctx, r));
    const response: ReportsIndexResponse = {
      groups: GROUP_ORDER.map((group) => ({
        group,
        reports: visible
          .filter((r) => r.group === group)
          .map((r) => ({ slug: r.slug, title: r.title, description: r.description, dated: r.dated, defaultRange: r.defaultRange, views: r.views, searchable: r.searchable }))
      })).filter((g) => g.reports.length > 0)
    };
    return ok(response);
  }),
  route("GET", "/reports/:slug", (ctx) => ok(runReport(ctx, ctx.params.slug)))
];

/** GET https://mock.wowcity.local/api/reports/{slug}/export?...&table=<key> — CSV text. */
export const reportExportRoute: Route = route("GET", "/api/reports/:slug/export", (ctx) => {
  if (!ctx.auth.isOwner && !ctx.auth.actor.permissions.has("reports.export")) forbidden();
  const report = runReport(ctx, ctx.params.slug);
  const key = q(ctx, "table");
  const table = report.tables.find((t) => t.key === key) ?? report.tables[0];
  if (!table) notFound("Nothing to export.");
  return csvResult(tableToCsv(table));
});
