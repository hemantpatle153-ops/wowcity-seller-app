/** Customers (owner) and dues ledgers. */
import type { CustomerRow, DuesStatementResponse, PartyBalanceRow, StatementEntry } from "@/api/types";
import { GSTIN_PATTERN } from "@/lib/india";
import type { Db, DbCustomer } from "../db";
import { findCustomer, findSupplier, partyBalance, postedInvoices } from "../db";
import { addLedger, mobile10 } from "../engine/common";
import { body, need, ownerOnly, q, route, type Route } from "../http";
import { addDays, forbidden, includesText, inr, invalid, isoDate, notFound, ok, pageParam, paginate, parseIsoDate, r2, r3, reject, startOfDay, str, toNum } from "../util";

export function customerStats(db: Db, customer: DbCustomer): CustomerRow {
  const bills = postedInvoices(db).filter((i) => i.customerId === customer.id);
  const times = bills.map((b) => b.at).sort();
  return {
    id: customer.id,
    name: customer.name,
    mobile: customer.mobile,
    city: customer.city,
    address: customer.address,
    bills: bills.length,
    spent: r2(bills.reduce((t, b) => t + b.totals.net, 0)),
    items: r3(bills.reduce((t, b) => t + b.totals.quantity, 0)),
    firstVisit: times[0] ?? null,
    lastVisit: times[times.length - 1] ?? null,
    balance: partyBalance(db, "customer", customer.id),
    createdAt: customer.createdAt
  };
}

function partyRows(db: Db, party: "customer" | "supplier"): PartyBalanceRow[] {
  const list = party === "customer" ? db.customers.map((c) => ({ id: c.id, name: c.name, mobile: c.mobile })) : db.suppliers.map((s) => ({ id: s.id, name: s.name, mobile: s.mobile || null }));
  return list.map((p) => {
    const entries = db.ledger.filter((e) => e.party === party && e.partyId === p.id);
    const last =
      entries
        .map((e) => e.at)
        .sort()
        .pop() ?? null;
    return { ...p, balance: partyBalance(db, party, p.id), lastActivity: last, entries: entries.length };
  });
}
export { partyRows };

