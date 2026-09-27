import { ApiClient, type Tokens } from "@/api/client";
import { ApiError } from "@/api/errors";
import type { TokenStore } from "@/auth/tokenStore";

function memoryTokens(initial: string | null = null): TokenStore & { value: string | null } {
  const store = {
    value: initial,
    getRefreshToken: async () => store.value,
    setRefreshToken: async (t: string) => {
      store.value = t;
    },
    clear: async () => {
      store.value = null;
    }
  };
  return store;
}

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(handler: (call: Call, calls: Call[]) => Response | Promise<Response>, refresh: string | null = "r1") {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const call: Call = { url, method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return handler(call, calls);
  }) as typeof fetch;
  const tokens = memoryTokens(refresh);
  const ended = jest.fn();
  const client = new ApiClient({ baseUrl: "https://x.test/api/v1", tokenStore: tokens, fetch: fetchImpl, onSessionEnded: ended });
  return { client, calls, tokens, ended };
}

const pair = (n: number): Tokens => ({ accessToken: `a${n}`, refreshToken: `r${n + 1}`, tokenType: "Bearer", expiresIn: 900 });

describe("ApiClient", () => {
  it("sends the bearer token and unwraps { data }", async () => {
    const { client, calls } = setup(() => json(200, { data: { ok: 1 } }));
    await client.setTokens(pair(1));
    await expect(client.get("/me")).resolves.toEqual({ ok: 1 });
    expect(calls[0].headers.Authorization).toBe("Bearer a1");
    expect(calls[0].url).toBe("https://x.test/api/v1/me");
  });

  it("returns raw bodies for endpoints without an envelope and maps string errors", async () => {
    const { client } = setup((call) => (call.url.includes("lookup") ? json(200, { items: [], exact: false }) : json(403, { error: "Not allowed here." })));
    await client.setTokens(pair(1));
    await expect(client.get("/catalog/lookup", { q: "x" })).resolves.toEqual({ items: [], exact: false });
    await expect(client.get("/other")).rejects.toMatchObject({ status: 403, message: "Not allowed here." });
  });

  it("surfaces error.message from the server", async () => {
    const { client } = setup(() => json(422, { error: { code: "sale_rejected", message: "Add a customer for credit bills." } }));
    await client.setTokens(pair(1));
    const error = (await client.post("/sales", {}).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("sale_rejected");
    expect(error.message).toBe("Add a customer for credit bills.");
  });

  it("builds query strings and skips empty values", async () => {
    const { client, calls } = setup(() => json(200, { data: {} }));
    await client.setTokens(pair(1));
    await client.get("/stock", { q: "kurta blue", page: 2, store: "", status: undefined });
    expect(calls[0].url).toBe("https://x.test/api/v1/stock?q=kurta%20blue&page=2");
  });

  it("refreshes once on 401 and retries the call with the new token", async () => {
    let n = 1;
    const { client, calls, tokens } = setup((call) => {
      if (call.url.endsWith("/auth/refresh")) return json(200, { data: pair(++n) });
      return call.headers.Authorization === "Bearer a1" ? json(401, { error: { code: "unauthenticated", message: "expired" } }) : json(200, { data: "fresh" });
    });
    await client.setTokens(pair(1));
    await expect(client.get("/me")).resolves.toBe("fresh");
    expect(calls.map((c) => c.url.replace("https://x.test/api/v1", ""))).toEqual(["/me", "/auth/refresh", "/me"]);
    expect(calls[1].body).toEqual({ refreshToken: "r2" });
    expect(tokens.value).toBe("r3");
  });

  it("shares one refresh between concurrent 401s (rotation-safe)", async () => {
    let refreshes = 0;
    const { client } = setup(async (call) => {
      if (call.url.endsWith("/auth/refresh")) {
        refreshes++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { data: pair(5) });
      }
      return call.headers.Authorization === "Bearer a5" ? json(200, { data: call.url }) : json(401, { error: { code: "unauthenticated", message: "x" } });
    });
    await client.setTokens(pair(1));
    await Promise.all([client.get("/a"), client.get("/b"), client.get("/c")]);
    expect(refreshes).toBe(1);
  });

  it("ends the session when refresh is rejected", async () => {
    const { client, tokens, ended } = setup((call) =>
      call.url.endsWith("/auth/refresh") ? json(401, { error: { code: "session_ended", message: "Signed out on this phone." } }) : json(401, { error: { code: "unauthenticated", message: "x" } })
    );
    await client.setTokens(pair(1));
    await expect(client.get("/me")).rejects.toMatchObject({ status: 401 });
    expect(tokens.value).toBeNull();
    expect(ended).toHaveBeenCalledWith("Signed out on this phone.");
  });

  it("retries only once: a second 401 after refresh signs out", async () => {
    let n = 1;
    const { client, ended, calls } = setup((call) => (call.url.endsWith("/auth/refresh") ? json(200, { data: pair(++n) }) : json(401, { error: { code: "unauthenticated", message: "Disabled" } })));
    await client.setTokens(pair(1));
    await expect(client.get("/me")).rejects.toMatchObject({ status: 401 });
    expect(calls.filter((c) => c.url.endsWith("/me"))).toHaveLength(2);
    expect(ended).toHaveBeenCalled();
  });

  it("maps a failed fetch to a network ApiError and keeps the session", async () => {
    const { client, tokens, ended } = setup(() => {
      throw new TypeError("Network request failed");
    });
    await client.setTokens(pair(1));
    const error = (await client.get("/me").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.isNetwork).toBe(true);
    expect(tokens.value).toBe("r2");
    expect(ended).not.toHaveBeenCalled();
  });

  it("restore(): signedOut without a token, offline when the server is unreachable, signedIn on success", async () => {
    expect(await setup(() => json(200, {}), null).client.restore()).toBe("signedOut");
    expect(
      await setup(() => {
        throw new TypeError("offline");
      }).client.restore()
    ).toBe("offline");
    const ok = setup(() => json(200, { data: pair(7) }));
    expect(await ok.client.restore()).toBe("signedIn");
    expect(ok.client.hasAccessToken()).toBe(true);
  });

  it("does not send bearer on sign-in calls", async () => {
    const { client, calls } = setup(() => json(201, { data: pair(1) }));
    await client.post("/auth/owner-login", { email: "a@b.c", password: "x" }, { auth: false });
    expect(calls[0].headers.Authorization).toBeUndefined();
  });
});
