import { useLocalSearchParams } from "expo-router";
import { LabelsScreen } from "@/features/labels/LabelsScreen";

/** ?job= loads a print job; ?variant=&barcode= adds one stock item (from its item page). */
export default function LabelsRoute() {
  const { job, variant, barcode } = useLocalSearchParams<{ job?: string; variant?: string; barcode?: string }>();
  return <LabelsScreen jobId={job} variantId={variant} barcode={barcode} />;
}
