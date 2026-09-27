import { useLocalSearchParams } from "expo-router";
import { PurchasesScreen } from "@/features/purchase/PurchasesScreen";

export default function PurchasesRoute() {
  const { supplier } = useLocalSearchParams<{ supplier?: string }>();
  return <PurchasesScreen initialSupplier={supplier ?? ""} />;
}
