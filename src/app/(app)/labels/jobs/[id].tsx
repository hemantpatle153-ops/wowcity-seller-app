import { useLocalSearchParams } from "expo-router";
import { JobDetailScreen } from "@/features/labels/JobDetailScreen";

export default function LabelJobRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <JobDetailScreen id={id} />;
}
