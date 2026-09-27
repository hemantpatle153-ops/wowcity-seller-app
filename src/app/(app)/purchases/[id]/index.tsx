import { useLocalSearchParams } from "expo-router";
import { PurchaseDetailScreen } from "@/features/purchase/PurchaseDetailScreen";

export default function PurchaseDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PurchaseDetailScreen id={id} />;
}
