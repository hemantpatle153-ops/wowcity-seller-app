import { OwnerOnly } from "@/features/admin/components";
import { StoresScreen } from "@/features/admin/StoresScreen";

export default function StoresRoute() {
  return (
    <OwnerOnly title="Stores">
      <StoresScreen />
    </OwnerOnly>
  );
}
