/**
 * POST /sales business rules (lib/sale/sale-service.ts): sale, estimate and return. Money is computed
 * with the same maths the app previews with (src/lib/saleMath.ts).
 */
import type { SaleInvoice, SaleRequest, SaleResponse, SaleResponseReturn, SaleResponseSale } from "@/api/types";
import { applyInvoiceRounding, calculateSaleBill, money, settleTender, supplyPlaceFor, type SaleCalcRow } from "@/lib/saleMath";
import type { Db, DbCustomer, DbInvoice, DbInvoiceLine, DbReturn } from "../db";
import { addStock, findCustomer, findStore, findVariant, gstRateOf, partyBalance, primaryBarcode, productOf, qtyAt, storeAddress, variantDetail, actorName } from "../db";
import { financialYearOf, inr, invalid, r2, r3, reject, toNum } from "../util";
import { addLedger, fyShortAt, logActivity, nextId, pad4, qrLikeSvg, upsertCustomer, type EngineActor, type EngineOptions } from "./common";

const PAYMENT_MODES = ["cash", "upi", "card", "other"];

function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("Send the bill details.");
  return body as Record<string, unknown>;
}

export function submitSale(db: Db, actor: EngineActor, input: unknown, options: EngineOptions = {}): { status: number; response: SaleResponse } {
  const body = asObject(input) as unknown as SaleRequest;
  if (body.kind !== "sale" && body.kind !== "return") invalid("kind must be sale or return.");
  const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (key.length < 12 || key.length > 80) invalid("idempotencyKey must be 12 to 80 characters.");
  if (!Array.isArray(body.rows) || body.rows.length < 1) invalid("Add at least one item.");
  if (body.rows.length > 300) invalid("A bill can have at most 300 items.");

  const previous = db.idempotency.get(`sale:${key}`) as SaleResponse | undefined;
  if (previous) {
    if ("invoiceId" in previous) return { status: 201, response: { ...previous, message: `Bill ${previous.billNumber} was already saved. No duplicate created.` } };
    return { status: 201, response: { ...previous, message: `Return ${previous.returnNumber} was already saved. No duplicate created.` } };
  }

  const store = findStore(db, body.storeId);
  if (!store || !store.is_active || !actor.storeIds.includes(store.id)) reject("You cannot bill in this store.");
  const at = options.at ?? new Date().toISOString();
  const response = body.kind === "return" ? submitReturn(db, actor, body, at) : submitInvoice(db, actor, body, at, !!options.skipStockCheck);
  db.idempotency.set(`sale:${key}`, response);
  return { status: 201, response };
}

function resolveCustomer(db: Db, body: SaleRequest, at: string): DbCustomer | null {
  const input = body.customer ?? {};
  if (input.id) {
    const customer = findCustomer(db, input.id);
    if (!customer) reject("That customer was not found. Pick them again.");
    return customer;
  }
  return upsertCustomer(db, input, at);
}

