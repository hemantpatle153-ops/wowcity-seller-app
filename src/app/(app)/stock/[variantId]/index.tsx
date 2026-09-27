import { useLocalSearchParams } from "expo-router";
import { ItemDetailScreen } from "@/features/stock/ItemDetailScreen";

export default function StockItemRoute() {
  const { variantId } = useLocalSearchParams<{ variantId: string }>();
  return <ItemDetailScreen key={variantId} variantId={variantId} />;
}
