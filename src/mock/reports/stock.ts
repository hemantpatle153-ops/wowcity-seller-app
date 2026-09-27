/** Stock, GST and dues/customer reports. */
import type { ReportRow } from "@/api/types";
import { findCustomer, findStore, findSupplier, partyBalance, productOf, qtyAt, qtyIn, variantDetail } from "../db";
import { customerStats } from "../routes/people";
import { addDays, daysBetween, inRange, r2, r3, startOfDay } from "../util";
import { col, matches, minor, num, periodInvoices, periodReturns, stat, table, type ReportBody, type ReportCtx } from "./shared";

const LOW = 5;

// ---------------------------------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------------------------------
export function stockReport(rc: ReportCtx): ReportBody {
  const { db } = rc;
  const items = db.variants
    .filter((v) => v.active)
    .map((v) => {
      const p = productOf(db, v);
      const qty = qtyIn(db, v.id, rc.stores);
      return { v, p, qty, cost: r2(Math.max(0, qty) * (v.unitCost ?? 0)), mrpValue: r2(Math.max(0, qty) * v.mrp) };
    });
  const positive = items.filter((i) => i.qty > 0);
  const stats = [
    stat("Items in stock", positive.length, "qty"),
    stat("Units", r3(positive.reduce((t, i) => t + i.qty, 0)), "qty"),
    stat("Value at cost", r2(positive.reduce((t, i) => t + i.cost, 0)), "money"),
    stat("Value at MRP", r2(positive.reduce((t, i) => t + i.mrpValue, 0)), "money"),
    stat("Low stock", items.filter((i) => i.qty > 0 && i.qty <= LOW).length, "qty", { tone: "warning", hint: `${LOW} or fewer left` }),
    stat("Out of stock", items.filter((i) => i.qty <= 0).length, "qty", { tone: "negative" })
  ];
  const view = rc.view ?? "in";
  if (view === "stores") {
    const rows = rc.stores.map((storeId) => {
      const here = db.variants.map((v) => ({ v, qty: qtyAt(db, v.id, storeId) })).filter((x) => x.qty > 0);
      return {
        store: findStore(db, storeId)?.name ?? "",
        skus: here.length,
        units: r3(here.reduce((t, x) => t + x.qty, 0)),
        cost: r2(here.reduce((t, x) => t + x.qty * (x.v.unitCost ?? 0), 0)),
        mrp: r2(here.reduce((t, x) => t + x.qty * x.v.mrp, 0))
      };
    });
    return {
      stats,
      notes: [],
      tables: [table("stores", [col("store", "Store"), num("skus", "Items", "qty"), num("units", "Units", "qty"), num("cost", "At cost", "money", true), num("mrp", "At MRP")], rows)]
    };
  }
  if (view === "products") {
    const byProduct = new Map<string, ReportRow & { units: number; cost: number; mrp: number; variants: number }>();
    for (const i of positive) {
      if (!matches(rc, i.p.name, i.p.brand, i.p.category)) continue;
      const row = byProduct.get(i.p.id) ?? { product: i.p.name, brand: i.p.brand, category: i.p.category, variants: 0, units: 0, cost: 0, mrp: 0 };
      row.variants += 1;
      row.units = r3(row.units + i.qty);
      row.cost = r2(row.cost + i.cost);
      row.mrp = r2(row.mrp + i.mrpValue);
      byProduct.set(i.p.id, row);
    }
    const rows = [...byProduct.values()].sort((a, b) => b.units - a.units);
    return {
      stats,
      notes: [],
      tables: [
        table(
          "products",
          [
            col("product", "Product"),
            minor("brand", "Brand"),
            minor("category", "Category"),
            num("variants", "Variants", "qty", true),
            num("units", "Units", "qty"),
            num("cost", "At cost", "money", true),
            num("mrp", "At MRP")
          ],
          rows
        )
      ]
    };
  }
  const chosen = items.filter((i) => (view === "out" ? i.qty <= 0 : view === "all" ? true : i.qty > 0) && matches(rc, i.p.name, i.p.brand, i.v.barcodes[0]?.barcode, i.v.colour));
  const rows = chosen
    .sort((a, b) => a.p.name.localeCompare(b.p.name))
    .map((i) => ({ item: i.p.name, brand: i.p.brand, detail: variantDetail(i.v), barcode: i.v.barcodes[0]?.barcode ?? "", qty: i.qty, cost: i.cost, mrp: i.mrpValue }));
  return {
    stats,
    notes: view === "out" ? ["Items with no stock in the selected stores."] : [],
    tables: [
      table(
        view,
        [
          col("item", "Item"),
          minor("brand", "Brand"),
          col("detail", "Size / Colour"),
          minor("barcode", "Barcode", "mono"),
          num("qty", "Qty", "qty"),
          num("cost", "At cost", "money", true),
          num("mrp", "At MRP")
        ],
        rows,
        { emptyText: view === "out" ? "Nothing is out of stock." : "No items." }
      )
    ]
  };
}