export const peopleRoutes: Route[] = [
  route("GET", "/customers", (ctx) => {
    ownerOnly(ctx);
    const { db } = ctx;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lapsedBefore = addDays(startOfDay(now), -60).toISOString();
    const text = q(ctx, "q") ?? "";
    const all = db.customers.filter((c) => includesText([c.name, c.mobile, c.city], text)).map((c) => customerStats(db, c));
    const isLapsed = (c: CustomerRow) => c.createdAt < lapsedBefore && (!c.lastVisit || c.lastVisit < lapsedBefore);
    const segment = q(ctx, "segment");
    let items = all.filter((c) =>
      segment === "repeat"
        ? c.bills >= 2
        : segment === "new"
          ? c.createdAt >= monthStart
          : segment === "lapsed"
            ? isLapsed(c)
            : segment === "dues"
              ? c.balance > 0
              : segment === "top"
                ? c.bills > 0
                : true
    );
    const sort = segment === "top" ? "spent" : (q(ctx, "sort") ?? "spent");
    items = items.sort((a, b) =>
      sort === "recent"
        ? (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "")
        : sort === "visits"
          ? b.bills - a.bills
          : sort === "dues"
            ? b.balance - a.balance
            : sort === "name"
              ? a.name.localeCompare(b.name)
              : b.spent - a.spent || a.name.localeCompare(b.name)
    );
    if (segment === "top") items = items.slice(0, 20);
    return ok({
      total: items.length,
      summary: {
        customers: all.length,
        buyers: all.filter((c) => c.bills > 0).length,
        repeat: all.filter((c) => c.bills >= 2).length,
        newThisMonth: all.filter((c) => c.createdAt >= monthStart).length,
        lapsed: all.filter(isLapsed).length,
        withDues: all.filter((c) => c.balance > 0).length,
        dues: r2(all.reduce((t, c) => t + Math.max(0, c.balance), 0)),
        spent: r2(all.reduce((t, c) => t + c.spent, 0))
      },
      items: paginate(items, pageParam(q(ctx, "page")), 50)
    });
  }),

  route("GET", "/customers/:id", (ctx) => {
    ownerOnly(ctx);
    const { db } = ctx;
    const customer = findCustomer(db, ctx.params.id);
    if (!customer) notFound("Customer not found.");
    const stats = customerStats(db, customer);
    return ok({
      customer: {
        id: customer.id,
        name: customer.name,
        mobile: customer.mobile,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        gstin: customer.gstin,
        created_at: customer.createdAt
      },
      stats: stats.bills || stats.balance ? stats : null,
      bills: postedInvoices(db)
        .filter((i) => i.customerId === customer.id)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 30)
        .map((i) => ({ id: i.id, bill_number: i.billNumber, invoice_datetime: i.at, net_sale_amount: i.totals.net, amount_due: i.totals.due, total_quantity: i.totals.quantity }))
    });
  }),

  route("PATCH", "/customers/:id", (ctx) => {
    ownerOnly(ctx);
    const { db } = ctx;
    const customer = findCustomer(db, ctx.params.id);
    if (!customer) notFound("Customer not found.");
    const b = body(ctx);
    if (typeof b.mobile !== "string") invalid("mobile is required (send an empty string to clear it).");
    const name = str(b.name, 200);
    if (!name || name.length > 120) reject("Enter the customer's name.");
    const mobile = mobile10(b.mobile);
    if (b.mobile.trim() && mobile.length !== 10) reject("Enter a 10-digit mobile number.");
    if (mobile && db.customers.some((c) => c.id !== customer.id && mobile10(c.mobile) === mobile)) reject("Another customer already has this mobile number.");
    const gstin = str(b.gstin, 20).toUpperCase();
    if (gstin && !GSTIN_PATTERN.test(gstin)) reject("That GSTIN does not look right.");
    Object.assign(customer, {
      name,
      mobile: mobile || null,
      address: str(b.address, 300) || null,
      city: str(b.city, 80) || null,
      state: str(b.state, 60) || null,
      gstin: gstin || null,
      changedAt: new Date().toISOString()
    });
    return ok({ message: "Customer updated." });
  }),

  route("GET", "/dues", (ctx) => {
    need(ctx, "reports.due");
    const { db } = ctx;
    const party = q(ctx, "party") === "supplier" ? "supplier" : "customer";
    const text = q(ctx, "q") ?? "";
    const all = partyRows(db, party).filter((p) => includesText([p.name, p.mobile], text));
    const filter = q(ctx, "filter") ?? "owing";
    const items = all
      .filter((p) => (filter === "owing" ? p.balance > 0 : filter === "advance" ? p.balance < 0 : filter === "settled" ? p.balance === 0 && p.entries > 0 : true))
      .sort((a, b) => (filter === "advance" ? a.balance - b.balance : filter === "owing" ? b.balance - a.balance : a.name.localeCompare(b.name)));
    return ok({
      total: items.length,
      summary: {
        owing: r2(all.filter((p) => p.balance > 0).reduce((t, p) => t + p.balance, 0)),
        owingCount: all.filter((p) => p.balance > 0).length,
        advance: r2(all.filter((p) => p.balance < 0).reduce((t, p) => t - p.balance, 0)),
        advanceCount: all.filter((p) => p.balance < 0).length,
        settledCount: all.filter((p) => p.balance === 0 && p.entries > 0).length
      },
      items: paginate(items, pageParam(q(ctx, "page")), 50)
    });
  }),

  route("GET", "/dues/:party/:id", (ctx) => {
    need(ctx, "reports.due");
    const { db } = ctx;
    const party = ctx.params.party;
    if (party !== "customer" && party !== "supplier") notFound();
    if (party === "supplier") ownerOnly(ctx);
    const customer = party === "customer" ? findCustomer(db, ctx.params.id) : undefined;
    const supplier = party === "supplier" ? findSupplier(db, ctx.params.id) : undefined;
    if (!customer && !supplier) notFound("Not found.");
    let running = 0;
    const entries: StatementEntry[] = db.ledger
      .filter((e) => e.party === party && e.partyId === ctx.params.id)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((e) => {
        running = r2(running + e.increase - e.decrease);
        return { id: e.id, at: e.at, type: e.type, label: e.label, reference: e.reference, mode: e.mode, increase: e.increase, decrease: e.decrease, balance: running, href: e.href };
      });
    const balance = partyBalance(db, party, ctx.params.id);
    let reminder: DuesStatementResponse["reminder"] = null;
    if (customer && balance > 0) {
      const shop = db.settings.profile.displayName;
      const upi = db.settings.invoice.upiId ? ` You can pay by UPI to ${db.settings.invoice.upiId}.` : "";
      const text = `Namaste ${customer.name}, this is a gentle reminder from ${shop}. Your pending balance is ${inr(balance)}.${upi} Thank you!`;
      const mobile = mobile10(customer.mobile);
      reminder = { text, whatsappUrl: `https://wa.me/${mobile ? `91${mobile}` : ""}?text=${encodeURIComponent(text)}` };
    }
    const response: DuesStatementResponse = {
      party: customer
        ? { id: customer.id, name: customer.name, mobile: customer.mobile, gstin: customer.gstin, city: customer.city }
        : { id: supplier!.id, name: supplier!.name, mobile: supplier!.mobile || null, gstin: supplier!.gstin || null, state: supplier!.state || null },
      entries,
      balance,
      totals: { increase: r2(entries.reduce((t, e) => t + e.increase, 0)), decrease: r2(entries.reduce((t, e) => t + e.decrease, 0)) },
      reminder
    };
    return ok(response);
  }),

  route("POST", "/dues/entries", (ctx) => {
    need(ctx, "reports.due");
    const { db } = ctx;
    const b = body(ctx);
    const requestId = str(b.requestId, 80);
    if (!requestId) invalid("requestId is required.");
    const previous = db.idempotency.get(`due:${requestId}`);
    if (previous) return { status: 201, body: { data: previous } };
    const party = b.party === "supplier" ? "supplier" : b.party === "customer" ? "customer" : invalid("party must be customer or supplier.");
    const kind = b.kind === "due" ? "due" : b.kind === "payment" ? "payment" : invalid("kind must be payment or due.");
    if (!ctx.auth.isOwner && (party !== "customer" || kind !== "payment")) forbidden();
    const target = party === "customer" ? findCustomer(db, str(b.partyId)) : findSupplier(db, str(b.partyId));
    if (!target) reject(`That ${party} was not found.`);
    const amountText = String(b.amount ?? "").replace(/[₹,\s]/g, "");
    const amount = toNum(amountText);
    if (!(amount > 0) || amount > 1e8 || !/^\d+(\.\d{1,2})?$/.test(amountText)) reject("Enter an amount more than ₹0 with up to 2 decimals.");
    const modes = ["cash", "upi", "card", "bank", "cheque"];
    const mode = str(b.mode);
    if (kind === "payment" && !modes.includes(mode)) reject("Pick how the money was paid.");
    let at = new Date();
    if (b.date) {
      const date = parseIsoDate(str(b.date));
      if (!date) reject("Enter a valid date.");
      if (date > startOfDay(new Date())) reject("The date cannot be in the future.");
      if (isoDate(date) !== isoDate(new Date())) at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0);
    }
    const note = str(b.note, 120);
    const type = party === "customer" ? (kind === "payment" ? "customer_due_settlement" : "manual_customer_due") : kind === "payment" ? "supplier_due_payment" : "manual_supplier_due";
    const label = note || (kind === "payment" ? (party === "customer" ? "Payment received" : "Payment made") : "Due added");
    addLedger(db, {
      party,
      partyId: target.id,
      at: at.toISOString(),
      type,
      label,
      reference: str(b.reference, 60) || null,
      mode: kind === "payment" ? mode : null,
      increase: kind === "due" ? r2(amount) : 0,
      decrease: kind === "payment" ? r2(amount) : 0,
      href: null,
      requestId
    });
    const message = kind === "due" ? `${inr(amount)} due added for ${target.name}.` : party === "customer" ? `${inr(amount)} received from ${target.name}.` : `${inr(amount)} paid to ${target.name}.`;
    const response = { message };
    db.idempotency.set(`due:${requestId}`, response);
    return { status: 201, body: { data: response } };
  })
];
