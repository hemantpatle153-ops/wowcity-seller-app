/** Sales, staff, purchase and profit reports. */
import type { ReportRow } from "@/api/types";
import { actorName, findStore, findSupplier, productOf, qtyIn, variantDetail } from "../db";
import { r2, r3 } from "../util";
import { col, invoiceHref, matches, minor, num, pct, periodInvoices, periodReturns, stat, table, type ReportBody, type ReportCtx } from "./shared";

const storeName = (rc: ReportCtx, id: string) => findStore(rc.db, id)?.name ?? "—";

export function saleReport(rc: ReportCtx): ReportBody {
  const all = periodInvoices(rc);
  const net = r2(all.reduce((t, i) => t + i.totals.net, 0));
  const due = r2(all.reduce((t, i) => t + i.totals.due, 0));
  const stats = [
    stat("Net sales", net, "money"),
    stat("Bills", all.length, "qty"),
    stat("Items sold", r3(all.reduce((t, i) => t + i.totals.quantity, 0)), "qty"),
    stat("Average bill", all.length ? r2(net / all.length) : 0, "money"),
    stat("GST collected", r2(all.reduce((t, i) => t + i.totals.gst, 0)), "money"),
    stat("On credit", due, "money", due > 0 ? { tone: "warning", hint: "Still to be collected from customers" } : {})
  ];
  const notes = ["Amounts include GST. Estimates are not included."];
  if (rc.view === "items") {
    const rows: ReportRow[] = all.flatMap((i) =>
      i.lines
        .filter((l) => matches(rc, i.billNumber, i.customer?.name, l.name, l.brand))
        .map((l) => ({ date: i.at, bill: i.billNumber, href: invoiceHref(i.id), item: l.name, detail: l.detail, qty: l.qty, rate: l.rate, discount: l.discount, gst: l.gst, net: l.net }))
    );
    return {
      stats,
      notes,
      tables: [
        table(
          "items",
          [
            col("date", "Date", "datetime"),
            col("bill", "Bill", "mono", { hrefKey: "href" }),
            col("item", "Item"),
            minor("detail", "Size / Colour"),
            num("qty", "Qty", "qty"),
            minor("rate", "Rate", "money"),
            num("discount", "Discount", "money", true),
            num("gst", "GST", "money", true),
            num("net", "Amount")
          ],
          rows,
          { title: "Items sold" }
        )
      ]
    };
  }
  const rows: ReportRow[] = all
    .filter((i) => matches(rc, i.billNumber, i.customer?.name, i.customer?.mobile, ...i.lines.map((l) => l.name)))
    .map((i) => ({
      date: i.at,
      bill: i.billNumber,
      href: invoiceHref(i.id),
      customer: i.customer?.name ?? "Cash sale",
      store: storeName(rc, i.storeId),
      staff: actorName(rc.db, i.by),
      qty: i.totals.quantity,
      taxable: i.totals.taxable,
      gst: i.totals.gst,
      net: i.totals.net,
      due: i.totals.due
    }));
  return {
    stats,
    notes,
    tables: [
      table(
        "bills",
        [
          col("date", "Date", "datetime"),
          col("bill", "Bill", "mono", { hrefKey: "href" }),
          col("customer", "Customer"),
          minor("store", "Store"),
          minor("staff", "Billed by"),
          num("qty", "Qty", "qty"),
          num("taxable", "Taxable", "money", true),
          num("gst", "GST", "money", true),
          num("net", "Amount"),
          num("due", "Due")
        ],
        rows,
        { title: "Bills" }
      )
    ]
  };
}

