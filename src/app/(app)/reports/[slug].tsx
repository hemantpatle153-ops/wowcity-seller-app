import { useLocalSearchParams } from "expo-router";
import { ReportViewerScreen } from "@/features/reports/ReportViewerScreen";

export default function ReportRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <ReportViewerScreen key={slug} slug={slug} />;
}
