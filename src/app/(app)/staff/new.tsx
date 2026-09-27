import { OwnerOnly } from "@/features/admin/components";
import { NewStaffScreen } from "@/features/admin/NewStaffScreen";

export default function NewStaffRoute() {
  return (
    <OwnerOnly title="Add staff">
      <NewStaffScreen />
    </OwnerOnly>
  );
}
