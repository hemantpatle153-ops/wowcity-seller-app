import type { RolePreset, ShiftWindow } from "@/api/types";
import { activityLabel, impliedBy, matchPreset, normalizePermissions, roleLabel, statusBadge, togglePermission } from "@/features/admin/roles";
import { roundBill, roundingExample } from "@/features/admin/rounding";
import { copyMondayToWeekdays, dayError, formatClock, isRestricted, shiftsBody, shiftSummary, weekErrors, weekFromShifts } from "@/features/admin/shifts";
import {
  accountNumberError,
  coordinatesError,
  generatePin,
  gstinError,
  ifscError,
  isTrivialPin,
  mapsUrlError,
  mobileError,
  panError,
  passwordStrength,
  pincodeError,
  suggestUsername,
  upiError,
  usernameError
} from "@/features/admin/validation";

const presets: RolePreset[] = [
  { key: "cashier", label: "Cashier", description: "", permissions: ["sale.view", "sale.create", "sale.return"] },
  { key: "stock", label: "Stock keeper", description: "", permissions: ["purchase.view", "purchase.create", "stock.view", "product.view", "barcode.view", "barcode.print"] },
  {
    key: "manager",
    label: "Manager",
    description: "",
    permissions: [
      "sale.create",
      "sale.view",
      "sale.return",
      "sale.discount_override",
      "purchase.create",
      "purchase.view",
      "purchase.view_cost",
      "product.view",
      "product.edit",
      "product.images.manage",
      "stock.view",
      "barcode.view",
      "barcode.print",
      "reports.sale",
      "reports.stock",
      "reports.due"
    ]
  }
];

describe("usernames", () => {
  it("accepts lowercase letters, digits and . _ -", () => {
    expect(usernameError("ravi.k_01-x")).toBeNull();
    expect(usernameError("  Ravi  ")).toBeNull(); // cleaned to "ravi"
  });
  it("rejects bad characters, length and duplicates", () => {
    expect(usernameError("")).toMatch(/Pick/);
    expect(usernameError("ab")).toMatch(/3/);
    expect(usernameError("a".repeat(33))).toMatch(/32/);
    expect(usernameError("ravi kumar")).toMatch(/letters/);
    expect(usernameError("ravi@x")).toMatch(/letters/);
    expect(usernameError("ravi", ["ravi"])).toMatch(/already/);
  });
  it("suggests one from a name, avoiding taken ones", () => {
    expect(suggestUsername("Ravi Kumar Singh")).toBe("ravi.kumar");
    expect(suggestUsername("Meena", ["meena"])).toBe("meena2");
  });
});

describe("Indian IDs", () => {
  it("GSTIN: format and state match", () => {
    expect(gstinError("")).toBeNull();
    expect(gstinError("29ABCDE1234F1Z5")).toBeNull();
    expect(gstinError("29abcde1234f1z5", "Karnataka")).toBeNull();
    expect(gstinError("29ABCDE1234F1Z5", "Maharashtra")).toMatch(/Karnataka/);
    expect(gstinError("29ABCDE1234")).toMatch(/15/);
    expect(gstinError("99ABCDE1234F1Z5")).toMatch(/state code|look right/);
  });
  it("PAN, IFSC, UPI, account number, pincode", () => {
    expect(panError("ABCDE1234F")).toBeNull();
    expect(panError("abcde1234f")).toBeNull();
    expect(panError("ABCD1234F")).toMatch(/ABCDE1234F/);
    expect(ifscError("HDFC0001234")).toBeNull();
    expect(ifscError("HDFC1001234")).toMatch(/HDFC0001234/);
    expect(upiError("luzzan@okhdfc")).toBeNull();
    expect(upiError("luzzan.fashion@ybl")).toBeNull();
    expect(upiError("luzzan")).toMatch(/name@bank/);
    expect(upiError("a@1bank")).toMatch(/name@bank/);
    expect(accountNumberError("123456")).toBeNull();
    expect(accountNumberError("12345")).toMatch(/6 to 20/);
    expect(accountNumberError("1234567890123456789012")).toMatch(/6 to 20/);
    expect(pincodeError("560001")).toBeNull();
    expect(pincodeError("56001")).toMatch(/6 digits/);
    expect(pincodeError("")).toMatch(/Enter/);
  });
  it("mobile, maps links and coordinates", () => {
    expect(mobileError("")).toBeNull();
    expect(mobileError("98450 12345")).toBeNull();
    expect(mobileError("+919845012345")).toBeNull();
    expect(mobileError("98450")).toMatch(/10-digit/);
    expect(mapsUrlError("https://maps.app.goo.gl/abc")).toBeNull();
    expect(mapsUrlError("https://www.google.com/maps/place/x")).toBeNull();
    expect(mapsUrlError("http://maps.app.goo.gl/abc")).toMatch(/https/);
    expect(mapsUrlError("https://example.com/maps")).toMatch(/Google Maps/);
    expect(coordinatesError("", "")).toEqual({ lat: null, lng: null });
    expect(coordinatesError("12.97", "77.59")).toEqual({ lat: null, lng: null });
    expect(coordinatesError("12.97", "").lng).toMatch(/longitude/);
    expect(coordinatesError("120", "77").lat).toMatch(/-90/);
  });
});

