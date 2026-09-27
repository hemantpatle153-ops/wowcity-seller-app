/**
 * POST /purchases and POST /purchases/{id}/returns (app/app/purchase/actions.ts): restock or create
 * variants, record the supplier bill, payments and an optional label print job.
 */
import type { PurchaseRequest, PurchaseResponse, PurchaseReturnBody, PurchaseReturnResponse, PurchaseRowInput } from "@/api/types";
import type { Db, DbProduct, DbPurchase, DbPurchaseItem, DbSupplier, DbVariant } from "../db";
import { addStock, findStore, findSupplier, gstCodeForRate, productOf, qtyAt, touchTime } from "../db";
import { ean13, inr, invalid, isoDate, parseIsoDate, r2, r3, reject, startOfDay, addDays } from "../util";
import { addLedger, fyShortAt, logActivity, nextId, pad4, type EngineActor, type EngineOptions } from "./common";

function pnum(value: unknown, label: string, row: number): number {
  if (value === undefined || value === null || value === "") return 0;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,3})?$/.test(text)) reject(`Row ${row}: ${label} must be a number.`);
  return Number(text);
}

export function nextBarcode(db: Db): string {
  let code = "";
  do {
    db.counters.barcode += 1;
    code = ean13(`89012345${String(db.counters.barcode).padStart(4, "0")}`);
  } while (db.variants.some((v) => v.barcodes.some((b) => b.barcode === code)));
  return code;
}

export function findByBarcode(db: Db, barcode: string): DbVariant | undefined {
  const needle = barcode.trim().toUpperCase();
  if (!needle) return undefined;
  return db.variants.find((v) => v.barcodes.some((b) => b.barcode.toUpperCase() === needle));
}

function resolveSupplier(db: Db, body: PurchaseRequest, at: string): DbSupplier | null {
  if (body.supplierId) {
    const supplier = findSupplier(db, body.supplierId);
    if (!supplier) reject("That supplier was not found.");
    return supplier;
  }
  const name = (body.supplierName ?? "").trim().slice(0, 120);
  if (!name) return null;
  const existing = db.suppliers.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const supplier: DbSupplier = { id: nextId(), name, mobile: "", gstin: "", state: "", address: "", active: true, createdAt: at };
  db.suppliers.push(supplier);
  return supplier;
}

function slabFor(db: Db, row: PurchaseRowInput, gstRate: number) {
  return db.settings.gstSlabs.find((s) => s.code === row.gstCode) ?? db.settings.gstSlabs.find((s) => s.rate === gstRate) ?? null;
}

/** Restock a known barcode, or reuse/create the product and variant for a new item. */
function resolveVariant(db: Db, row: PurchaseRowInput, prices: { mrp: number; saleRate: number; gstCode: string; unitCost: number }, at: string): DbVariant {
  const entry = (row.entry ?? "").trim().toUpperCase();
  const known = findByBarcode(db, entry);
  const stamp = touchTime(db);
  if (known) {
    const product = productOf(db, known);
    if (prices.mrp > 0) known.mrp = prices.mrp;
    if (prices.saleRate > 0) known.saleRate = prices.saleRate;
    known.gstCode = prices.gstCode || known.gstCode;
    if (row.hsnCode) product.hsnCode = row.hsnCode;
    known.unitCost = prices.unitCost;
    known.changedAt = stamp;
    return known;
  }
  const name = row.itemName.trim();
  const brand = (row.brand ?? "").trim();
  let product = db.products.find((p) => p.name.toLowerCase() === name.toLowerCase() && p.brand.toLowerCase() === brand.toLowerCase());
  if (!product) {
    const created: DbProduct = {
      id: nextId(),
      name,
      brand,
      category: (row.category ?? "").trim(),
      hsnCode: row.hsnCode ?? "",
      active: true,
      createdAt: at,
      listing: { enabled: false, storeIds: [], fields: ["product_name", "brand", "size", "colour", "mrp", "sale_rate"], description: (row.description ?? "").trim(), tags: row.tags ?? [] },
      images: []
    };
    db.products.push(created);
    product = created;
  }
  const size = (row.size ?? "").trim();
  const colour = (row.colour ?? "").trim();
  const style = (row.style ?? "").trim();
  const same = db.variants.find((v) => v.productId === product.id && v.size === size && v.colour === colour && v.style === style);
  if (same) {
    if (entry) same.barcodes.push({ id: nextId(), barcode: entry });
    same.mrp = prices.mrp || same.mrp;
    same.saleRate = prices.saleRate || same.saleRate;
    same.unitCost = prices.unitCost;
    same.changedAt = stamp;
    return same;
  }
  const variant: DbVariant = {
    id: nextId(),
    productId: product.id,
    size,
    colour,
    style,
    mrp: prices.mrp,
    saleRate: prices.saleRate || prices.mrp,
    gstCode: prices.gstCode,
    active: true,
    barcodes: [{ id: nextId(), barcode: entry || nextBarcode(db) }],
    unitCost: prices.unitCost,
    internalDescription: null,
    customValues: {},
    tags: row.tags ?? [],
    createdAt: at,
    changedAt: stamp
  };
  db.variants.push(variant);
  return variant;
}

