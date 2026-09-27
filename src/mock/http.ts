/** Route/handler plumbing shared by src/mock/routes/*. */
import type { Db } from "./db";
import type { AuthContext } from "./state";
import { forbidden, type MockResult } from "./util";

export interface Ctx {
  db: Db;
  method: string;
  path: string;
  params: Record<string, string>;
  query: Map<string, string>;
  body: unknown;
  auth: AuthContext;
}
export type PublicCtx = Omit<Ctx, "auth"> & { auth: AuthContext | null };

export interface Route {
  method: string;
  path: string; // "/sales/:id"
  handler: (ctx: Ctx) => MockResult;
  /** No bearer needed (sign-in, refresh). */
  public?: boolean;
  /** RAW web route: no {data} envelope and errors are { error: string }. */
  raw?: boolean;
}

export function route(method: string, path: string, handler: (ctx: Ctx) => MockResult, flags: { public?: boolean; raw?: boolean } = {}): Route {
  return { method, path, handler, ...flags };
}

export function q(ctx: Ctx, key: string): string | null {
  const value = ctx.query.get(key);
  return value === undefined || value === "" ? null : value;
}

export function body<T = Record<string, unknown>>(ctx: Ctx): T {
  return (ctx.body && typeof ctx.body === "object" ? ctx.body : {}) as T;
}

/** 403 unless the caller holds any of these permissions. */
export function need(ctx: Ctx, ...permissions: string[]) {
  if (!permissions.some((p) => ctx.auth.actor.permissions.has(p))) forbidden();
}
export function has(ctx: Ctx, permission: string): boolean {
  return ctx.auth.actor.permissions.has(permission);
}
export function ownerOnly(ctx: Ctx) {
  if (!ctx.auth.isOwner) forbidden();
}
/** Store filter honoured only when it is one of the caller's stores. */
export function storeFilter(ctx: Ctx, key = "store"): string[] {
  const requested = q(ctx, key);
  const mine = ctx.auth.actor.storeIds;
  return requested && mine.includes(requested) ? [requested] : mine;
}

export function parseQuery(search: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of search.split("&")) {
    if (!part) continue;
    const [k, ...rest] = part.split("=");
    const decode = (s: string) => {
      try {
        return decodeURIComponent(s.replace(/\+/g, " "));
      } catch {
        return s;
      }
    };
    map.set(decode(k), decode(rest.join("=")));
  }
  return map;
}