function submitInvoice(db: Db, actor: EngineActor, body: SaleRequest, at: string, skipStockCheck: boolean): SaleResponseSale {
  const store = findStore(db, body.storeId)!;
  const estimate = body.billType === "estimate";
  const canOverride = actor.permissions.has("sale.discount_override");
  const taxType = body.taxType === "exclusive" ? "exclusive" : "inclusive";
  const extraPct = toNum(body.extraDiscountPercent ?? 0) || 0;
  const extraAmt = toNum(body.extraDiscountAmount ?? 0) || 0;
  if (!canOverride && (extraPct > 0 || extraAmt > 0)) reject("You cannot give a discount on this bill. Ask the shop owner.");

  const calcRows: SaleCalcRow[] = [];
  const picked = body.rows.map((row, index) => {
    const variant = findVariant(db, row?.variantId);
    if (!variant || !variant.active) reject(`Row ${index + 1}: this item is no longer for sale.`);
    const qty = toNum(row.qty);
    if (!(qty > 0)) reject(`Row ${index + 1}: quantity must be more than 0.`);
    const product = productOf(db, variant);
    let mrp = variant.mrp;
    let rate = variant.saleRate;
    let discountPercent = 0;
    let discountAmount = 0;
    if (canOverride) {
      const m = toNum(row.mrp);
      const r = toNum(row.rate);
      if (Number.isFinite(m) && m >= 0) mrp = m;
      if (Number.isFinite(r)) rate = r;
      if (rate < 0) reject(`Row ${index + 1}: rate cannot be negative.`);
      discountPercent = toNum(row.discountPercent ?? 0) || 0;
      discountAmount = toNum(row.discountAmount ?? 0) || 0;
    }
    const gstRate = gstRateOf(db, variant);
    calcRows.push({ qty, mrp, rate, discountPercent, discountAmount, gstRate });
    return { variant, product, qty, mrp, rate, gstRate };
  });

  const customer = resolveCustomer(db, body, at);
  const customerState = (body.customer?.state || customer?.state || "").trim();
  const supply = supplyPlaceFor(customerState, store.state);
  const roundingMode = db.settings.tax.roundingMode;
  const calc = calculateSaleBill(calcRows, taxType, supply, roundingMode, extraPct, extraAmt);
  const net = Number(calc.totals.netSale);

  const payments = Array.isArray(body.payments) ? body.payments.slice(0, 10) : [];
  for (const payment of payments) {
    if (!PAYMENT_MODES.includes(payment?.mode)) invalid("Payment mode must be cash, upi, card or other.");
    if (!(toNum(payment.amount) >= 0)) invalid("Payment amounts must be numbers.");
  }
  const tender = settleTender(net, estimate ? [] : payments.map((p) => ({ mode: p.mode, amount: String(p.amount), referenceNo: p.referenceNo })));
  let due = estimate ? 0 : Number(tender.due);
  let changeDue = estimate ? 0 : Number(tender.changeDue);
  const recorded = tender.payments.map((p) => ({ mode: p.mode, amount: Number(p.amount), reference: p.referenceNo ?? "" }));

  let advanceUsed = 0;
  if (!estimate && body.useAdvance && customer && due > 0) {
    const balance = partyBalance(db, "customer", customer.id);
    if (balance < 0) {
      advanceUsed = r2(Math.min(-balance, due));
      due = r2(due - advanceUsed);
      recorded.push({ mode: "advance", amount: advanceUsed, reference: "" });
    }
  }
  let changeToAccount = 0;
  if (!estimate && body.creditChangeToAccount && customer && changeDue > 0) {
    changeToAccount = changeDue;
    changeDue = 0;
  }
  if (due > 0 && !customer) reject(`Add the customer's name or mobile to keep ${inr(due)} as due.`);

  if (!estimate && !body.offline && !skipStockCheck) {
    const needed = new Map<string, number>();
    for (const line of picked) needed.set(line.variant.id, (needed.get(line.variant.id) ?? 0) + line.qty);
    for (const line of picked) {
      const available = qtyAt(db, line.variant.id, store.id);
      const want = needed.get(line.variant.id) ?? 0;
      if (want > available) reject(`Only ${Math.max(0, available)} of ${line.product.name} (${variantDetail(line.variant) || "Standard"}) left in ${store.name}.`);
    }
  }

  const fy = financialYearOf(new Date(at));
  const billNumber = estimate ? `EST/${fy.short}/${pad4(++store.estimateCounter)}` : `${store.invoice_prefix}/${fy.short}/${pad4(++store.billCounter)}`;
  const invoiceId = nextId();
  const lines: DbInvoiceLine[] = picked.map((line, index) => {
    const c = calc.lines[index];
    return {
      id: nextId(),
      variantId: line.variant.id,
      productId: line.product.id,
      name: line.product.name,
      brand: line.product.brand,
      detail: variantDetail(line.variant),
      hsn: line.product.hsnCode,
      barcode: primaryBarcode(line.variant) ?? "",
      qty: line.qty,
      mrp: line.mrp,
      rate: line.rate,
      discount: Number(c.discountAmount),
      taxable: Number(c.taxableValue),
      gstRate: line.gstRate,
      cgst: Number(c.cgst),
      sgst: Number(c.sgst),
      igst: Number(c.igst),
      gst: Number(c.gstAmount),
      net: Number(c.netAmount),
      unitCost: line.variant.unitCost,
      returned: 0
    };
  });
  const paid = estimate ? 0 : r2(Number(tender.paid) + advanceUsed);
  const invoice: DbInvoice = {
    id: invoiceId,
    billNumber,
    storeId: store.id,
    at,
    financialYear: fy.label,
    isEstimate: estimate,
    taxType,
    customerId: customer?.id ?? null,
    customer: customer ? { name: customer.name, mobile: customer.mobile ?? "", address: body.customer?.address || customer.address || "", state: customerState, gstin: customer.gstin ?? "" } : null,
    by: actor.ref,
    lines,
    totals: {
      quantity: Number(calc.totals.totalQuantity),
      taxable: Number(calc.totals.taxableValue),
      gst: Number(calc.totals.gstAmount),
      discount: Number(calc.totals.totalDiscount),
      roundOff: Number(calc.totals.roundOff),
      net,
      paid,
      due,
      savings: Number(calc.totals.savings),
      mrp: Number(calc.totals.totalMrp)
    },
    payments: recorded,
    interState: supply === "inter_state",
    offline: !!body.offline
  };
  db.invoices.push(invoice);

  if (!estimate) {
    for (const line of lines) addStock(db, line.variantId, store.id, -line.qty, "sale", invoiceId, at, nextId());
    if (customer) {
      const href = `/app/sale/invoices/${invoiceId}`;
      addLedger(db, { party: "customer", partyId: customer.id, at, type: "sale", label: `Bill ${billNumber}`, reference: billNumber, mode: null, increase: net, decrease: 0, href });
      const settled = r2(Number(tender.paid));
      if (settled > 0)
        addLedger(db, {
          party: "customer",
          partyId: customer.id,
          at,
          type: "sale_settlement",
          label: `Paid on bill ${billNumber}`,
          reference: billNumber,
          mode: recorded[0]?.mode ?? null,
          increase: 0,
          decrease: settled,
          href
        });
      if (advanceUsed > 0)
        addLedger(db, {
          party: "customer",
          partyId: customer.id,
          at,
          type: "customer_advance_used",
          label: `Advance used on ${billNumber}`,
          reference: billNumber,
          mode: "advance",
          increase: 0,
          decrease: advanceUsed,
          href
        });
      if (changeToAccount > 0)
        addLedger(db, {
          party: "customer",
          partyId: customer.id,
          at,
          type: "customer_advance",
          label: `Change kept as advance (${billNumber})`,
          reference: billNumber,
          mode: "cash",
          increase: 0,
          decrease: changeToAccount,
          href
        });
    }
    logActivity(db, actor.ref, "sale_created", `Bill ${billNumber}`, net, "sale_invoice", invoiceId, at);
  } else {
    logActivity(db, actor.ref, "estimate_created", `Estimate ${billNumber}`, net, "sale_invoice", invoiceId, at);
  }

  const message = estimate ? `Estimate ${billNumber} saved. Stock was not changed.` : due > 0 ? `Bill ${billNumber} saved. ${inr(due)} added to the customer's dues.` : `Bill ${billNumber} saved.`;
  return { ok: true, message, invoiceId, billNumber, estimate, changeDue: changeDue.toFixed(2), printIntent: body.printIntent ?? "none" };
}

