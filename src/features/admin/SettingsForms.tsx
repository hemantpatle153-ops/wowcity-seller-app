import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import type { InvoiceSettings, RoundingMode, SettingsResponse } from "@/api/types";
import { gstStateCode, indianStates } from "@/lib/india";
import { upiUri } from "@/printing/receipt";
import { QrCode } from "@/printing/QrCode";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Card, Chip, ErrorState, Header, Icon, Input, Row, Screen, SectionTitle, Segmented, Select, SkeletonCards, Stack, Text, ToggleRow } from "@/ui";
import { ChoiceCard, CopyRow, FormSection, StickyFooter } from "./components";
import { adminKeys, useAdminMutation, useSettings, useUnsavedGuard } from "./hooks";
import { roundingExample, roundingModes } from "./rounding";
import { accountNumberError, gstinError, ifscError, nameError, panError, phoneError, stateNameFor, upiError } from "./validation";

/** Loads GET /settings, then renders the form with the loaded values. */
function SettingsLoader({ title, children }: { title: string; children: (data: SettingsResponse) => ReactNode }) {
  const query = useSettings();
  if (query.data) return <>{children(query.data)}</>;
  return (
    <Screen header={<Header back title={title} />}>
      {query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : <SkeletonCards count={3} height={150} />}
    </Screen>
  );
}

function FormScreen({ title, subtitle, dirty, invalid, saving, onSave, touched, children }: { title: string; subtitle?: string; dirty: boolean; invalid: boolean; saving: boolean; onSave: () => void; touched: boolean; children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        header={<Header back title={title} subtitle={subtitle} />}
        footerSpace={110}
        footer={
          <StickyFooter error={touched && invalid ? "Fix the highlighted fields." : null} note={!dirty ? "No changes yet" : null}>
            <Button label="Save changes" size="lg" fullWidth disabled={!dirty} loading={saving} onPress={onSave} />
          </StickyFooter>
        }
      >
        {children}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function useSettingsSave<T>(fn: (body: T) => Promise<{ message: string }>, allowLeave: () => void) {
  return useAdminMutation(fn, {
    invalidate: [adminKeys.settings],
    refreshMe: true,
    onSuccess: () => {
      allowLeave();
      router.back();
    }
  });
}

const changed = <T extends object>(a: T, b: T) => (Object.keys(a) as (keyof T)[]).some((k) => a[k] !== b[k]);

// ---------------------------------------------------------------------------------------------------
// Business profile
// ---------------------------------------------------------------------------------------------------
const BUSINESS_TYPES = ["Clothing & fashion", "Footwear", "Electronics", "Mobile & accessories", "Grocery", "Pharmacy", "Stationery", "Hardware"];

function ProfileForm({ data }: { data: SettingsResponse }) {
  const initial = { displayName: data.profile.displayName, businessType: data.profile.businessType, ownerName: data.profile.ownerName, phone: data.profile.phone ?? "" };
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);
  const dirty = changed(initial, form);
  const guard = useUnsavedGuard(dirty);
  const errors = {
    displayName: nameError(form.displayName, "the shop name"),
    businessType: form.businessType.trim().length < 2 ? "Enter the type of business." : form.businessType.trim().length > 60 ? "Keep it under 60 characters." : null,
    ownerName: nameError(form.ownerName, "the owner's name"),
    phone: phoneError(form.phone)
  };
  const invalid = Object.values(errors).some(Boolean);
  const save = useSettingsSave(() => api.settings.profile({ displayName: form.displayName.trim(), businessType: form.businessType.trim(), ownerName: form.ownerName.trim(), phone: form.phone.trim() }), guard.allowLeave);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);
  return (
    <FormScreen
      title="Business profile"
      dirty={dirty}
      invalid={invalid}
      touched={touched}
      saving={save.isPending}
      onSave={() => {
        setTouched(true);
        if (!invalid) save.mutate(undefined);
      }}
    >
      <Card style={{ gap: 8 }}>
        <CopyRow label="Shop code" value={data.profile.shopCode} />
        <Text variant="small" color="textMuted">
          Staff type this code when they sign in.
        </Text>
      </Card>
      <FormSection title="Shop">
        <Input label="Shop name" value={form.displayName} onChangeText={(displayName) => setForm({ ...form, displayName })} error={show("displayName")} maxLength={80} autoCapitalize="words" hint="Shown on bills and on WowCity." />
        <Stack gap={2}>
          <Input label="Type of business" value={form.businessType} onChangeText={(businessType) => setForm({ ...form, businessType })} error={show("businessType")} maxLength={60} />
          <Row gap={2} wrap>
            {BUSINESS_TYPES.map((t) => (
              <Chip key={t} label={t} selected={form.businessType === t} onPress={() => setForm({ ...form, businessType: t })} />
            ))}
          </Row>
        </Stack>
      </FormSection>
      <FormSection title="Owner">
        <Input label="Owner name" value={form.ownerName} onChangeText={(ownerName) => setForm({ ...form, ownerName })} error={show("ownerName")} maxLength={80} autoCapitalize="words" />
        <Input label="Phone" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" error={touched || form.phone.length >= 10 ? errors.phone : null} maxLength={16} />
        <Input label="Email" value={data.profile.email} editable={false} icon="mail-outline" hint="Your sign-in email can't be changed here." />
      </FormSection>
    </FormScreen>
  );
}

