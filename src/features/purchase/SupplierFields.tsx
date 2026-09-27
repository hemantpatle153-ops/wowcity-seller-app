import { GSTIN_PATTERN, gstStateCode, indianStates } from "@/lib/india";
import { Input, Select, Stack } from "@/ui";

export type SupplierForm = { name: string; mobile: string; gstin: string; state: string; address: string };
export const emptySupplierForm: SupplierForm = { name: "", mobile: "", gstin: "", state: "", address: "" };

export function supplierFormErrors(form: SupplierForm): Partial<Record<keyof SupplierForm, string>> {
  const errors: Partial<Record<keyof SupplierForm, string>> = {};
  const name = form.name.trim();
  if (name.length < 2) errors.name = "Enter the supplier name (at least 2 letters).";
  else if (name.length > 120) errors.name = "Keep the name under 120 characters.";
  const digits = form.mobile.replace(/\D/g, "");
  if (digits && (digits.length < 10 || digits.length > 13)) errors.mobile = "Mobile number must be 10 to 13 digits.";
  const gstin = form.gstin.trim().toUpperCase();
  if (gstin) {
    if (!GSTIN_PATTERN.test(gstin)) errors.gstin = "That GSTIN doesn't look right (15 characters, like 29ABCDE1234F1Z5).";
    else if (!gstStateCode(gstin)) errors.gstin = "The first two digits of the GSTIN are not a valid state code.";
    else if (form.state && gstStateCode(form.state) && gstStateCode(form.state) !== gstStateCode(gstin)) {
      const expected = indianStates.find((s) => s.code === gstStateCode(gstin))?.name;
      errors.state = `This GSTIN is registered in ${expected ?? "another state"}.`;
    }
  }
  if (form.address.length > 300) errors.address = "Keep the address under 300 characters.";
  return errors;
}

/** Name, mobile, GSTIN (fills the state), state and address for a supplier. */
export function SupplierFields({ value, onChange, errors }: { value: SupplierForm; onChange: (next: SupplierForm) => void; errors: Partial<Record<keyof SupplierForm, string>> }) {
  const set = (patch: Partial<SupplierForm>) => onChange({ ...value, ...patch });
  return (
    <Stack gap={3}>
      <Input label="Supplier name" value={value.name} onChangeText={(name) => set({ name })} icon="business-outline" autoCapitalize="words" error={errors.name} maxLength={120} />
      <Input label="Mobile (optional)" value={value.mobile} onChangeText={(mobile) => set({ mobile: mobile.replace(/[^\d+ ]/g, "") })} keyboardType="phone-pad" icon="call-outline" error={errors.mobile} maxLength={16} />
      <Input
        label="GSTIN (optional)"
        value={value.gstin}
        onChangeText={(text) => {
          const gstin = text.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15);
          const code = gstin.length >= 2 ? gstStateCode(gstin.slice(0, 2)) : null;
          const state = !value.state && code ? (indianStates.find((s) => s.code === code)?.name ?? value.state) : value.state;
          set({ gstin, state });
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        icon="document-text-outline"
        error={errors.gstin}
        hint="The state fills in from the GSTIN."
      />
      <Select label="State" value={value.state} options={indianStates.map((s) => ({ value: s.name, label: s.name, hint: `GST code ${s.code}` }))} onChange={(state) => set({ state })} searchable placeholder="Choose state" error={errors.state} />
      <Input label="Address (optional)" value={value.address} onChangeText={(address) => set({ address })} multiline icon="location-outline" error={errors.address} maxLength={300} style={{ minHeight: 64, textAlignVertical: "top" }} />
    </Stack>
  );
}
