/** Purchases, suppliers and product photo uploads. */
import type { PurchaseBarcodeLookupResponse, PurchaseBill, PurchaseListRow, PurchaseSetupResponse, SupplierRow } from "@/api/types";
import { GSTIN_PATTERN } from "@/lib/india";
import type { Db, DbPurchase } from "../db";
import { findProduct, findStore, findSupplier, gstSlab, partyBalance, qtyAt, qtyIn } from "../db";
import { findByBarcode, returnToSupplier, submitPurchase } from "../engine/purchases";
import { body, has, need, q, route, storeFilter, type Route } from "../http";
import { includesText, MockHttpError, newId, notFound, numStr, ok, pageParam, paginate, raw, reject, resolveRange, r2, r3, str } from "../util";

const PUBLIC_FIELDS = [
  { key: "product_name", label: "Product name" },
  { key: "brand", label: "Brand" },
  { key: "category", label: "Category" },
  { key: "size", label: "Size" },
  { key: "colour", label: "Colour" },
  { key: "style", label: "Style" },
  { key: "mrp", label: "MRP" },
  { key: "sale_rate", label: "Price" }
] as const;

function purchasePaid(p: DbPurchase) {
  return r2(p.payments.reduce((t, x) => t + x.amount, 0));
}
function purchaseDue(p: DbPurchase) {
  const returned = p.returns.reduce((t, r) => t + r.amount, 0);
  return Math.max(0, r2(p.totals.total - purchasePaid(p) - returned));
}

const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, 300);

function setup(db: Db, storeIds: string[], canPublish: boolean, canSeeCost: boolean): PurchaseSetupResponse {
  return {
    suppliers: db.suppliers
      .filter((s) => s.active)
      .slice(0, 1000)
      .map((s) => ({ id: s.id, name: s.name, mobile: s.mobile || null, gstin: s.gstin || null, state: s.state || null })),
    stores: db.stores
      .filter((s) => s.is_active && storeIds.includes(s.id))
      .map((s) => ({ id: s.id, name: s.name, state: s.state ?? "", address_line_1: s.address_line_1, address_line_2: s.address_line_2, city: s.city, pincode: s.pincode })),
    gstSlabs: db.settings.gstSlabs,
    customFields: db.customFields
      .filter((f) => f.is_active && !f.deleted_at && f.show_in_purchase_grid)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({
        id: f.id,
        name: f.name,
        field_type: f.field_type,
        options_json: f.options_json,
        is_public_eligible: f.is_public_eligible,
        is_required_on_purchase: f.is_required_on_purchase,
        default_public_enabled: f.default_public_enabled,
        show_in_sale_search: f.show_in_sale_search,
        sort_order: f.sort_order
      })),
    publicFieldOptions: PUBLIC_FIELDS.map((f) => ({ key: f.key, label: f.label })),
    publicFieldDefaults: { product_name: true, brand: true, size: true, colour: true, mrp: true, sale_rate: true },
    roundingMode: db.settings.tax.roundingMode,
    canPublish,
    canSeeCost,
    suggestions: {
      brands: unique(db.products.map((p) => p.brand)),
      sizes: unique(db.variants.map((v) => v.size)),
      colours: unique(db.variants.map((v) => v.colour)),
      styles: unique(db.variants.map((v) => v.style)),
      categories: unique(db.products.map((p) => p.category))
    }
  };
}

