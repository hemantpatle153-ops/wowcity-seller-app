/** Owner administration: staff, stores, settings (and the not-yet-built account deletion). */
import type { RoundingMode, ShiftWindow, StaffDetailResponse, StaffMember, StoreRow } from "@/api/types";
import { GSTIN_PATTERN, gstStateCode, indianStates } from "@/lib/india";
import type { Db, DbStore, DbWorker } from "../db";
import { addStock, findWorker, postedInvoices, qtyAt } from "../db";
import { fyShortAt, nextId, logActivity } from "../engine/common";
import { body, ownerOnly, route, type Ctx, type Route } from "../http";
import { revokeWhere } from "../state";
import { addDays, normalizeWorkerPermissions, notFound, ok, permissionGroups, r2, r3, reject, rolePresets, startOfDay, str } from "../util";

// ---------------------------------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------------------------------
function withinShift(worker: DbWorker, now = new Date()): boolean {
  if (!worker.restricted) return true;
  const today = worker.shifts.find((s) => s.day_of_week === now.getDay() && s.enabled);
  if (!today) return false;
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return hhmm >= today.start_time && hhmm < today.end_time;
}

function staffMember(db: Db, worker: DbWorker): StaffMember {
  const todayStart = startOfDay(new Date()).toISOString();
  const since30 = addDays(startOfDay(new Date()), -29).toISOString();
  const bills = postedInvoices(db).filter((i) => i.by.kind === "worker" && i.by.id === worker.id);
  const sumOf = (list: typeof bills) => ({ amount: r2(list.reduce((t, i) => t + i.totals.net, 0)), bills: list.length });
  return {
    id: worker.id,
    username: worker.username,
    displayName: worker.displayName,
    mobile: worker.mobile,
    status: worker.disabled ? "disabled" : db.lockdown ? "locked" : withinShift(worker) ? "active" : "off_shift",
    permissions: normalizeWorkerPermissions(worker.permissions),
    stores: db.stores.filter((s) => s.is_active && worker.storeIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name })),
    shifts: worker.shifts.map((s) => ({ ...s })),
    createdAt: worker.createdAt,
    lastLoginAt: worker.lastLoginAt,
    sales30d: sumOf(bills.filter((i) => i.at >= since30)),
    salesToday: sumOf(bills.filter((i) => i.at >= todayStart))
  };
}

function workerOr404(ctx: Ctx): DbWorker {
  ownerOnly(ctx);
  const worker = findWorker(ctx.db, ctx.params.id);
  if (!worker) notFound("Staff member not found.");
  return worker;
}

function accessFrom(ctx: Ctx, permissionsInput: unknown, storeIdsInput: unknown) {
  const permissions = normalizeWorkerPermissions(Array.isArray(permissionsInput) ? permissionsInput.map(String) : []);
  if (!permissions.length) reject("Give at least one permission.");
  const active = ctx.db.stores.filter((s) => s.is_active).map((s) => s.id);
  const storeIds = (Array.isArray(storeIdsInput) ? storeIdsInput.map(String) : []).filter((id) => active.includes(id));
  if (!storeIds.length) reject("Pick at least one open store.");
  return { permissions, storeIds };
}

const signOutWorker = (db: Db, workerId: string) => revokeWhere(db, (s) => s.actor.kind === "worker" && s.actor.id === workerId);