export function submitPurchase(db: Db, actor: EngineActor, input: unknown, options: EngineOptions = {}): { status: number; response: PurchaseResponse } {
  if (!input || typeof input !== "object") invalid("Send the purchase details.");
  const body = input as PurchaseRequest;
  const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (key.length < 12 || key.length > 80) invalid("idempotencyKey must be 12 to 80 characters.");
  const previous = db.idempotency.get(`purchase:${key}`) as PurchaseResponse | undefined;
  if (previous) return { status: 201, response: { ...previous, message: "This purchase was already saved. No duplicate was created." } };

  const store = findStore(db, body.storeId);
  if (!store || !store.is_active || !actor.storeIds.includes(store.id)) reject("Pick a store you can add stock to.");
  const date = parseIsoDate(body.purchaseDate);
  if (!date) reject("Enter the purchase date.");
  if (date > addDays(startOfDay(new Date()), 1)) reject("The purchase date cannot be in the future.");
  if (!Array.isArray(body.rows) || body.rows.length === 0) reject("Add at least one item.");
  if (body.rows.length > 500) reject("A purchase can have at most 500 rows.");
  const pricing = body.gstPricingMode === "inclusive" ? "inclusive" : "exclusive";
  const at = options.at ?? new Date().toISOString();

  // Validate every row before changing anything.
  const parsed = body.rows.map((row, i) => {
    const n = i + 1;
    if (!row || typeof row.itemName !== "string" || !row.itemName.trim()) reject(`Row ${n}: item name is required.`);
    if (row.itemName.trim().length > 160) reject(`Row ${n}: item name is too long.`);
    if (row.hsnCode && !/^\d{4,8}$/.test(row.hsnCode)) reject(`Row ${n}: HSN must be 4 to 8 digits`);
    const qty = pnum(row.qty, "quantity", n);
    if (!(qty > 0)) reject(`Row ${n}: quantity must be more than 0.`);
    const rate = pnum(row.purchaseRate, "purchase rate", n);
    const d1p = pnum(row.disc1Percent, "discount %", n);
    if (d1p > 100) reject(`Row ${n}: discount cannot be more than 100%.`);
    const d1a = pnum(row.disc1Amount, "discount", n);
    const d2a = pnum(row.disc2Amount, "discount 2", n);
    const mrp = pnum(row.mrp, "MRP", n);
    const saleRate = pnum(row.saleRate, "sale rate", n);
    if (mrp > 0 && saleRate > mrp) reject(`Row ${n}: sale rate cannot be more than MRP.`);
    const gstRate = pnum(row.gstRate, "GST", n);
    const slab = slabFor(db, row, gstRate);
    if (!slab) reject(`Row ${n}: pick a GST rate.`);
    const gross = r2(qty * rate);
    const discount = Math.min(gross, r2(gross * (d1p / 100) + d1a + d2a));
    return { row, qty, rate, mrp, saleRate, slab, gross, discount, afterDisc: r2(gross - discount) };
  });

  const baseTotal = parsed.reduce((t, p) => t + p.afterDisc, 0);
  const extraPct = pnum(body.extraDiscountPercent, "extra discount %", 0);
  const extraAmt = pnum(body.extraDiscountAmount, "extra discount", 0);
  const extra = Math.min(baseTotal, r2(baseTotal * (extraPct / 100) + extraAmt));
  const tcs = pnum(body.tcsAmount, "TCS", 0);

  const payments = (Array.isArray(body.payments) ? body.payments : [])
    .slice(0, 6)
    .map((p) => ({ mode: p.mode, amount: pnum(p.amount, "payment", 0), reference: (p.referenceNo ?? "").slice(0, 60) }))
    .filter((p) => p.amount > 0);
  const supplier = resolveSupplier(db, body, at);
  if (payments.length && !supplier) reject("Pick a supplier to record a payment.");

  const purchaseId = nextId();
  const items: DbPurchaseItem[] = [];
  let remainingExtra = extra;
  parsed.forEach((p, index) => {
    const share = index === parsed.length - 1 ? remainingExtra : baseTotal > 0 ? r2((extra * p.afterDisc) / baseTotal) : 0;
    remainingExtra = r2(remainingExtra - share);
    const value = Math.max(0, r2(p.afterDisc - share));
    const rateFraction = p.slab!.rate / 100;
    const taxable = pricing === "inclusive" ? r2(value / (1 + rateFraction)) : value;
    const gst = pricing === "inclusive" ? r2(value - taxable) : r2(taxable * rateFraction);
    const variant = resolveVariant(db, p.row, { mrp: p.mrp, saleRate: p.saleRate, gstCode: p.slab!.code || gstCodeForRate(p.slab!.rate), unitCost: r2(taxable / p.qty) }, at);
    const product = productOf(db, variant);
    if (p.row.customValues) {
      for (const [fieldId, value] of Object.entries(p.row.customValues)) {
        if (value === "" || value === null) delete variant.customValues[fieldId];
        else variant.customValues[fieldId] = value;
      }
    }
    for (const image of p.row.images ?? []) {
      if (product.images.length >= 4) break;
      product.images.push({ id: nextId(), url: `https://mock.wowcity.local/r2/${image.objectKey}`, variantId: null, isPrimary: image.isPrimary || product.images.length === 0 });
    }
    if (p.row.publicEnabled && actor.permissions.has("product.publication.manage")) {
      product.listing.enabled = true;
      if (!product.listing.storeIds.includes(store.id)) product.listing.storeIds.push(store.id);
    }
    addStock(db, variant.id, store.id, p.qty, "purchase", purchaseId, at, nextId());
    items.push({
      id: nextId(),
      variantId: variant.id,
      barcode: variant.barcodes[0]?.barcode ?? "",
      name: product.name,
      detail: [product.brand, variant.size, variant.colour].filter(Boolean).join(" · "),
      qty: p.qty,
      rate: p.rate,
      discount: r2(p.discount + share),
      taxable,
      gstRate: p.slab!.rate,
      gst,
      total: r2(taxable + gst),
      mrp: variant.mrp,
      price: variant.saleRate,
      returned: 0
    });
  });

  const taxable = r2(items.reduce((t, i) => t + i.taxable, 0));
  const gst = r2(items.reduce((t, i) => t + i.gst, 0));
  const exact = r2(taxable + gst + tcs);
  const total = Math.round(exact);
  const purchase: DbPurchase = {
    id: purchaseId,
    date: isoDate(date),
    invoice: (body.invoiceNumber ?? "").trim().slice(0, 40),
    supplierId: supplier?.id ?? null,
    storeId: store.id,
    pricing,
    items,
    totals: {
      qty: r3(items.reduce((t, i) => t + i.qty, 0)),
      gross: r2(parsed.reduce((t, p) => t + p.gross, 0)),
      discount: r2(items.reduce((t, i) => t + i.discount, 0)),
      taxable,
      gst,
      tcs,
      roundOff: r2(total - exact),
      total,
      mrp: r2(items.reduce((t, i) => t + i.mrp * i.qty, 0))
    },
    payments: payments.map((p) => ({ ...p, at })),
    returns: [],
    labelJobId: null,
    createdAt: at,
    by: actor.ref
  };

  const toPrint = items.filter((_, index) => parsed[index].row.printLabels !== false);
  if (toPrint.length) {
    const jobId = nextId();
    db.labelJobs.push({
      id: jobId,
      at,
      source: "purchase",
      template: "a4-3x8",
      storeId: store.id,
      title: `Purchase${purchase.invoice ? ` ${purchase.invoice}` : ""} · ${supplier?.name ?? "No supplier"}`,
      items: toPrint.map((item) => {
        const variant = db.variants.find((v) => v.id === item.variantId)!;
        return { variantId: variant.id, barcodeId: variant.barcodes[0].id, copies: Math.max(1, Math.ceil(item.qty)) };
      })
    });
    purchase.labelJobId = jobId;
  }
  db.purchases.push(purchase);

  if (supplier) {
    const href = `/app/purchase/${purchaseId}`;
    addLedger(db, {
      party: "supplier",
      partyId: supplier.id,
      at,
      type: "purchase",
      label: `Purchase ${purchase.invoice || purchaseId.slice(0, 8)}`,
      reference: purchase.invoice || null,
      mode: null,
      increase: total,
      decrease: 0,
      href
    });
    for (const p of payments)
      addLedger(db, {
        party: "supplier",
        partyId: supplier.id,
        at,
        type: "purchase_payment",
        label: `Paid on purchase ${purchase.invoice}`.trim(),
        reference: p.reference || null,
        mode: p.mode,
        increase: 0,
        decrease: p.amount,
        href
      });
  }
  logActivity(db, actor.ref, "purchase_created", `Purchase from ${supplier?.name ?? "no supplier"}`, total, "purchase_invoice", purchaseId, at);

  const units = r3(items.reduce((t, i) => t + i.qty, 0));
  const response: PurchaseResponse = {
    message: `Purchase saved. ${units} items added to stock.`,
    purchaseId,
    ...(purchase.labelJobId ? { printJobId: purchase.labelJobId } : {}),
    itemCount: items.length,
    total: purchase.totals.gross.toFixed(2)
  };
  db.idempotency.set(`purchase:${key}`, response);
  return { status: 201, response };
}

