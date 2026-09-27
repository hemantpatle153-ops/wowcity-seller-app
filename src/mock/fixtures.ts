/**
 * Deterministic seed data for the demo shop "Luzzan Fashions" (seeded PRNG; dates relative to the
 * moment the mock starts so the demo always looks current). The static catalogue, people and
 * settings go straight into the db; history (purchases, sales, returns, dues) is returned as a
 * script that state.ts replays through the real business rules.
 */
import type { CustomField, LabelTemplate, PurchaseRequest, SaleRequest } from "@/api/types";
import { calculateSaleBill } from "@/lib/saleMath";
import type { ActorRef, Db, DbCustomer, DbProduct, DbStore, DbSupplier, DbVariant, DbWorker } from "./db";
import { addDays, createRng, ean13, financialYearOf, intBetween, isoDate, pick, startOfDay, uuidFrom, type Rng } from "./util";

export const DEMO = {
  shopCode: "LUZ482",
  ownerEmail: "owner@luzzan.in",
  ownerPassword: "demo1234",
  otpCode: "123456",
  staffPin: "1234"
} as const;

type ProductSpec = {
  name: string;
  brand: string;
  category: string;
  hsn: string;
  mrp: number;
  rate: number;
  sizes: string[];
  colours: string[];
  style?: string;
  fabric: string;
  fit?: string;
  season: string;
};

