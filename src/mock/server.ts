/**
 * In-app fake backend for demos (EXPO_PUBLIC_MOCK=1). `mockFetch` has the `fetch` signature and
 * answers https://mock.wowcity.local/api/v1/** (plus the R2 upload and report CSV routes) from an
 * in-memory database seeded with a realistic clothing shop. See src/mock/fixtures.ts for the demo
 * logins: owner owner@luzzan.in / demo1234, staff LUZ482 · ravi|meena / 1234, OTP 123456.
 */
import { dispatch } from "./router";
import { expireAccessTokens, getDb, resetMockDb } from "./state";
import type { MockResult } from "./util";

const OFFLINE_KEY = "wowcity.mock.offline";
const session = () => (typeof globalThis !== "undefined" && "sessionStorage" in globalThis ? (globalThis as { sessionStorage?: Storage }).sessionStorage : undefined);
// On web the switch survives a page reload, so a demo can show offline billing end to end.
let offline = session()?.getItem(OFFLINE_KEY) === "1";
let fixedLatency: number | null = null;

/** Pretend the phone lost its connection: every call fails like fetch does offline. */
export function setMockOffline(value: boolean) {
  offline = value;
  try {
    if (value) session()?.setItem(OFFLINE_KEY, "1");
    else session()?.removeItem(OFFLINE_KEY);
  } catch {
    // Storage unavailable: the switch lasts until reload.
  }
}
export function isMockOffline() {
  return offline;
}
/** Fixed latency in ms (tests use 0); null restores the random 120–350 ms. */
export function setMockLatency(ms: number | null) {
  fixedLatency = ms;
}
/** Invalidate every access token so the next call must refresh (refresh tokens keep working). */
export function expireMockAccessTokens() {
  expireAccessTokens(getDb());
}
/** Throw away all changes and re-seed the demo shop. */
export function resetMock() {
  resetMockDb();
}

function wait(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener?.("abort", onAbort);
  });
}

function abortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function headerValue(headers: RequestInit["headers"] | undefined, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
  if (Array.isArray(headers)) return headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? record[key] : null;
}

/** A real Response when the runtime has one (RN, web, Node 18+), else a minimal look-alike. */
function toResponse(result: MockResult): Response {
  const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
  const contentType = result.contentType ?? (typeof result.body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8");
  if (typeof Response !== "undefined") {
    return new Response(text, { status: result.status, headers: { "Content-Type": contentType } });
  }
  const minimal = {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    statusText: "",
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
    text: async () => text,
    json: async () => JSON.parse(text)
  };
  return minimal as unknown as Response;
}

export const mockFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const signal = init?.signal ?? null;
  if (offline) {
    await wait(300, signal);
    throw new TypeError("Network request failed");
  }
  await wait(fixedLatency ?? 120 + Math.floor(Math.random() * 231), signal);

  let url: string;
  let method = init?.method ?? "GET";
  let authorization = headerValue(init?.headers, "Authorization");
  let bodyText: string | null = typeof init?.body === "string" ? init.body : null;
  if (typeof input === "string") url = input;
  else if (typeof URL !== "undefined" && input instanceof URL) url = input.toString();
  else {
    const request = input as Request;
    url = request.url;
    method = init?.method ?? request.method ?? "GET";
    authorization = authorization ?? headerValue(request.headers, "Authorization");
    if (bodyText === null && typeof request.text === "function" && method !== "GET" && method !== "HEAD") bodyText = await request.text();
  }
  if (init?.body && typeof init.body !== "string") bodyText = "{}"; // binary uploads (photo PUT)

  return toResponse(dispatch(getDb(), { method, url, authorization, bodyText }));
}) as typeof fetch;

/** Sign-in hint shown on the welcome screen of demo builds only. */
export const demoCredentials = "Owner: owner@luzzan.in / demo1234 (or code 123456)\nStaff: shop LUZ482 · ravi or meena · PIN 1234";
