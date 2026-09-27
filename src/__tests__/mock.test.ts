import { calculateSaleBill, supplyPlaceFor } from "@/lib/saleMath";
import { expireMockAccessTokens, mockFetch, resetMock, setMockLatency, setMockOffline } from "@/mock/server";

const BASE = "https://mock.wowcity.local/api/v1";

type Json = Record<string, any>;

async function call(method: string, path: string, options: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await mockFetch(path.startsWith("http") ? path : `${BASE}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let json: Json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { text };
  }
  return { status: response.status, json, text, contentType: response.headers.get("content-type") };
}

async function ownerLogin() {
  const res = await call("POST", "/auth/owner-login", { body: { email: "owner@luzzan.in", password: "demo1234", deviceName: "Jest", platform: "test" } });
  expect(res.status).toBe(201);
  return res.json.data as { accessToken: string; refreshToken: string };
}

async function staffLogin(username: string) {
  const res = await call("POST", "/auth/staff-login", { body: { shopCode: "luz482", username, pin: "1234" } });
  return res;
}

beforeAll(() => setMockLatency(0));
beforeEach(() => resetMock());
afterAll(() => setMockLatency(null));

describe("mock backend", () => {
  it("signs the owner in and answers /me", async () => {
    const tokens = await ownerLogin();
    expect(tokens.accessToken).toMatch(/^mock\.at\.owner\./);
    expect(tokens.refreshToken).toMatch(/^wcr_mock_/);
    const me = await call("GET", "/me", { token: tokens.accessToken });
    expect(me.status).toBe(200);
    expect(me.json.data).toMatchObject({ actor: "seller", shopName: "Luzzan Fashions", shopCode: "LUZ482", financialYear: expect.stringMatching(/^\d{4}-\d{4}$/) });
    expect(me.json.data.permissions).toContain("settings.tax");
    expect(me.json.data.stores).toHaveLength(2);
  });

  it("rejects a wrong password with 401 invalid_credentials", async () => {
    const res = await call("POST", "/auth/owner-login", { body: { email: "owner@luzzan.in", password: "nope" } });
    expect(res.status).toBe(401);
    expect(res.json).toEqual({ error: { code: "invalid_credentials", message: "Email or password is wrong." } });
  });

  it("requires a bearer token", async () => {
    const res = await call("GET", "/me");
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("unauthenticated");
  });

  it("rotates refresh tokens and ends the session when an old one is reused", async () => {
    const first = await ownerLogin();
    expireMockAccessTokens();
    expect((await call("GET", "/me", { token: first.accessToken })).status).toBe(401);

    const rotated = await call("POST", "/auth/refresh", { body: { refreshToken: first.refreshToken } });
    expect(rotated.status).toBe(200);
    const second = rotated.json.data as { accessToken: string; refreshToken: string };
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect((await call("GET", "/me", { token: second.accessToken })).status).toBe(200);

    const reused = await call("POST", "/auth/refresh", { body: { refreshToken: first.refreshToken } });
    expect(reused.status).toBe(401);
    expect(reused.json.error.code).toBe("session_ended");
    // Reuse revoked the whole session: the newest tokens stop working too.
    expect((await call("GET", "/me", { token: second.accessToken })).status).toBe(401);
    expect((await call("POST", "/auth/refresh", { body: { refreshToken: second.refreshToken } })).status).toBe(401);
  });

  it("posts a sale with server maths and is idempotent", async () => {
    const { accessToken: token } = await ownerLogin();
    const me = (await call("GET", "/me", { token })).json.data;
    const storeId = me.stores.find((s: Json) => s.name.includes("MG Road")).id;
    const lookup = await call("GET", `/catalog/lookup?q=${encodeURIComponent("kurta")}&storeId=${storeId}`, { token });
    const items = lookup.json.items as Json[];
    expect(items.length).toBeGreaterThan(1);
    const [a, b] = items;
    const rows = [
      { variantId: a.variantId, itemName: a.itemName, qty: "1", mrp: a.mrp, rate: a.rate, discountPercent: "10" },
      { variantId: b.variantId, itemName: b.itemName, qty: "1", mrp: b.mrp, rate: b.rate, discountAmount: "50" }
    ];
    const expected = calculateSaleBill(
      rows.map((r, i) => ({ ...r, gstRate: items[i].gstRate })),
      "inclusive",
      supplyPlaceFor("", "Madhya Pradesh"),
      me.settings.roundingMode,
      "0",
      "20"
    ).totals;
    const body = { kind: "sale", storeId, taxType: "inclusive", idempotencyKey: "jest-sale-000000001", extraDiscountAmount: "20", rows, payments: [{ mode: "cash", amount: "5000" }] };

    const posted = await call("POST", "/sales", { token, body });
    expect(posted.status).toBe(201);
    const sale = posted.json.data;
    expect(sale.ok).toBe(true);
    expect(sale.message).toBe(`Bill ${sale.billNumber} saved.`);
    expect(sale.billNumber).toMatch(/^MG\/\d{4}\/\d{4}$/);
    expect(sale.changeDue).toBe((5000 - Number(expected.netSale)).toFixed(2));

    const invoice = (await call("GET", `/sales/${sale.invoiceId}`, { token })).json.data;
    expect(invoice.totals.net).toBe(Number(expected.netSale));
    expect(invoice.totals.taxable).toBe(Number(expected.taxableValue));
    expect(invoice.gstSummary.length).toBeGreaterThan(0);
    expect(invoice.upi).toBeNull(); // fully paid

    const again = await call("POST", "/sales", { token, body });
    expect(again.status).toBe(201);
    expect(again.json.data.invoiceId).toBe(sale.invoiceId);
    expect(again.json.data.message).toBe(`Bill ${sale.billNumber} was already saved. No duplicate created.`);
  });

  it("returns an exact barcode match from /catalog/lookup without a data envelope", async () => {
    const { accessToken: token } = await ownerLogin();
    const me = (await call("GET", "/me", { token })).json.data;
    const storeId = me.stores[0].id;
    const first = (await call("GET", `/catalog/lookup?q=jeans&storeId=${storeId}&inStock=false`, { token })).json;
    const barcode = first.items[0].barcode as string;
    expect(barcode).toMatch(/^\d{13}$/);
    const res = await call("GET", `/catalog/lookup?q=${barcode}&storeId=${storeId}`, { token });
    expect(res.status).toBe(200);
    expect(res.json.data).toBeUndefined();
    expect(res.json.exact).toBe(true);
    expect(res.json.items).toHaveLength(1);
    expect(typeof res.json.items[0].mrp).toBe("string");
    expect(typeof res.json.items[0].gstRate).toBe("string");
  });

  it("forbids a cashier from staff management and lets staff sign in", async () => {
    const ravi = await staffLogin("ravi");
    expect(ravi.status).toBe(201);
    const token = ravi.json.data.accessToken;
    const staff = await call("GET", "/staff", { token });
    expect(staff.status).toBe(403);
    expect(staff.json).toEqual({ error: { code: "forbidden", message: "You do not have permission for this." } });
    const me = (await call("GET", "/me", { token })).json.data;
    expect(me.actor).toBe("worker");
    expect(me.permissions).toEqual(["sale.create", "sale.view", "sale.return"]);
    const reports = (await call("GET", "/reports", { token })).json.data;
    expect(reports.groups).toEqual([]);

    const arjun = await staffLogin("arjun");
    expect(arjun.status).toBe(403);
    expect(arjun.json.error.message).toBe("This account is disabled. Ask the shop owner.");
  });

  it("paginates /sync/catalog until hasMore is false", async () => {
    const { accessToken: token } = await ownerLogin();
    const storeId = (await call("GET", "/me", { token })).json.data.storeIds[0];
    const seen = new Set<string>();
    let cursor: { sinceAt: string; sinceId: string } | null = null;
    for (let page = 0; page < 50; page++) {
      const query: string = cursor ? `&sinceAt=${encodeURIComponent(cursor.sinceAt)}&sinceId=${cursor.sinceId}` : "";
      const res = await call("GET", `/sync/catalog?storeId=${storeId}&limit=20${query}`, { token });
      expect(res.status).toBe(200);
      const data = res.json.data;
      for (const item of data.items) {
        expect(seen.has(item.variantId)).toBe(false);
        expect(typeof item.mrp).toBe("number");
        seen.add(item.variantId);
      }
      if (!data.hasMore) break;
      cursor = data.next;
    }
    expect(seen.size).toBeGreaterThanOrEqual(60);
    const final = await call("GET", `/sync/catalog?storeId=${storeId}&sinceAt=${encodeURIComponent(cursor!.sinceAt)}&sinceId=${cursor!.sinceId}&limit=500`, { token });
    expect(final.json.data.hasMore).toBe(false);
  });

  it("answers every screen's GET for owner and staff without errors", async () => {
    const { accessToken: token } = await ownerLogin();
    const me = (await call("GET", "/me", { token })).json.data;
    const storeId = me.storeIds[0];
    const paths = [
      "/dashboard",
      `/dashboard?store=${storeId}`,
      "/sales?range=7d",
      "/sales?range=30d&view=returns",
      "/stock",
      "/stock?status=low&sort=stock_low",
      "/products",
      "/custom-fields",
      "/purchases/setup",
      "/purchases",
      "/suppliers",
      "/labels/search?q=kurta",
      "/labels/jobs",
      "/dues",
      "/dues?party=supplier&filter=all",
      "/customers",
      "/customers?segment=dues",
      "/staff",
      "/devices",
      "/stores",
      "/settings",
      "/reports",
      "/sync/customers"
    ];
    for (const path of paths) {
      const res = await call("GET", path, { token });
      expect([path, res.status]).toEqual([path, 200]);
    }
    const index = (await call("GET", "/reports", { token })).json.data;
    for (const group of index.groups)
      for (const report of group.reports)
        for (const view of report.views.length ? report.views : [{ key: "" }]) {
          const res = await call("GET", `/reports/${report.slug}?range=30d${view.key ? `&view=${view.key}` : ""}`, { token });
          expect([report.slug, view.key, res.status]).toEqual([report.slug, view.key, 200]);
        }
    const csv = await call("GET", "https://mock.wowcity.local/api/reports/sale/export?range=7d&table=bills", { token });
    expect(csv.contentType).toContain("text/csv");
    expect(csv.text.split("\n")[0]).toContain("Bill");

    const meena = (await staffLogin("meena")).json.data.accessToken;
    for (const path of ["/dashboard", "/stock", "/sales", "/reports", "/dues", "/purchases"]) expect([path, (await call("GET", path, { token: meena })).status]).toEqual([path, 200]);
  });

  it("goes offline on demand", async () => {
    setMockOffline(true);
    await expect(mockFetch(`${BASE}/me`)).rejects.toThrow("Network request failed");
    setMockOffline(false);
  });

  it("does not have account deletion yet", async () => {
    const { accessToken: token } = await ownerLogin();
    const res = await call("DELETE", "/account", { token, body: { confirm: "LUZ482" } });
    expect(res.status).toBe(404);
    expect(res.json).toEqual({ error: { code: "not_found", message: "Not found." } });
  });
});
