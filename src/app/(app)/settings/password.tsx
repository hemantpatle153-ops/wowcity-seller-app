import { OwnerOnly } from "@/features/admin/components";
import { PasswordScreen } from "@/features/admin/PasswordScreen";

export default function Route() {
  return (
    <OwnerOnly title="Change password">
      <PasswordScreen />
    </OwnerOnly>
  );
}
