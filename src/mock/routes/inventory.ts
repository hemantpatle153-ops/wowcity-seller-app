/** Stock, products, custom fields and barcode labels. */
import type { CustomFieldType, LabelItem, ProductListItem, ProductListingResponse, StockItem, StockItemDetail } from "@/api/types";
import type { Db, DbVariant } from "../db";
import { addStock, findProduct, findStore, findVariant, gstSlab, productOf, qtyAt, qtyIn, touchTime, variantLabel } from "../db";
import { fyShortAt, logActivity, nextId, pad4 } from "../engine/common";
import { body, has, need, ownerOnly, q, route, storeFilter, type Ctx, type Route } from "../http";
import { matchesSearch } from "./sales";
import { includesText, inRange, invalid, notFound, ok, pageParam, paginate, reject, resolveRange, r2, r3, str, toNum } from "../util";

const LOW = 5;

function imageKey(db: Db, productId: string, imageId: string) {
  return `sellers/${db.sellerId}/products/${productId}/product/${imageId}.jpg`;
}

function stockItem(db: Db, variant: DbVariant, stores: string[]): StockItem {
  const product = productOf(db, variant);
  const byStore: Record<string, number> = {};
  for (const storeId of stores) byStore[storeId] = qtyAt(db, variant.id, storeId);
  return {
    id: variant.id,
    productId: product.id,
    name: product.name,
    brand: product.brand || null,
    category: product.category || null,
    size: variant.size || null,
    colour: variant.colour || null,
    style: variant.style || null,
    mrp: variant.mrp,
    saleRate: variant.saleRate,
    barcode: variant.barcodes[0]?.barcode ?? null,
    qty: r3(Object.values(byStore).reduce((t, n) => t + n, 0)),
    byStore,
    unitCost: variant.unitCost,
    imageKey: product.images[0] ? imageKey(db, product.id, product.images[0].id) : null,
    isPublic: product.listing.enabled,
    createdAt: variant.createdAt
  };
}

export function labelItem(db: Db, variant: DbVariant, stores: string[]): LabelItem {
  const product = productOf(db, variant);
  return {
    variantId: variant.id,
    barcodeId: variant.barcodes[0]?.id ?? "",
    barcode: variant.barcodes[0]?.barcode ?? "",
    name: product.name,
    brand: product.brand,
    size: variant.size,
    color: variant.colour,
    mrp: variant.mrp,
    price: variant.saleRate,
    stock: qtyIn(db, variant.id, stores)
  };
}

const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const BUILT_IN_FIELDS = [
  { key: "product_name", label: "Product name" },
  { key: "brand", label: "Brand" },
  { key: "category", label: "Category" },
  { key: "size", label: "Size" },
  { key: "colour", label: "Colour" },
  { key: "style", label: "Style" },
  { key: "mrp", label: "MRP" },
  { key: "sale_rate", label: "Price" }
] as const;
const FIELD_TYPES: CustomFieldType[] = ["text", "number", "decimal", "select", "multi_select", "boolean", "date", "color", "url"];

function customColumns(db: Db) {
  return db.customFields.filter((f) => f.is_active && !f.deleted_at && f.is_public_eligible).map((f) => ({ key: `custom:${f.id}`, label: f.name }));
}