const PRODUCTS: ProductSpec[] = [
  { name: "Cotton Straight Kurta", brand: "Biba", category: "Kurtas", hsn: "6204", mrp: 1299, rate: 1149, sizes: ["S", "M", "L", "XL"], colours: ["Indigo"], fabric: "Cotton", season: "All season" },
  {
    name: "Anarkali Printed Kurta",
    brand: "W",
    category: "Kurtas",
    hsn: "6204",
    mrp: 1899,
    rate: 1699,
    sizes: ["M", "L", "XL"],
    colours: ["Maroon"],
    style: "Anarkali",
    fabric: "Rayon",
    season: "Festive"
  },
  {
    name: "Rayon A-line Kurta",
    brand: "Rangmanch",
    category: "Kurtas",
    hsn: "6204",
    mrp: 999,
    rate: 899,
    sizes: ["S", "M", "L"],
    colours: ["Mustard", "Teal"],
    style: "A-line",
    fabric: "Rayon",
    season: "Summer"
  },
  { name: "Lucknowi Chikankari Kurta", brand: "Rangmanch", category: "Kurtas", hsn: "6204", mrp: 2499, rate: 2199, sizes: ["M", "L"], colours: ["White"], fabric: "Cotton", season: "Summer" },
  { name: "Banarasi Silk Saree", brand: "Rangmanch", category: "Sarees", hsn: "5007", mrp: 8999, rate: 7999, sizes: ["Free"], colours: ["Red", "Royal Blue"], fabric: "Silk", season: "Wedding" },
  {
    name: "Kanjivaram Style Silk Saree",
    brand: "Kanchi Weaves",
    category: "Sarees",
    hsn: "5007",
    mrp: 6499,
    rate: 5899,
    sizes: ["Free"],
    colours: ["Green", "Magenta"],
    fabric: "Silk",
    season: "Festive"
  },
  {
    name: "Printed Georgette Saree",
    brand: "Saree Mandir",
    category: "Sarees",
    hsn: "5407",
    mrp: 1499,
    rate: 1299,
    sizes: ["Free"],
    colours: ["Peach", "Navy"],
    fabric: "Georgette",
    season: "All season"
  },
  { name: "Cotton Handloom Saree", brand: "Rangmanch", category: "Sarees", hsn: "5208", mrp: 1199, rate: 999, sizes: ["Free"], colours: ["Beige"], fabric: "Cotton", season: "Summer" },
  {
    name: "511 Slim Fit Jeans",
    brand: "Levi's",
    category: "Jeans",
    hsn: "6203",
    mrp: 3299,
    rate: 2799,
    sizes: ["30", "32", "34"],
    colours: ["Dark Blue", "Black"],
    fabric: "Denim",
    fit: "Slim",
    season: "All season"
  },
  {
    name: "505 Regular Fit Jeans",
    brand: "Levi's",
    category: "Jeans",
    hsn: "6203",
    mrp: 2999,
    rate: 2599,
    sizes: ["30", "32", "34"],
    colours: ["Mid Blue"],
    fabric: "Denim",
    fit: "Regular",
    season: "All season"
  },
  {
    name: "Women's Skinny Jeans",
    brand: "Spykar",
    category: "Jeans",
    hsn: "6204",
    mrp: 1999,
    rate: 1699,
    sizes: ["28", "30", "32"],
    colours: ["Light Blue"],
    fabric: "Denim",
    fit: "Slim",
    season: "All season"
  },
  {
    name: "Slim Fit Formal Shirt",
    brand: "Peter England",
    category: "Shirts",
    hsn: "6205",
    mrp: 1499,
    rate: 1299,
    sizes: ["M", "L", "XL"],
    colours: ["White", "Sky Blue"],
    fabric: "Cotton",
    fit: "Slim",
    season: "All season"
  },
  {
    name: "Oxford Formal Shirt",
    brand: "Allen Solly",
    category: "Shirts",
    hsn: "6205",
    mrp: 1799,
    rate: 1549,
    sizes: ["M", "L", "XL"],
    colours: ["Pink"],
    fabric: "Cotton",
    fit: "Regular",
    season: "All season"
  },
  {
    name: "Linen Casual Shirt",
    brand: "Allen Solly",
    category: "Shirts",
    hsn: "6205",
    mrp: 2199,
    rate: 1899,
    sizes: ["M", "L"],
    colours: ["Olive"],
    fabric: "Linen",
    fit: "Relaxed",
    season: "Summer"
  },
  {
    name: "Printed Crew Neck T-shirt",
    brand: "Roadster",
    category: "T-shirts",
    hsn: "6109",
    mrp: 599,
    rate: 499,
    sizes: ["S", "M", "L", "XL"],
    colours: ["Black", "White"],
    fabric: "Cotton",
    fit: "Regular",
    season: "Summer"
  },
  {
    name: "Classic Polo T-shirt",
    brand: "U.S. Polo Assn.",
    category: "T-shirts",
    hsn: "6105",
    mrp: 1299,
    rate: 1099,
    sizes: ["M", "L", "XL"],
    colours: ["Navy"],
    fabric: "Cotton",
    fit: "Regular",
    season: "All season"
  },
  {
    name: "Graphic Oversized Tee",
    brand: "Bewakoof",
    category: "T-shirts",
    hsn: "6109",
    mrp: 699,
    rate: 549,
    sizes: ["M", "L"],
    colours: ["Lavender"],
    fabric: "Cotton",
    fit: "Oversized",
    season: "Summer"
  },
  {
    name: "Ankle Length Leggings",
    brand: "Go Colors",
    category: "Leggings",
    hsn: "6104",
    mrp: 399,
    rate: 349,
    sizes: ["Free"],
    colours: ["Black", "Maroon", "Beige"],
    fabric: "Cotton",
    season: "All season"
  },
  { name: "Churidar Leggings", brand: "Twin Birds", category: "Leggings", hsn: "6104", mrp: 299, rate: 279, sizes: ["Free"], colours: ["White", "Navy"], fabric: "Cotton", season: "All season" },
  {
    name: "Kids Party Wear Frock",
    brand: "Little Kangaroos",
    category: "Kids",
    hsn: "6209",
    mrp: 899,
    rate: 799,
    sizes: ["2-3Y", "4-5Y", "6-7Y"],
    colours: ["Pink"],
    fabric: "Georgette",
    season: "Festive"
  },
  { name: "Kids Cotton Frock", brand: "Hopscotch", category: "Kids", hsn: "6209", mrp: 599, rate: 499, sizes: ["2-3Y", "4-5Y"], colours: ["Yellow"], fabric: "Cotton", season: "Summer" },
  { name: "Wedding Sherwani Set", brand: "Manyavar", category: "Ethnic Men", hsn: "6203", mrp: 8999, rate: 8499, sizes: ["M", "L", "XL"], colours: ["Ivory"], fabric: "Silk", season: "Wedding" },
  { name: "Silk Blend Dupatta", brand: "Rangmanch", category: "Dupattas", hsn: "6214", mrp: 699, rate: 599, sizes: ["Free"], colours: ["Red", "Mustard", "Green"], fabric: "Silk", season: "Festive" },
  { name: "Phulkari Embroidered Dupatta", brand: "Rangmanch", category: "Dupattas", hsn: "6214", mrp: 1299, rate: 1099, sizes: ["Free"], colours: ["Multicolour"], fabric: "Cotton", season: "Festive" }
];

const CUSTOMER_NAMES = [
  "Priya Sharma",
  "Rahul Verma",
  "Anjali Gupta",
  "Vikram Singh",
  "Neha Jain",
  "Amit Patel",
  "Sneha Agrawal",
  "Rohit Choudhary",
  "Pooja Mishra",
  "Karan Malhotra",
  "Divya Tiwari",
  "Sanjay Yadav",
  "Kavita Joshi",
  "Manish Soni",
  "Ritu Saxena",
  "Arun Dubey",
  "Shalini Rathore",
  "Deepak Chouhan",
  "Meghna Bhatt",
  "Nikhil Kushwah",
  "Swati Pandey",
  "Gaurav Thakur",
  "Anita Raghuvanshi",
  "Harsh Sen",
  "Isha Khandelwal",
  "Mohit Goyal",
  "Rekha Parmar",
  "Sunil Patidar"
];
const CITIES = [
  { city: "Indore", address: "Vijay Nagar" },
  { city: "Indore", address: "Palasia" },
  { city: "Indore", address: "Rajwada" },
  { city: "Bhopal", address: "Arera Colony" },
  { city: "Bhopal", address: "Kolar Road" },
  { city: "Ujjain", address: "Freeganj" },
  { city: "Dewas", address: "AB Road" }
];

