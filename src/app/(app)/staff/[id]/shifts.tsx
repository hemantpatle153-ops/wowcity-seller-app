import { useLocalSearchParams } from "expo-router";
import { OwnerOnly } from "@/features/admin/components";
import { StaffShiftsScreen } from "@/features/admin/StaffShiftsScreen";

export default function StaffShiftsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OwnerOnly title="Working hours">
      <StaffShiftsScreen id={id} />
    </OwnerOnly>
  );
}