function stockRoutes(): Route[] {
  return [
    route("GET", "/stock", (ctx) => {
      need(ctx, "stock.view");
      const { db } = ctx;
      const stores = storeFilter(ctx);
      const all = db.variants.filter((v) => v.active && productOf(db, v).active).map((v) => stockItem(db, v, stores));
      const text = (q(ctx, "q") ?? "").slice(0, 80);
      const status = q(ctx, "status");
      const exact = (key: "brand" | "size" | "colour" | "category") => q(ctx, key);
      let items = all.filter(
        (i) =>
          (!text || includesText([`${i.name} ${i.brand ?? ""} ${i.category ?? ""} ${i.size ?? ""} ${i.colour ?? ""}`, i.barcode], text)) &&
          (status === "in" ? i.qty > LOW : status === "low" ? i.qty > 0 && i.qty <= LOW : status === "out" ? i.qty <= 0 : true) &&
          (!exact("brand") || i.brand === exact("brand")) &&
          (!exact("size") || i.size === exact("size")) &&
          (!exact("colour") || i.colour === exact("colour")) &&
          (!exact("category") || i.category === exact("category"))
      );
      const sort = q(ctx, "sort");
      items = [...items].sort((a, b) =>
        sort === "stock_low"
          ? a.qty - b.qty
          : sort === "stock_high"
            ? b.qty - a.qty
            : sort === "newest"
              ? b.createdAt.localeCompare(a.createdAt)
              : sort === "price_high"
                ? b.saleRate - a.saleRate
                : a.name.localeCompare(b.name) || (a.size ?? "").localeCompare(b.size ?? "")
      );
      return ok({
        total: items.length,
        summary: {
          skus: all.length,
          units: r3(all.reduce((t, i) => t + Math.max(0, i.qty), 0)),
          costValue: r2(all.reduce((t, i) => t + Math.max(0, i.qty) * (i.unitCost ?? 0), 0)),
          mrpValue: r2(all.reduce((t, i) => t + Math.max(0, i.qty) * i.mrp, 0)),
          low: all.filter((i) => i.qty > 0 && i.qty <= LOW).length,
          out: all.filter((i) => i.qty <= 0).length
        },
        facets: {
          brands: uniqueSorted(all.map((i) => i.brand ?? "")),
          sizes: uniqueSorted(all.map((i) => i.size ?? "")),
          colours: uniqueSorted(all.map((i) => i.colour ?? "")),
          categories: uniqueSorted(all.map((i) => i.category ?? ""))
        },
        items: paginate(items, pageParam(q(ctx, "page")), 40)
      });
    }),

    route("GET", "/stock/items/:id", (ctx) => {
      need(ctx, "stock.view", "product.view");
      const { db } = ctx;
      const variant = findVariant(db, ctx.params.id);
      if (!variant) notFound("Item not found.");
      const product = productOf(db, variant);
      const stores = ctx.auth.actor.storeIds;
      const slab = gstSlab(db, variant.gstCode);
      const stock = stores.map((storeId) => ({ storeId, store: findStore(db, storeId)?.name ?? "", available: qtyAt(db, variant.id, storeId), held: 0 }));
      const detail: StockItemDetail = {
        variantId: variant.id,
        productId: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        size: variant.size,
        colour: variant.colour,
        style: variant.style,
        hsnCode: product.hsnCode,
        gst: slab ? { code: slab.code, label: slab.label, rate: slab.rate } : null,
        mrp: variant.mrp,
        price: variant.saleRate,
        active: variant.active,
        internalDescription: has(ctx, "purchase.view_cost") ? variant.internalDescription : null,
        barcodes: variant.barcodes.map((b) => ({ id: b.id, barcode: b.barcode })),
        images: product.images.map((i) => ({ id: i.id, url: i.url, isPrimary: i.isPrimary, variantId: i.variantId })),
        stock,
        totalStock: r3(stock.reduce((t, s) => t + s.available, 0)),
        movements: db.movements
          .filter((m) => m.variantId === variant.id && stores.includes(m.storeId))
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 50)
          .map((m) => ({ id: m.id, store: findStore(db, m.storeId)?.name ?? "", type: m.type, documentId: m.documentId, qty: m.qty, at: m.at })),
        customValues: { ...variant.customValues },
        tags: [...variant.tags],
        siblings: db.variants.filter((v) => v.productId === product.id && v.id !== variant.id).map((v) => ({ variantId: v.id, label: variantLabel(v) }))
      };
      return ok(detail);
    }),

    route("POST", "/stock/adjust", (ctx) => {
      need(ctx, "stock.dump");
      const { db } = ctx;
      const b = body(ctx);
      const variant = findVariant(db, str(b.variantId));
      if (!variant) reject("Item not found.");
      const storeId = str(b.storeId);
      if (!ctx.auth.actor.storeIds.includes(storeId)) reject("Pick one of your stores.");
      const qtyText = String(b.qty ?? "");
      if (!/^\d+(\.\d{1,3})?$/.test(qtyText) || !(Number(qtyText) > 0)) reject("Enter a quantity more than 0.");
      const qty = Number(qtyText);
      const reasons = ["damaged", "lost", "found", "count_correction", "returned_to_supplier", "sample", "other"];
      if (!reasons.includes(str(b.reason))) reject("Pick a reason.");
      const direction = b.direction === "add" ? "add" : b.direction === "remove" ? "remove" : reject("Pick add or remove.");
      const available = qtyAt(db, variant.id, storeId);
      if (direction === "remove" && qty > available) reject(`Only ${available} in this store.`);
      const at = new Date().toISOString();
      const id = nextId();
      const reason = str(b.reason);
      db.adjustments.push({ id, variantId: variant.id, storeId, direction, qty, reason, note: str(b.note, 200), at, by: ctx.auth.actor.ref });
      addStock(db, variant.id, storeId, direction === "add" ? qty : -qty, direction === "remove" && (reason === "damaged" || reason === "lost") ? "dump" : "adjustment", id, at, nextId());
      logActivity(db, ctx.auth.actor.ref, "stock_adjusted", `Stock ${direction === "add" ? "added" : "removed"}: ${productOf(db, variant).name}`, null, "stock_adjustment", id, at);
      return ok({ message: `Stock updated. ${qtyAt(db, variant.id, storeId)} now in this store.` });
    }),

    route("POST", "/stock/transfer", (ctx) => {
      need(ctx, "stock.transfer");
      const { db } = ctx;
      const b = body(ctx);
      const key = str(b.idempotencyKey, 80);
      if (key.length < 12) invalid("idempotencyKey must be at least 12 characters.");
      const previous = db.idempotency.get(`transfer:${key}`);
      if (previous) return ok(previous);
      const variant = findVariant(db, str(b.variantId));
      if (!variant) reject("Item not found.");
      const from = str(b.fromStoreId);
      const to = str(b.toStoreId);
      const mine = ctx.auth.actor.storeIds;
      if (!mine.includes(from) || !mine.includes(to)) reject("Pick two of your open stores.");
      if (from === to) reject("Pick a different store to move stock to.");
      const qty = toNum(b.qty);
      if (!(qty > 0)) reject("Enter a quantity more than 0.");
      const available = qtyAt(db, variant.id, from);
      if (qty > available) reject(`Only ${Math.max(0, available)} in ${findStore(db, from)?.name}.`);
      const at = new Date().toISOString();
      const id = nextId();
      const challan = `TR-${fyShortAt(at)}-${pad4(++db.counters.challan)}`;
      db.transfers.push({ id, challan, variantId: variant.id, fromStoreId: from, toStoreId: to, qty, at, by: ctx.auth.actor.ref });
      addStock(db, variant.id, from, -qty, "transfer", id, at, nextId());
      addStock(db, variant.id, to, qty, "transfer", id, at, nextId());
      logActivity(db, ctx.auth.actor.ref, "stock_transferred", `Challan ${challan}`, null, "stock_transfer", id, at);
      const response = { message: `Moved ${qty} pcs. Challan ${challan}.` };
      db.idempotency.set(`transfer:${key}`, response);
      return ok(response);
    })
  ];
}

