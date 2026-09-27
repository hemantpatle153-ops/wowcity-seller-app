/** Matches a mock request to a route, checks the bearer and turns errors into API-shaped failures. */
import type { Db } from "./db";
import { parseQuery, type Ctx, type Route } from "./http";
import { reportExportRoute, reportRoutes } from "./reports";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { inventoryRoutes } from "./routes/inventory";
import { peopleRoutes } from "./routes/people";
import { imageUploadRoute, purchaseRoutes } from "./routes/purchases";
import { salesRoutes } from "./routes/sales";
import { authenticate } from "./state";
import { MockHttpError, type MockResult } from "./util";

const V1_ROUTES: Route[] = [...authRoutes, ...dashboardRoutes, ...salesRoutes, ...peopleRoutes, ...inventoryRoutes, ...purchaseRoutes, ...reportRoutes, ...adminRoutes];
const ROOT_ROUTES: Route[] = [imageUploadRoute, reportExportRoute];

function match(routes: Route[], method: string, path: string): { route: Route; params: Record<string, string> } | null {
  const parts = path.split("/").filter(Boolean);
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const pattern = candidate.path.split("/").filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(":")) {
        try {
          params[pattern[i].slice(1)] = decodeURIComponent(parts[i]);
        } catch {
          params[pattern[i].slice(1)] = parts[i];
        }
      } else if (pattern[i] !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: candidate, params };
  }
  return null;
}

function failure(status: number, code: string, message: string, raw: boolean): MockResult {
  return { status, body: raw ? { error: message } : { error: { code, message } } };
}

export interface MockRequest {
  method: string;
  url: string;
  authorization: string | null;
  bodyText: string | null;
}

export function dispatch(db: Db, request: MockRequest): MockResult {
  const method = request.method.toUpperCase();
  const withoutOrigin = request.url.replace(/^[a-z]+:\/\/[^/]+/i, "");
  const [pathPart, ...searchParts] = withoutOrigin.split("?");
  const path = pathPart.replace(/\/+$/, "") || "/";
  const query = parseQuery(searchParts.join("?"));

  // Presigned photo upload target: accept the bytes, nothing to store.
  if (path.startsWith("/upload/")) return method === "PUT" ? { status: 200, body: "" } : failure(404, "not_found", "Not found.", false);

  let found: { route: Route; params: Record<string, string> } | null = null;
  if (path.startsWith("/api/v1/")) found = match(V1_ROUTES, method, path.slice("/api/v1".length));
  else found = match(ROOT_ROUTES, method, path);
  if (!found) return failure(404, "not_found", "Not found.", false);
  const { route, params } = found;

  let body: unknown = undefined;
  if (request.bodyText) {
    try {
      body = JSON.parse(request.bodyText);
    } catch {
      return failure(400, "invalid_json", "The request was not valid JSON.", !!route.raw);
    }
  }

  const auth = authenticate(db, request.authorization);
  if (!route.public && !auth) {
    return route.raw ? failure(401, "unauthenticated", "Sign in again to continue.", true) : failure(401, "unauthenticated", "Your session has ended. Sign in again.", false);
  }

  const ctx = { db, method, path, params, query, body, auth } as Ctx;
  try {
    return route.handler(ctx);
  } catch (error) {
    if (error instanceof MockHttpError) return failure(error.status, error.code, error.message, !!route.raw);
    console.warn("[mock] handler crashed", method, path, error);
    return failure(500, "server_error", "Something went wrong on our side. Try again.", !!route.raw);
  }
}