function submitReturn(db: Db, actor: EngineActor, body: SaleRequest, at: string): SaleResponseReturn {
  const store = findStore(db, body.storeId)!;
  const original = body.originalSaleInvoiceId ? db.invoices.find((i) => i.id === body.originalSaleInvoiceId && !i.isEstimate) : undefined;
  if (body.originalSaleInvoiceId && !original) reject("The original bill was not found.");
  const taxType = body.taxType === "exclusive" ? "exclusive" : "inclusive";

  const lines = body.rows.map((row, index) => {
    const qty = toNum(row?.qty);
    if (!(qty > 0)) reject(`Row ${index + 1}: quantity must be more than 0.`);
    if (row.originalItemId) {
      const source = original ?? db.invoices.find((i) => i.lines.some((l) => l.id === row.originalItemId));
      const line = source?.lines.find((l) => l.id === row.originalItemId);
      if (!source || !line) reject(`Row ${index + 1}: this item is not on the original bill.`);
      const returnable = r3(line.qty - line.returned);
      if (qty > returnable) reject(`Only ${returnable} of ${line.name} can be returned from this bill.`);
      const share = qty / line.qty;
      return { line, variantId: line.variantId, name: line.name, qty, amount: r2(line.net * share), gstRate: line.gstRate, taxable: r2(line.taxable * share), gst: r2(line.gst * share) };
    }
    const variant = findVariant(db, row.variantId);
    if (!variant) reject(`Row ${index + 1}: this item was not found.`);
    const rate = Number.isFinite(toNum(row.rate)) ? toNum(row.rate) : variant.saleRate;
    const gstRate = gstRateOf(db, variant);
    const calc = calculateSaleBill([{ qty, mrp: variant.mrp, rate, gstRate }], taxType, "intra_state", "none");
    return {
      line: null,
      variantId: variant.id,
      name: productOf(db, variant).name,
      qty,
      amount: Number(calc.totals.netSale),
      gstRate,
      taxable: Number(calc.totals.taxableValue),
      gst: Number(calc.totals.gstAmount)
    };
  });

  const refund = Number(applyInvoiceRounding(money(lines.reduce((t, l) => t + l.amount, 0)), db.settings.tax.roundingMode).toFixed(2));
  const customerId = original?.customerId ?? body.customer?.id ?? null;
  const customer = customerId ? findCustomer(db, customerId) : undefined;
  const refundMode = body.refundMode === "credit_note" ? "credit_note" : "cash";
  if (refundMode === "credit_note" && !customer) reject("Pick the customer to give a credit note.");

  const fy = fyShortAt(at);
  const returnNumber = `SR/${fy}/${pad4(++db.counters.saleReturn)}`;
  const creditNoteNumber = refundMode === "credit_note" ? `CN/${fy}/${pad4(++db.counters.creditNote)}` : null;
  const returnId = nextId();
  for (const l of lines) {
    if (l.line) l.line.returned = r3(l.line.returned + l.qty);
    addStock(db, l.variantId, store.id, l.qty, "sale_return", returnId, at, nextId());
  }
  const record: DbReturn = {
    id: returnId,
    returnNumber,
    creditNoteNumber,
    invoiceId: original?.id ?? null,
    storeId: store.id,
    at,
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? original?.customer?.name ?? null,
    customerMobile: customer?.mobile ?? null,
    refundMode,
    amount: refund,
    qty: lines.reduce((t, l) => t + l.qty, 0),
    by: actor.ref,
    lines: lines.map((l) => ({ originalItemId: l.line?.id ?? null, variantId: l.variantId, name: l.name, qty: l.qty, amount: l.amount, gstRate: l.gstRate, taxable: l.taxable, gst: l.gst }))
  };
  db.returns.push(record);
  if (customer && refundMode === "credit_note") {
    addLedger(db, {
      party: "customer",
      partyId: customer.id,
      at,
      type: "sale_return",
      label: `Credit note ${creditNoteNumber}`,
      reference: creditNoteNumber,
      mode: "credit_note",
      increase: 0,
      decrease: refund,
      href: original ? `/app/sale/invoices/${original.id}` : null
    });
  }
  logActivity(db, actor.ref, "sale_return_created", `Return ${returnNumber}`, refund, "sale_return", returnId, at);

  const message = creditNoteNumber ? `Credit note ${creditNoteNumber} for ${inr(refund)} added to ${customer!.name}'s account.` : `Return ${returnNumber} saved. Refund ${inr(refund)} in cash.`;
  return { ok: true, message, returnId, returnNumber, ...(creditNoteNumber ? { creditNoteNumber } : {}), refundAmount: refund.toFixed(2) };
}