export function saleReturnReport(rc: ReportCtx): ReportBody {
  const all = periodReturns(rc);
  const amount = r2(all.reduce((t, r) => t + r.amount, 0));
  const credit = r2(all.filter((r) => r.refundMode === "credit_note").reduce((t, r) => t + r.amount, 0));
  const stats = [
    stat("Returns", all.length, "qty"),
    stat("Refunded", amount, "money", amount > 0 ? { tone: "negative" } : {}),
    stat("As credit notes", credit, "money"),
    stat("Cash refunds", r2(amount - credit), "money")
  ];
  const original = (id: string | null) => rc.db.invoices.find((i) => i.id === id);
  if (rc.view === "items") {
    const rows = all.flatMap((r) =>
      r.lines.filter((l) => matches(rc, r.returnNumber, l.name, r.customerName)).map((l) => ({ date: r.at, number: r.returnNumber, item: l.name, qty: l.qty, gst: l.gst, amount: l.amount }))
    );
    return {
      stats,
      notes: [],
      tables: [
        table(
          "items",
          [col("date", "Date", "datetime"), col("number", "Return", "mono"), col("item", "Item"), num("qty", "Qty", "qty"), num("gst", "GST", "money", true), num("amount", "Refund")],
          rows,
          { emptyText: "No returns in this period." }
        )
      ]
    };
  }
  const rows = all
    .filter((r) => matches(rc, r.returnNumber, r.creditNoteNumber, r.customerName))
    .map((r) => ({
      date: r.at,
      number: r.returnNumber,
      bill: original(r.invoiceId)?.billNumber ?? "—",
      href: r.invoiceId ? invoiceHref(r.invoiceId) : null,
      customer: r.customerName ?? "Walk-in",
      mode: r.refundMode === "credit_note" ? "Credit note" : "Cash",
      modeFormat: "badge",
      store: storeName(rc, r.storeId),
      qty: r.qty,
      amount: r.amount
    }));
  return {
    stats,
    notes: [],
    tables: [
      table(
        "returns",
        [
          col("date", "Date", "datetime"),
          col("number", "Return", "mono"),
          col("bill", "Original bill", "mono", { hrefKey: "href" }),
          col("customer", "Customer"),
          col("mode", "Refund"),
          minor("store", "Store"),
          num("qty", "Qty", "qty"),
          num("amount", "Amount")
        ],
        rows,
        { emptyText: "No returns in this period." }
      )
    ]
  };
}

export function saleAndReturnReport(rc: ReportCtx): ReportBody {
  const sales = periodInvoices(rc);
  const returns = periodReturns(rc);
  const salesTotal = r2(sales.reduce((t, i) => t + i.totals.net, 0));
  const returnTotal = r2(returns.reduce((t, r) => t + r.amount, 0));
  const rows: ReportRow[] = [];
  if (rc.view !== "returns")
    for (const i of sales)
      if (matches(rc, i.billNumber, i.customer?.name))
        rows.push({
          date: i.at,
          type: "Sale",
          typeFormat: "badge",
          number: i.billNumber,
          href: invoiceHref(i.id),
          customer: i.customer?.name ?? "Cash sale",
          qty: i.totals.quantity,
          amount: i.totals.net
        });
  if (rc.view !== "sales")
    for (const r of returns)
      if (matches(rc, r.returnNumber, r.customerName))
        rows.push({
          date: r.at,
          type: "Return",
          typeFormat: "badge",
          number: r.returnNumber,
          href: r.invoiceId ? invoiceHref(r.invoiceId) : null,
          customer: r.customerName ?? "Walk-in",
          qty: -r.qty,
          amount: -r.amount
        });
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    stats: [
      stat("Sales", salesTotal, "money"),
      stat("Returns", returnTotal, "money", returnTotal ? { tone: "negative" } : {}),
      stat("Net", r2(salesTotal - returnTotal), "money", { tone: "positive" })
    ],
    notes: ["Returns are shown as negative amounts."],
    tables: [
      table(
        rc.view ?? "all",
        [col("date", "Date", "datetime"), col("type", "Type"), col("number", "Number", "mono", { hrefKey: "href" }), col("customer", "Customer"), num("qty", "Qty", "qty"), num("amount", "Amount")],
        rows
      )
    ]
  };
}

