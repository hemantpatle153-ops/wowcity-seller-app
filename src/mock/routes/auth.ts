/** Sign-in, OTP, sign-up, refresh, logout, /me and owner devices. */
import type { DevicesResponse, MeResponse, OtpRequestBody, OtpVerifyBody, OwnerLoginBody, SignupBody, StaffLoginBody } from "@/api/types";
import { DEMO } from "../fixtures";
import { body, ownerOnly, route, type Ctx, type Route } from "../http";
import { issueTokens, revokeDevice, revokeSession, rotateRefreshToken } from "../state";
import { ALL_PERMISSIONS, MockHttpError, invalid, notFound, ok, str } from "../util";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function device(b: { deviceName?: string; platform?: string }) {
  return { deviceName: b.deviceName, platform: b.platform };
}

function maskIdentifier(identifier: string): { sentTo: string; channel: "email" | "sms" } | null {
  const text = identifier.trim();
  if (EMAIL.test(text)) {
    const [user, domain] = text.split("@");
    const masked = user.length <= 2 ? `${user[0]}*` : `${user[0]}${"*".repeat(Math.min(6, user.length - 2))}${user[user.length - 1]}`;
    return { sentTo: `${masked}@${domain}`, channel: "email" };
  }
  const digits = text.replace(/\D/g, "");
  const mobile = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (/^[6-9]\d{9}$/.test(mobile)) return { sentTo: `+91 ******${mobile.slice(-4)}`, channel: "sms" };
  return null;
}

function applySignupShop(ctx: Ctx, shop: Partial<SignupBody>, email?: string) {
  const required: Array<[keyof SignupBody, string]> = [
    ["ownerName", "Enter your name."],
    ["phone", "Enter a mobile number."],
    ["shopName", "Enter the shop name."],
    ["addressLine1", "Enter the shop address."],
    ["city", "Enter the city."],
    ["state", "Pick the state."],
    ["pincode", "Enter the 6-digit pincode."]
  ];
  for (const [key, message] of required) if (!str(shop[key])) invalid(message);
  if (!/^\+?[0-9 ]{10,15}$/.test(str(shop.phone))) invalid("Enter a valid mobile number.");
  if (!/^\d{6}$/.test(str(shop.pincode))) invalid("Enter the 6-digit pincode.");
  const s = ctx.db.settings;
  s.profile.displayName = str(shop.shopName, 80);
  s.profile.ownerName = str(shop.ownerName, 80);
  s.profile.phone = str(shop.phone, 20);
  s.profile.businessType = str(shop.businessType, 60) || "Clothing";
  if (email) s.profile.email = email;
  if (str(shop.gstin)) s.tax.gstin = str(shop.gstin, 15).toUpperCase();
  s.tax.legalName = str(shop.legalName, 120) || s.profile.displayName;
  s.invoice.payeeName = s.profile.displayName;
  ctx.db.owner.name = s.profile.ownerName;
  if (email) ctx.db.owner.email = email;
}

const ownerRef = (ctx: Ctx) => ({ kind: "owner" as const, id: ctx.db.owner.id });

