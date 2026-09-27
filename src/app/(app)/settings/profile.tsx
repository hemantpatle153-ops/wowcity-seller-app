import { OwnerOnly } from "@/features/admin/components";
import { SettingsProfileScreen } from "@/features/admin/SettingsForms";

export default function Route() {
  return (
    <OwnerOnly title="Business profile">
      <SettingsProfileScreen />
    </OwnerOnly>
  );
}
