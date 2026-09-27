import { useLocalSearchParams } from "expo-router";
import { ReturnScreen } from "@/features/purchase/ReturnScreen";

export default function PurchaseReturnRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReturnScreen id={id} />;
}
