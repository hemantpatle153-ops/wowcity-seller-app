import { useLocalSearchParams } from "expo-router";
import { ListingScreen } from "@/features/products/ListingScreen";

export default function ProductListingRoute() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  return <ListingScreen key={productId} productId={productId} />;
}
