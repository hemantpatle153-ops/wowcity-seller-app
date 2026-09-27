import { useLocalSearchParams } from "expo-router";
import { CustomerEditScreen } from "@/features/customers/CustomerEditScreen";

export default function CustomerEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CustomerEditScreen key={id} id={id} />;
}