export function stockAnalysisReport(rc: ReportCtx): ReportBody {
  const { db } = rc;
  const range = rc.range!;
  const rows: ReportRow[] = [];
  for (const v of db.variants) {
    const moves = db.movements.filter((m) => m.variantId === v.id && rc.stores.includes(m.storeId));
    const within = moves.filter((m) => inRange(m.at, range));
    if (!within.length) continue;
    const p = productOf(db, v);
    if (!matches(rc, p.name, p.brand)) continue;
    const after = moves.filter((m) => new Date(m.at).getTime() >= range.end).reduce((t, m) => t + m.qty, 0);
    const closing = r3(qtyIn(db, v.id, rc.stores) - after);
    const by = (type: string) => r3(within.filter((m) => m.type === type).reduce((t, m) => t + m.qty, 0));
    const purchased = by("purchase");
    const sold = -by("sale");
    const returned = by("sale_return");
    const other = r3(within.reduce((t, m) => t + m.qty, 0) - purchased + sold - returned);
    rows.push({ item: p.name, detail: variantDetail(v), opening: Math.max(0, r3(closing - (purchased - sold + returned + other))), purchased, sold, returned, other, closing });
  }
  rows.sort((a, b) => Number(b.sold) - Number(a.sold));
  return {
    stats: [
      stat("Items moved", rows.length, "qty"),
      stat("Units in", r3(rows.reduce((t, r) => t + Number(r.purchased) + Number(r.returned), 0)), "qty"),
      stat("Units sold", r3(rows.reduce((t, r) => t + Number(r.sold), 0)), "qty")
    ],
    notes: ["Other = transfers, write-offs, corrections and returns to suppliers."],
    tables: [
      table(
        "movement",
        [
          col("item", "Item"),
          minor("detail", "Size / Colour"),
          num("opening", "Opening", "qty", true),
          num("purchased", "In", "qty"),
          num("sold", "Sold", "qty"),
          num("returned", "Returned", "qty", true),
          num("other", "Other", "qty", true),
          num("closing", "Closing", "qty")
        ],
        rows,
        { emptyText: "No stock moved in this period." }
      )
    ]
  };
}

