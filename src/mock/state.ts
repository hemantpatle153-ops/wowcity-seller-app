/**
 * The mock backend's mutable in-memory database (one per app run) and the session/token store.
 * The seed history is replayed through the same business rules the endpoints use.
 */
import type { TokenPair } from "@/api/types";
import type { ActorRef, Db, DbWorker, Session } from "./db";
import { addStock, findWorker } from "./db";
import { addLedger, fyShortAt, idSource, logActivity, nextId, pad4, type EngineActor } from "./engine/common";
import { submitPurchase } from "./engine/purchases";
import { submitSale } from "./engine/sales";
import { buildSeed } from "./fixtures";
import { ALL_PERMISSIONS, MockHttpError, newId, normalizeWorkerPermissions, randomToken, uuidFrom } from "./util";

let current: Db | null = null;

export function getDb(): Db {
  if (!current) current = createDb();
  return current;
}

/** Throw away every change and re-seed (tests, or a "reset demo" button). */
export function resetMockDb(now = new Date()): Db {
  current = createDb(now);
  return current;
}

export function engineActorFor(db: Db, ref: ActorRef): EngineActor {
  if (ref.kind === "owner") return { ref, permissions: new Set(ALL_PERMISSIONS), storeIds: db.stores.filter((s) => s.is_active).map((s) => s.id) };
  const worker = findWorker(db, ref.id) as DbWorker;
  return { ref, permissions: new Set(normalizeWorkerPermissions(worker.permissions)), storeIds: worker.storeIds.filter((id) => db.stores.some((s) => s.id === id && s.is_active)) };
}

function createDb(now = new Date()): Db {
  const { db, script, rng } = buildSeed(now);
  idSource.next = () => uuidFrom(rng);
  try {
    for (const p of script.purchases) submitPurchase(db, engineActorFor(db, p.actor), p.body, { at: p.at });
    const posted: string[] = [];
    for (const s of script.sales) {
      const { response } = submitSale(db, engineActorFor(db, s.actor), s.body, { at: s.at, skipStockCheck: true });
      posted.push("invoiceId" in response ? response.invoiceId : "");
    }
    script.returns.forEach((r, index) => {
      const invoice = db.invoices.find((i) => i.id === posted[r.saleIndex]);
      if (!invoice) return;
      const line = invoice.lines[0];
      submitSale(
        db,
        engineActorFor(db, invoice.by),
        {
          kind: "return",
          storeId: invoice.storeId,
          taxType: invoice.taxType,
          idempotencyKey: `seed-return-${index}-000000`,
          refundMode: r.refundMode,
          originalSaleInvoiceId: invoice.id,
          customer: invoice.customerId ? { id: invoice.customerId } : {},
          rows: [{ variantId: line.variantId, itemName: line.name, qty: "1", mrp: line.mrp, rate: line.rate, originalItemId: line.id }]
        },
        { at: r.at, skipStockCheck: true }
      );
    });
    for (const entry of script.ledger) {
      addLedger(db, {
        party: "customer",
        partyId: entry.customerId,
        at: entry.at,
        type: entry.type,
        label: entry.label,
        reference: null,
        mode: entry.mode,
        increase: entry.increase,
        decrease: entry.decrease,
        href: null
      });
    }
    const owner: ActorRef = { kind: "owner", id: db.owner.id };
    for (const t of script.transfers) {
      const id = nextId();
      const challan = `TR-${fyShortAt(t.at)}-${pad4(++db.counters.challan)}`;
      db.transfers.push({ id, challan, variantId: t.variantId, fromStoreId: t.fromStoreId, toStoreId: t.toStoreId, qty: t.qty, at: t.at, by: owner });
      addStock(db, t.variantId, t.fromStoreId, -t.qty, "transfer", id, t.at, nextId());
      addStock(db, t.variantId, t.toStoreId, t.qty, "transfer", id, t.at, nextId());
      logActivity(db, owner, "stock_transferred", `Challan ${challan}`, null, "stock_transfer", id, t.at);
    }
    for (const d of script.dumps) {
      const id = nextId();
      db.adjustments.push({ id, variantId: d.variantId, storeId: d.storeId, direction: "remove", qty: d.qty, reason: d.reason, note: d.note, at: d.at, by: owner });
      addStock(db, d.variantId, d.storeId, -d.qty, "dump", id, d.at, nextId());
    }
    // Final stock levels are fixed by the fixtures (some low, some out of stock).
    for (const [variantId, byStore] of Object.entries(script.targetStock)) db.stock[variantId] = { ...byStore };
    // Sync cursors: everything seeded shares one baseline so first-run pagination is by id.
    const baseline = new Date(now.getTime() - 60000).toISOString();
    for (const v of db.variants) v.changedAt = baseline;
    for (const c of db.customers) c.changedAt = baseline;
    db.lastTouch = now.getTime();
  } finally {
    idSource.next = newId;
  }
  db.idempotency.clear();
  return db;
}

// ---------------------------------------------------------------------------------------------------
// Sessions & tokens
// ---------------------------------------------------------------------------------------------------
export interface AuthContext {
  session: Session;
  actor: EngineActor;
  isOwner: boolean;
  worker: DbWorker | null;
  name: string;
}

