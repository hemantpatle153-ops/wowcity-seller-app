import { useLocalSearchParams } from "expo-router";
import { SupplierEditScreen } from "@/features/purchase/SupplierEditScreen";

export default function SupplierEditRoute() {
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  return <SupplierEditScreen id={id} name={name} />;
}
