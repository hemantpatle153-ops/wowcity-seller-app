import { useLocalSearchParams } from "expo-router";
import { OwnerOnly } from "@/features/admin/components";
import { StaffDetailScreen } from "@/features/admin/StaffDetailScreen";

export default function StaffDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OwnerOnly title="Staff">
      <StaffDetailScreen id={id} />
    </OwnerOnly>
  );
}
