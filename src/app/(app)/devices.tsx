import { OwnerOnly } from "@/features/admin/components";
import { DevicesScreen } from "@/features/admin/DevicesScreen";

export default function DevicesRoute() {
  return (
    <OwnerOnly title="Signed-in phones">
      <DevicesScreen />
    </OwnerOnly>
  );
}