// ---------------------------------------------------------------------------------------------------
// GET /sales/{id}
// ---------------------------------------------------------------------------------------------------
export function toSaleInvoice(db: Db, invoice: DbInvoice): SaleInvoice {
  const store = findStore(db, invoice.storeId)!;
  const s = db.settings;
  const bySlab = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const line of invoice.lines) {
    const slab = bySlab.get(line.gstRate) ?? { rate: line.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    slab.taxable += line.taxable;
    slab.cgst += line.cgst;
    slab.sgst += line.sgst;
    slab.igst += line.igst;
    bySlab.set(line.gstRate, slab);
  }
  const upiAmount = invoice.isEstimate ? invoice.totals.net : invoice.totals.due;
  const upiId = s.invoice.upiId;
  let upi: SaleInvoice["upi"] = null;
  if (upiId && s.invoice.showUpiQr && upiAmount > 0) {
    const uri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(s.invoice.payeeName || s.profile.displayName)}&am=${upiAmount.toFixed(2)}&cu=INR`;
    upi = { svg: qrLikeSvg(uri), uri, amount: upiAmount, upiId };
  }
  return {
    id: invoice.id,
    billNumber: invoice.billNumber,
    date: invoice.at,
    financialYear: invoice.financialYear,
    isEstimate: invoice.isEstimate,
    status: invoice.isEstimate ? "draft" : "posted",
    taxType: invoice.taxType,
    shop: { name: s.profile.displayName, legalName: s.tax.legalName, gstin: store.gstin || s.tax.gstin || "" },
    store: { name: store.name, address: storeAddress(store), state: store.state ?? "", phone: store.contact_phone ?? "" },
    customer: invoice.customer,
    soldBy: invoice.by.kind === "worker" ? actorName(db, invoice.by) : null,
    lines: invoice.lines.map((l) => ({
      id: l.id,
      name: l.name,
      brand: l.brand,
      detail: l.detail,
      hsn: l.hsn,
      barcode: l.barcode,
      qty: l.qty,
      mrp: l.mrp,
      rate: l.rate,
      discount: l.discount,
      taxable: l.taxable,
      gstRate: l.gstRate,
      cgst: l.cgst,
      sgst: l.sgst,
      igst: l.igst,
      gst: l.gst,
      net: l.net
    })),
    gstSummary: [...bySlab.values()].sort((a, b) => a.rate - b.rate),
    interState: invoice.interState,
    totals: {
      quantity: invoice.totals.quantity,
      taxable: invoice.totals.taxable,
      gst: invoice.totals.gst,
      discount: invoice.totals.discount,
      roundOff: invoice.totals.roundOff,
      net: invoice.totals.net,
      paid: invoice.totals.paid,
      due: invoice.totals.due,
      savings: invoice.totals.savings
    },
    payments: invoice.payments.map((p) => ({ mode: p.mode, amount: p.amount, reference: p.reference })),
    terms: s.invoice.terms,
    printFormat: s.invoice.printFormat,
    bank: s.invoice.accountNumber && s.invoice.ifsc ? { name: s.invoice.bankName, accountName: s.invoice.accountName, accountNumber: s.invoice.accountNumber, ifsc: s.invoice.ifsc } : null,
    upi
  };
}