const SUPPLIERS = [
  { name: "Arvind Fashions Distributors", mobile: "9824512345", gstin: "24AAACA1234B1Z8", state: "Gujarat", address: "Ashram Road, Ahmedabad", brands: ["W", "Biba", "Spykar"] },
  { name: "Surat Silk Mills", mobile: "9825098765", gstin: "24AAFCS5678C1Z3", state: "Gujarat", address: "Ring Road Textile Market, Surat", brands: ["Kanchi Weaves", "Saree Mandir"] },
  { name: "Levi Strauss (India) Pvt Ltd", mobile: "8041234567", gstin: "29AAACL1234D1Z5", state: "Karnataka", address: "Bellandur, Bengaluru", brands: ["Levi's", "U.S. Polo Assn."] },
  { name: "Madura Fashion & Lifestyle", mobile: "8067891234", gstin: "29AAACM4321E1ZX", state: "Karnataka", address: "Whitefield, Bengaluru", brands: ["Peter England", "Allen Solly", "Manyavar"] },
  {
    name: "Indore Garment Wholesale",
    mobile: "9827054321",
    gstin: "23AAHFI9876F1Z1",
    state: "Madhya Pradesh",
    address: "MT Cloth Market, Indore",
    brands: ["Go Colors", "Twin Birds", "Roadster", "Bewakoof", "Little Kangaroos", "Hopscotch"]
  },
  { name: "Jaipur Prints & Co.", mobile: "9829067890", gstin: "08AAKFJ2468G1Z7", state: "Rajasthan", address: "Johari Bazaar, Jaipur", brands: ["Rangmanch"] }
];

const LABEL_TEMPLATES: LabelTemplate[] = [
  {
    key: "a4-3x4",
    name: "A4 · 12 labels (3 × 4)",
    description: "Big tags for sarees and gift sets.",
    page: { width: 210, height: 297 },
    columns: 3,
    rows: 4,
    label: { width: 63.5, height: 72 },
    margin: { top: 4.5, left: 7.2 },
    gap: { x: 2.5, y: 0 },
    radius: 2
  },
  {
    key: "a4-3x8",
    name: "A4 · 24 labels (3 × 8)",
    description: "Standard sticker sheet for garment tags.",
    page: { width: 210, height: 297 },
    columns: 3,
    rows: 8,
    label: { width: 63.5, height: 33.9 },
    margin: { top: 12.9, left: 7.2 },
    gap: { x: 2.5, y: 0 },
    radius: 2
  },
  {
    key: "a4-4x10",
    name: "A4 · 40 labels (4 × 10)",
    description: "Small price stickers.",
    page: { width: 210, height: 297 },
    columns: 4,
    rows: 10,
    label: { width: 48.5, height: 25.4 },
    margin: { top: 21.5, left: 8 },
    gap: { x: 0, y: 0 },
    radius: 1
  },
  {
    key: "roll-50x25",
    name: "Roll · 50 × 25 mm",
    description: "Thermal label printer roll.",
    page: { width: 50, height: 25 },
    columns: 1,
    rows: 1,
    label: { width: 50, height: 25 },
    margin: { top: 0, left: 0 },
    gap: { x: 0, y: 0 },
    radius: 0
  }
];

export interface SeedScript {
  purchases: Array<{ at: string; actor: ActorRef; body: PurchaseRequest }>;
  sales: Array<{ at: string; actor: ActorRef; body: SaleRequest }>;
  returns: Array<{ at: string; saleIndex: number; refundMode: "cash" | "credit_note" }>;
  ledger: Array<{ at: string; customerId: string; type: string; label: string; mode: string | null; increase: number; decrease: number }>;
  targetStock: Record<string, Record<string, number>>;
  transfers: Array<{ at: string; variantId: string; fromStoreId: string; toStoreId: string; qty: number }>;
  dumps: Array<{ at: string; variantId: string; storeId: string; qty: number; reason: string; note: string }>;
}

function atTime(now: Date, daysAgo: number, hour: number, minute: number): string {
  const d = addDays(startOfDay(now), -daysAgo);
  d.setHours(hour, minute, intBetween(createRng(daysAgo * 100 + minute), 0, 59));
  return d.toISOString();
}

