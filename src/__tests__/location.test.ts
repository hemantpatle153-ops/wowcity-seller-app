import { addressFromGeocode, mapsLink, roundCoord } from "@/features/admin/location";
import { MAPS_PATTERN } from "@/features/admin/validation";

describe("store location", () => {
  it("rounds coordinates and builds a Maps link the store form accepts", () => {
    expect(roundCoord(22.719568123)).toBe(22.719568);
    const link = mapsLink(22.7195681, 75.8577258);
    expect(link).toBe("https://www.google.com/maps?q=22.719568,75.857726");
    expect(MAPS_PATTERN.test(link)).toBe(true);
  });

  it("maps a reverse-geocoded place to address fields with GST state names", () => {
    expect(
      addressFromGeocode({ name: "Luzzan Fashions", streetNumber: "12", street: "MG Road", district: "Palasia", city: "Indore", subregion: null, region: "Madhya Pradesh", postalCode: "452001" })
    ).toEqual({
      line1: "Luzzan Fashions, 12 MG Road, Palasia",
      city: "Indore",
      state: "Madhya Pradesh",
      pincode: "452001"
    });
    expect(addressFromGeocode({ name: null, streetNumber: null, street: null, district: null, city: null, subregion: "Bhopal", region: "Orissa", postalCode: "12" })).toEqual({
      line1: "",
      city: "Bhopal",
      state: "Odisha",
      pincode: ""
    });
    expect(addressFromGeocode(null)).toBeNull();
  });
});

import { cleanMobileInput, formFromCustomer } from "@/features/customers/form";

describe("customer form", () => {
  it("strips +91 / 0 from pasted numbers instead of cutting the last digits", () => {
    expect(cleanMobileInput("+91 98765 43210")).toBe("9876543210");
    expect(cleanMobileInput("09876543210")).toBe("9876543210");
    expect(cleanMobileInput("98765")).toBe("98765");
  });

  it("normalises a saved state so old customers stay editable", () => {
    const form = formFromCustomer({ id: "c", name: "A", mobile: null, address: null, city: null, state: "Orissa", gstin: null, created_at: "" });
    expect(form.state).toBe("Odisha");
  });
});