function accessTokenFor(db: Db, session: Session): string {
  const token = `mock.at.${session.actor.kind}.${session.actor.id}.${++db.counters.token}`;
  db.accessTokens.set(token, session.id);
  return token;
}

export function issueTokens(db: Db, actor: ActorRef, device: { deviceName?: string; platform?: string }): TokenPair {
  const name = (device.deviceName ?? "").trim().slice(0, 80) || "Phone";
  const platform = (device.platform ?? "").trim().slice(0, 20) || null;
  const nowIso = new Date().toISOString();
  let row = db.devices.find((d) => !d.revoked && d.actor.kind === actor.kind && d.actor.id === actor.id && d.name === name && d.platform === platform);
  if (!row) {
    row = { id: newId(), actor, name, platform, createdAt: nowIso, lastUsedAt: nowIso, revoked: false };
    db.devices.push(row);
  }
  row.lastUsedAt = nowIso;
  const refreshToken = refreshTokenFor(actor);
  const session: Session = { id: newId(), actor, deviceId: row.id, refreshToken, revoked: false };
  db.sessions.set(session.id, session);
  db.refreshTokens.set(refreshToken, { sessionId: session.id, current: true });
  if (actor.kind === "worker") {
    const worker = findWorker(db, actor.id);
    if (worker) worker.lastLoginAt = nowIso;
  }
  return { accessToken: accessTokenFor(db, session), refreshToken, tokenType: "Bearer", expiresIn: 900 };
}

const sessionEnded = (message = "Your session has ended. Sign in again.") => new MockHttpError(401, "session_ended", message);

/** Refresh tokens name their actor so a demo survives a page reload (the in-memory mock restarts). */
function refreshTokenFor(actor: ActorRef) {
  return `wcr_mock_${actor.kind}.${actor.id}_${randomToken(32)}`;
}

export function rotateRefreshToken(db: Db, refreshToken: unknown): TokenPair {
  const entry = typeof refreshToken === "string" ? db.refreshTokens.get(refreshToken) : undefined;
  if (!entry) {
    // Unknown to this (freshly started) mock: resume the actor it names, if they may still sign in.
    const match = typeof refreshToken === "string" ? /^wcr_mock_(\w+)\.([^_]+)_/.exec(refreshToken) : null;
    const actor = match ? ({ kind: match[1], id: match[2] } as ActorRef) : null;
    if (actor && isActorAllowed(db, actor)) return issueTokens(db, actor, { deviceName: "Web preview", platform: "web" });
    throw sessionEnded();
  }
  const session = db.sessions.get(entry.sessionId);
  if (!session || session.revoked) throw sessionEnded();
  if (!entry.current) {
    // A rotated token came back: treat it as leaked and end that phone's session.
    revokeSession(db, session);
    throw sessionEnded("This sign-in was used somewhere else, so it was ended. Sign in again.");
  }
  if (!isActorAllowed(db, session.actor)) {
    revokeSession(db, session);
    throw sessionEnded();
  }
  entry.current = false;
  const next = refreshTokenFor(session.actor);
  session.refreshToken = next;
  db.refreshTokens.set(next, { sessionId: session.id, current: true });
  const device = db.devices.find((d) => d.id === session.deviceId);
  if (device) device.lastUsedAt = new Date().toISOString();
  return { accessToken: accessTokenFor(db, session), refreshToken: next, tokenType: "Bearer", expiresIn: 900 };
}

function isActorAllowed(db: Db, actor: ActorRef): boolean {
  if (actor.kind === "owner") return true;
  const worker = findWorker(db, actor.id);
  return !!worker && !worker.disabled && !db.lockdown;
}

export function revokeSession(db: Db, session: Session) {
  session.revoked = true;
  for (const [token, sessionId] of db.accessTokens) if (sessionId === session.id) db.accessTokens.delete(token);
  const device = db.devices.find((d) => d.id === session.deviceId);
  if (device && ![...db.sessions.values()].some((s) => s.deviceId === device.id && !s.revoked)) device.revoked = true;
}

export function revokeWhere(db: Db, predicate: (session: Session) => boolean) {
  for (const session of db.sessions.values()) if (!session.revoked && predicate(session)) revokeSession(db, session);
}

/** Revoke a device row and every session on it (Settings → Devices, Staff → sign out). */
export function revokeDevice(db: Db, deviceId: string) {
  revokeWhere(db, (s) => s.deviceId === deviceId);
  const device = db.devices.find((d) => d.id === deviceId);
  if (device) device.revoked = true;
}

export function authenticate(db: Db, authorization: string | null): AuthContext | null {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  if (!match) return null;
  const sessionId = db.accessTokens.get(match[1].trim());
  const session = sessionId ? db.sessions.get(sessionId) : undefined;
  if (!session || session.revoked || !isActorAllowed(db, session.actor)) return null;
  const actor = engineActorFor(db, session.actor);
  const worker = session.actor.kind === "worker" ? (findWorker(db, session.actor.id) ?? null) : null;
  return { session, actor, isOwner: session.actor.kind === "owner", worker, name: worker ? worker.displayName : db.owner.name };
}

/** Test hook: every access token stops working (the refresh token still does). */
export function expireAccessTokens(db: Db) {
  db.accessTokens.clear();
}
