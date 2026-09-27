import { OwnerOnly } from "@/features/admin/components";
import { SettingsInvoiceScreen } from "@/features/admin/SettingsForms";

export default function Route() {
  return (
    <OwnerOnly title="Invoice & payments">
      <SettingsInvoiceScreen />
    </OwnerOnly>
  );
}
