/** GET /dashboard: the owner's overview or the staff member's own day. */
import type { DailyPoint, DashboardBill, OwnerDashboard, PaymentMix, SalesSummary, StaffDashboard, StockAlert } from "@/api/types";
import type { Db, DbInvoice } from "../db";
import { actorName, findStore, partyBalance, postedInvoices, productOf, qtyAt, variantDetail } from "../db";
import { has, q, route, type Ctx, type Route } from "../http";
import { addDays, isoDate, r2, r3, startOfDay } from "../util";

const LOW = 5;

function summary(list: DbInvoice[]): SalesSummary {
  const amount = r2(list.reduce((t, i) => t + i.totals.net, 0));
  return {
    amount,
    bills: list.length,
    quantity: r3(list.reduce((t, i) => t + i.totals.quantity, 0)),
    averageBill: list.length ? r2(amount / list.length) : 0,
    creditDue: r2(list.reduce((t, i) => t + i.totals.due, 0))
  };
}

function onDay(list: DbInvoice[], day: Date) {
  const key = isoDate(day);
  return list.filter((i) => isoDate(new Date(i.at)) === key);
}

function trend(list: DbInvoice[], days: number): DailyPoint[] {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(today, index - days + 1);
    const bills = onDay(list, day);
    return { date: isoDate(day), amount: r2(bills.reduce((t, i) => t + i.totals.net, 0)), bills: bills.length };
  });
}

function paymentMix(list: DbInvoice[]): PaymentMix {
  const totals = new Map<string, number>([
    ["cash", 0],
    ["upi", 0],
    ["card", 0],
    ["other", 0],
    ["credit", 0]
  ]);
  for (const invoice of list) {
    for (const p of invoice.payments) {
      const mode = totals.has(p.mode) ? p.mode : "other";
      totals.set(mode, (totals.get(mode) ?? 0) + p.amount);
    }
    totals.set("credit", (totals.get("credit") ?? 0) + invoice.totals.due);
  }
  return [...totals].filter(([, amount]) => amount > 0).map(([mode, amount]) => ({ mode, amount: r2(amount) }));
}

function stockAlerts(db: Db, storeIds: string[], max: number) {
  const variants = db.variants.filter((v) => v.active && productOf(db, v).active);
  let outOfStock = 0;
  let low = 0;
  const alerts: StockAlert[] = [];
  for (const v of variants) {
    const total = storeIds.reduce((t, s) => t + qtyAt(db, v.id, s), 0);
    if (total <= 0) outOfStock += 1;
    else if (total <= LOW) low += 1;
    for (const storeId of storeIds) {
      const quantity = qtyAt(db, v.id, storeId);
      if (quantity <= LOW)
        alerts.push({ variantId: v.id, storeName: findStore(db, storeId)?.name ?? "", quantity, name: productOf(db, v).name, detail: variantDetail(v), barcode: v.barcodes[0]?.barcode ?? null });
    }
  }
  alerts.sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  // Low first (still sellable, reorder soon), then the ones already out.
  const ordered = [...alerts.filter((a) => a.quantity > 0), ...alerts.filter((a) => a.quantity <= 0)].slice(0, max);
  return { outOfStock, low, alerts: ordered };
}

function dashboardBill(db: Db, i: DbInvoice): DashboardBill {
  return {
    id: i.id,
    billNumber: i.billNumber,
    time: i.at,
    customer: i.customer?.name ?? "Cash sale",
    store: findStore(db, i.storeId)?.name ?? "",
    quantity: i.totals.quantity,
    amount: i.totals.net,
    due: i.totals.due
  };
}

function dueParties(db: Db, party: "customer" | "supplier") {
  const list = (party === "customer" ? db.customers : db.suppliers).map((p) => ({ id: p.id, name: p.name, amount: partyBalance(db, party, p.id) }));
  const owing = list.filter((p) => p.amount > 0);
  return {
    due: r2(owing.reduce((t, p) => t + p.amount, 0)),
    advance: r2(list.filter((p) => p.amount < 0).reduce((t, p) => t - p.amount, 0)),
    parties: owing.length,
    top: owing.sort((a, b) => b.amount - a.amount).slice(0, 5)
  };
}