export function buildSeed(now: Date): { db: Db; script: SeedScript; rng: Rng } {
  const rng = createRng(482);
  const id = () => uuidFrom(rng);
  const createdLongAgo = addDays(startOfDay(now), -210).toISOString();
  const fy = financialYearOf(now);
  const sellerId = id();
  const ownerId = id();

  // ------------------------------------------------------------------ stores
  const store = (name: string, l1: string, l2: string, city: string, pincode: string, phone: string, prefix: string, active: boolean, counter: number, lat: number, lng: number): DbStore => ({
    id: id(),
    name,
    address_line_1: l1,
    address_line_2: l2,
    city,
    state: "Madhya Pradesh",
    pincode,
    contact_phone: phone,
    gstin: "23ABCDE1234F1Z5",
    google_maps_url: null,
    latitude: lat,
    longitude: lng,
    is_discoverable: active,
    public_address_enabled: active,
    public_contact_enabled: active,
    is_active: active,
    invoice_prefix: prefix,
    createdAt: createdLongAgo,
    billCounter: counter,
    estimateCounter: 3
  });
  const mg = store("Luzzan — MG Road", "14, MG Road", "Near Regal Square", "Indore", "452001", "+91 731 400 1234", "MG", true, 118, 22.7196, 75.8577);
  const nm = store("Luzzan — New Market", "Shop 22, New Market", "TT Nagar", "Bhopal", "462003", "+91 755 266 4321", "NM", true, 64, 23.2336, 77.4006);
  const uj = store("Luzzan — Ujjain", "7, Freeganj Main Road", "", "Ujjain", "456010", "+91 734 255 0101", "UJ", false, 212, 23.1765, 75.7885);
  const stores = [mg, nm, uj];

  // ------------------------------------------------------------------ custom fields
  const fabricId = id();
  const fitId = id();
  const seasonId = id();
  const customFields: CustomField[] = [
    {
      id: fabricId,
      name: "Fabric",
      field_type: "select",
      options_json: ["Cotton", "Silk", "Rayon", "Denim", "Linen", "Georgette"],
      is_public_eligible: true,
      is_required_on_purchase: false,
      default_public_enabled: true,
      show_in_purchase_grid: true,
      show_in_sale_search: true,
      is_active: true,
      deleted_at: null,
      sort_order: 1
    },
    {
      id: fitId,
      name: "Fit",
      field_type: "select",
      options_json: ["Slim", "Regular", "Relaxed", "Oversized"],
      is_public_eligible: true,
      is_required_on_purchase: false,
      default_public_enabled: false,
      show_in_purchase_grid: true,
      show_in_sale_search: false,
      is_active: true,
      deleted_at: null,
      sort_order: 2
    },
    {
      id: seasonId,
      name: "Season",
      field_type: "text",
      options_json: [],
      is_public_eligible: true,
      is_required_on_purchase: false,
      default_public_enabled: false,
      show_in_purchase_grid: true,
      show_in_sale_search: false,
      is_active: true,
      deleted_at: null,
      sort_order: 3
    },
    {
      id: id(),
      name: "Old rack code",
      field_type: "text",
      options_json: [],
      is_public_eligible: false,
      is_required_on_purchase: false,
      default_public_enabled: false,
      show_in_purchase_grid: false,
      show_in_sale_search: false,
      is_active: false,
      deleted_at: addDays(now, -40).toISOString(),
      sort_order: 4
    }
  ];

  // ------------------------------------------------------------------ catalogue
  const products: DbProduct[] = [];
  const variants: DbVariant[] = [];
  let barcodeSeq = 0;
  PRODUCTS.forEach((spec, index) => {
    const createdAt = addDays(startOfDay(now), -(180 - index * 5)).toISOString();
    const product: DbProduct = {
      id: id(),
      name: spec.name,
      brand: spec.brand,
      category: spec.category,
      hsnCode: spec.hsn,
      active: true,
      createdAt,
      listing: {
        enabled: index % 3 !== 2,
        storeIds: index % 3 !== 2 ? [mg.id, ...(index % 2 === 0 ? [nm.id] : [])] : [],
        fields: ["product_name", "brand", "category", "size", "colour", "mrp", "sale_rate"],
        description: `${spec.fabric} ${spec.category.toLowerCase()} from ${spec.brand}.`,
        tags: [spec.category.toLowerCase(), spec.season.toLowerCase()]
      },
      images: index % 4 === 3 ? [] : [{ id: id(), url: `https://picsum.photos/seed/luzzan-${index}/600/800`, variantId: null, isPrimary: true }]
    };
    products.push(product);
    const gstCode = spec.rate <= 1000 ? "GST5" : "GST12";
    for (const size of spec.sizes)
      for (const colour of spec.colours) {
        barcodeSeq += 1;
        const costFactor = 0.52 + rng() * 0.1;
        variants.push({
          id: id(),
          productId: product.id,
          size,
          colour,
          style: spec.style ?? "",
          mrp: spec.mrp,
          saleRate: spec.rate,
          gstCode,
          active: true,
          barcodes: [{ id: id(), barcode: ean13(`89012345${String(barcodeSeq).padStart(4, "0")}`) }],
          unitCost: Math.round((spec.rate * costFactor) / 5) * 5,
          internalDescription: `Rack ${String.fromCharCode(65 + (index % 6))}${(index % 9) + 1}`,
          customValues: { [fabricId]: spec.fabric, ...(spec.fit ? { [fitId]: spec.fit } : {}), [seasonId]: spec.season },
          tags: [],
          createdAt,
          changedAt: createdAt
        });
      }
  });

  // Target stock: mostly healthy, some low (1–5) and some out (0).
  const targetStock: SeedScript["targetStock"] = {};
  variants.forEach((variant, index) => {
    const level = () => {
      const r = rng();
      return r < 0.1 ? 0 : r < 0.24 ? intBetween(rng, 1, 5) : intBetween(rng, 6, 28);
    };
    const expensive = variant.mrp >= 6000;
    targetStock[variant.id] = {
      [mg.id]: index % 11 === 4 ? 0 : index % 9 === 2 ? 3 : expensive ? intBetween(rng, 1, 4) : level(),
      [nm.id]: index % 13 === 6 ? 0 : expensive ? intBetween(rng, 0, 3) : level(),
      [uj.id]: 0
    };
  });

  // ------------------------------------------------------------------ customers
  const customers: DbCustomer[] = CUSTOMER_NAMES.map((name, index) => {
    const place = pick(rng, CITIES);
    const createdAt = addDays(startOfDay(now), -intBetween(rng, 2, 200)).toISOString();
    return {
      id: id(),
      name,
      mobile: `98${String(intBetween(rng, 10000000, 99999999))}`,
      address: index % 3 === 0 ? `${intBetween(rng, 1, 250)}, ${place.address}` : null,
      city: place.city,
      state: "Madhya Pradesh",
      gstin: null,
      createdAt,
      changedAt: createdAt
    };
  });
  const b2bCreated = addDays(startOfDay(now), -120).toISOString();
  customers.push(
    {
      id: id(),
      name: "Shree Ganesh Textiles",
      mobile: "9893045678",
      address: "Sarafa Bazaar",
      city: "Indore",
      state: "Madhya Pradesh",
      gstin: "23AAKFS1234L1Z2",
      createdAt: b2bCreated,
      changedAt: b2bCreated
    },
    { id: id(), name: "Sharma Uniforms", mobile: "9822056789", address: "Sitabuldi", city: "Nagpur", state: "Maharashtra", gstin: "27ABHPS5678K1Z9", createdAt: b2bCreated, changedAt: b2bCreated }
  );

  // ------------------------------------------------------------------ suppliers
  const suppliers: DbSupplier[] = SUPPLIERS.map((s) => ({ id: id(), name: s.name, mobile: s.mobile, gstin: s.gstin, state: s.state, address: s.address, active: true, createdAt: createdLongAgo }));

  // ------------------------------------------------------------------ staff
  const allWeek = (start: string, end: string, sunday: boolean) => [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day_of_week: day, start_time: start, end_time: end, enabled: day !== 0 || sunday }));
  const ravi: DbWorker = {
    id: id(),
    username: "ravi",
    displayName: "Ravi Kumar",
    mobile: "9826011111",
    pin: DEMO.staffPin,
    disabled: false,
    permissions: ["sale.create", "sale.view", "sale.return"],
    storeIds: [mg.id],
    restricted: true,
    shifts: allWeek("09:00", "22:00", true),
    createdAt: addDays(now, -150).toISOString(),
    lastLoginAt: addDays(now, -1).toISOString()
  };
  const meena: DbWorker = {
    id: id(),
    username: "meena",
    displayName: "Meena Joshi",
    mobile: "9826022222",
    pin: DEMO.staffPin,
    disabled: false,
    permissions: [
      "sale.create",
      "sale.view",
      "sale.return",
      "sale.discount_override",
      "purchase.create",
      "purchase.view",
      "purchase.view_cost",
      "product.view",
      "product.edit",
      "product.images.manage",
      "stock.view",
      "barcode.view",
      "barcode.print",
      "reports.sale",
      "reports.stock",
      "reports.due"
    ],
    storeIds: [mg.id, nm.id],
    restricted: false,
    shifts: [],
    createdAt: addDays(now, -190).toISOString(),
    lastLoginAt: now.toISOString()
  };
  const arjun: DbWorker = {
    id: id(),
    username: "arjun",
    displayName: "Arjun Verma",
    mobile: "9826033333",
    pin: DEMO.staffPin,
    disabled: true,
    permissions: ["purchase.create", "purchase.view", "product.view", "stock.view", "barcode.view", "barcode.print"],
    storeIds: [nm.id],
    restricted: true,
    shifts: allWeek("10:00", "19:00", false),
    createdAt: addDays(now, -95).toISOString(),
    lastLoginAt: addDays(now, -33).toISOString()
  };
  const owner: ActorRef = { kind: "owner", id: ownerId };

  const db: Db = {
    seededAt: now,
    sellerId,
    owner: { id: ownerId, name: "Hemant Patle", email: DEMO.ownerEmail, password: DEMO.ownerPassword },
    lockdown: false,
    settings: {
      profile: { displayName: "Luzzan Fashions", businessType: "Clothing", ownerName: "Hemant Patle", phone: "+91 98260 12345", email: DEMO.ownerEmail, shopCode: DEMO.shopCode },
      tax: { legalName: "Luzzan Fashions", gstin: "23ABCDE1234F1Z5", stateCode: "23", state: "Madhya Pradesh", pan: "ABCDE1234F", roundingMode: "nearest_rupee" },
      invoice: {
        terms: "Goods once sold will be exchanged within 7 days with the bill. No exchange on sale items.",
        upiId: "luzzan@okaxis",
        payeeName: "Luzzan Fashions",
        showUpiQr: true,
        bankName: "HDFC Bank",
        accountName: "Luzzan Fashions",
        accountNumber: "50200012345678",
        ifsc: "HDFC0001234",
        printFormat: "thermal"
      },
      gstSlabs: [
        { code: "GST0", label: "GST 0%", rate: 0, is_special: false },
        { code: "GST5", label: "GST 5%", rate: 5, is_special: false },
        { code: "GST12", label: "GST 12%", rate: 12, is_special: false },
        { code: "GST18", label: "GST 18%", rate: 18, is_special: false }
      ],
      financialYears: [
        {
          label: `${fy.start.getFullYear() - 1}-${fy.start.getFullYear()}`,
          starts_on: isoDate(new Date(fy.start.getFullYear() - 1, 3, 1)),
          ends_on: isoDate(new Date(fy.start.getFullYear(), 2, 31)),
          is_active: false
        },
        { label: fy.label, starts_on: isoDate(fy.start), ends_on: isoDate(fy.end), is_active: true }
      ]
    },
    stores,
    products,
    variants,
    stock: {},
    movements: [],
    customers,
    suppliers,
    ledger: [],
    invoices: [],
    returns: [],
    purchases: [],
    workers: [ravi, meena, arjun],
    devices: [
      { id: id(), actor: owner, name: "Hemant's iPhone", platform: "ios", createdAt: addDays(now, -60).toISOString(), lastUsedAt: addDays(now, -1).toISOString(), revoked: false },
      { id: id(), actor: owner, name: "Counter Tablet", platform: "android", createdAt: addDays(now, -120).toISOString(), lastUsedAt: now.toISOString(), revoked: false },
      {
        id: id(),
        actor: { kind: "worker", id: ravi.id },
        name: "Counter Phone",
        platform: "android",
        createdAt: addDays(now, -90).toISOString(),
        lastUsedAt: addDays(now, -1).toISOString(),
        revoked: false
      },
      { id: id(), actor: { kind: "worker", id: meena.id }, name: "Meena's Redmi", platform: "android", createdAt: addDays(now, -80).toISOString(), lastUsedAt: now.toISOString(), revoked: false }
    ],
    customFields,
    labelTemplates: LABEL_TEMPLATES,
    labelJobs: [],
    activity: [],
    transfers: [],
    adjustments: [],
    sessions: new Map(),
    accessTokens: new Map(),
    refreshTokens: new Map(),
    idempotency: new Map(),
    counters: { saleReturn: 17, creditNote: 5, debitNote: 2, challan: 9, barcode: barcodeSeq, token: 0 },
    lastTouch: 0
  };

  // ------------------------------------------------------------------ purchases (last 4 weeks)
  const purchases: SeedScript["purchases"] = [];
  const brandSupplier = (brand: string) => suppliers[SUPPLIERS.findIndex((s) => s.brands.includes(brand))];
  const purchaseDays = [27, 24, 21, 18, 15, 12, 9, 6, 4, 2];
  purchaseDays.forEach((daysAgo, index) => {
    const supplierIndex = index % suppliers.length;
    const supplier = suppliers[supplierIndex];
    const pool = variants.filter((v) => brandSupplier(products.find((p) => p.id === v.productId)!.brand) === supplier);
    const chosen = [...pool].sort(() => rng() - 0.5).slice(0, Math.min(pool.length, intBetween(rng, 3, 6)));
    const storeId = index % 3 === 1 ? nm.id : mg.id;
    const rows = chosen.map((variant, rowIndex) => {
      const product = products.find((p) => p.id === variant.productId)!;
      return {
        rowId: `seed-${index}-${rowIndex}`,
        entry: variant.barcodes[0].barcode,
        itemName: product.name,
        brand: product.brand,
        category: product.category,
        size: variant.size,
        colour: variant.colour,
        style: variant.style,
        hsnCode: product.hsnCode,
        gstCode: variant.gstCode,
        gstRate: variant.gstCode === "GST5" ? "5" : "12",
        qty: String(variant.mrp > 5000 ? intBetween(rng, 2, 4) : intBetween(rng, 5, 14)),
        purchaseRate: String(variant.unitCost),
        disc1Percent: index % 2 === 0 ? "5" : "",
        disc1Amount: "",
        disc2Amount: "",
        mrp: String(variant.mrp),
        saleRate: String(variant.saleRate),
        printLabels: index >= 6
      };
    });
    const estimate = rows.reduce((t, r) => t + Number(r.qty) * Number(r.purchaseRate), 0) * 0.9;
    const paymentPlan = index % 3;
    purchases.push({
      at: atTime(now, daysAgo, 11, 15 + index),
      actor: owner,
      body: {
        supplierId: supplier.id,
        gstPricingMode: "exclusive",
        purchaseDate: isoDate(addDays(now, -daysAgo)),
        invoiceNumber: `${supplier.name.split(" ")[0].slice(0, 3).toUpperCase()}/${fy.short}/${String(300 + index * 17)}`,
        storeId,
        idempotencyKey: `seed-purchase-${index}-000`,
        payments:
          paymentPlan === 0
            ? [{ mode: "bank", amount: String(Math.floor(estimate / 100) * 100), referenceNo: `NEFT${400100 + index}` }]
            : paymentPlan === 1
              ? [{ mode: "upi", amount: String(Math.round(estimate / 2 / 100) * 100) }]
              : [],
        rows
      }
    });
  });

  // ------------------------------------------------------------------ sales (last 14 days)
  const sales: SeedScript["sales"] = [];
  const workersByStore: Record<string, ActorRef[]> = {
    [mg.id]: [owner, { kind: "worker", id: ravi.id }, { kind: "worker", id: ravi.id }, { kind: "worker", id: meena.id }],
    [nm.id]: [owner, { kind: "worker", id: meena.id }]
  };
  let saleIndex = 0;
  for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
    const count = daysAgo === 0 ? 6 : daysAgo === 1 ? 5 : intBetween(rng, 2, 4);
    for (let n = 0; n < count; n++) {
      saleIndex += 1;
      const storeId = rng() < 0.6 ? mg.id : nm.id;
      const actor = pick(rng, workersByStore[storeId]);
      let at: string;
      if (daysAgo === 0) {
        const minutesBack = (count - n) * 23 + intBetween(rng, 0, 9);
        const t = Math.max(startOfDay(now).getTime() + (n + 1) * 60000, now.getTime() - minutesBack * 60000);
        at = new Date(t).toISOString();
      } else {
        at = atTime(now, daysAgo, 10 + Math.floor((n * 10) / count) + intBetween(rng, 0, 1), intBetween(rng, 0, 59));
      }
      const customer = rng() < 0.55 ? pick(rng, customers) : null;
      const lineCount = intBetween(rng, 1, 3);
      const canDiscount = actor.kind === "owner" || actor.id === meena.id;
      const discount = canDiscount && rng() < 0.2 ? 10 : 0;
      const rows = Array.from({ length: lineCount }, () => {
        const variant = pick(
          rng,
          variants.filter((v) => v.mrp < 6000 || rng() < 0.15)
        );
        const product = products.find((p) => p.id === variant.productId)!;
        return {
          variantId: variant.id,
          barcode: variant.barcodes[0].barcode,
          itemName: product.name,
          qty: rng() < 0.12 ? "2" : "1",
          mrp: String(variant.mrp),
          rate: String(variant.saleRate),
          discountPercent: String(discount),
          discountAmount: "0",
          gstRate: variant.gstCode === "GST5" ? 5 : 12
        };
      });
      const net = Number(calculateSaleBill(rows, "inclusive", "intra_state", "nearest_rupee").totals.netSale);
      const r = rng();
      let payments: SaleRequest["payments"];
      if (customer && r > 0.86) payments = net > 1500 ? [{ mode: "cash", amount: String(Math.floor(net / 2 / 100) * 100) }] : [];
      else if (r < 0.4) payments = [{ mode: "cash", amount: String(Math.ceil(net / 100) * 100) }];
      else if (r < 0.78) payments = [{ mode: "upi", amount: String(net), referenceNo: `UPI${412000 + saleIndex * 37}` }];
      else if (r < 0.86) payments = [{ mode: "card", amount: String(net), referenceNo: `XX${1000 + saleIndex}` }];
      else payments = [{ mode: "cash", amount: String(Math.ceil(net / 500) * 500) }];
      sales.push({
        at,
        actor,
        body: {
          kind: "sale",
          storeId,
          billType: "invoice",
          taxType: "inclusive",
          idempotencyKey: `seed-sale-${saleIndex}-00000`,
          customer: customer ? { id: customer.id } : {},
          rows: rows.map(({ gstRate: _g, ...row }) => row),
          payments
        }
      });
    }
  }
  // Two B2B bills (GST-registered customers): one in Madhya Pradesh, one inter-state (IGST).
  const b2b: Array<{ daysAgo: number; customer: DbCustomer; picks: number[]; paid: "none" | "full" }> = [
    { daysAgo: 9, customer: customers[28], picks: [0, 1, 2], paid: "none" },
    { daysAgo: 5, customer: customers[29], picks: [36, 37, 38], paid: "full" }
  ];
  b2b.forEach((entry, index) => {
    const rows = entry.picks.map((i) => ({
      variantId: variants[i].id,
      barcode: variants[i].barcodes[0].barcode,
      itemName: products.find((p) => p.id === variants[i].productId)!.name,
      qty: "4",
      mrp: String(variants[i].mrp),
      rate: String(variants[i].saleRate)
    }));
    const net = Number(
      calculateSaleBill(
        rows.map((r, k) => ({ ...r, gstRate: variants[entry.picks[k]].gstCode === "GST5" ? 5 : 12 })),
        "inclusive",
        "intra_state",
        "nearest_rupee"
      ).totals.netSale
    );
    sales.push({
      at: atTime(now, entry.daysAgo, 12, 30 + index),
      actor: owner,
      body: {
        kind: "sale",
        storeId: mg.id,
        billType: "invoice",
        taxType: "inclusive",
        idempotencyKey: `seed-b2b-${index}-0000000`,
        customer: { id: entry.customer.id },
        rows,
        payments: entry.paid === "full" ? [{ mode: "other", amount: String(net), referenceNo: "NEFT 7781204" }] : []
      }
    });
  });
  // One estimate for the demo.
  sales.push({
    at: atTime(now, 2, 17, 40),
    actor: owner,
    body: {
      kind: "sale",
      storeId: mg.id,
      billType: "estimate",
      taxType: "inclusive",
      idempotencyKey: "seed-estimate-1-000000",
      customer: { id: customers[3].id },
      rows: [{ variantId: variants[30].id, itemName: products.find((p) => p.id === variants[30].productId)!.name, qty: "1", mrp: String(variants[30].mrp), rate: String(variants[30].saleRate) }]
    }
  });

  // Returns against a few older bills that had a customer.
  const returnable = sales.map((s, index) => ({ s, index })).filter(({ s }) => s.body.customer?.id && s.body.billType === "invoice");
  const returns: SeedScript["returns"] = [
    { at: atTime(now, 6, 16, 5), saleIndex: returnable[1].index, refundMode: "credit_note" },
    { at: atTime(now, 4, 12, 45), saleIndex: returnable[3].index, refundMode: "cash" },
    { at: atTime(now, 1, 18, 20), saleIndex: returnable[6].index, refundMode: "cash" }
  ];

  // Opening dues, advances and payments received.
  const ledger: SeedScript["ledger"] = [
    { at: atTime(now, 75, 13, 10), customerId: customers[2].id, type: "manual_customer_due", label: "Opening balance", mode: null, increase: 3450, decrease: 0 },
    { at: atTime(now, 48, 17, 30), customerId: customers[7].id, type: "manual_customer_due", label: "Wedding order balance", mode: null, increase: 12800, decrease: 0 },
    { at: atTime(now, 20, 12, 0), customerId: customers[7].id, type: "customer_due_settlement", label: "Payment received", mode: "upi", increase: 0, decrease: 5000 },
    { at: atTime(now, 35, 11, 20), customerId: customers[11].id, type: "manual_customer_due", label: "Opening balance", mode: null, increase: 1890, decrease: 0 },
    { at: atTime(now, 10, 15, 45), customerId: customers[28].id, type: "manual_customer_due", label: "Bulk order — school uniforms", mode: null, increase: 24500, decrease: 0 },
    { at: atTime(now, 3, 11, 5), customerId: customers[28].id, type: "customer_due_settlement", label: "Payment received", mode: "bank", increase: 0, decrease: 10000 },
    { at: atTime(now, 9, 16, 0), customerId: customers[5].id, type: "customer_advance", label: "Advance for Diwali order", mode: "cash", increase: 0, decrease: 2000 },
    { at: atTime(now, 5, 18, 30), customerId: customers[14].id, type: "customer_advance", label: "Advance for lehenga alteration", mode: "upi", increase: 0, decrease: 750 }
  ];

  // Stock moved between stores and damaged pieces written off.
  const transfers: SeedScript["transfers"] = [
    { at: atTime(now, 8, 10, 30), variantId: variants[0].id, fromStoreId: nm.id, toStoreId: mg.id, qty: 3 },
    { at: atTime(now, 3, 10, 40), variantId: variants[25].id, fromStoreId: mg.id, toStoreId: nm.id, qty: 2 }
  ];
  const dumps: SeedScript["dumps"] = [
    { at: atTime(now, 11, 19, 10), variantId: variants[45].id, storeId: mg.id, qty: 1, reason: "damaged", note: "Stain on the front" },
    { at: atTime(now, 2, 20, 0), variantId: variants[60].id, storeId: nm.id, qty: 2, reason: "lost", note: "Missing after stock count" }
  ];

  // Two manual label jobs.
  db.labelJobs.push(
    {
      id: id(),
      at: atTime(now, 7, 12, 10),
      source: "manual",
      title: "Diwali price tags",
      storeId: mg.id,
      template: "a4-4x10",
      items: variants.slice(0, 4).map((v) => ({ variantId: v.id, barcodeId: v.barcodes[0].id, copies: 5 }))
    },
    {
      id: id(),
      at: atTime(now, 1, 11, 30),
      source: "manual",
      title: "Reprint — sarees",
      storeId: nm.id,
      template: "roll-50x25",
      items: variants.slice(16, 19).map((v) => ({ variantId: v.id, barcodeId: v.barcodes[0].id, copies: 2 }))
    }
  );

  return { db, rng, script: { purchases, sales, returns, ledger, targetStock, transfers, dumps } };
}
