import type { Db, ActorRef, DbCustomer, LedgerEntry } from "../db";
import { touchTime } from "../db";
import { financialYearOf, newId } from "../util";

/** Everything the business rules need to know about the caller. */
export interface EngineActor {
  ref: ActorRef;
  permissions: Set<string>;
  storeIds: string[];
}

/** Seeding replays history with fixed timestamps; live calls use the clock. */
export interface EngineOptions {
  at?: string;
  /** Fixture replay only: history is posted first and stock levels are set afterwards. */
  skipStockCheck?: boolean;
}

export const pad4 = (n: number) => String(n).padStart(4, "0");

export function fyShortAt(at: string) {
  return financialYearOf(new Date(at)).short;
}

export function logActivity(db: Db, by: ActorRef, action: string, label: string, amount: number | null, documentType: string | null, documentId: string | null, at: string) {
  db.activity.push({ id: nextId(), by, action, label, amount, documentType, documentId, at });
}

export function addLedger(db: Db, entry: Omit<LedgerEntry, "id">) {
  db.ledger.push({ id: nextId(), ...entry });
  if (entry.party === "customer") {
    const customer = db.customers.find((c) => c.id === entry.partyId);
    if (customer) customer.changedAt = touchTime(db);
  }
}

/** Id source: seeded during fixture replay, random afterwards (see state.ts). */
export const idSource: { next: () => string } = { next: newId };
export function nextId(): string {
  return idSource.next();
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}
export function mobile10(value: string | null | undefined): string {
  const digits = digitsOnly(value);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Finds a customer by mobile or creates one (sale screen "new customer" flow). */
export function upsertCustomer(db: Db, input: { name?: string; mobile?: string; address?: string; state?: string }, at: string): DbCustomer | null {
  const name = (input.name ?? "").trim().slice(0, 120);
  const mobile = mobile10(input.mobile);
  if (!name && !mobile) return null;
  if (mobile) {
    const existing = db.customers.find((c) => mobile10(c.mobile) === mobile);
    if (existing) return existing;
  }
  const customer: DbCustomer = {
    id: nextId(),
    name: name || `Customer ${mobile.slice(-4)}`,
    mobile: mobile || null,
    address: (input.address ?? "").trim() || null,
    city: null,
    state: (input.state ?? "").trim() || null,
    gstin: null,
    createdAt: at,
    changedAt: touchTime(db)
  };
  db.customers.push(customer);
  return customer;
}

/**
 * A QR-looking SVG (three finder squares and a deterministic module pattern from the text). Not a
 * scannable QR code, but valid SVG markup that renders like one on the invoice.
 */
export function qrLikeSvg(text: string): string {
  const size = 29;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  const next = () => {
    hash ^= hash << 13;
    hash >>>= 0;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    hash >>>= 0;
    return hash;
  };
  const cells: string[] = [];
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);
  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        if (edge || core) cells.push(`M${ox + x} ${oy + y}h1v1h-1z`);
      }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (inFinder(x, y)) continue;
      if (next() % 2 === 0) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  const q = 2; // quiet zone
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-q} ${-q} ${size + q * 2} ${size + q * 2}" shape-rendering="crispEdges"><rect x="${-q}" y="${-q}" width="${size + q * 2}" height="${size + q * 2}" fill="#ffffff"/><path fill="#000000" d="${cells.join("")}"/></svg>`;
}
