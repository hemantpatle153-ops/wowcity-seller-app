import { OwnerOnly } from "@/features/admin/components";
import { SettingsTaxScreen } from "@/features/admin/SettingsForms";

export default function Route() {
  return (
    <OwnerOnly title="Tax & rounding">
      <SettingsTaxScreen />
    </OwnerOnly>
  );
}
