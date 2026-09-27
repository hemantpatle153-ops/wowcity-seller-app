import { OwnerOnly } from "@/features/admin/components";
import { DeleteAccountScreen } from "@/features/admin/DeleteAccountScreen";

export default function Route() {
  return (
    <OwnerOnly title="Delete account">
      <DeleteAccountScreen />
    </OwnerOnly>
  );
}
