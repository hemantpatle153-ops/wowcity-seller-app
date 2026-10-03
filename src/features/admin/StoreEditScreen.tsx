import { router } from "expo-router";
import { useState } from "react";
import { Linking, Platform } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { api, errorMessage } from "@/api";
import type { StoreRow, StoreSaveBody } from "@/api/types";
import { gstStateCode, indianStates } from "@/lib/india";
import { Button, EmptyState, ErrorState, Header, Input, Row, Screen, Select, SkeletonCards, Text, toast, ToggleRow } from "@/ui";
import { Callout, FormSection, StickyFooter } from "./components";
import { adminKeys, useAdminMutation, useStores, useUnsavedGuard } from "./hooks";
import { currentStoreLocation, mapsLink } from "./location";
import { coordinatesError, gstinError, mapsUrlError, phoneError, pincodeError, stateNameFor } from "./validation";

type Form = {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  contactPhone: string;
  gstin: string;
  googleMapsUrl: string;
  latitude: string;
  longitude: string;
  isDiscoverable: boolean;
  publicAddressEnabled: boolean;
  publicContactEnabled: boolean;
};

function formFrom(store: StoreRow | null): Form {
  return {
    name: store?.name ?? "",
    addressLine1: store?.address_line_1 ?? "",
    addressLine2: store?.address_line_2 ?? "",
    city: store?.city ?? "",
    state: indianStates.find((s) => s.code === gstStateCode(store?.state))?.name ?? store?.state ?? "",
    pincode: store?.pincode ?? "",
    contactPhone: store?.contact_phone ?? "",
    gstin: store?.gstin ?? "",
    googleMapsUrl: store?.google_maps_url ?? "",
    latitude: store?.latitude !== null && store?.latitude !== undefined ? String(store.latitude) : "",
    longitude: store?.longitude !== null && store?.longitude !== undefined ? String(store.longitude) : "",
    isDiscoverable: store?.is_discoverable ?? false,
    publicAddressEnabled: store?.public_address_enabled ?? false,
    publicContactEnabled: store?.public_contact_enabled ?? false
  };
}

/** Full replace: every field is sent, starting from the loaded values. */
export function storeBody(form: Form, storeId?: string): StoreSaveBody {
  const hasCoords = form.latitude.trim() !== "" && form.longitude.trim() !== "";
  return {
    ...(storeId ? { storeId } : {}),
    name: form.name.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2.trim(),
    city: form.city.trim(),
    state: form.state,
    pincode: form.pincode.trim(),
    contactPhone: form.contactPhone.trim(),
    gstin: form.gstin.trim().toUpperCase(),
    googleMapsUrl: form.googleMapsUrl.trim(),
    ...(hasCoords ? { latitude: Number(form.latitude), longitude: Number(form.longitude) } : {}),
    isDiscoverable: form.isDiscoverable,
    publicAddressEnabled: form.publicAddressEnabled,
    publicContactEnabled: form.publicContactEnabled
  };
}