export function fastMovingReport(rc: ReportCtx): ReportBody {
  const sold = new Map<string, { qty: number; amount: number; last: string }>();
  for (const i of periodInvoices(rc))
    for (const l of i.lines) {
      const s = sold.get(l.variantId) ?? { qty: 0, amount: 0, last: "" };
      s.qty += l.qty;
      s.amount += l.net;
      if (i.at > s.last) s.last = i.at;
      sold.set(l.variantId, s);
    }
  const rowFor = (variantId: string) => {
    const v = rc.db.variants.find((x) => x.id === variantId)!;
    const p = productOf(rc.db, v);
    const s = sold.get(variantId);
    return { item: p.name, brand: p.brand, detail: variantDetail(v), sold: r3(s?.qty ?? 0), amount: r2(s?.amount ?? 0), stock: qtyIn(rc.db, v.id, rc.stores), lastSold: s?.last || null };
  };
  const filtered = (rows: ReportRow[]) => rows.filter((r) => matches(rc, String(r.item), String(r.brand)));
  if (rc.view === "slow") {
    const rows = filtered(rc.db.variants.filter((v) => v.active && qtyIn(rc.db, v.id, rc.stores) > 0).map((v) => rowFor(v.id))).sort(
      (a, b) => Number(a.sold) - Number(b.sold) || Number(b.stock) - Number(a.stock)
    );
    return {
      stats: [
        stat("Items not sold", rows.filter((r) => r.sold === 0).length, "qty", { tone: "warning" }),
        stat("Units sitting idle", r3(rows.filter((r) => r.sold === 0).reduce((t, r) => t + Number(r.stock), 0)), "qty")
      ],
      notes: ["In-stock items with the fewest sales in this period. Consider a discount or moving them to another store."],
      tables: [
        table(
          "slow",
          [col("item", "Item"), minor("brand", "Brand"), col("detail", "Size / Colour"), num("stock", "In stock", "qty"), num("sold", "Sold", "qty"), minor("lastSold", "Last sold", "date")],
          rows
        )
      ]
    };
  }
  const rows = filtered([...sold.keys()].map(rowFor)).sort((a, b) => Number(b.sold) - Number(a.sold) || Number(b.amount) - Number(a.amount));
  return {
    stats: [
      stat("Items sold", rows.length, "qty"),
      stat("Units sold", r3(rows.reduce((t, r) => t + Number(r.sold), 0)), "qty"),
      stat("Sales", r2(rows.reduce((t, r) => t + Number(r.amount), 0)), "money")
    ],
    notes: ["Best sellers first. Keep these in stock."],
    tables: [
      table("fast", [col("item", "Item"), minor("brand", "Brand"), col("detail", "Size / Colour"), num("sold", "Sold", "qty"), num("amount", "Sales"), num("stock", "In stock", "qty", true)], rows)
    ]
  };
}

export function salesmanSummaryReport(rc: ReportCtx): ReportBody {
  const byActor = new Map<string, { staff: string; role: string; amount: number; bills: number; qty: number; due: number; returns: number }>();
  const keyOf = (by: { kind: string; id: string }) => `${by.kind}:${by.id}`;
  for (const i of periodInvoices(rc)) {
    const key = keyOf(i.by);
    const row = byActor.get(key) ?? { staff: actorName(rc.db, i.by), role: i.by.kind === "owner" ? "Owner" : "Staff", amount: 0, bills: 0, qty: 0, due: 0, returns: 0 };
    row.amount = r2(row.amount + i.totals.net);
    row.bills += 1;
    row.qty = r3(row.qty + i.totals.quantity);
    row.due = r2(row.due + i.totals.due);
    byActor.set(key, row);
  }
  for (const r of periodReturns(rc)) {
    const row = byActor.get(keyOf(r.by));
    if (row) row.returns = r2(row.returns + r.amount);
  }
  const rows = [...byActor.values()]
    .filter((r) => matches(rc, r.staff))
    .map((r) => ({ ...r, average: r.bills ? r2(r.amount / r.bills) : 0 }))
    .sort((a, b) => b.amount - a.amount);
  const top = rows[0];
  return {
    stats: [
      stat("Top seller", top ? top.staff : "—", "text", top ? { hint: `₹${top.amount.toLocaleString("en-IN")}` } : {}),
      stat("Staff billing", rows.length, "qty"),
      stat("Total sales", r2(rows.reduce((t, r) => t + r.amount, 0)), "money")
    ],
    notes: [],
    tables: [
      table(
        "staff",
        [
          col("staff", "Staff"),
          minor("role", "Role", "badge"),
          num("bills", "Bills", "qty"),
          num("qty", "Items", "qty", true),
          num("amount", "Sales"),
          { key: "average", label: "Avg bill", format: "money", hideOnMobile: true },
          num("returns", "Returns", "money", true),
          num("due", "On credit", "money", true)
        ],
        rows
      )
    ]
  };
}

export function salesmanDetailReport(rc: ReportCtx): ReportBody {
  const rows = periodInvoices(rc)
    .map((i) => ({ date: i.at, staff: actorName(rc.db, i.by), bill: i.billNumber, href: invoiceHref(i.id), customer: i.customer?.name ?? "Cash sale", qty: i.totals.quantity, amount: i.totals.net }))
    .filter((r) => matches(rc, r.staff, r.bill, r.customer));
  return {
    stats: [stat("Bills", rows.length, "qty"), stat("Sales", r2(rows.reduce((t, r) => t + r.amount, 0)), "money")],
    notes: [],
    tables: [
      table(
        "bills",
        [
          col("date", "Date", "datetime"),
          col("staff", "Billed by"),
          col("bill", "Bill", "mono", { hrefKey: "href" }),
          minor("customer", "Customer"),
          num("qty", "Qty", "qty"),
          num("amount", "Amount")
        ],
        rows
      )
    ]
  };
}