export function dumpedStockReport(rc: ReportCtx): ReportBody {
  const { db } = rc;
  const list = db.adjustments.filter((a) => rc.stores.includes(a.storeId) && inRange(a.at, rc.range!) && (rc.view === "all" || a.direction === "remove")).sort((a, b) => b.at.localeCompare(a.at));
  const reasons: Record<string, string> = {
    damaged: "Damaged",
    lost: "Lost",
    found: "Found",
    count_correction: "Count correction",
    returned_to_supplier: "Returned to supplier",
    sample: "Sample",
    other: "Other"
  };
  const rows = list
    .map((a) => {
      const v = db.variants.find((x) => x.id === a.variantId)!;
      const p = productOf(db, v);
      const qty = a.direction === "remove" ? -a.qty : a.qty;
      return {
        date: a.at,
        item: p.name,
        detail: variantDetail(v),
        store: findStore(db, a.storeId)?.name ?? "",
        reason: reasons[a.reason] ?? a.reason,
        reasonFormat: "badge",
        qty,
        value: r2(qty * (v.unitCost ?? 0)),
        note: a.note
      };
    })
    .filter((r) => matches(rc, r.item, r.note));
  const lost = r2(rows.filter((r) => r.qty < 0).reduce((t, r) => t - r.value, 0));
  return {
    stats: [
      stat("Entries", rows.length, "qty"),
      stat("Units written off", r3(rows.filter((r) => r.qty < 0).reduce((t, r) => t - r.qty, 0)), "qty"),
      stat("Loss at cost", lost, "money", lost ? { tone: "negative" } : {})
    ],
    notes: [],
    tables: [
      table(
        rc.view ?? "out",
        [
          col("date", "Date", "datetime"),
          col("item", "Item"),
          minor("detail", "Size / Colour"),
          minor("store", "Store"),
          col("reason", "Reason"),
          num("qty", "Qty", "qty"),
          num("value", "At cost", "money", true),
          minor("note", "Note")
        ],
        rows,
        { emptyText: "No stock was written off in this period." }
      )
    ]
  };
}

export function stockTransferReport(rc: ReportCtx): ReportBody {
  const { db } = rc;
  const list = db.transfers.filter((t) => inRange(t.at, rc.range!) && (rc.stores.includes(t.fromStoreId) || rc.stores.includes(t.toStoreId))).sort((a, b) => b.at.localeCompare(a.at));
  const name = (id: string) => findStore(db, id)?.name ?? "";
  const stats = [stat("Challans", list.length, "qty"), stat("Units moved", r3(list.reduce((t, x) => t + x.qty, 0)), "qty")];
  if (rc.view === "items") {
    const rows = list
      .map((t) => {
        const v = db.variants.find((x) => x.id === t.variantId)!;
        return { date: t.at, challan: t.challan, item: productOf(db, v).name, detail: variantDetail(v), qty: t.qty };
      })
      .filter((r) => matches(rc, r.challan, r.item));
    return {
      stats,
      notes: [],
      tables: [
        table("items", [col("date", "Date", "datetime"), col("challan", "Challan", "mono"), col("item", "Item"), minor("detail", "Size / Colour"), num("qty", "Qty", "qty")], rows, {
          emptyText: "No transfers in this period."
        })
      ]
    };
  }
  const rows = list.map((t) => ({ date: t.at, challan: t.challan, from: name(t.fromStoreId), to: name(t.toStoreId), items: 1, qty: t.qty })).filter((r) => matches(rc, r.challan, r.from, r.to));
  return {
    stats,
    notes: [],
    tables: [
      table(
        "challans",
        [col("date", "Date", "datetime"), col("challan", "Challan", "mono"), col("from", "From"), col("to", "To"), num("items", "Items", "qty", true), num("qty", "Qty", "qty")],
        rows,
        { emptyText: "No transfers in this period." }
      )
    ]
  };
}

export function emptyStockReport(key: string, emptyText: string, columns = [col("item", "Item"), col("detail", "Size / Colour"), num("qty", "Qty", "qty")]) {
  return (): ReportBody => ({ stats: [stat("Entries", 0, "qty")], notes: [], tables: [table(key, columns, [], { emptyText })] });
}

