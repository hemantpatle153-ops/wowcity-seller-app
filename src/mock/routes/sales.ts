/** Billing: POST/GET /sales, original-bill, catalogue lookup, offline sync and customer search. */
import type { CatalogLookupItem, HistoryRow, OriginalBillResponse, SalesListResponse, SyncCatalogItem, SyncCustomer } from "@/api/types";
import type { Db, DbVariant } from "../db";
import { actorName, findStore, gstRateOf, partyBalance, productOf, qtyAt } from "../db";
import { toSaleInvoice, submitSale } from "../engine/sales";
import { body, need, q, route, storeFilter, type Ctx, type Route } from "../http";
import { includesText, inRange, invalid, notFound, numStr, ok, pageParam, paginate, raw, resolveRange, r2, r3, forbidden } from "../util";

export function lookupItem(db: Db, variant: DbVariant, storeId: string): CatalogLookupItem {
  const product = productOf(db, variant);
  return {
    variantId: variant.id,
    productId: product.id,
    barcodeId: variant.barcodes[0]?.id ?? "",
    barcode: variant.barcodes[0]?.barcode ?? "",
    itemName: product.name,
    brand: product.brand,
    size: variant.size,
    colour: variant.colour,
    style: variant.style,
    hsnCode: product.hsnCode,
    gstRate: numStr(gstRateOf(db, variant)),
    mrp: numStr(variant.mrp),
    rate: numStr(variant.saleRate),
    availableQty: qtyAt(db, variant.id, storeId)
  };
}

/** Every whitespace-separated word must appear in the item's name, brand, category, size or colour. */
export function matchesSearch(db: Db, variant: DbVariant, text: string): boolean {
  const product = productOf(db, variant);
  const haystack = `${product.name} ${product.brand} ${product.category} ${variant.size} ${variant.colour} ${variant.style}`.toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function cursorPage<T extends { changedAt: string; id: string }>(ctx: Ctx, list: T[]) {
  const sinceAt = q(ctx, "sinceAt");
  const sinceId = q(ctx, "sinceId") ?? "";
  const limitRaw = Number(q(ctx, "limit") ?? 500);
  const limit = Math.min(2000, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 500));
  const sorted = [...list].sort((a, b) => (a.changedAt === b.changedAt ? a.id.localeCompare(b.id) : a.changedAt.localeCompare(b.changedAt)));
  const after = sinceAt ? sorted.filter((item) => item.changedAt > sinceAt || (item.changedAt === sinceAt && item.id > sinceId)) : sorted;
  const page = after.slice(0, limit);
  const last = page[page.length - 1];
  return { page, hasMore: after.length > limit, next: last ? { sinceAt: last.changedAt, sinceId: last.id } : null };
}

function billRow(db: Db, invoiceId: string): HistoryRow | null {
  const invoice = db.invoices.find((i) => i.id === invoiceId);
  if (!invoice) return null;
  return {
    id: invoice.id,
    at: invoice.at,
    number: invoice.billNumber,
    href: `/app/sale/invoices/${invoice.id}`,
    customer: invoice.customer?.name ?? null,
    mobile: invoice.customer?.mobile || null,
    quantity: invoice.totals.quantity,
    by: actorName(db, invoice.by),
    store: findStore(db, invoice.storeId)?.name ?? "—",
    amount: invoice.totals.net,
    due: invoice.totals.due
  };
}