export function returnToSupplier(db: Db, actor: EngineActor, purchaseId: string, input: unknown, options: EngineOptions = {}): { status: number; response: PurchaseReturnResponse } {
  const purchase = db.purchases.find((p) => p.id === purchaseId);
  if (!purchase) reject("Purchase not found.");
  const body = (input ?? {}) as PurchaseReturnBody;
  if (!body.requestId || typeof body.requestId !== "string") invalid("requestId is required.");
  const previous = db.idempotency.get(`preturn:${body.requestId}`) as PurchaseReturnResponse | undefined;
  if (previous) return { status: 201, response: previous };
  if (!Array.isArray(body.lines) || body.lines.length === 0) reject("Pick at least one item to return.");

  const lines = body.lines.map((line) => {
    const item = purchase.items.find((i) => i.id === line?.purchaseItemId);
    if (!item) reject("An item is not on this purchase.");
    const qty = Number(line.qty);
    if (!(qty > 0)) reject(`Enter a quantity for ${item.name}.`);
    const left = r3(item.qty - item.returned);
    if (qty > left) reject(`Only ${left} of ${item.name} can be returned.`);
    const inStock = qtyAt(db, item.variantId, purchase.storeId);
    if (qty > inStock) reject(`Only ${Math.max(0, inStock)} of ${item.name} is in stock.`);
    return { item, qty, amount: r2((item.total / item.qty) * qty) };
  });
  const at = options.at ?? new Date().toISOString();
  const amount = r2(lines.reduce((t, l) => t + l.amount, 0));
  const number = `DN-${fyShortAt(at)}-${pad4(++db.counters.debitNote)}`;
  const returnId = nextId();
  for (const l of lines) {
    l.item.returned = r3(l.item.returned + l.qty);
    addStock(db, l.item.variantId, purchase.storeId, -l.qty, "purchase_return", returnId, at, nextId());
  }
  const reason = (body.reason ?? "").trim().slice(0, 200);
  purchase.returns.push({ id: returnId, number, date: isoDate(new Date(at)), amount, reason, qty: r3(lines.reduce((t, l) => t + l.qty, 0)) });
  if (purchase.supplierId) {
    addLedger(db, {
      party: "supplier",
      partyId: purchase.supplierId,
      at,
      type: "purchase_return",
      label: `Debit note ${number}`,
      reference: number,
      mode: null,
      increase: 0,
      decrease: amount,
      href: `/app/purchase/${purchase.id}`
    });
  }
  logActivity(db, actor.ref, "purchase_return_created", `Debit note ${number}`, amount, "purchase_return", returnId, at);
  const response = { message: `Debit note ${number} saved for ${inr(amount)}.`, returnNumber: number };
  db.idempotency.set(`preturn:${body.requestId}`, response);
  return { status: 201, response };
}
