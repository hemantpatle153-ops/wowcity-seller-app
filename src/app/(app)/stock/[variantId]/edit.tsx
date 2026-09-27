import { useLocalSearchParams } from "expo-router";
import { EditProductScreen } from "@/features/products/EditProductScreen";

export default function EditStockItemRoute() {
  const { variantId } = useLocalSearchParams<{ variantId: string }>();
  return <EditProductScreen key={variantId} variantId={variantId} />;
}