export function SettingsProfileScreen() {
  return <SettingsLoader title="Business profile">{(data) => <ProfileForm data={data} />}</SettingsLoader>;
}

// ---------------------------------------------------------------------------------------------------
// Tax & rounding
// ---------------------------------------------------------------------------------------------------
function TaxForm({ data }: { data: SettingsResponse }) {
  const theme = useTheme();
  const stateName = indianStates.find((s) => s.code === (data.tax.stateCode ?? gstStateCode(data.tax.state)))?.name ?? data.tax.state ?? "";
  const initial = { legalName: data.tax.legalName ?? "", gstin: data.tax.gstin ?? "", state: stateName, pan: data.tax.pan ?? "", roundingMode: data.tax.roundingMode as RoundingMode };
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);
  const dirty = changed(initial, form);
  const guard = useUnsavedGuard(dirty);
  const errors = { gstin: gstinError(form.gstin, form.state), pan: panError(form.pan) };
  const invalid = Object.values(errors).some(Boolean);
  const save = useSettingsSave(
    () => api.settings.tax({ legalName: form.legalName.trim(), gstin: form.gstin.trim().toUpperCase(), state: form.state, pan: form.pan.trim().toUpperCase(), roundingMode: form.roundingMode }),
    guard.allowLeave
  );
  const gstinState = form.gstin.length === 15 ? stateNameFor(gstStateCode(form.gstin)) : null;
  return (
    <FormScreen
      title="Tax & rounding"
      dirty={dirty}
      invalid={invalid}
      touched={touched}
      saving={save.isPending}
      onSave={() => {
        setTouched(true);
        if (!invalid) save.mutate(undefined);
      }}
    >
      <FormSection title="GST registration" hint="Used on tax invoices. Leave GSTIN empty if you're not registered.">
        <Input label="Legal name (as on GST certificate)" value={form.legalName} onChangeText={(legalName) => setForm({ ...form, legalName })} maxLength={120} autoCapitalize="words" />
        <Input
          label="GSTIN"
          value={form.gstin}
          onChangeText={(v) => {
            const gstin = v.toUpperCase().replace(/\s/g, "");
            const fromGstin = gstin.length === 15 ? stateNameFor(gstStateCode(gstin)) : null;
            setForm({ ...form, gstin, state: !form.state && fromGstin ? fromGstin : form.state });
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={15}
          placeholder="29ABCDE1234F1Z5"
          error={touched || form.gstin.length === 15 ? errors.gstin : null}
          hint={gstinState && !errors.gstin ? `Registered in ${gstinState}` : "15 characters, starts with your state code."}
        />
        {gstinState && form.state !== gstinState ? (
          <Button label={`Set state to ${gstinState}`} icon="swap-horizontal-outline" variant="soft" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => setForm({ ...form, state: gstinState })} />
        ) : null}
        <Select
          label="State"
          value={form.state}
          onChange={(state) => setForm({ ...form, state })}
          searchable
          sheetTitle="State"
          placeholder="Choose the state"
          options={indianStates.map((s) => ({ value: s.name, label: s.name, hint: `GST code ${s.code}` }))}
        />
        <Input
          label="PAN"
          value={form.pan}
          onChangeText={(pan) => setForm({ ...form, pan: pan.toUpperCase().replace(/\s/g, "") })}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
          placeholder="ABCDE1234F"
          error={touched || form.pan.length === 10 ? errors.pan : null}
        />
      </FormSection>
      <Stack gap={2}>
        <SectionTitle title="Round bill totals" />
        <View accessibilityRole="radiogroup" style={{ gap: theme.space[2] }}>
          {roundingModes.map((mode) => (
            <ChoiceCard key={mode.key} selected={form.roundingMode === mode.key} title={mode.label} body={mode.hint} onPress={() => setForm({ ...form, roundingMode: mode.key })}>
              <View style={{ marginTop: 6, gap: 2 }}>
                {mode.samples.map((amount) => (
                  <Text key={amount} variant="small" weight="700" tabular color={form.roundingMode === mode.key ? "accentSoftText" : "text"}>
                    {roundingExample(amount, mode.key)}
                  </Text>
                ))}
              </View>
            </ChoiceCard>
          ))}
        </View>
        <Text variant="small" color="textMuted">
          The difference shows on the bill as “Round off”. It applies to new bills.
        </Text>
      </Stack>
    </FormScreen>
  );
}