function ownerDashboard(ctx: Ctx): OwnerDashboard {
  const { db } = ctx;
  const active = db.stores.filter((s) => s.is_active);
  const requested = q(ctx, "store");
  const store = active.find((s) => s.id === requested);
  const storeIds = store ? [store.id] : active.map((s) => s.id);
  const invoices = postedInvoices(db).filter((i) => storeIds.includes(i.storeId));
  const today = startOfDay(new Date());
  const todays = onDay(invoices, today);
  const yesterdays = onDay(invoices, addDays(today, -1));
  const t = summary(todays);
  const y = summary(yesterdays);

  let revenue = 0;
  let cost = 0;
  let itemsWithoutCost = 0;
  for (const line of todays.flatMap((i) => i.lines)) {
    revenue += line.taxable;
    if (line.unitCost === null) itemsWithoutCost += 1;
    else cost += line.unitCost * line.qty;
  }
  const profit = r2(revenue - cost);

  const todayKey = isoDate(today);
  const returns = db.returns.filter((r) => storeIds.includes(r.storeId) && isoDate(new Date(r.at)) === todayKey);
  const purchases = db.purchases.filter((p) => storeIds.includes(p.storeId) && p.date === todayKey);

  const weekStart = addDays(today, -6).toISOString();
  const top = new Map<string, { quantity: number; amount: number }>();
  for (const line of invoices.filter((i) => i.at >= weekStart).flatMap((i) => i.lines)) {
    const entry = top.get(line.variantId) ?? { quantity: 0, amount: 0 };
    entry.quantity += line.qty;
    entry.amount += line.net;
    top.set(line.variantId, entry);
  }
  const topItems = [...top]
    .sort((a, b) => b[1].quantity - a[1].quantity || b[1].amount - a[1].amount)
    .slice(0, 5)
    .map(([variantId, v]) => {
      const variant = db.variants.find((x) => x.id === variantId)!;
      return { variantId, quantity: r3(v.quantity), amount: r2(v.amount), name: productOf(db, variant).name, detail: variantDetail(variant), barcode: variant.barcodes[0]?.barcode ?? null };
    });

  const team = new Map<string, OwnerDashboard["team"]["today"][number]>();
  for (const i of todays) {
    const key = `${i.by.kind}:${i.by.id}`;
    const row = team.get(key) ?? { key, actor: i.by.kind, id: i.by.id, amount: 0, bills: 0, quantity: 0, name: actorName(db, i.by) };
    row.amount = r2(row.amount + i.totals.net);
    row.bills += 1;
    row.quantity = r3(row.quantity + i.totals.quantity);
    team.set(key, row);
  }

  const publicProducts = db.products.filter((p) => p.active && p.listing.enabled);
  const publicInStock = publicProducts.filter((p) => db.variants.some((v) => v.productId === p.id && p.listing.storeIds.some((s) => qtyAt(db, v.id, s) > 0)));

  return {
    kind: "owner",
    stores: active.map((s) => ({ id: s.id, name: s.name, state: s.state ?? "", address_line_1: s.address_line_1, address_line_2: s.address_line_2, city: s.city, pincode: s.pincode })),
    ...(store ? { storeId: store.id } : {}),
    storeName: store ? store.name : "All stores",
    todayDate: todayKey,
    today: t,
    yesterday: y,
    change: y.amount ? Math.round(((t.amount - y.amount) / y.amount) * 1000) / 10 : null,
    trend: trend(invoices, 14),
    paymentMix: paymentMix(todays),
    profit: { revenue: r2(revenue), cost: r2(cost), profit, marginPercent: revenue ? Math.round((profit / revenue) * 1000) / 10 : null, itemsWithoutCost },
    returns: { count: returns.length, amount: r2(returns.reduce((s, r) => s + r.amount, 0)) },
    purchases: {
      count: purchases.length,
      amount: r2(purchases.reduce((s, p) => s + p.totals.total, 0)),
      due: r2(purchases.reduce((s, p) => s + Math.max(0, p.totals.total - p.payments.reduce((x, y) => x + y.amount, 0)), 0)),
      quantity: r3(purchases.reduce((s, p) => s + p.totals.qty, 0))
    },
    dues: { customers: dueParties(db, "customer"), suppliers: dueParties(db, "supplier") },
    stock: stockAlerts(db, storeIds, 8),
    topItems,
    team: { active: db.workers.filter((w) => !w.disabled).length, total: db.workers.length, today: [...team.values()].sort((a, b) => b.amount - a.amount) },
    listings: {
      public: publicProducts.length,
      inStock: publicInStock.length,
      outOfStock: publicProducts.length - publicInStock.length,
      discoverableStores: active.filter((s) => s.is_discoverable).length
    },
    recentBills: [...todays]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8)
      .map((i) => ({ ...dashboardBill(db, i), soldBy: actorName(db, i.by) })),
    activity: [...db.activity]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6)
      .map((a) => ({ id: a.id, action: a.label, by: actorName(db, a.by), amount: a.amount, at: a.at }))
  };
}

function staffDashboard(ctx: Ctx): StaffDashboard {
  const { db, auth } = ctx;
  const mine = postedInvoices(db).filter((i) => i.by.kind === "worker" && i.by.id === auth.actor.ref.id);
  const todays = onDay(mine, startOfDay(new Date()));
  return {
    kind: "staff",
    todayDate: isoDate(new Date()),
    stores: db.stores.filter((s) => auth.worker?.storeIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name, is_active: s.is_active })),
    today: summary(todays),
    trend: trend(mine, 7),
    paymentMix: paymentMix(todays),
    stock: has(ctx, "stock.view") ? stockAlerts(db, auth.actor.storeIds, 6) : null,
    recentBills: [...mine]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 12)
      .map((i) => dashboardBill(db, i))
  };
}

export const dashboardRoutes: Route[] = [route("GET", "/dashboard", (ctx) => ({ status: 200, body: { data: ctx.auth.isOwner ? ownerDashboard(ctx) : staffDashboard(ctx) } }))];