export const authRoutes: Route[] = [
  route(
    "POST",
    "/auth/owner-login",
    (ctx) => {
      const b = body<OwnerLoginBody>(ctx);
      const email = str(b.email, 200).toLowerCase();
      if (!EMAIL.test(email)) invalid("Enter a valid email address.");
      if (typeof b.password !== "string" || b.password !== ctx.db.owner.password) throw new MockHttpError(401, "invalid_credentials", "Email or password is wrong.");
      return ok(issueTokens(ctx.db, ownerRef(ctx), device(b)), 201);
    },
    { public: true }
  ),

  route(
    "POST",
    "/auth/staff-login",
    (ctx) => {
      const b = body<StaffLoginBody>(ctx);
      const wrong = () => new MockHttpError(401, "invalid_credentials", "Shop code, username or PIN is wrong.");
      const shopCode = str(b.shopCode, 20).toUpperCase();
      if (shopCode.length < 3 || !str(b.username) || !str(b.pin)) invalid("Enter the shop code, username and PIN.");
      if (shopCode !== DEMO.shopCode) throw wrong();
      const worker = ctx.db.workers.find((w) => w.username === str(b.username, 40).toLowerCase());
      if (!worker || worker.pin !== String(b.pin)) throw wrong();
      if (worker.disabled) throw new MockHttpError(403, "forbidden", "This account is disabled. Ask the shop owner.");
      if (ctx.db.lockdown) throw new MockHttpError(403, "forbidden", "Staff sign-in is paused by the shop owner.");
      return ok(issueTokens(ctx.db, { kind: "worker", id: worker.id }, device(b)), 201);
    },
    { public: true }
  ),

  route(
    "POST",
    "/auth/otp/request",
    (ctx) => {
      const b = body<OtpRequestBody>(ctx);
      if (b.purpose !== "login" && b.purpose !== "signup") invalid("purpose must be login or signup.");
      const target = maskIdentifier(str(b.identifier, 200));
      if (!target) throw new MockHttpError(422, "invalid_identifier", "Enter a valid email or 10-digit mobile number.");
      return ok(target);
    },
    { public: true }
  ),

  route(
    "POST",
    "/auth/otp/verify",
    (ctx) => {
      const b = body<OtpVerifyBody>(ctx);
      if (!maskIdentifier(str(b.identifier, 200))) throw new MockHttpError(422, "invalid_identifier", "Enter a valid email or 10-digit mobile number.");
      if (str(b.code, 12) !== DEMO.otpCode) throw new MockHttpError(422, "invalid_code", "That code is not right. Check it and try again.");
      if (b.purpose === "signup") {
        if (!b.shop || typeof b.shop !== "object") invalid("Enter your shop details.");
        const identifier = str(b.identifier, 200);
        applySignupShop(ctx, b.shop, EMAIL.test(identifier) ? identifier.toLowerCase() : undefined);
        return ok({ ...issueTokens(ctx.db, ownerRef(ctx), device(b)), shopCode: DEMO.shopCode }, 201);
      }
      return ok(issueTokens(ctx.db, ownerRef(ctx), device(b)));
    },
    { public: true }
  ),

  route(
    "POST",
    "/auth/signup",
    (ctx) => {
      const b = body<SignupBody>(ctx);
      const email = str(b.email, 200).toLowerCase();
      if (!EMAIL.test(email)) invalid("Enter a valid email address.");
      if (typeof b.password !== "string" || b.password.length < 8) invalid("Password must be at least 8 characters.");
      applySignupShop(ctx, b, email);
      ctx.db.owner.password = b.password;
      return ok({ ...issueTokens(ctx.db, ownerRef(ctx), device(b)), shopCode: DEMO.shopCode }, 201);
    },
    { public: true }
  ),

  route("POST", "/auth/refresh", (ctx) => ok(rotateRefreshToken(ctx.db, body(ctx).refreshToken)), { public: true }),

  route("POST", "/auth/logout", (ctx) => {
    revokeSession(ctx.db, ctx.auth.session);
    return ok({ signedOut: true });
  }),

  route("GET", "/me", (ctx) => {
    const { db, auth } = ctx;
    const stores = db.stores
      .filter((s) => s.is_active && auth.actor.storeIds.includes(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ id: s.id, name: s.name, state: s.state ?? "", city: s.city ?? "" }));
    const me: MeResponse = {
      actor: auth.isOwner ? "seller" : "worker",
      userId: auth.isOwner ? db.owner.id : null,
      workerId: auth.worker?.id ?? null,
      displayName: auth.name,
      sellerId: db.sellerId,
      shopName: db.settings.profile.displayName,
      shopCode: db.settings.profile.shopCode,
      permissions: auth.isOwner ? [...ALL_PERMISSIONS] : [...auth.actor.permissions],
      storeIds: auth.actor.storeIds,
      financialYear: db.settings.financialYears.find((f) => f.is_active)?.label ?? "",
      stores,
      settings: {
        roundingMode: db.settings.tax.roundingMode,
        gstin: db.settings.tax.gstin || null,
        printFormat: db.settings.invoice.printFormat,
        upiId: db.settings.invoice.upiId || null,
        terms: db.settings.invoice.terms
      }
    };
    return ok(me);
  }),

  route("GET", "/devices", (ctx) => {
    ownerOnly(ctx);
    const devices = ctx.db.devices
      .filter((d) => !d.revoked && d.actor.kind === "owner")
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
      .slice(0, 20)
      .map((d) => ({ id: d.id, name: d.name, platform: d.platform, createdAt: d.createdAt, lastUsedAt: d.lastUsedAt }));
    const response: DevicesResponse = { devices, currentDeviceId: ctx.auth.session.deviceId };
    return ok(response);
  }),

  route("DELETE", "/devices/:id", (ctx) => {
    ownerOnly(ctx);
    const deviceRow = ctx.db.devices.find((d) => d.id === ctx.params.id && !d.revoked);
    if (!deviceRow) notFound();
    revokeDevice(ctx.db, deviceRow.id);
    return ok({ message: "Phone signed out." });
  })
];