function productRoutes(): Route[] {
  const summarise = (ctx: Ctx): ProductListItem[] =>
    ctx.db.products
      .filter((p) => p.active)
      .map((p) => {
        const variants = ctx.db.variants.filter((v) => v.productId === p.id && v.active);
        const prices = variants.map((v) => v.saleRate);
        const listedStores = p.listing.enabled ? p.listing.storeIds : [];
        return {
          id: p.id,
          name: p.name,
          brand: p.brand || null,
          category: p.category || null,
          variants: variants.length,
          stock: r3(variants.reduce((t, v) => t + qtyIn(ctx.db, v.id, ctx.auth.actor.storeIds), 0)),
          minPrice: prices.length ? Math.min(...prices) : null,
          maxPrice: prices.length ? Math.max(...prices) : null,
          image: p.images[0]?.url ?? null,
          listed: listedStores.length,
          live: listedStores.filter((s) => variants.some((v) => qtyAt(ctx.db, v.id, s) > 0)).length
        };
      });
  return [
    route("GET", "/products", (ctx) => {
      need(ctx, "product.view");
      const text = q(ctx, "q") ?? "";
      const all = summarise(ctx).filter((p) => includesText([`${p.name} ${p.brand ?? ""} ${p.category ?? ""}`], text));
      const filter = q(ctx, "filter");
      const items = all
        .filter((p) =>
          filter === "live" ? p.live > 0 : filter === "listed" ? p.listed > 0 : filter === "unlisted" ? p.listed === 0 : filter === "nophoto" ? !p.image : filter === "instock" ? p.stock > 0 : true
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      return ok({
        total: items.length,
        summary: {
          products: all.length,
          listed: all.filter((p) => p.listed > 0).length,
          live: all.filter((p) => p.live > 0).length,
          noPhoto: all.filter((p) => !p.image).length,
          unlistedInStock: all.filter((p) => p.listed === 0 && p.stock > 0).length
        },
        items: paginate(items, pageParam(q(ctx, "page")), 40)
      });
    }),

    route("GET", "/products/:id/listing", (ctx) => {
      need(ctx, "product.view");
      const { db } = ctx;
      const product = findProduct(db, ctx.params.id);
      if (!product) notFound("Product not found.");
      const stores = db.stores.filter((s) => s.is_active);
      const columns = customColumns(db);
      const fieldOptions = [...BUILT_IN_FIELDS.map((f) => ({ key: f.key as string, label: f.label as string })), ...columns];
      const response: ProductListingResponse = {
        product: { id: product.id, name: product.name, brand: product.brand, category: product.category },
        enabled: product.listing.enabled,
        listedStoreIds: [...product.listing.storeIds],
        description: product.listing.description,
        fields: Object.fromEntries(fieldOptions.map((f) => [f.key, product.listing.fields.includes(f.key)])),
        tags: [...product.listing.tags],
        images: product.images.slice(0, 8).map((i) => ({ id: i.id, url: i.url })),
        stores: stores.map((s) => ({ id: s.id, name: s.name, city: s.city ?? "", discoverable: s.is_discoverable })),
        customColumns: columns,
        variants: db.variants
          .filter((v) => v.productId === product.id && v.active)
          .map((v) => ({
            id: v.id,
            label: variantLabel(v),
            barcode: v.barcodes[0]?.barcode ?? "",
            mrp: v.mrp,
            price: v.saleRate,
            stock: Object.fromEntries(stores.map((s) => [s.id, qtyAt(db, v.id, s.id)])),
            status: Object.fromEntries(
              stores.map((s) => [s.id, product.listing.enabled && product.listing.storeIds.includes(s.id) ? (qtyAt(db, v.id, s.id) > 0 ? "in_stock" : "out_of_stock") : "hidden"] as const)
            )
          })),
        fieldOptions
      };
      return ok(response);
    }),

    route("PUT", "/products/:id/listing", (ctx) => {
      need(ctx, "product.publication.manage");
      const { db } = ctx;
      const product = findProduct(db, ctx.params.id);
      if (!product) notFound("Product not found.");
      const b = body(ctx);
      const active = db.stores.filter((s) => s.is_active).map((s) => s.id);
      const storeIds = (Array.isArray(b.storeIds) ? (b.storeIds as unknown[]) : []).map(String).filter((id) => active.includes(id));
      const valid = new Set([...BUILT_IN_FIELDS.map((f) => f.key as string), ...customColumns(db).map((c) => c.key)]);
      const description = str(b.description, 1000);
      if (description.length > 600) reject("Keep the description under 600 characters.");
      product.listing = {
        enabled: b.enabled === true,
        storeIds,
        fields: (Array.isArray(b.fields) ? (b.fields as unknown[]) : []).map(String).filter((f) => valid.has(f)),
        description,
        tags: (Array.isArray(b.tags) ? (b.tags as unknown[]) : [])
          .map((t) => str(t, 40))
          .filter(Boolean)
          .slice(0, 20)
      };
      for (const v of db.variants) if (v.productId === product.id) v.changedAt = touchTime(db);
      if (!product.listing.enabled) return ok({ message: "Removed from WowCity." });
      if (!storeIds.length) return ok({ message: "Saved. Nothing is live yet: pick at least one store." });
      const live = storeIds.filter((s) => db.variants.some((v) => v.productId === product.id && qtyAt(db, v.id, s) > 0)).length;
      if (!live) return ok({ message: "Saved. Nothing is live yet: this product is out of stock in the chosen stores." });
      return ok({ message: `Listed on WowCity in ${live} ${live === 1 ? "store" : "stores"}.` });
    }),

    route("PATCH", "/products/:pid/variants/:vid", (ctx) => {
      need(ctx, "product.edit");
      const { db } = ctx;
      const product = findProduct(db, ctx.params.pid);
      const variant = findVariant(db, ctx.params.vid);
      if (!product || !variant || variant.productId !== product.id) notFound("Item not found.");
      const b = body(ctx);
      const name = str(b.productName, 200);
      if (!name || name.length > 160) reject("Enter a product name (up to 160 characters).");
      const mrpText = String(b.mrp ?? "");
      const rateText = String(b.saleRate ?? "");
      if (!/^\d+(\.\d{1,2})?$/.test(mrpText)) reject("Enter a valid MRP.");
      if (!/^\d+(\.\d{1,2})?$/.test(rateText)) reject("Enter a valid price.");
      if (Number(rateText) > Number(mrpText)) reject("Price cannot be more than MRP.");
      const hsn = str(b.hsnCode, 8);
      if (hsn && !/^\d{4,8}$/.test(hsn)) reject("HSN must be 4 to 8 digits.");
      const gstCode = str(b.gstCode, 40);
      if (gstCode && !gstSlab(db, gstCode)) reject("Pick a GST rate.");
      product.name = name;
      product.brand = str(b.brand, 80);
      product.category = str(b.category, 80);
      product.hsnCode = hsn;
      variant.size = str(b.size, 40);
      variant.colour = str(b.colour, 40);
      variant.style = str(b.style, 60);
      variant.mrp = Number(mrpText);
      variant.saleRate = Number(rateText);
      if (gstCode) variant.gstCode = gstCode;
      variant.internalDescription = str(b.internalDescription, 1000) || null;
      if (has(ctx, "product.publication.manage")) {
        product.listing.description = str(b.publicDescription, 1000);
        variant.tags = str(b.tags, 2000)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 25);
      }
      for (const [key, value] of Object.entries(b)) {
        if (!key.startsWith("custom_")) continue;
        const fieldId = key.slice(7);
        if (value === "" || value === null) delete variant.customValues[fieldId];
        else variant.customValues[fieldId] = String(value);
      }
      for (const v of db.variants) if (v.productId === product.id) v.changedAt = touchTime(db);
      return ok({ message: "Changes saved." });
    })
  ];
}