export function SettingsTaxScreen() {
  return <SettingsLoader title="Tax & rounding">{(data) => <TaxForm data={data} />}</SettingsLoader>;
}

// ---------------------------------------------------------------------------------------------------
// Invoice & payments
// ---------------------------------------------------------------------------------------------------
const TERMS_MAX = 500;

function InvoiceForm({ data }: { data: SettingsResponse }) {
  const theme = useTheme();
  const initial: InvoiceSettings = { ...data.invoice };
  const [form, setForm] = useState<InvoiceSettings>(initial);
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<InvoiceSettings>) => setForm({ ...form, ...patch });
  const dirty = changed(initial, form);
  const guard = useUnsavedGuard(dirty);
  const errors = {
    terms: form.terms.length > TERMS_MAX ? `Keep the terms under ${TERMS_MAX} characters.` : null,
    upiId: upiError(form.upiId),
    payeeName: form.payeeName.length > 60 ? "Keep it under 60 characters." : null,
    accountNumber: accountNumberError(form.accountNumber),
    ifsc: ifscError(form.ifsc)
  };
  const invalid = Object.values(errors).some(Boolean);
  // Full replace: every field goes back, starting from the loaded values.
  const save = useSettingsSave(
    () =>
      api.settings.invoice({
        terms: form.terms.trim(),
        upiId: form.upiId.trim(),
        payeeName: form.payeeName.trim(),
        showUpiQr: form.showUpiQr,
        bankName: form.bankName.trim(),
        accountName: form.accountName.trim(),
        accountNumber: form.accountNumber.trim(),
        ifsc: form.ifsc.trim().toUpperCase(),
        printFormat: form.printFormat
      }),
    guard.allowLeave
  );
  const qrReady = form.showUpiQr && !!form.upiId.trim() && !errors.upiId;
  const payee = form.payeeName.trim() || data.profile.displayName;
  return (
    <FormScreen
      title="Invoice & payments"
      dirty={dirty}
      invalid={invalid}
      touched={touched}
      saving={save.isPending}
      onSave={() => {
        setTouched(true);
        if (!invalid) save.mutate(undefined);
      }}
    >
      <FormSection title="Terms on every bill">
        <Input
          label="Terms and notes"
          value={form.terms}
          onChangeText={(terms) => set({ terms })}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={{ minHeight: 96 }}
          placeholder="e.g. Exchange within 7 days with bill. No cash refunds."
          error={errors.terms}
        />
        <Text variant="caption" color={form.terms.length > TERMS_MAX ? "danger" : form.terms.length > TERMS_MAX - 50 ? "warning" : "textMuted"} align="right" tabular accessibilityLiveRegion="polite">
          {form.terms.length}/{TERMS_MAX}
        </Text>
      </FormSection>

      <FormSection title="UPI payments">
        <Input
          label="UPI ID"
          value={form.upiId}
          onChangeText={(upiId) => set({ upiId: upiId.replace(/\s/g, "") })}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="shopname@okhdfcbank"
          error={touched || form.upiId.includes("@") ? errors.upiId : null}
          right={form.upiId && !errors.upiId ? <Icon name="checkmark-circle" color="success" accessibilityLabel="UPI ID looks right" /> : undefined}
        />
        <Input label="Payee name" value={form.payeeName} onChangeText={(payeeName) => set({ payeeName })} maxLength={60} placeholder={data.profile.displayName} hint="Shown in the customer's UPI app." error={errors.payeeName} />
        <ToggleRow icon="qr-code-outline" label="Print a UPI QR on bills" hint="Customers scan it to pay the exact bill amount." value={form.showUpiQr} onChange={(showUpiQr) => set({ showUpiQr })} />
        {form.showUpiQr && !form.upiId.trim() ? (
          <Text variant="small" color="textMuted">
            Add your UPI ID above and the QR appears on bills.
          </Text>
        ) : null}
        {qrReady ? (
          <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(220)} exiting={theme.reduceMotion ? undefined : FadeOut.duration(140)} style={{ alignItems: "center", gap: 8 }}>
            <View style={{ padding: 10, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised }}>
              <QrCode value={upiUri(form.upiId.trim(), payee, 1, "Test payment")} size={168} label={`Sample UPI QR for ${form.upiId}`} />
            </View>
            <Text variant="small" weight="700" align="center">
              {payee} · {form.upiId.trim()}
            </Text>
            <Text variant="caption" color="textMuted" align="center">
              Preview for ₹1: scan it to check the name. On bills the QR carries the bill amount.
            </Text>
          </Animated.View>
        ) : null}
      </FormSection>

      <FormSection title="Bank details (optional)" hint="Printed on A4 invoices for customers who pay by bank transfer.">
        <Input label="Bank name" value={form.bankName} onChangeText={(bankName) => set({ bankName })} maxLength={80} autoCapitalize="words" />
        <Input label="Account holder name" value={form.accountName} onChangeText={(accountName) => set({ accountName })} maxLength={80} autoCapitalize="words" />
        <Input
          label="Account number"
          value={form.accountNumber}
          onChangeText={(accountNumber) => set({ accountNumber: accountNumber.replace(/\D/g, "") })}
          keyboardType="number-pad"
          maxLength={20}
          error={touched || form.accountNumber.length >= 6 ? errors.accountNumber : null}
        />
        <Input
          label="IFSC"
          value={form.ifsc}
          onChangeText={(ifsc) => set({ ifsc: ifsc.toUpperCase().replace(/\s/g, "") })}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={11}
          placeholder="HDFC0001234"
          error={touched || form.ifsc.length === 11 ? errors.ifsc : null}
        />
      </FormSection>

      <FormSection title="Default print format">
        <Segmented
          accessibilityLabel="Default print format"
          options={[
            { key: "thermal", label: "Thermal receipt", icon: "receipt-outline" },
            { key: "a4", label: "A4 invoice", icon: "document-text-outline" }
          ]}
          value={form.printFormat}
          onChange={(printFormat) => set({ printFormat })}
        />
        <Text variant="small" color="textMuted">
          {form.printFormat === "thermal" ? "Narrow 58/80 mm receipts for a counter printer." : "Full-page GST invoice with bank details, for PDF and office printers."}
        </Text>
      </FormSection>
    </FormScreen>
  );
}

export function SettingsInvoiceScreen() {
  return <SettingsLoader title="Invoice & payments">{(data) => <InvoiceForm data={data} />}</SettingsLoader>;
}