export function purchaseReport(rc: ReportCtx): ReportBody {
  const list = rc.db.purchases.filter((p) => rc.stores.includes(p.storeId) && (!rc.range || (p.date >= rc.range.from && p.date <= rc.range.to))).sort((a, b) => b.date.localeCompare(a.date));
  const paidOf = (p: (typeof list)[number]) => r2(p.payments.reduce((t, x) => t + x.amount, 0));
  const total = r2(list.reduce((t, p) => t + p.totals.total, 0));
  const due = r2(list.reduce((t, p) => t + Math.max(0, p.totals.total - paidOf(p)), 0));
  const stats = [
    stat("Purchases", total, "money"),
    stat("Bills", list.length, "qty"),
    stat("Units", r3(list.reduce((t, p) => t + p.totals.qty, 0)), "qty"),
    stat("GST paid", r2(list.reduce((t, p) => t + p.totals.gst, 0)), "money"),
    stat("Unpaid", due, "money", due ? { tone: "warning" } : {})
  ];
  const supplierName = (id: string | null) => findSupplier(rc.db, id)?.name ?? "No supplier";
  if (rc.view === "items") {
    const rows = list.flatMap((p) =>
      p.items
        .filter((i) => matches(rc, p.invoice, supplierName(p.supplierId), i.name))
        .map((i) => ({
          date: p.date,
          invoice: p.invoice || "—",
          supplier: supplierName(p.supplierId),
          item: i.name,
          detail: i.detail,
          qty: i.qty,
          rate: i.rate,
          taxable: i.taxable,
          gst: i.gst,
          total: i.total
        }))
    );
    return {
      stats,
      notes: [],
      tables: [
        table(
          "items",
          [
            col("date", "Date", "date"),
            col("invoice", "Invoice", "mono"),
            minor("supplier", "Supplier"),
            col("item", "Item"),
            minor("detail", "Details"),
            num("qty", "Qty", "qty"),
            minor("rate", "Rate", "money"),
            num("taxable", "Taxable", "money", true),
            num("gst", "GST", "money", true),
            num("total", "Total")
          ],
          rows
        )
      ]
    };
  }
  const rows = list
    .filter((p) => matches(rc, p.invoice, supplierName(p.supplierId)))
    .map((p) => ({
      date: p.date,
      invoice: p.invoice || "—",
      supplier: supplierName(p.supplierId),
      store: storeName(rc, p.storeId),
      qty: p.totals.qty,
      taxable: p.totals.taxable,
      gst: p.totals.gst,
      total: p.totals.total,
      paid: paidOf(p),
      due: r2(Math.max(0, p.totals.total - paidOf(p)))
    }));
  return {
    stats,
    notes: [],
    tables: [
      table(
        "bills",
        [
          col("date", "Date", "date"),
          col("invoice", "Invoice", "mono"),
          col("supplier", "Supplier"),
          minor("store", "Store"),
          num("qty", "Qty", "qty"),
          num("taxable", "Taxable", "money", true),
          num("gst", "GST", "money", true),
          num("total", "Total"),
          num("paid", "Paid", "money", true),
          num("due", "Due")
        ],
        rows
      )
    ]
  };
}

function lineCost(l: { unitCost: number | null; qty: number }) {
  return l.unitCost === null ? 0 : l.unitCost * l.qty;
}