function customFieldRoutes(): Route[] {
  const ordered = (db: Db) => [...db.customFields].sort((a, b) => a.sort_order - b.sort_order);
  return [
    route("GET", "/custom-fields", (ctx) => {
      ownerOnly(ctx);
      return ok({ fields: ordered(ctx.db) });
    }),
    route("POST", "/custom-fields", (ctx) => {
      ownerOnly(ctx);
      const { db } = ctx;
      const b = body(ctx);
      const name = str(b.name, 100);
      if (!name || name.length > 48) reject("Enter a column name (up to 48 characters).");
      const fieldType = str(b.fieldType) as CustomFieldType;
      if (!FIELD_TYPES.includes(fieldType)) reject("Pick a column type.");
      const options = str(b.options, 5000)
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      if ((fieldType === "select" || fieldType === "multi_select") && options.length === 0) reject("Add at least one option, separated by commas.");
      if (options.length > 50) reject("A column can have at most 50 options.");
      const looksPrivate = /cost|supplier|margin|purchase|profit/i.test(name);
      const note = looksPrivate && b.isPublicEligible === true ? " It stays private because it looks like internal data." : "";
      const values = {
        name,
        field_type: fieldType,
        options_json: options,
        is_required_on_purchase: b.isRequiredOnPurchase === true,
        show_in_purchase_grid: b.showInPurchaseGrid !== false,
        show_in_sale_search: b.showInSaleSearch === true,
        is_public_eligible: b.isPublicEligible === true && !looksPrivate,
        default_public_enabled: b.defaultPublicEnabled === true && !looksPrivate
      };
      if (b.fieldId) {
        const field = db.customFields.find((f) => f.id === b.fieldId);
        if (!field) reject("That column was not found.");
        if (db.customFields.some((f) => f.id !== field.id && !f.deleted_at && f.name.toLowerCase() === name.toLowerCase())) reject(`A column named ${name} already exists.`);
        Object.assign(field, values);
        return ok({ message: `${name} updated.${note}` });
      }
      const same = db.customFields.find((f) => f.name.toLowerCase() === name.toLowerCase());
      if (same && !same.deleted_at) reject(`A column named ${name} already exists.`);
      if (same) {
        Object.assign(same, values, { is_active: true, deleted_at: null });
        return ok({ message: `${name} restored.${note}` });
      }
      db.customFields.push({ id: nextId(), ...values, is_active: true, deleted_at: null, sort_order: Math.max(0, ...db.customFields.map((f) => f.sort_order)) + 1 });
      return ok({ message: `${name} added.${note}` });
    }),
    route("POST", "/custom-fields/:id/archive", (ctx) => {
      ownerOnly(ctx);
      const field = ctx.db.customFields.find((f) => f.id === ctx.params.id);
      if (field) {
        const restore = body(ctx).restore === true;
        field.is_active = restore;
        field.deleted_at = restore ? null : new Date().toISOString();
      }
      return ok({ updated: true });
    }),
    route("POST", "/custom-fields/:id/move", (ctx) => {
      ownerOnly(ctx);
      const list = ordered(ctx.db).filter((f) => !f.deleted_at);
      const index = list.findIndex((f) => f.id === ctx.params.id);
      const direction = body(ctx).direction;
      if (direction !== "up" && direction !== "down") reject("direction must be up or down.");
      const other = list[direction === "up" ? index - 1 : index + 1];
      if (index >= 0 && other) [list[index].sort_order, other.sort_order] = [other.sort_order, list[index].sort_order];
      return ok({ updated: true });
    })
  ];
}

