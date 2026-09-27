/**
 * The API returns WEB paths for linked rows ("/app/sale/invoices/<id>", "/app/dues/customer/<id>",
 * "/app/insights/customers/<id>"). Map the ones the app has screens for; anything else → null.
 */
const ID = "([A-Za-z0-9-]+)";
const rules: { pattern: RegExp; to: (id: string, m: RegExpExecArray) => string }[] = [
  { pattern: new RegExp(`^/app/sale/invoices/${ID}/?$`), to: (id) => `/bills/${id}` },
  { pattern: new RegExp(`^/app/dues/(customer|supplier)/${ID}/?$`), to: (_id, m) => `/dues/${m[1]}/${m[2]}` },
  { pattern: new RegExp(`^/app/insights/customers/${ID}/?$`), to: (id) => `/customers/${id}` }
];

export function appHref(webPath: unknown): string | null {
  if (typeof webPath !== "string" || !webPath) return null;
  const path = webPath.split(/[?#]/)[0];
  for (const rule of rules) {
    const m = rule.pattern.exec(path);
    if (m) return rule.to(m[1], m);
  }
  return null;
}

/** Invoice id from a sale-linked statement/report href, if any. */
export function invoiceIdFromHref(webPath: unknown): string | null {
  const href = appHref(webPath);
  return href?.startsWith("/bills/") ? href.slice("/bills/".length) : null;
}