export function profitSummaryReport(rc: ReportCtx): ReportBody {
  const invoices = periodInvoices(rc);
  const returns = periodReturns(rc);
  const revenue = r2(invoices.reduce((t, i) => t + i.totals.taxable, 0));
  const returned = r2(returns.reduce((t, r) => t + r.lines.reduce((s, l) => s + l.taxable, 0), 0));
  const cogs = r2(invoices.reduce((t, i) => t + i.lines.reduce((s, l) => s + lineCost(l), 0), 0));
  const returnedCost = r2(returns.reduce((t, r) => t + r.lines.reduce((s, l) => s + (rc.db.variants.find((v) => v.id === l.variantId)?.unitCost ?? 0) * l.qty, 0), 0));
  const netSales = r2(revenue - returned);
  const netCost = r2(cogs - returnedCost);
  const gross = r2(netSales - netCost);
  const purchases = rc.db.purchases.filter((p) => rc.stores.includes(p.storeId) && rc.range && p.date >= rc.range.from && p.date <= rc.range.to);
  const closing = r2(rc.db.variants.reduce((t, v) => t + Math.max(0, qtyIn(rc.db, v.id, rc.stores)) * (v.unitCost ?? 0), 0));
  const rows: ReportRow[] = [
    { line: "Sales (without GST)", amount: revenue },
    { line: "Less: returns", amount: -returned },
    { line: "Net sales", amount: netSales, emphasis: true },
    { line: "Cost of goods sold", amount: -netCost },
    { line: "Gross profit", amount: gross, emphasis: true },
    { line: "Margin", amount: pct(gross, netSales), amountFormat: "percent" },
    { line: "Purchases in this period", amount: r2(purchases.reduce((t, p) => t + p.totals.taxable, 0)) },
    { line: "Closing stock at cost", amount: closing }
  ];
  return {
    stats: [
      stat("Net sales", netSales, "money"),
      stat("Cost of goods", netCost, "money"),
      stat("Gross profit", gross, "money", { tone: gross >= 0 ? "positive" : "negative" }),
      stat("Margin", pct(gross, netSales), "percent")
    ],
    notes: ["Profit uses the latest purchase cost of each item. GST is not income, so it is left out."],
    tables: [table("summary", [col("line", "Particulars"), col("amount", "Amount", "money")], rows, { totals: null })]
  };
}

export function profitDetailReport(rc: ReportCtx): ReportBody {
  const invoices = periodInvoices(rc);
  if (rc.view === "items") {
    const byVariant = new Map<string, { item: string; detail: string; qty: number; revenue: number; cost: number }>();
    for (const l of invoices.flatMap((i) => i.lines)) {
      const row = byVariant.get(l.variantId) ?? { item: l.name, detail: l.detail, qty: 0, revenue: 0, cost: 0 };
      row.qty += l.qty;
      row.revenue += l.taxable;
      row.cost += lineCost(l);
      byVariant.set(l.variantId, row);
    }
    const rows = [...byVariant.values()]
      .filter((r) => matches(rc, r.item))
      .map((r) => ({ item: r.item, detail: r.detail, qty: r3(r.qty), revenue: r2(r.revenue), cost: r2(r.cost), profit: r2(r.revenue - r.cost), margin: pct(r.revenue - r.cost, r.revenue) }))
      .sort((a, b) => b.profit - a.profit);
    return {
      stats: [stat("Items", rows.length, "qty"), stat("Profit", r2(rows.reduce((t, r) => t + r.profit, 0)), "money", { tone: "positive" })],
      notes: [],
      tables: [
        table(
          "items",
          [
            col("item", "Item"),
            minor("detail", "Size / Colour"),
            num("qty", "Qty", "qty", true),
            num("revenue", "Sales"),
            num("cost", "Cost", "money", true),
            num("profit", "Profit"),
            num("margin", "Margin", "percent")
          ],
          rows
        )
      ]
    };
  }
  const rows = invoices
    .filter((i) => matches(rc, i.billNumber, i.customer?.name))
    .map((i) => {
      const cost = r2(i.lines.reduce((t, l) => t + lineCost(l), 0));
      return {
        date: i.at,
        bill: i.billNumber,
        href: invoiceHref(i.id),
        customer: i.customer?.name ?? "Cash sale",
        revenue: i.totals.taxable,
        cost,
        profit: r2(i.totals.taxable - cost),
        margin: pct(i.totals.taxable - cost, i.totals.taxable)
      };
    });
  const profit = r2(rows.reduce((t, r) => t + r.profit, 0));
  return {
    stats: [stat("Bills", rows.length, "qty"), stat("Profit", profit, "money", { tone: profit >= 0 ? "positive" : "negative" })],
    notes: ["Sales are shown without GST."],
    tables: [
      table(
        "bills",
        [
          col("date", "Date", "datetime"),
          col("bill", "Bill", "mono", { hrefKey: "href" }),
          minor("customer", "Customer"),
          num("revenue", "Sales"),
          num("cost", "Cost", "money", true),
          num("profit", "Profit"),
          num("margin", "Margin", "percent")
        ],
        rows
      )
    ]
  };
}
