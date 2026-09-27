import { useLocalSearchParams } from "expo-router";
import { OwnerOnly } from "@/features/admin/components";
import { StoreEditScreen } from "@/features/admin/StoreEditScreen";

export default function StoreEditRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <OwnerOnly title="Store">
      <StoreEditScreen id={id || undefined} />
    </OwnerOnly>
  );
}
