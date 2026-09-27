import type { CustomField, MeResponse, ProductListingResponse, StockItemDetail } from "@/api/types";
import { buildVariantPatch, formFromDetail, normaliseTags, validateForm, type EditableCustomField } from "@/features/products/editForm";
import { buildFieldBody, buildListingBody, buyerPreview, draftFromField, draftFromListing, emptyFieldDraft, fieldDraftError, sortFields } from "@/features/products/listingLogic";
import {
  activeFilterChips,
  canSeeCost,
  clearFacets,
  customValueText,
  defaultStockFilters,
  facetCount,
  qtyString,
  shortStoreName,
  statusCounts,
  stockQuery,
  stockStatusOf
} from "@/features/stock/stockLogic";

describe("stock filters → GET /stock query", () => {
  it("leaves defaults out", () => {
    expect(stockQuery(defaultStockFilters)).toEqual({
      q: undefined,
      store: undefined,
      status: undefined,
      sort: undefined,
      brand: undefined,
      size: undefined,
      colour: undefined,
      category: undefined,
      page: 1
    });
  });

  it("maps every filter and trims/slices the search", () => {
    const q = stockQuery({ ...defaultStockFilters, q: `  ${"x".repeat(100)} `, status: "low", store: "s1", sort: "stock_low", brand: "Biba", size: "M", colour: "Red", category: "Kurtas" }, 3);
    expect(q.q).toHaveLength(80);
    expect(q).toMatchObject({ status: "low", store: "s1", sort: "stock_low", brand: "Biba", size: "M", colour: "Red", category: "Kurtas", page: 3 });
  });

  it("lists active facet chips and clears them", () => {
    const filters = { ...defaultStockFilters, brand: "Biba", colour: "Red", sort: "newest" as const, status: "out" as const };
    expect(activeFilterChips(filters).map((c) => c.label)).toEqual(["Brand: Biba", "Colour: Red", "Sort: Newest"]);
    expect(facetCount(filters)).toBe(3);
    const cleared = clearFacets(filters);
    expect(activeFilterChips(cleared)).toEqual([]);
    expect(cleared.status).toBe("out");
  });

  it("uses the API's stock thresholds", () => {
    expect(stockStatusOf(0)).toBe("out");
    expect(stockStatusOf(-2)).toBe("out");
    expect(stockStatusOf(1)).toBe("low");
    expect(stockStatusOf(5)).toBe("low");
    expect(stockStatusOf(6)).toBe("in");
  });

  it("derives chip counts from the summary", () => {
    expect(statusCounts({ skus: 20, units: 100, costValue: 0, mrpValue: 0, low: 4, out: 3 })).toEqual({ all: 20, in: 13, low: 4, out: 3 });
    expect(statusCounts(undefined)).toBeUndefined();
  });

  it("hides cost from staff without purchase.view_cost", () => {
    const staff = { actor: "worker", permissions: ["stock.view"] } as unknown as MeResponse;
    expect(canSeeCost(staff)).toBe(false);
    expect(canSeeCost({ ...staff, permissions: ["purchase.view_cost"] })).toBe(true);
    expect(canSeeCost({ ...staff, actor: "seller" })).toBe(true);
  });

  it("formats small helpers", () => {
    expect(shortStoreName("Luzzan — MG Road")).toBe("MG Road");
    expect(shortStoreName("Main")).toBe("Main");
    expect(qtyString(2)).toBe("2");
    expect(qtyString(1.23456)).toBe("1.235");
    expect(customValueText(["Cotton", "Silk"])).toBe("Cotton, Silk");
    expect(customValueText(true)).toBe("Yes");
    expect(customValueText(null)).toBe("");
  });
});

const detail: StockItemDetail = {
  variantId: "v1",
  productId: "p1",
  name: "Cotton Kurta",
  brand: "Biba",
  category: "Kurtas",
  size: "M",
  colour: "Indigo",
  style: "",
  hsnCode: "6204",
  gst: { code: "GST5", label: "GST 5%", rate: 5 },
  mrp: 1299,
  price: 1149.5,
  active: true,
  internalDescription: "Reorder in March",
  barcodes: [],
  images: [],
  stock: [],
  totalStock: 0,
  movements: [],
  customValues: { f1: "Cotton", f2: ["Festive", "Summer"], f3: true },
  tags: ["festive", "cotton"],
  siblings: []
};
const fields: EditableCustomField[] = [
  { id: "f1", name: "Fabric", type: "select", options: ["Cotton", "Silk"] },
  { id: "f2", name: "Occasion", type: "multi_select", options: ["Festive", "Summer", "Office"] },
  { id: "f3", name: "Handmade", type: "boolean", options: [] },
  { id: "f4", name: "Weight", type: "decimal", options: [] }
];

