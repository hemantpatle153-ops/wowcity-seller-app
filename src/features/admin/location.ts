import * as Location from "expo-location";
import { gstStateCode, indianStates } from "@/lib/india";

export type StoreLocation = {
  latitude: number;
  longitude: number;
  /** Metres, when the phone reports it. */
  accuracy: number | null;
  address: { line1: string; city: string; state: string; pincode: string } | null;
};

export type LocationFailure = { reason: "denied" | "blocked" | "services_off" | "unavailable"; message: string };

/** Round to 6 decimals (about 11 cm): plenty for a shop pin and what the server stores. */
export const roundCoord = (value: number) => Math.round(value * 1e6) / 1e6;

/** Google Maps link for a pin (accepted by the store form's Maps field). */
export function mapsLink(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${roundCoord(latitude)},${roundCoord(longitude)}`;
}

/** Map a reverse-geocode result onto our address fields, using GST state names. */
export function addressFromGeocode(place: Pick<Location.LocationGeocodedAddress, "name" | "streetNumber" | "street" | "district" | "city" | "subregion" | "region" | "postalCode"> | null | undefined) {
  if (!place) return null;
  const code = gstStateCode(place.region ?? "");
  const state = indianStates.find((s) => s.code === code)?.name ?? "";
  const street = [place.streetNumber, place.street].filter(Boolean).join(" ");
  const line1 = [place.name && place.name !== street ? place.name : null, street || null, place.district].filter(Boolean).join(", ");
  const pincode = /^\d{6}$/.test(place.postalCode ?? "") ? (place.postalCode as string) : "";
  return { line1, city: place.city ?? place.subregion ?? "", state, pincode };
}

/**
 * Where the phone is now, for pinning a store. Asks for "while using the app" permission only when
 * tapped, uses a recent fix if there is one, and otherwise waits for a fresh one.
 */
export async function currentStoreLocation(): Promise<{ ok: true; location: StoreLocation } | { ok: false; error: LocationFailure }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    return permission.canAskAgain
      ? { ok: false, error: { reason: "denied", message: "Location permission is needed to pin the store. You can type the coordinates instead." } }
      : { ok: false, error: { reason: "blocked", message: "Location is turned off for WowCity Seller. Allow it in your phone's settings, or type the coordinates." } };
  }
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) {
    return { ok: false, error: { reason: "services_off", message: "Turn on location (GPS) on your phone and try again." } };
  }
  let position = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000, requiredAccuracy: 100 }).catch(() => null);
  if (!position) {
    position = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000))]).catch(() => null);
  }
  if (!position) return { ok: false, error: { reason: "unavailable", message: "Couldn't get a location fix. Step near a door or window and try again." } };
  const { latitude, longitude, accuracy } = position.coords;
  const places = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
  return { ok: true, location: { latitude: roundCoord(latitude), longitude: roundCoord(longitude), accuracy: accuracy ?? null, address: addressFromGeocode(places[0]) } };
}