export const purchaseRoutes: Route[] = [
  route("GET", "/purchases/setup", (ctx) => {
    need(ctx, "purchase.create");
    return ok(setup(ctx.db, ctx.auth.actor.storeIds, has(ctx, "product.publication.manage"), has(ctx, "purchase.view_cost")));
  }),

  route("GET", "/purchases", (ctx) => {
    need(ctx, "purchase.view", "purchase.create");
    const { db } = ctx;
    const cost = has(ctx, "purchase.view_cost");
    const range = resolveRange(q(ctx, "range"), q(ctx, "from"), q(ctx, "to"), "30d");
    const stores = storeFilter(ctx);
    const inPeriod = db.purchases.filter((p) => p.date >= range.from && p.date <= range.to && stores.includes(p.storeId));
    const supplierId = q(ctx, "supplier");
    const status = q(ctx, "status");
    const text = q(ctx, "q") ?? "";
    const rows: PurchaseListRow[] = inPeriod
      .filter((p) => {
        const supplier = findSupplier(db, p.supplierId);
        return (
          (!supplierId || p.supplierId === supplierId) && (status === "due" ? purchaseDue(p) > 0 : status === "paid" ? purchaseDue(p) === 0 : true) && includesText([p.invoice, supplier?.name], text)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .map((p) => ({
        id: p.id,
        date: p.date,
        invoice: p.invoice,
        supplier: findSupplier(db, p.supplierId)?.name ?? "No supplier",
        supplierId: p.supplierId,
        store: findStore(db, p.storeId)?.name ?? "",
        qty: p.totals.qty,
        amount: cost ? p.totals.total : null,
        gst: cost ? p.totals.gst : null,
        paid: cost ? purchasePaid(p) : null,
        due: cost ? purchaseDue(p) : null
      }));
    return ok({
      range: { from: range.from, to: range.to },
      total: rows.length,
      summary: cost
        ? {
            amount: r2(inPeriod.reduce((t, p) => t + p.totals.total, 0)),
            gst: r2(inPeriod.reduce((t, p) => t + p.totals.gst, 0)),
            due: r2(inPeriod.reduce((t, p) => t + purchaseDue(p), 0)),
            qty: r3(inPeriod.reduce((t, p) => t + p.totals.qty, 0)),
            bills: inPeriod.length
          }
        : null,
      rows: paginate(rows, pageParam(q(ctx, "page")), 40)
    });
  }),

  route(
    "GET",
    "/purchases/barcode-lookup",
    (ctx) => {
      need(ctx, "purchase.create", "purchase.view");
      const { db } = ctx;
      const variant = findByBarcode(db, q(ctx, "barcode") ?? "");
      if (!variant) return raw({ found: false } satisfies PurchaseBarcodeLookupResponse);
      const product = findProduct(db, variant.productId)!;
      const slab = gstSlab(db, variant.gstCode);
      const response: PurchaseBarcodeLookupResponse = {
        found: true,
        variantId: variant.id,
        barcode: variant.barcodes[0]?.barcode ?? "",
        itemName: product.name,
        brand: product.brand,
        category: product.category,
        size: variant.size,
        colour: variant.colour,
        style: variant.style,
        hsnCode: product.hsnCode,
        gstCode: slab?.code ?? "",
        gstRate: slab ? numStr(slab.rate) : "",
        mrp: numStr(variant.mrp),
        saleRate: numStr(variant.saleRate),
        inStock: qtyIn(
          db,
          variant.id,
          db.stores.map((s) => s.id)
        )
      };
      return raw(response);
    },
    { raw: true }
  ),

  route("GET", "/purchases/:id", (ctx) => {
    need(ctx, "purchase.view", "purchase.create");
    const { db } = ctx;
    const p = db.purchases.find((x) => x.id === ctx.params.id);
    if (!p || !ctx.auth.actor.storeIds.includes(p.storeId)) notFound("Purchase not found.");
    const cost = has(ctx, "purchase.view_cost");
    const supplier = findSupplier(db, p.supplierId);
    const due = purchaseDue(p);
    const bill: PurchaseBill = {
      id: p.id,
      date: p.date,
      invoice: p.invoice,
      pricing: p.pricing,
      store: findStore(db, p.storeId)?.name ?? "",
      supplier: supplier ? { id: supplier.id, name: supplier.name, mobile: supplier.mobile || null, gstin: supplier.gstin || null, state: supplier.state || null } : null,
      totals: cost ? { ...p.totals, paid: purchasePaid(p), due, outstanding: due } : null,
      items: p.items.map((i) => ({
        id: i.id,
        variantId: i.variantId,
        barcode: i.barcode,
        name: i.name,
        detail: i.detail,
        qty: i.qty,
        rate: cost ? i.rate : null,
        discount: cost ? i.discount : null,
        taxable: cost ? i.taxable : null,
        gstRate: i.gstRate,
        gst: cost ? i.gst : null,
        total: cost ? i.total : null,
        mrp: i.mrp,
        price: i.price,
        returned: i.returned,
        inStock: qtyAt(db, i.variantId, p.storeId)
      })),
      payments: cost ? p.payments.map((x) => ({ mode: x.mode, amount: x.amount, reference: x.reference, at: x.at })) : [],
      returns: p.returns.map((r) => ({ ...r })),
      ...(p.labelJobId ? { labelJobId: p.labelJobId } : {})
    };
    return ok(bill);
  }),

  route("POST", "/purchases", (ctx) => {
    need(ctx, "purchase.create");
    const { status, response } = submitPurchase(ctx.db, ctx.auth.actor, ctx.body);
    return { status, body: { data: response } };
  }),

  route("POST", "/purchases/:id/returns", (ctx) => {
    need(ctx, "purchase.return");
    const { status, response } = returnToSupplier(ctx.db, ctx.auth.actor, ctx.params.id, ctx.body);
    return { status, body: { data: response } };
  }),

  route("GET", "/suppliers", (ctx) => {
    need(ctx, "purchase.view", "purchase.create");
    const { db } = ctx;
    const cost = has(ctx, "purchase.view_cost");
    const text = q(ctx, "q") ?? "";
    const suppliers: SupplierRow[] = db.suppliers
      .filter((s) => includesText([s.name, s.mobile, s.gstin], text))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 500)
      .map((s) => {
        const bills = db.purchases.filter((p) => p.supplierId === s.id);
        const last =
          bills
            .map((p) => p.date)
            .sort()
            .pop() ?? null;
        return {
          id: s.id,
          name: s.name,
          mobile: s.mobile,
          gstin: s.gstin,
          state: s.state,
          address: s.address,
          active: s.active,
          bills: bills.length,
          purchased: cost ? r2(bills.reduce((t, p) => t + p.totals.total, 0)) : null,
          lastPurchase: last,
          balance: cost ? partyBalance(db, "supplier", s.id) : null
        };
      });
    return ok({ suppliers });
  }),

  route("POST", "/suppliers", (ctx) => {
    need(ctx, "purchase.create");
    const { db } = ctx;
    const b = body(ctx);
    const name = str(b.name, 200);
    if (name.length < 2 || name.length > 120) reject("Enter the supplier name (2 to 120 characters).");
    const mobile = str(b.mobile, 20).replace(/\D/g, "");
    if (mobile && (mobile.length < 10 || mobile.length > 13)) reject("Mobile number must be 10 to 13 digits.");
    const gstin = str(b.gstin, 20).toUpperCase();
    if (gstin && !GSTIN_PATTERN.test(gstin)) reject("That GSTIN does not look right.");
    const values = { name, mobile, gstin, state: str(b.state, 60), address: str(b.address, 300) };
    if (db.suppliers.some((s) => s.id !== b.supplierId && s.name.toLowerCase() === name.toLowerCase())) reject(`A supplier named ${name} already exists.`);
    if (b.supplierId) {
      const supplier = findSupplier(db, str(b.supplierId));
      if (!supplier) reject("That supplier was not found.");
      Object.assign(supplier, values);
      return ok({ message: "Supplier updated." });
    }
    db.suppliers.push({ id: newId(), ...values, active: true, createdAt: new Date().toISOString() });
    return ok({ message: `${name} added.` });
  })
];

/** POST https://mock.wowcity.local/api/r2/product-image-upload (RAW). */
export const imageUploadRoute: Route = route(
  "POST",
  "/api/r2/product-image-upload",
  (ctx) => {
    need(ctx, "product.images.manage", "purchase.create");
    const b = body(ctx);
    const bad = (message: string) => new MockHttpError(400, "invalid_input", message);
    const productId = str(b.productId, 100);
    const fileName = str(b.fileName, 300);
    const contentType = str(b.contentType);
    const sizeBytes = Number(b.sizeBytes);
    if (!productId) throw bad("productId is required.");
    if (!fileName || fileName.length > 200) throw bad("fileName is required.");
    const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : null;
    if (!ext) throw bad("Only JPEG, PNG or WebP photos can be uploaded.");
    if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 5 * 1024 * 1024) throw bad("Photos must be under 5 MB.");
    const product = findProduct(ctx.db, productId);
    if (product && product.images.length >= 4) throw new MockHttpError(409, "rejected", "A product can have at most 4 images.");
    const id = newId();
    const variantId = str(b.variantId, 100);
    const folder = variantId ? `variants/${variantId}` : "product";
    return raw({
      uploadUrl: `https://mock.wowcity.local/upload/${id}`,
      bucket: "wowcity-mock",
      objectKey: `sellers/${ctx.db.sellerId}/products/${productId}/${folder}/${id}.${ext}`,
      maxImagesPerProduct: 4
    });
  },
  { raw: true }
);
