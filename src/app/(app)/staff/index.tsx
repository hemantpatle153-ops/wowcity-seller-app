import { OwnerOnly } from "@/features/admin/components";
import { StaffListScreen } from "@/features/admin/StaffListScreen";

export default function StaffRoute() {
  return (
    <OwnerOnly title="Staff">
      <StaffListScreen />
    </OwnerOnly>
  );
}