function labelRoutes(): Route[] {
  const labelStores = (ctx: Ctx) => (ctx.auth.isOwner ? ctx.db.stores.map((s) => s.id) : ctx.auth.actor.storeIds);
  return [
    route("GET", "/labels/search", (ctx) => {
      need(ctx, "barcode.print");
      const { db } = ctx;
      const text = (q(ctx, "q") ?? "").trim();
      const items =
        text.length < 2
          ? []
          : db.variants
              .filter((v) => v.active && (matchesSearch(db, v, text) || v.barcodes.some((b) => b.barcode.includes(text.toUpperCase()))))
              .slice(0, 50)
              .map((v) => labelItem(db, v, labelStores(ctx)));
      return ok({
        items,
        templates: db.labelTemplates,
        fields: [
          { key: "shop", label: "Shop name" },
          { key: "name", label: "Item name" },
          { key: "variant", label: "Size / colour" },
          { key: "mrp", label: "MRP" },
          { key: "price", label: "Our price" },
          { key: "code", label: "Barcode" }
        ]
      });
    }),
    route("GET", "/labels/jobs", (ctx) => {
      need(ctx, "barcode.view", "barcode.print");
      const range = resolveRange(q(ctx, "range"), q(ctx, "from"), q(ctx, "to"), "30d");
      const source = q(ctx, "source");
      const rows = ctx.db.labelJobs
        .filter((j) => inRange(j.at, range) && (!source || j.source === source) && (ctx.auth.isOwner || !j.storeId || ctx.auth.actor.storeIds.includes(j.storeId)))
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((j) => ({
          id: j.id,
          at: j.at,
          source: j.source,
          title: j.title,
          store: findStore(ctx.db, j.storeId)?.name ?? null,
          items: j.items.length,
          labels: j.items.reduce((t, i) => t + i.copies, 0)
        }));
      return ok({ total: rows.length, rows: paginate(rows, pageParam(q(ctx, "page")), 25) });
    }),
    route("GET", "/labels/jobs/:id", (ctx) => {
      need(ctx, "barcode.print");
      const job = ctx.db.labelJobs.find((j) => j.id === ctx.params.id);
      if (!job) notFound("Label job not found.");
      const items = job.items.flatMap((i) => {
        const variant = findVariant(ctx.db, i.variantId);
        return variant ? [{ ...labelItem(ctx.db, variant, labelStores(ctx)), barcodeId: i.barcodeId, copies: i.copies }] : [];
      });
      return ok({ items });
    }),
    route("POST", "/labels/prints", (ctx) => {
      need(ctx, "barcode.print");
      const { db } = ctx;
      const b = body(ctx);
      const template = str(b.template, 60);
      if (!template || template.length > 40) invalid("Pick a label template.");
      const input = Array.isArray(b.items) ? (b.items as Array<{ barcodeId?: string; copies?: number }>) : [];
      if (input.length < 1 || input.length > 500) invalid("Pick 1 to 500 items to print.");
      const items = input.map((item) => {
        const variant = db.variants.find((v) => v.barcodes.some((bc) => bc.id === item.barcodeId));
        if (!variant) reject("An item on this list no longer has that barcode.");
        const copies = Number(item.copies);
        if (!Number.isInteger(copies) || copies < 1 || copies > 2000) invalid("Copies must be a whole number from 1 to 2000.");
        return { variantId: variant.id, barcodeId: String(item.barcodeId), copies };
      });
      const jobId = nextId();
      const labels = items.reduce((t, i) => t + i.copies, 0);
      db.labelJobs.push({
        id: jobId,
        at: new Date().toISOString(),
        source: "manual",
        template,
        storeId: ctx.auth.actor.storeIds[0] ?? null,
        title: `${labels} labels · ${items.length} ${items.length === 1 ? "item" : "items"}`,
        items
      });
      return { status: 201, body: { data: { jobId } } };
    })
  ];
}

export const inventoryRoutes: Route[] = [...stockRoutes(), ...productRoutes(), ...customFieldRoutes(), ...labelRoutes()];