export const salesRoutes: Route[] = [
  route("POST", "/sales", (ctx) => {
    const kind = body(ctx).kind;
    need(ctx, kind === "return" ? "sale.return" : "sale.create");
    const { status, response } = submitSale(ctx.db, ctx.auth.actor, ctx.body);
    return { status, body: { data: response } };
  }),

  route("GET", "/sales", (ctx) => {
    need(ctx, "sale.view", "sale.create", "sale.return");
    const { db, auth } = ctx;
    const range = resolveRange(q(ctx, "range"), q(ctx, "from"), q(ctx, "to"), "today");
    const stores = storeFilter(ctx);
    const staff = auth.isOwner ? q(ctx, "staff") : `worker:${auth.actor.ref.id}`;
    const byStaff = (by: { kind: string; id: string }) => !staff || staff === `${by.kind}:${by.id}`;
    const mineOnly = (by: { kind: string; id: string }) => auth.isOwner || (by.kind === "worker" && by.id === auth.actor.ref.id);
    const text = q(ctx, "q") ?? "";

    const bills = db.invoices.filter((i) => !i.isEstimate && stores.includes(i.storeId) && inRange(i.at, range) && mineOnly(i.by));
    const returns = db.returns.filter((r) => stores.includes(r.storeId) && inRange(r.at, range) && mineOnly(r.by));
    const summary = {
      sales: r2(bills.reduce((t, i) => t + i.totals.net, 0)),
      bills: bills.length,
      items: r3(bills.reduce((t, i) => t + i.totals.quantity, 0)),
      due: r2(bills.reduce((t, i) => t + i.totals.due, 0)),
      returns: r2(returns.reduce((t, r) => t + r.amount, 0)),
      returnCount: returns.length
    };
    let rows: HistoryRow[];
    if (q(ctx, "view") === "returns") {
      rows = returns
        .filter((r) => byStaff(r.by) && includesText([r.returnNumber, r.creditNoteNumber, r.customerName, r.customerMobile], text))
        .map((r) => ({
          id: r.id,
          at: r.at,
          number: r.returnNumber || "Return",
          href: r.invoiceId ? `/app/sale/invoices/${r.invoiceId}` : null,
          customer: r.customerName,
          mobile: r.customerMobile,
          quantity: r.qty,
          by: r.refundMode === "credit_note" ? "Credit note" : "Cash refund",
          store: findStore(db, r.storeId)?.name ?? "—",
          amount: r.amount,
          due: 0,
          ...(r.refundMode === "credit_note" ? { badge: { label: "Credit note", variant: "brand" as const } } : {})
        }));
    } else {
      rows = bills.filter((i) => byStaff(i.by) && includesText([i.billNumber, i.customer?.name, i.customer?.mobile], text)).map((i) => billRow(db, i.id)!);
    }
    rows.sort((a, b) => b.at.localeCompare(a.at));
    const page = pageParam(q(ctx, "page"));
    const response: SalesListResponse = { range: { from: range.from, to: range.to }, page, total: rows.length, summary, rows: paginate(rows, page, 30) };
    return ok(response);
  }),

  route(
    "GET",
    "/sales/original-bill",
    (ctx) => {
      need(ctx, "sale.return");
      const { db } = ctx;
      const number = (q(ctx, "billNumber") ?? "").trim().toUpperCase();
      const invoice = db.invoices.find((i) => !i.isEstimate && i.billNumber.toUpperCase() === number && ctx.auth.actor.storeIds.includes(i.storeId));
      if (!number || !invoice) return raw({ found: false } satisfies OriginalBillResponse);
      const customer = invoice.customerId ? db.customers.find((c) => c.id === invoice.customerId) : undefined;
      const response: OriginalBillResponse = {
        found: true,
        invoice: { id: invoice.id, billNumber: invoice.billNumber, storeId: invoice.storeId, date: invoice.at, total: invoice.totals.net, taxType: invoice.taxType },
        customer: customer ? { id: customer.id, name: customer.name, mobile: customer.mobile, address: customer.address, state: customer.state } : null,
        items: invoice.lines.map((line) => {
          const [size = "", colour = ""] = line.detail.split(" / ");
          return {
            originalItemId: line.id,
            variantId: line.variantId,
            barcode: line.barcode,
            itemName: line.name,
            size,
            colour,
            soldQty: line.qty,
            returnableQty: r3(line.qty - line.returned),
            mrp: numStr(line.mrp),
            rate: numStr(line.rate),
            unitRefund: (line.net / line.qty).toFixed(2),
            gstRate: numStr(line.gstRate)
          };
        })
      };
      return raw(response);
    },
    { raw: true }
  ),

  route("GET", "/sales/:id", (ctx) => {
    need(ctx, "sale.view", "sale.create", "sale.return");
    const invoice = ctx.db.invoices.find((i) => i.id === ctx.params.id);
    if (!invoice || !ctx.auth.actor.storeIds.includes(invoice.storeId)) notFound("Bill not found.");
    return ok(toSaleInvoice(ctx.db, invoice));
  }),

  route(
    "GET",
    "/catalog/lookup",
    (ctx) => {
      need(ctx, "sale.create", "sale.view", "sale.return");
      const { db } = ctx;
      const text = (q(ctx, "q") ?? "").trim();
      const storeId = q(ctx, "storeId") ?? "";
      if (!text || !storeId) return raw({ items: [] });
      if (!ctx.auth.actor.storeIds.includes(storeId)) forbidden();
      const upper = text.toUpperCase();
      const exact = db.variants.find((v) => v.active && v.barcodes.some((b) => b.barcode.toUpperCase() === upper));
      if (exact) return raw({ items: [lookupItem(db, exact, storeId)], exact: true });
      const inStock = q(ctx, "inStock") !== "false";
      const items = db.variants
        .filter((v) => v.active && productOf(db, v).active && matchesSearch(db, v, text) && (!inStock || qtyAt(db, v.id, storeId) > 0))
        .slice(0, 20)
        .map((v) => lookupItem(db, v, storeId));
      return raw(items.length ? { items, exact: false } : { items: [] });
    },
    { raw: true }
  ),

  route("GET", "/sync/catalog", (ctx) => {
    need(ctx, "sale.create", "sale.view", "sale.return", "stock.view");
    const { db } = ctx;
    const storeId = q(ctx, "storeId");
    if (!storeId) invalid("storeId is required.");
    if (!ctx.auth.actor.storeIds.includes(storeId)) forbidden();
    const { page, hasMore, next } = cursorPage(ctx, db.variants);
    const items: SyncCatalogItem[] = page.map((v) => {
      const product = productOf(db, v);
      return {
        variantId: v.id,
        productId: product.id,
        active: v.active && product.active,
        itemName: product.name,
        brand: product.brand || null,
        category: product.category || null,
        size: v.size || null,
        colour: v.colour || null,
        style: v.style || null,
        hsnCode: product.hsnCode || null,
        gstRate: gstRateOf(db, v),
        mrp: v.mrp,
        rate: v.saleRate,
        availableQty: qtyAt(db, v.id, storeId),
        barcodes: v.barcodes.map((b) => b.barcode),
        changedAt: v.changedAt
      };
    });
    return ok({ items, next, hasMore, serverTime: new Date().toISOString() });
  }),

  route("GET", "/sync/customers", (ctx) => {
    need(ctx, "sale.create", "sale.return");
    const { db } = ctx;
    const { page, hasMore, next } = cursorPage(ctx, db.customers);
    const items: SyncCustomer[] = page.map((c) => ({
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      address: c.address,
      city: c.city,
      state: c.state,
      gstin: c.gstin,
      balance: partyBalance(db, "customer", c.id),
      changedAt: c.changedAt
    }));
    return ok({ items, next, hasMore, serverTime: new Date().toISOString() });
  }),

  route(
    "GET",
    "/customers/search",
    (ctx) => {
      need(ctx, "sale.create", "sale.return");
      const { db } = ctx;
      const text = (q(ctx, "q") ?? "").trim();
      if (text.length < 2) return raw({ customers: [] });
      const digits = text.replace(/\D/g, "");
      const lower = text.toLowerCase();
      const customers = db.customers
        .filter((c) => c.name.toLowerCase().includes(lower) || (digits.length >= 2 && (c.mobile ?? "").includes(digits)))
        .sort((a, b) => Number(b.name.toLowerCase().startsWith(lower)) - Number(a.name.toLowerCase().startsWith(lower)) || a.name.localeCompare(b.name))
        .slice(0, 8)
        .map((c) => ({ id: c.id, name: c.name, mobile: c.mobile, address: c.address, state: c.state, gstin: c.gstin, balance: partyBalance(db, "customer", c.id) }));
      return raw({ customers });
    },
    { raw: true }
  )
];