function StoreForm({ store }: { store: StoreRow | null }) {
  const initial = formFrom(store);
  const [form, setForm] = useState<Form>(initial);
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const useMyLocation = async () => {
    setLocating(true);
    try {
      const result = await currentStoreLocation();
      if (!result.ok) {
        if (result.error.reason === "blocked") toast.warning(result.error.message, { label: "Settings", onPress: () => void Linking.openSettings() });
        else toast.warning(result.error.message);
        return;
      }
      const { latitude, longitude, address } = result.location;
      // Pin the coordinates; only fill address fields that are still empty.
      setForm((current) => ({
        ...current,
        latitude: String(latitude),
        longitude: String(longitude),
        googleMapsUrl: current.googleMapsUrl.trim() ? current.googleMapsUrl : mapsLink(latitude, longitude),
        addressLine1: current.addressLine1.trim() || !address?.line1 ? current.addressLine1 : address.line1,
        city: current.city.trim() || !address?.city ? current.city : address.city,
        state: current.state || !address?.state ? current.state : address.state,
        pincode: current.pincode.trim() || !address?.pincode ? current.pincode : address.pincode
      }));
      setAccuracy(result.location.accuracy);
      toast.success("Store pinned at your current location");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLocating(false);
    }
  };
  const dirty = (Object.keys(initial) as (keyof Form)[]).some((k) => initial[k] !== form[k]);
  const guard = useUnsavedGuard(dirty);
  const coords = coordinatesError(form.latitude, form.longitude);
  const errors = {
    name: form.name.trim().length < 2 ? "Enter the store name." : null,
    addressLine1: form.addressLine1.trim() ? null : "Enter the address.",
    city: form.city.trim() ? null : "Enter the city.",
    state: form.state ? null : "Pick the state.",
    pincode: pincodeError(form.pincode),
    contactPhone: phoneError(form.contactPhone),
    gstin: gstinError(form.gstin, form.state),
    googleMapsUrl: mapsUrlError(form.googleMapsUrl),
    latitude: coords.lat,
    longitude: coords.lng
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (key: keyof typeof errors, live = false) => (touched || live ? errors[key] : null);
  const save = useAdminMutation(() => api.stores.save(storeBody(form, store?.id)), {
    invalidate: [adminKeys.stores, adminKeys.staff],
    refreshMe: true,
    onSuccess: () => {
      guard.allowLeave();
      router.back();
    }
  });
  const submit = () => {
    setTouched(true);
    if (!invalid) save.mutate(undefined);
  };
  const gstinState = form.gstin.length >= 2 ? stateNameFor(gstStateCode(form.gstin.slice(0, 2))) : null;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen
        header={<Header back title={store ? "Edit store" : "Add store"} subtitle={store?.name} />}
        footerSpace={110}
        footer={
          <StickyFooter error={touched && invalid ? "Fix the highlighted fields." : null} note={!dirty && store ? "No changes yet" : null}>
            <Button label={store ? "Save store" : "Add store"} size="lg" fullWidth disabled={!dirty} loading={save.isPending} onPress={submit} />
          </StickyFooter>
        }
      >
        <FormSection title="Store">
          <Input label="Store name" value={form.name} onChangeText={(name) => set({ name })} placeholder="e.g. Luzzan — MG Road" error={show("name")} maxLength={120} autoCapitalize="words" />
          <Input
            label="Phone (optional)"
            value={form.contactPhone}
            onChangeText={(contactPhone) => set({ contactPhone })}
            keyboardType="phone-pad"
            error={show("contactPhone", form.contactPhone.length >= 10)}
            maxLength={16}
          />
        </FormSection>

        <FormSection title="Address" hint="Printed on bills from this store.">
          <Input
            label="Address line 1"
            value={form.addressLine1}
            onChangeText={(addressLine1) => set({ addressLine1 })}
            placeholder="Shop number, building, street"
            error={show("addressLine1")}
            maxLength={200}
          />
          <Input label="Address line 2 (optional)" value={form.addressLine2} onChangeText={(addressLine2) => set({ addressLine2 })} placeholder="Area, landmark" maxLength={200} />
          <Row gap={3} align="flex-start">
            <Input label="City" value={form.city} onChangeText={(city) => set({ city })} error={show("city")} maxLength={80} containerStyle={{ flex: 1.4 }} autoCapitalize="words" />
            <Input
              label="Pincode"
              value={form.pincode}
              onChangeText={(pincode) => set({ pincode: pincode.replace(/\D/g, "") })}
              keyboardType="number-pad"
              maxLength={6}
              error={show("pincode", form.pincode.length === 6)}
              containerStyle={{ flex: 1 }}
            />
          </Row>
          <Select
            label="State"
            value={form.state}
            onChange={(state) => set({ state })}
            placeholder="Choose the state"
            searchable
            sheetTitle="State"
            options={indianStates.map((s) => ({ value: s.name, label: s.name, hint: `GST code ${s.code}` }))}
            error={show("state")}
          />
        </FormSection>

        <FormSection title="GST">
          <Input
            label="GSTIN for this store (optional)"
            value={form.gstin}
            onChangeText={(gstin) => set({ gstin: gstin.toUpperCase().replace(/\s/g, "") })}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
            placeholder="29ABCDE1234F1Z5"
            error={show("gstin", form.gstin.length === 15)}
            hint={gstinState && !errors.gstin ? `Registered in ${gstinState}` : "Leave empty to use the shop's GSTIN."}
          />
          {form.gstin.length === 15 && gstinState && form.state !== gstinState ? (
            <Button label={`Set state to ${gstinState}`} icon="swap-horizontal-outline" variant="soft" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => set({ state: gstinState })} />
          ) : null}
        </FormSection>

        <FormSection title="Location" hint="Helps buyers get directions on WowCity.">
          <Input
            label="Google Maps link (optional)"
            value={form.googleMapsUrl}
            onChangeText={(googleMapsUrl) => set({ googleMapsUrl })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://maps.app.goo.gl/…"
            error={show("googleMapsUrl", form.googleMapsUrl.length > 12)}
          />
          {Platform.OS !== "web" ? (
            <Button
              label={locating ? "Finding you…" : "Use my location"}
              icon="locate-outline"
              variant="soft"
              onPress={useMyLocation}
              loading={locating}
              accessibilityHint="Fills latitude and longitude with where this phone is now. Stand inside the shop."
            />
          ) : null}
          <Row gap={3} align="flex-start">
            <Input
              label="Latitude"
              value={form.latitude}
              onChangeText={(latitude) => set({ latitude: latitude.replace(/[^0-9.-]/g, "") })}
              keyboardType="numbers-and-punctuation"
              placeholder="12.9716"
              error={show("latitude")}
              containerStyle={{ flex: 1 }}
            />
            <Input
              label="Longitude"
              value={form.longitude}
              onChangeText={(longitude) => set({ longitude: longitude.replace(/[^0-9.-]/g, "") })}
              keyboardType="numbers-and-punctuation"
              placeholder="77.5946"
              error={show("longitude")}
              containerStyle={{ flex: 1 }}
            />
          </Row>
          <Text variant="small" color="textMuted">
            {accuracy !== null
              ? `Pinned to within about ${Math.max(1, Math.round(accuracy))} m. Check the Maps link opens at your shop.`
              : "Optional, both or neither. Tap “Use my location” while standing in the shop, or long-press the shop’s pin in Google Maps to copy its coordinates."}
          </Text>
        </FormSection>

        <FormSection title="On WowCity">
          <ToggleRow
            icon="globe-outline"
            label="Show this store to buyers"
            hint="Buyers nearby can find it and see listed stock."
            value={form.isDiscoverable}
            onChange={(isDiscoverable) => set({ isDiscoverable })}
          />
          <ToggleRow
            icon="location-outline"
            label="Show the address"
            hint="Otherwise only the area and city are shown."
            value={form.publicAddressEnabled}
            onChange={(publicAddressEnabled) => set({ publicAddressEnabled })}
          />
          <ToggleRow
            icon="call-outline"
            label="Show the phone number"
            hint="Let buyers call the store."
            value={form.publicContactEnabled}
            onChange={(publicContactEnabled) => set({ publicContactEnabled })}
          />
        </FormSection>
        {!store ? (
          <Callout icon="receipt-outline" tone="info">
            New stores get their own bill numbers (for example MGR/26-27/0001). You’ll see the prefix after saving.
          </Callout>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function StoreEditScreen({ id }: { id?: string }) {
  const query = useStores();
  if (!id) return <StoreForm store={null} />;
  if (query.data) {
    const store = query.data.stores.find((s) => s.id === id);
    if (store) return <StoreForm key={store.id} store={store} />;
    return (
      <Screen header={<Header back title="Edit store" />}>
        <EmptyState icon="storefront-outline" title="Store not found" body="It may have been removed." action="Back to stores" onAction={() => router.back()} />
      </Screen>
    );
  }
  return (
    <Screen header={<Header back title="Edit store" />}>
      {query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : <SkeletonCards count={4} height={140} />}
    </Screen>
  );
}