const staffRoutes: Route[] = [
  route("GET", "/staff", (ctx) => {
    ownerOnly(ctx);
    return ok({ staff: ctx.db.workers.map((w) => staffMember(ctx.db, w)), permissionGroups, rolePresets });
  }),
  route("POST", "/staff/lockdown", (ctx) => {
    ownerOnly(ctx);
    const lock = body(ctx).lock === true;
    ctx.db.lockdown = lock;
    if (lock) revokeWhere(ctx.db, (s) => s.actor.kind === "worker");
    return ok({ message: lock ? "All staff are locked out and signed off." : "Staff locked by the emergency switch can sign in again." });
  }),
  route("GET", "/staff/:id", (ctx) => {
    const worker = workerOr404(ctx);
    const { db } = ctx;
    const response: StaffDetailResponse = {
      member: staffMember(db, worker),
      activity: db.activity
        .filter((a) => a.by.kind === "worker" && a.by.id === worker.id)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 25)
        .map((a) => ({ id: a.id, action: a.action, amount: a.amount, document_type: a.documentType, document_id: a.documentId, created_at: a.at })),
      bills: postedInvoices(db)
        .filter((i) => i.by.kind === "worker" && i.by.id === worker.id)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 10)
        .map((i) => ({ id: i.id, number: i.billNumber, at: i.at, amount: i.totals.net, due: i.totals.due, customer: i.customer?.name ?? null })),
      devices: db.devices
        .filter((d) => !d.revoked && d.actor.kind === "worker" && d.actor.id === worker.id)
        .map((d) => ({ id: d.id, name: d.name, platform: d.platform, createdAt: d.createdAt, lastUsedAt: d.lastUsedAt }))
    };
    return ok(response);
  }),
  route("POST", "/staff", (ctx) => {
    ownerOnly(ctx);
    const { db } = ctx;
    const b = body(ctx);
    const displayName = str(b.displayName, 100);
    if (displayName.length < 2 || displayName.length > 80) reject("Enter their name (2 to 80 characters).");
    const username = str(b.username, 40).toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) reject("Username must be 3 to 32 letters, numbers, dots, dashes or underscores.");
    if (db.workers.some((w) => w.username === username)) reject("That username is taken. Try another.");
    const password = typeof b.password === "string" ? b.password : "";
    if (password.length < 6 || password.length > 72) reject("PIN or password must be 6 to 72 characters.");
    const preset = rolePresets.find((p) => p.key === b.preset);
    const access = accessFrom(ctx, preset ? preset.permissions : b.permissions, b.storeIds);
    const worker: DbWorker = {
      id: nextId(),
      username,
      displayName,
      mobile: str(b.mobile, 20) || null,
      pin: password,
      disabled: false,
      ...access,
      restricted: false,
      shifts: [],
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };
    db.workers.push(worker);
    logActivity(db, ctx.auth.actor.ref, "worker_created", `Added ${displayName}`, null, "worker", worker.id, worker.createdAt);
    return { status: 201, body: { data: { message: `${displayName} can now sign in.`, workerId: worker.id } } };
  }),
  route("PATCH", "/staff/:id", (ctx) => {
    const worker = workerOr404(ctx);
    const b = body(ctx);
    const displayName = str(b.displayName, 100);
    if (displayName.length < 2 || displayName.length > 80) reject("Enter their name (2 to 80 characters).");
    worker.displayName = displayName;
    worker.mobile = str(b.mobile, 20) || null;
    return ok({ message: "Details saved." });
  }),
  route("PUT", "/staff/:id/access", (ctx) => {
    const worker = workerOr404(ctx);
    const b = body(ctx);
    Object.assign(worker, accessFrom(ctx, b.permissions, b.storeIds));
    return ok({ message: "Access updated. It applies on their next tap." });
  }),
  route("PUT", "/staff/:id/shifts", (ctx) => {
    const worker = workerOr404(ctx);
    const b = body(ctx);
    const restricted = b.restricted === true;
    const days = Array.isArray(b.days) ? (b.days as Array<{ dayOfWeek?: number; start?: string; end?: string }>) : [];
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const d of days) {
      if (!Number.isInteger(d.dayOfWeek) || (d.dayOfWeek as number) < 0 || (d.dayOfWeek as number) > 6) reject("Pick a valid day.");
      if (!time.test(d.start ?? "") || !time.test(d.end ?? "")) reject("Enter times like 09:30.");
      if ((d.end as string) <= (d.start as string)) reject("End time must be after the start time.");
    }
    if (restricted && days.length === 0) reject("Pick at least one working day.");
    worker.restricted = restricted;
    worker.shifts = restricted
      ? [0, 1, 2, 3, 4, 5, 6].map((day): ShiftWindow => {
          const d = days.find((x) => x.dayOfWeek === day);
          return { day_of_week: day, start_time: d?.start ?? "10:00", end_time: d?.end ?? "20:00", enabled: !!d };
        })
      : [];
    return ok({ message: restricted ? "Working hours saved. They can sign in only during these hours." : "They can now sign in any time." });
  }),
  route("POST", "/staff/:id/pin", (ctx) => {
    const worker = workerOr404(ctx);
    const password = body(ctx).password;
    if (typeof password !== "string" || password.length < 6 || password.length > 72) reject("PIN or password must be 6 to 72 characters.");
    worker.pin = password;
    signOutWorker(ctx.db, worker.id);
    return ok({ message: "Password changed. They were signed out everywhere." });
  }),
  route("POST", "/staff/:id/status", (ctx) => {
    const worker = workerOr404(ctx);
    worker.disabled = body(ctx).disabled === true;
    if (worker.disabled) signOutWorker(ctx.db, worker.id);
    return ok({ message: worker.disabled ? "Account disabled and signed out." : "Account enabled." });
  }),
  route("POST", "/staff/:id/sign-out", (ctx) => {
    const worker = workerOr404(ctx);
    signOutWorker(ctx.db, worker.id);
    for (const d of ctx.db.devices) if (d.actor.kind === "worker" && d.actor.id === worker.id) d.revoked = true;
    return ok({ message: "Signed out on every device." });
  })
];

