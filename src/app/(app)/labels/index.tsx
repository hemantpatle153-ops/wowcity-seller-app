import { useLocalSearchParams } from "expo-router";
import { LabelsScreen } from "@/features/labels/LabelsScreen";

export default function LabelsRoute() {
  const { job } = useLocalSearchParams<{ job?: string }>();
  return <LabelsScreen jobId={job} />;
}