describe("PINs and passwords", () => {
  it("generates 6-digit non-trivial PINs", () => {
    for (let i = 0; i < 50; i++) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(isTrivialPin(pin)).toBe(false);
    }
    expect(isTrivialPin("111111")).toBe(true);
    expect(isTrivialPin("123456")).toBe(true);
    expect(isTrivialPin("654321")).toBe(true);
    expect(isTrivialPin("839201")).toBe(false);
  });
  it("skips trivial PINs from the random source", () => {
    const seq = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.8, 0.3, 0.9, 0.2, 0.0, 0.1];
    let i = 0;
    expect(generatePin(6, () => seq[i++])).toBe("839201");
  });
  it("rates password strength", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("abc").score).toBeLessThanOrEqual(1);
    expect(passwordStrength("password123").score).toBe(1);
    expect(passwordStrength("Shop2026!long").score).toBe(4);
  });
});

describe("working hours", () => {
  const server: ShiftWindow[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, start_time: "09:30", end_time: "18:00", enabled: d !== 0 }));

  it("reads the server week and knows when it is restricted", () => {
    const week = weekFromShifts(server);
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ day: 0, enabled: false, start: "09:30", end: "18:00" });
    expect(isRestricted(server)).toBe(true);
    expect(isRestricted([])).toBe(false);
    expect(weekFromShifts([])[1]).toEqual({ day: 1, enabled: true, start: "10:00", end: "20:00" });
  });
  it("serialises to the PUT body (camelCase, only enabled days)", () => {
    const week = weekFromShifts(server);
    expect(shiftsBody(false, week)).toEqual({ restricted: false });
    const body = shiftsBody(true, week);
    expect(body.restricted).toBe(true);
    expect(body.days).toHaveLength(6);
    expect(body.days?.[0]).toEqual({ dayOfWeek: 1, start: "09:30", end: "18:00" });
  });
  it("validates end after start and at least one day", () => {
    expect(dayError({ day: 1, enabled: true, start: "10:00", end: "10:00" })).toMatch(/after/);
    expect(dayError({ day: 1, enabled: true, start: "10:00", end: "9:00" })).toMatch(/09:30/);
    expect(dayError({ day: 1, enabled: false, start: "20:00", end: "10:00" })).toBeNull();
    const off = weekFromShifts(server).map((d) => ({ ...d, enabled: false }));
    expect(weekErrors(true, off).form).toMatch(/at least one/);
    expect(weekErrors(false, off).form).toBeNull();
  });
  it("copies Monday to Tue–Sat", () => {
    const week = weekFromShifts([]).map((d) => (d.day === 1 ? { ...d, start: "08:00", end: "14:00" } : d.day === 3 ? { ...d, enabled: false } : d));
    const copied = copyMondayToWeekdays(week);
    expect(copied.slice(2).every((d) => d.enabled && d.start === "08:00" && d.end === "14:00")).toBe(true);
    expect(copied[0]).toEqual(week[0]);
  });
  it("summarises hours", () => {
    expect(shiftSummary([])).toBe("Any time");
    expect(shiftSummary(server)).toBe("Mon–Sat, 9:30 am – 6:00 pm");
    expect(formatClock("00:05")).toBe("12:05 am");
    expect(formatClock("12:00")).toBe("12:00 pm");
  });
});

describe("roles and permissions", () => {
  it("adds implied permissions and drops non-grantable ones", () => {
    expect(normalizePermissions(["sale.create", "barcode.print", "settings.tax"])).toEqual(["sale.create", "sale.view", "barcode.view", "barcode.print"]);
  });
  it("matches presets regardless of order or implied extras", () => {
    expect(matchPreset(["sale.return", "sale.create"], presets)).toBe("cashier");
    expect(matchPreset(["sale.create"], presets)).toBe("custom");
    expect(matchPreset(presets[2].permissions.slice().reverse(), presets)).toBe("manager");
    expect(roleLabel(["purchase.create", "stock.view", "product.view", "barcode.print"], presets)).toBe("Stock keeper");
    expect(roleLabel(["reports.sale"], presets)).toBe("Custom");
  });
  it("toggles with implications", () => {
    expect(togglePermission([], "sale.create")).toEqual(["sale.create", "sale.view"]);
    // sale.view is needed by sale.create, so it cannot be turned off alone
    expect(togglePermission(["sale.create", "sale.view"], "sale.view")).toEqual(["sale.create", "sale.view"]);
    expect(togglePermission(["sale.create", "sale.view"], "sale.create")).toEqual(["sale.view"]);
    expect(impliedBy("sale.view", ["sale.create", "sale.return"])).toEqual(["sale.create", "sale.return"]);
  });
  it("labels status and activity", () => {
    expect(statusBadge("locked")).toMatchObject({ label: "Locked (emergency)", tone: "warning" });
    expect(statusBadge("off_shift")).toMatchObject({ label: "Off shift", tone: "info" });
    expect(statusBadge("disabled").tone).toBe("danger");
    expect(activityLabel("sale_created").label).toBe("Made a bill");
    expect(activityLabel("something_new").label).toBe("Something new");
  });
});

describe("rounding examples", () => {
  it("rounds each way", () => {
    expect(roundBill(1249.5, "nearest_rupee")).toBe(1250);
    expect(roundBill(1249.4, "nearest_rupee")).toBe(1249);
    expect(roundBill(1249.1, "up_rupee")).toBe(1250);
    expect(roundBill(1249.9, "down_rupee")).toBe(1249);
    expect(roundBill(1249.5, "none")).toBe(1249.5);
  });
  it("formats the example", () => {
    expect(roundingExample(1249.5, "nearest_rupee")).toBe("₹1,249.50 → ₹1,250");
    expect(roundingExample(1249.5, "down_rupee")).toBe("₹1,249.50 → ₹1,249");
    expect(roundingExample(1249.5, "none")).toBe("₹1,249.50 → ₹1,249.50");
  });
});