// ---------------------------------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------------------------------
function storeRow(db: Db, store: DbStore, withStats: boolean): StoreRow {
  const { billCounter: _b, estimateCounter: _e, createdAt: _c, ...row } = store;
  const todayStart = startOfDay(new Date()).toISOString();
  const bills = postedInvoices(db).filter((i) => i.storeId === store.id && i.at >= todayStart);
  const inStock = db.variants.filter((v) => qtyAt(db, v.id, store.id) > 0);
  return {
    ...row,
    stats: withStats
      ? {
          units: r3(inStock.reduce((t, v) => t + qtyAt(db, v.id, store.id), 0)),
          skus: inStock.length,
          salesToday: r2(bills.reduce((t, i) => t + i.totals.net, 0)),
          billsToday: bills.length,
          staff: db.workers.filter((w) => !w.disabled && w.storeIds.includes(store.id)).length
        }
      : null
  };
}

const MAPS = /^https:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i;

const storeRoutes: Route[] = [
  route("GET", "/stores", (ctx) => {
    const { db, auth } = ctx;
    const list = auth.isOwner ? db.stores : db.stores.filter((s) => auth.worker?.storeIds.includes(s.id));
    return ok({ stores: [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((s) => storeRow(db, s, auth.isOwner)) });
  }),
  route("POST", "/stores", (ctx) => {
    ownerOnly(ctx);
    const { db } = ctx;
    const b = body(ctx);
    const name = str(b.name, 120);
    if (name.length < 2) reject("Enter the store name.");
    if (!str(b.addressLine1)) reject("Enter the address.");
    if (!str(b.city)) reject("Enter the city.");
    const state = indianStates.find((s) => s.name.toLowerCase() === str(b.state).toLowerCase());
    if (!state) reject("Pick the state.");
    const pincode = str(b.pincode, 10);
    if (!/^\d{6}$/.test(pincode)) reject("Pincode must be 6 digits.");
    const gstin = str(b.gstin, 20).toUpperCase();
    if (gstin && !GSTIN_PATTERN.test(gstin)) reject("That GSTIN does not look right.");
    if (gstin && gstStateCode(gstin) !== state.code) reject(`This GSTIN is not from ${state.name}.`);
    const maps = str(b.googleMapsUrl, 500);
    if (maps && !MAPS.test(maps)) reject("Paste a Google Maps link that starts with https://.");
    const lat = typeof b.latitude === "number" ? b.latitude : null;
    const lng = typeof b.longitude === "number" ? b.longitude : null;
    const values = {
      name,
      address_line_1: str(b.addressLine1, 200),
      address_line_2: str(b.addressLine2, 200) || null,
      city: str(b.city, 80),
      state: state.name,
      pincode,
      contact_phone: str(b.contactPhone, 20) || null,
      gstin: gstin || null,
      google_maps_url: maps || null,
      latitude: lat !== null && lng !== null ? lat : null,
      longitude: lat !== null && lng !== null ? lng : null,
      is_discoverable: b.isDiscoverable === true,
      public_address_enabled: b.publicAddressEnabled === true,
      public_contact_enabled: b.publicContactEnabled === true
    };
    if (b.storeId) {
      const store = db.stores.find((s) => s.id === b.storeId);
      if (!store) reject("That store was not found.");
      Object.assign(store, values);
      return ok({ message: `${name} saved.` });
    }
    const base =
      (name.split(/—|-/).pop() ?? name)
        .trim()
        .replace(/[^A-Za-z ]/g, "")
        .split(/\s+/)
        .map((w) => w[0] ?? "")
        .join("")
        .toUpperCase()
        .slice(0, 3) || "ST";
    let prefix =
      base.length >= 2
        ? base
        : `${base}${name
            .replace(/[^A-Za-z]/g, "")
            .toUpperCase()
            .slice(1, 3)}`;
    let n = 2;
    while (db.stores.some((s) => s.invoice_prefix === prefix)) prefix = `${base}${n++}`;
    db.stores.push({ id: nextId(), ...values, is_active: true, invoice_prefix: prefix, createdAt: new Date().toISOString(), billCounter: 0, estimateCounter: 0 });
    return ok({ message: `${name} added. Its bills will be numbered ${prefix}/${fyShortAt(new Date().toISOString())}/0001.` });
  }),
  route("POST", "/stores/:id/close", (ctx) => {
    ownerOnly(ctx);
    const { db } = ctx;
    const store = db.stores.find((s) => s.id === ctx.params.id);
    if (!store) notFound("Store not found.");
    if (!store.is_active) reject("This store is already closed.");
    if (db.stores.filter((s) => s.is_active).length === 1) reject("You need at least one open store.");
    const b = body(ctx);
    if (b.mode === "merge") {
      const target = db.stores.find((s) => s.id === b.targetStoreId && s.is_active && s.id !== store.id);
      if (!target) reject("Pick an open store to move the stock to.");
      const at = new Date().toISOString();
      const transferId = nextId();
      for (const v of db.variants) {
        const qty = qtyAt(db, v.id, store.id);
        if (qty > 0) {
          addStock(db, v.id, store.id, -qty, "transfer", transferId, at, nextId());
          addStock(db, v.id, target.id, qty, "transfer", transferId, at, nextId());
        }
      }
      store.is_active = false;
      return ok({ message: "Store closed and its stock moved." });
    }
    store.is_active = false;
    return ok({ message: "Store closed. Its stock stays where it is." });
  }),
  route("POST", "/stores/:id/reopen", (ctx) => {
    ownerOnly(ctx);
    const store = ctx.db.stores.find((s) => s.id === ctx.params.id);
    if (!store) notFound("Store not found.");
    store.is_active = true;
    return ok({ message: "Store reopened." });
  })
];

// ---------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------
const ROUNDING: RoundingMode[] = ["nearest_rupee", "up_rupee", "down_rupee", "none"];

const settingsRoutes: Route[] = [
  route("GET", "/settings", (ctx) => {
    ownerOnly(ctx);
    return ok(JSON.parse(JSON.stringify(ctx.db.settings)));
  }),
  route("PUT", "/settings/profile", (ctx) => {
    ownerOnly(ctx);
    const b = body(ctx);
    const displayName = str(b.displayName, 100);
    const businessType = str(b.businessType, 100);
    const ownerName = str(b.ownerName, 100);
    if (displayName.length < 2 || displayName.length > 80) reject("Enter the shop name (2 to 80 characters).");
    if (businessType.length < 2 || businessType.length > 60) reject("Enter the type of business.");
    if (ownerName.length < 2 || ownerName.length > 80) reject("Enter the owner's name.");
    const phone = str(b.phone, 20);
    if (phone && !/^\+?[0-9 ]{10,15}$/.test(phone)) reject("Enter a valid phone number.");
    Object.assign(ctx.db.settings.profile, { displayName, businessType, ownerName, phone });
    ctx.db.owner.name = ownerName;
    return ok({ message: "Business profile saved." });
  }),
  route("PUT", "/settings/tax", (ctx) => {
    ownerOnly(ctx);
    const b = body(ctx);
    const tax = ctx.db.settings.tax;
    const gstin = str(b.gstin, 20).toUpperCase();
    if (gstin && !GSTIN_PATTERN.test(gstin)) reject("That GSTIN does not look right.");
    const roundingMode = str(b.roundingMode) as RoundingMode;
    if (!ROUNDING.includes(roundingMode)) reject("Pick how bills are rounded.");
    const pan = str(b.pan, 10).toUpperCase();
    if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) reject("That PAN does not look right.");
    const stateName = str(b.state, 60) || (gstin ? (indianStates.find((s) => s.code === gstin.slice(0, 2))?.name ?? "") : tax.state);
    if (gstin && stateName && gstStateCode(stateName) !== gstin.slice(0, 2)) reject(`This GSTIN is not from ${stateName}.`);
    Object.assign(tax, { legalName: str(b.legalName, 120), gstin, pan, state: stateName, stateCode: gstStateCode(stateName), roundingMode });
    return ok({ message: "Tax settings saved." });
  }),
  route("PUT", "/settings/invoice", (ctx) => {
    ownerOnly(ctx);
    const b = body(ctx);
    const upiId = str(b.upiId, 100);
    if (upiId && !/^[\w.-]{2,}@[a-zA-Z][\w]{1,}$/.test(upiId)) reject("UPI ID should look like name@bank.");
    const accountNumber = str(b.accountNumber, 30);
    if (accountNumber && !/^\d{6,20}$/.test(accountNumber)) reject("Account number must be 6 to 20 digits.");
    const ifsc = str(b.ifsc, 20).toUpperCase();
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) reject("IFSC should look like HDFC0001234.");
    const terms = str(b.terms, 1000);
    if (terms.length > 500) reject("Keep the terms under 500 characters.");
    ctx.db.settings.invoice = {
      terms,
      upiId,
      payeeName: str(b.payeeName, 60),
      showUpiQr: b.showUpiQr !== false,
      bankName: str(b.bankName, 80),
      accountName: str(b.accountName, 80),
      accountNumber,
      ifsc,
      printFormat: b.printFormat === "thermal" ? "thermal" : "a4"
    };
    return ok({ message: "Invoice settings saved." });
  }),
  route("POST", "/settings/password", (ctx) => {
    ownerOnly(ctx);
    const b = body(ctx);
    if (b.currentPassword !== ctx.db.owner.password) reject("Your current password is not right.");
    const next = typeof b.newPassword === "string" ? b.newPassword : "";
    if (next.length < 8 || next.length > 72) reject("The new password must be 8 to 72 characters.");
    if (next !== b.confirmPassword) reject("The two new passwords do not match.");
    ctx.db.owner.password = next;
    revokeWhere(ctx.db, (s) => s.actor.kind === "owner");
    return ok({ message: "Password changed. Your phones were signed out." });
  })
];

export const adminRoutes: Route[] = [
  ...staffRoutes,
  ...storeRoutes,
  ...settingsRoutes,
  // The backend has no account deletion yet; the app shows a friendly message for this 404.
  route("DELETE", "/account", () => notFound())
];