// ---------------------------------------------------------------------------------------------------
// GST
// ---------------------------------------------------------------------------------------------------
export function gstr1Report(rc: ReportCtx): ReportBody {
  const invoices = periodInvoices(rc);
  const lines = invoices.flatMap((i) => i.lines.map((l) => ({ i, l })));
  const t = (pick: (l: (typeof lines)[number]["l"]) => number) => r2(lines.reduce((s, x) => s + pick(x.l), 0));
  const b2b = invoices
    .filter((i) => i.customer?.gstin)
    .map((i) => ({
      gstin: i.customer!.gstin,
      customer: i.customer!.name,
      bill: i.billNumber,
      date: i.at,
      taxable: i.totals.taxable,
      igst: r2(i.lines.reduce((s, l) => s + l.igst, 0)),
      cgst: r2(i.lines.reduce((s, l) => s + l.cgst, 0)),
      sgst: r2(i.lines.reduce((s, l) => s + l.sgst, 0)),
      net: i.totals.net
    }));
  const b2cMap = new Map<string, ReportRow & { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const { i, l } of lines) {
    if (i.customer?.gstin) continue;
    const place = i.interState ? i.customer?.state || "Other state" : findStore(rc.db, i.storeId)?.state || "";
    const key = `${l.gstRate}|${place}`;
    const row = b2cMap.get(key) ?? { rate: l.gstRate, place, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    row.taxable = r2(row.taxable + l.taxable);
    row.cgst = r2(row.cgst + l.cgst);
    row.sgst = r2(row.sgst + l.sgst);
    row.igst = r2(row.igst + l.igst);
    b2cMap.set(key, row);
  }
  const hsnMap = new Map<string, ReportRow & { qty: number; taxable: number; tax: number }>();
  for (const { l } of lines) {
    const row = hsnMap.get(`${l.hsn}|${l.gstRate}`) ?? { hsn: l.hsn || "—", rate: l.gstRate, qty: 0, taxable: 0, tax: 0 };
    row.qty = r3(row.qty + l.qty);
    row.taxable = r2(row.taxable + l.taxable);
    row.tax = r2(row.tax + l.gst);
    hsnMap.set(`${l.hsn}|${l.gstRate}`, row);
  }
  const credit = periodReturns(rc).map((r) => ({
    number: r.creditNoteNumber ?? r.returnNumber,
    date: r.at,
    taxable: r2(r.lines.reduce((s, l) => s + l.taxable, 0)),
    gst: r2(r.lines.reduce((s, l) => s + l.gst, 0)),
    amount: r.amount
  }));
  return {
    stats: [
      stat("Invoices", invoices.length, "qty"),
      stat(
        "Taxable value",
        t((l) => l.taxable),
        "money"
      ),
      stat(
        "CGST",
        t((l) => l.cgst),
        "money"
      ),
      stat(
        "SGST",
        t((l) => l.sgst),
        "money"
      ),
      stat(
        "IGST",
        t((l) => l.igst),
        "money"
      ),
      stat(
        "Total tax",
        t((l) => l.gst),
        "money"
      )
    ],
    notes: ["B2C: bills to customers without a GSTIN, grouped by rate and place of supply.", "Check these figures with your CA before filing."],
    tables: [
      table(
        "b2b",
        [
          col("gstin", "GSTIN", "mono"),
          col("customer", "Customer"),
          col("bill", "Invoice", "mono"),
          minor("date", "Date", "date"),
          num("taxable", "Taxable"),
          num("igst", "IGST", "money", true),
          num("cgst", "CGST", "money", true),
          num("sgst", "SGST", "money", true),
          num("net", "Invoice value")
        ],
        b2b,
        { title: "B2B invoices", emptyText: "No bills to GST-registered customers." }
      ),
      table(
        "b2cs",
        [col("place", "Place of supply"), { key: "rate", label: "Rate", format: "percent" }, num("taxable", "Taxable"), num("cgst", "CGST"), num("sgst", "SGST"), num("igst", "IGST")],
        [...b2cMap.values()].sort((a, b) => Number(a.rate) - Number(b.rate)),
        { title: "B2C (small)" }
      ),
      table(
        "hsn",
        [col("hsn", "HSN", "mono"), { key: "rate", label: "Rate", format: "percent" }, num("qty", "Qty", "qty"), num("taxable", "Taxable"), num("tax", "Tax")],
        [...hsnMap.values()].sort((a, b) => String(a.hsn).localeCompare(String(b.hsn))),
        { title: "HSN summary" }
      ),
      table("cdnr", [col("number", "Note", "mono"), col("date", "Date", "date"), num("taxable", "Taxable"), num("gst", "GST"), num("amount", "Amount")], credit, {
        title: "Credit notes & returns",
        emptyText: "No returns in this period."
      })
    ]
  };
}

function purchaseTax(rc: ReportCtx) {
  const home = rc.db.settings.tax.state;
  return rc.db.purchases
    .filter((p) => rc.stores.includes(p.storeId) && p.date >= rc.range!.from && p.date <= rc.range!.to)
    .map((p) => {
      const supplier = findSupplier(rc.db, p.supplierId);
      const inter = !!supplier?.state && supplier.state !== home;
      return { p, supplier, inter, igst: inter ? p.totals.gst : 0, cgst: inter ? 0 : r2(p.totals.gst / 2), sgst: inter ? 0 : r2(p.totals.gst - r2(p.totals.gst / 2)) };
    });
}

export function gstr2Report(rc: ReportCtx): ReportBody {
  const list = purchaseTax(rc);
  const rows = list
    .map((x) => ({
      supplier: x.supplier?.name ?? "No supplier",
      gstin: x.supplier?.gstin || "—",
      invoice: x.p.invoice || "—",
      date: x.p.date,
      taxable: x.p.totals.taxable,
      igst: x.igst,
      cgst: x.cgst,
      sgst: x.sgst,
      total: x.p.totals.total
    }))
    .filter((r) => matches(rc, r.supplier, r.gstin, r.invoice));
  const itc = r2(list.reduce((t, x) => t + x.p.totals.gst, 0));
  return {
    stats: [
      stat("Purchase bills", list.length, "qty"),
      stat("Taxable value", r2(list.reduce((t, x) => t + x.p.totals.taxable, 0)), "money"),
      stat("Input tax credit", itc, "money", { tone: "positive" })
    ],
    notes: ["Match these bills with GSTR-2B on the GST portal before claiming credit."],
    tables: [
      table(
        "bills",
        [
          col("supplier", "Supplier"),
          col("gstin", "GSTIN", "mono"),
          col("invoice", "Invoice", "mono"),
          minor("date", "Date", "date"),
          num("taxable", "Taxable"),
          num("igst", "IGST", "money", true),
          num("cgst", "CGST", "money", true),
          num("sgst", "SGST", "money", true),
          num("total", "Total")
        ],
        rows,
        { emptyText: "No purchase bills in this period." }
      )
    ]
  };
}

export function gstr3bReport(rc: ReportCtx): ReportBody {
  const lines = periodInvoices(rc).flatMap((i) => i.lines);
  const out = {
    taxable: r2(lines.reduce((t, l) => t + l.taxable, 0)),
    igst: r2(lines.reduce((t, l) => t + l.igst, 0)),
    cgst: r2(lines.reduce((t, l) => t + l.cgst, 0)),
    sgst: r2(lines.reduce((t, l) => t + l.sgst, 0))
  };
  const purchases = purchaseTax(rc);
  const itc = {
    taxable: r2(purchases.reduce((t, x) => t + x.p.totals.taxable, 0)),
    igst: r2(purchases.reduce((t, x) => t + x.igst, 0)),
    cgst: r2(purchases.reduce((t, x) => t + x.cgst, 0)),
    sgst: r2(purchases.reduce((t, x) => t + x.sgst, 0))
  };
  const outTax = r2(out.igst + out.cgst + out.sgst);
  const itcTax = r2(itc.igst + itc.cgst + itc.sgst);
  const payable = r2(Math.max(0, outTax - itcTax));
  const rows: ReportRow[] = [
    { section: "3.1(a) Outward taxable supplies", ...out, total: outTax },
    { section: "4(A)(5) Input tax credit — all other", ...itc, total: itcTax },
    {
      section: "Net GST payable (before set-off rules)",
      taxable: null,
      igst: r2(Math.max(0, out.igst - itc.igst)),
      cgst: r2(Math.max(0, out.cgst - itc.cgst)),
      sgst: r2(Math.max(0, out.sgst - itc.sgst)),
      total: payable,
      emphasis: true
    }
  ];
  return {
    stats: [stat("Output tax", outTax, "money"), stat("Input credit", itcTax, "money"), stat("Estimated payable", payable, "money", { tone: payable > 0 ? "warning" : "positive" })],
    notes: ["A simplified summary. Your CA applies the IGST/CGST/SGST set-off order when filing."],
    tables: [
      table(
        "summary",
        [
          col("section", "Section"),
          col("taxable", "Taxable", "money"),
          col("igst", "IGST", "money", { hideOnMobile: true }),
          col("cgst", "CGST", "money", { hideOnMobile: true }),
          col("sgst", "SGST", "money", { hideOnMobile: true }),
          col("total", "Tax", "money")
        ],
        rows,
        { totals: null }
      )
    ]
  };
}

// ---------------------------------------------------------------------------------------------------
// Dues & customers
// ---------------------------------------------------------------------------------------------------
export function partyDueReport(party: "customer" | "supplier") {
  return (rc: ReportCtx): ReportBody => {
    const { db } = rc;
    const now = new Date();
    const list = party === "customer" ? db.customers.map((c) => ({ id: c.id, name: c.name, mobile: c.mobile })) : db.suppliers.map((s) => ({ id: s.id, name: s.name, mobile: s.mobile || null }));
    const minAge = rc.view && rc.view !== "any" ? Number(rc.view) : 0;
    const rows = list
      .map((p) => {
        const balance = partyBalance(db, party, p.id);
        const increases = db.ledger
          .filter((e) => e.party === party && e.partyId === p.id && e.increase > 0)
          .map((e) => e.at)
          .sort();
        const since = increases[increases.length - 1] ?? null;
        return { name: p.name, href: `/app/dues/${party}/${p.id}`, mobile: p.mobile ?? "", balance, since, age: since ? daysBetween(new Date(since), now) : 0 };
      })
      .filter((r) => r.balance > 0 && r.age >= minAge && matches(rc, r.name, r.mobile))
      .sort((a, b) => b.balance - a.balance);
    const total = r2(rows.reduce((t, r) => t + r.balance, 0));
    return {
      stats: [
        stat(party === "customer" ? "Customers owing" : "Suppliers to pay", rows.length, "qty"),
        stat("Total due", total, "money", total ? { tone: "warning" } : {}),
        stat("Oldest", rows.length ? Math.max(...rows.map((r) => r.age)) : 0, "qty", { hint: "days since the last bill" })
      ],
      notes: minAge ? [`Only balances whose last bill is at least ${minAge} days old.`] : [],
      tables: [
        table(
          "dues",
          [
            col("name", party === "customer" ? "Customer" : "Supplier", "text", { hrefKey: "href" }),
            minor("mobile", "Mobile", "mono"),
            num("balance", "Due"),
            minor("since", "Last bill", "date"),
            col("age", "Days", "qty")
          ],
          rows,
          { emptyText: "Nobody owes anything here." }
        )
      ]
    };
  };
}

export function partyOutstandingReport(party: "customer" | "supplier") {
  return (rc: ReportCtx): ReportBody => {
    const { db } = rc;
    const range = rc.range!;
    const list = party === "customer" ? db.customers.map((c) => ({ id: c.id, name: c.name })) : db.suppliers.map((s) => ({ id: s.id, name: s.name }));
    const rows = list
      .map((p) => {
        const entries = db.ledger.filter((e) => e.party === party && e.partyId === p.id);
        const before = entries.filter((e) => new Date(e.at).getTime() < range.start);
        const within = entries.filter((e) => inRange(e.at, range));
        const opening = r2(before.reduce((t, e) => t + e.increase - e.decrease, 0));
        const increase = r2(within.reduce((t, e) => t + e.increase, 0));
        const decrease = r2(within.reduce((t, e) => t + e.decrease, 0));
        return { name: p.name, href: `/app/dues/${party}/${p.id}`, opening, increase, decrease, closing: r2(opening + increase - decrease) };
      })
      .filter((r) => (rc.view === "all" ? r.opening || r.increase || r.decrease : r.closing !== 0) && matches(rc, r.name))
      .sort((a, b) => b.closing - a.closing);
    return {
      stats: [
        stat("Opening", r2(rows.reduce((t, r) => t + r.opening, 0)), "money"),
        stat(party === "customer" ? "Billed on credit" : "Purchased", r2(rows.reduce((t, r) => t + r.increase, 0)), "money"),
        stat(party === "customer" ? "Received" : "Paid", r2(rows.reduce((t, r) => t + r.decrease, 0)), "money"),
        stat("Closing", r2(rows.reduce((t, r) => t + r.closing, 0)), "money")
      ],
      notes: ["Negative closing means an advance."],
      tables: [
        table(
          rc.view ?? "open",
          [
            col("name", party === "customer" ? "Customer" : "Supplier", "text", { hrefKey: "href" }),
            num("opening", "Opening", "money", true),
            num("increase", party === "customer" ? "Billed" : "Purchased"),
            num("decrease", party === "customer" ? "Received" : "Paid"),
            num("closing", "Closing")
          ],
          rows
        )
      ]
    };
  };
}

export function customerReport(rc: ReportCtx): ReportBody {
  const { db } = rc;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const lapsedBefore = addDays(startOfDay(new Date()), -60).toISOString();
  const all = db.customers.map((c) => customerStats(db, c));
  const view = rc.view ?? "top";
  const rows = all
    .filter(
      (c) =>
        (view === "top" ? c.bills > 0 : view === "lapsed" ? c.createdAt < lapsedBefore && (!c.lastVisit || c.lastVisit < lapsedBefore) : view === "new" ? c.createdAt >= monthStart : true) &&
        matches(rc, c.name, c.mobile, c.city)
    )
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name))
    .slice(0, view === "top" ? 50 : 5000)
    .map((c) => ({
      name: c.name,
      href: findCustomer(db, c.id) ? `/app/dues/customer/${c.id}` : null,
      mobile: c.mobile ?? "",
      city: c.city ?? "",
      bills: c.bills,
      spent: c.spent,
      lastVisit: c.lastVisit,
      balance: c.balance
    }));
  return {
    stats: [
      stat("Customers", all.length, "qty"),
      stat("Buyers", all.filter((c) => c.bills > 0).length, "qty"),
      stat("Repeat buyers", all.filter((c) => c.bills >= 2).length, "qty", { tone: "positive" }),
      stat("Total spent", r2(all.reduce((t, c) => t + c.spent, 0)), "money")
    ],
    notes: view === "lapsed" ? ["No purchase in the last 60 days. Send them a festive offer on WhatsApp."] : [],
    tables: [
      table(
        view,
        [
          col("name", "Customer", "text", { hrefKey: "href" }),
          minor("mobile", "Mobile", "mono"),
          minor("city", "City"),
          num("bills", "Bills", "qty"),
          num("spent", "Spent"),
          minor("lastVisit", "Last visit", "date"),
          num("balance", "Balance", "money", true)
        ],
        rows,
        { emptyText: "No customers here." }
      )
    ]
  };
}
