import { useLocalSearchParams } from "expo-router";
import { CustomerProfileScreen } from "@/features/customers/CustomerProfileScreen";

export default function CustomerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CustomerProfileScreen key={id} id={id} />;
}