describe("product edit form → PATCH body (full replace)", () => {
  it("starts from every loaded value", () => {
    const form = formFromDetail(detail, fields, "Soft cotton");
    expect(form).toMatchObject({ productName: "Cotton Kurta", mrp: "1299", saleRate: "1149.5", gstCode: "GST5", publicDescription: "Soft cotton", tags: ["festive", "cotton"] });
    expect(form.custom).toEqual({ f1: "Cotton", f2: "Festive, Summer", f3: "true", f4: "" });
  });

  it("sends every field, tags comma-separated and custom_<id> values", () => {
    const body = buildVariantPatch(formFromDetail(detail, fields, "Soft cotton"), fields, { canPublish: true, canSeeInternal: true });
    expect(body).toEqual({
      productName: "Cotton Kurta",
      mrp: "1299",
      saleRate: "1149.5",
      brand: "Biba",
      category: "Kurtas",
      size: "M",
      colour: "Indigo",
      style: "",
      hsnCode: "6204",
      gstCode: "GST5",
      internalDescription: "Reorder in March",
      publicDescription: "Soft cotton",
      tags: "festive,cotton",
      custom_f1: "Cotton",
      custom_f2: "Festive,Summer",
      custom_f3: "true",
      custom_f4: ""
    });
  });

  it("leaves publication fields out without the permission", () => {
    const body = buildVariantPatch(formFromDetail(detail, fields), fields, { canPublish: false, canSeeInternal: true });
    expect(body).not.toHaveProperty("publicDescription");
    expect(body).not.toHaveProperty("tags");
  });

  it("validates price, HSN and typed custom values", () => {
    const form = { ...formFromDetail(detail, fields), saleRate: "1500", hsnCode: "62", custom: { f4: "heavy" } };
    const errors = validateForm(form, fields);
    expect(errors.saleRate).toMatch(/more than MRP/);
    expect(errors.hsnCode).toMatch(/4 to 8/);
    expect(errors.custom_f4).toBe("Enter a number.");
    expect(validateForm(formFromDetail(detail, fields), fields)).toEqual({});
  });

  it("normalises tags", () => {
    expect(normaliseTags([" Festive ", "festive", "a,b", ""])).toEqual(["Festive", "a b"]);
    expect(normaliseTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(25);
  });
});

const listing: ProductListingResponse = {
  product: { id: "p1", name: "Cotton Kurta", brand: "Biba", category: "Kurtas" },
  enabled: true,
  listedStoreIds: ["s1", "gone"],
  description: "Soft",
  fields: { product_name: true, brand: false, mrp: true, sale_rate: true, "custom:f1": true },
  tags: ["cotton"],
  images: [{ id: "i1", url: null }],
  stores: [
    { id: "s1", name: "Luzzan — MG Road", city: "Indore", discoverable: true },
    { id: "s2", name: "Luzzan — Ujjain", city: "Ujjain", discoverable: false }
  ],
  customColumns: [{ key: "custom:f1", label: "Fabric" }],
  variants: [
    { id: "v1", label: "M / Indigo", barcode: "B1", mrp: 1299, price: 1149, stock: { s1: 3, s2: 0 }, status: { s1: "in_stock", s2: "hidden" } },
    { id: "v2", label: "L / Indigo", barcode: "B2", mrp: 1299, price: 1199, stock: { s1: 0, s2: 2 }, status: { s1: "out_of_stock", s2: "hidden" } }
  ],
  fieldOptions: [
    { key: "product_name", label: "Product name" },
    { key: "brand", label: "Brand" },
    { key: "size", label: "Size" },
    { key: "mrp", label: "MRP" },
    { key: "sale_rate", label: "Price" },
    { key: "custom:f1", label: "Fabric" }
  ]
};

describe("online listing", () => {
  it("builds the PUT body from the draft", () => {
    const draft = { ...draftFromListing(listing), tags: ["cotton", "Cotton", "summer"] };
    expect(buildListingBody(draft, listing)).toEqual({ enabled: true, storeIds: ["s1"], fields: ["product_name", "mrp", "sale_rate", "custom:f1"], description: "Soft", tags: ["cotton", "summer"] });
  });

  it("previews only the chosen fields", () => {
    const draft = draftFromListing(listing);
    const preview = buyerPreview(draft, listing);
    expect(preview).toMatchObject({ title: "Cotton Kurta", brand: null, price: 1149, mrp: 1299, options: [], customLabels: ["Fabric"], inStock: true });
    const withSize = buyerPreview({ ...draft, fields: { ...draft.fields, size: true }, storeIds: ["s2"] }, listing);
    expect(withSize.options).toEqual(["M / Indigo", "L / Indigo"]);
    expect(withSize.inStock).toBe(true);
  });
});

describe("custom columns", () => {
  const field: CustomField = {
    id: "f1",
    name: "Fabric",
    field_type: "dropdown",
    options_json: ["Cotton", "Silk"],
    is_public_eligible: true,
    is_required_on_purchase: false,
    default_public_enabled: true,
    show_in_purchase_grid: true,
    show_in_sale_search: false,
    is_active: true,
    deleted_at: null,
    sort_order: 2
  };

  it("sends options comma-separated and maps legacy dropdown to select", () => {
    expect(buildFieldBody(draftFromField(field))).toEqual({
      fieldId: "f1",
      name: "Fabric",
      fieldType: "select",
      options: "Cotton,Silk",
      isRequiredOnPurchase: false,
      showInPurchaseGrid: true,
      showInSaleSearch: false,
      isPublicEligible: true,
      defaultPublicEnabled: true
    });
  });

  it("drops options for non-list types and validates", () => {
    const body = buildFieldBody({ ...emptyFieldDraft, name: " Season ", options: ["x"], defaultPublicEnabled: true });
    expect(body).not.toHaveProperty("options");
    expect(body).not.toHaveProperty("fieldId");
    expect(body.name).toBe("Season");
    expect(body.defaultPublicEnabled).toBe(false);
    expect(fieldDraftError({ ...emptyFieldDraft, name: "" })).toMatch(/name/);
    expect(fieldDraftError({ ...emptyFieldDraft, name: "Fit", fieldType: "select" })).toMatch(/option/);
  });

  it("splits active and archived in order", () => {
    const archivedField = { ...field, id: "f0", sort_order: 1, is_active: false, deleted_at: "2026-01-01" };
    const other = { ...field, id: "f3", sort_order: 1 };
    const { active, archived } = sortFields([field, archivedField, other]);
    expect(active.map((f) => f.id)).toEqual(["f3", "f1"]);
    expect(archived.map((f) => f.id)).toEqual(["f0"]);
  });
});
