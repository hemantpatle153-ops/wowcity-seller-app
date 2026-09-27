import { ApiError, fallbackMessage } from "./errors";
import type { TokenStore } from "@/auth/tokenStore";

export type Tokens = { accessToken: string; refreshToken: string; tokenType?: "Bearer"; expiresIn: number };

export type Query = Record<string, string | number | boolean | null | undefined>;

export type RequestOptions = {
  query?: Query;
  body?: unknown;
  /** Send the bearer token (default true). Sign-in and refresh calls pass false. */
  auth?: boolean;
  signal?: AbortSignal;
  /** Response body is text (CSV export) instead of the JSON envelope. */
  text?: boolean;
  timeoutMs?: number;
};

export type RestoreResult = "signedIn" | "offline" | "signedOut";

export type ApiClientConfig = {
  baseUrl: string;
  tokenStore: TokenStore;
  fetch?: typeof fetch;
  /** Called once when the session can no longer be refreshed (sign-in screen should show). */
  onSessionEnded?: (reason: string) => void;
  /** Called after every token change, so the app can know when the access token expires. */
  onTokens?: (tokens: Tokens) => void;
  defaultTimeoutMs?: number;
};

function buildUrl(baseUrl: string, path: string, query?: Query) {
  const base = baseUrl.replace(/\/+$/, "");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `${url}${url.includes("?") ? "&" : "?"}${params.join("&")}` : url;
}

/**
 * Typed JSON client for /api/v1 (docs/api.md).
 * - Access token in memory only; refresh token in secure storage, rotated on every refresh.
 * - One refresh at a time (concurrent 401s share it), then exactly one retry of the failed call.
 * - Errors surface as ApiError with the server's `error.message`, safe to show.
 */
export class ApiClient {
  private accessToken: string | null = null;
  private accessExpiresAt = 0;
  private refreshing: Promise<"ok" | "ended" | "network"> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ApiClientConfig) {
    this.fetchImpl = config.fetch ?? (((input: string, init?: RequestInit) => fetch(input, init)) as typeof fetch);
  }

  get baseUrl() {
    return this.config.baseUrl;
  }

  hasAccessToken() {
    return !!this.accessToken;
  }

  /** Save tokens from sign-in or refresh. */
  async setTokens(tokens: Tokens) {
    this.accessToken = tokens.accessToken;
    this.accessExpiresAt = Date.now() + Math.max(0, tokens.expiresIn - 30) * 1000;
    await this.config.tokenStore.setRefreshToken(tokens.refreshToken);
    this.config.onTokens?.(tokens);
  }

  /** Forget everything locally (after sign-out or when the server ended the session). */
  async clear() {
    this.accessToken = null;
    this.accessExpiresAt = 0;
    await this.config.tokenStore.clear();
  }

  /** On app start: use the stored refresh token to get a fresh access token. */
  async restore(): Promise<RestoreResult> {
    const stored = await this.config.tokenStore.getRefreshToken();
    if (!stored) return "signedOut";
    const result = await this.refresh();
    if (result === "ok") return "signedIn";
    if (result === "network") return "offline";
    return "signedOut";
  }

  /** Rotate the refresh token. Concurrent callers share one request. */
  refresh(): Promise<"ok" | "ended" | "network"> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<"ok" | "ended" | "network"> {
    const refreshToken = await this.config.tokenStore.getRefreshToken();
    if (!refreshToken) return "ended";
    try {
      // Generous timeout: giving up on a refresh the server already rotated would sign this phone out.
      const tokens = await this.send<Tokens>("POST", "/auth/refresh", { body: { refreshToken }, auth: false, timeoutMs: 45000 });
      await this.setTokens(tokens);
      return "ok";
    } catch (error) {
      if (error instanceof ApiError && error.isNetwork) return "network";
      if (error instanceof ApiError && error.status >= 500) return "network";
      // 401 (rotated/reused/expired) or any other rejection ends the session.
      await this.clear();
      this.config.onSessionEnded?.(error instanceof ApiError ? error.message : "Your session has ended. Sign in again.");
      return "ended";
    }
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const auth = options.auth ?? true;
    if (auth && this.accessToken && Date.now() >= this.accessExpiresAt) {
      // Proactively refresh an expired access token; if that fails we still try the call once.
      await this.refresh();
    } else if (auth && !this.accessToken) {
      const result = await this.refresh();
      if (result === "network") throw new ApiError(0, "network", fallbackMessage(0));
      if (result === "ended") throw new ApiError(401, "unauthenticated", fallbackMessage(401));
    }
    try {
      return await this.send<T>(method, path, options);
    } catch (error) {
      if (!(auth && error instanceof ApiError && error.isAuth)) throw error;
      const result = await this.refresh();
      if (result === "network") throw new ApiError(0, "network", fallbackMessage(0));
      if (result !== "ok") throw error;
      try {
        return await this.send<T>(method, path, options);
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.isAuth) {
          await this.clear();
          this.config.onSessionEnded?.(retryError.message);
        }
        throw retryError;
      }
    }
  }

  get<T>(path: string, query?: Query, options: Omit<RequestOptions, "query" | "body"> = {}) {
    return this.request<T>("GET", path, { ...options, query });
  }

  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, "body"> = {}) {
    return this.request<T>("POST", path, { ...options, body: body ?? {} });
  }

  put<T>(path: string, body?: unknown, options: Omit<RequestOptions, "body"> = {}) {
    return this.request<T>("PUT", path, { ...options, body: body ?? {} });
  }

  patch<T>(path: string, body?: unknown, options: Omit<RequestOptions, "body"> = {}) {
    return this.request<T>("PATCH", path, { ...options, body: body ?? {} });
  }

  delete<T>(path: string, body?: unknown, options: Omit<RequestOptions, "body"> = {}) {
    return this.request<T>("DELETE", path, { ...options, body });
  }

  private async send<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    const headers: Record<string, string> = { Accept: options.text ? "text/csv, text/plain, */*" : "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if ((options.auth ?? true) && this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.config.defaultTimeoutMs ?? 20000);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort);

    let response: Response;
    try {
      response = await this.fetchImpl(buildUrl(this.config.baseUrl, path, options.query), {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
    } catch {
      if (options.signal?.aborted) throw new ApiError(0, "aborted", "Cancelled.");
      throw new ApiError(0, "network", fallbackMessage(0));
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    }

    if (options.text && response.ok) return (await response.text()) as T;

    let payload: unknown = null;
    try {
      const raw = await response.text();
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    // Most endpoints wrap results as { data } and errors as { error: { code, message } }. A few re-exported
    // web routes (catalog/lookup, customers/search, sales/original-bill, purchases/barcode-lookup, image
    // upload) return the object directly and fail with { error: "message" }.
    const body = (payload ?? {}) as { data?: unknown; error?: string | { code?: string; message?: string } };
    const error = body.error;
    if (!response.ok || error) {
      const status = response.ok ? 422 : response.status;
      const code = typeof error === "object" && error?.code ? error.code : `http_${status}`;
      const message = typeof error === "string" ? error : error?.message;
      throw new ApiError(status, code, message?.trim() || fallbackMessage(status));
    }
    return (payload && typeof payload === "object" && "data" in (payload as object) ? body.data : payload) as T;
  }
}

export { buildUrl };
