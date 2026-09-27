import { useLocalSearchParams } from "expo-router";
import { OwnerOnly } from "@/features/admin/components";
import { StaffAccessScreen } from "@/features/admin/StaffAccessScreen";

export default function StaffAccessRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OwnerOnly title="Access">
      <StaffAccessScreen id={id} />
    </OwnerOnly>
  );
}
