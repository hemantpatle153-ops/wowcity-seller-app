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
