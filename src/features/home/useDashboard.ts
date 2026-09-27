import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/api";
import type { DashboardResponse, OwnerDashboard, StaffDashboard } from "@/api/types";

/** GET /dashboard (store filter honoured for owners). Keeps showing the last data while refreshing or offline. */
export function useDashboard(store?: string | null) {
  return useQuery<DashboardResponse>({
    queryKey: ["dashboard", store ?? "all"],
    queryFn: () => api.dashboard(store ?? undefined),
    placeholderData: keepPreviousData,
    staleTime: 60_000
  });
}

export function isOwnerDashboard(d: DashboardResponse | undefined): d is OwnerDashboard {
  return d?.kind === "owner";
}
export function isStaffDashboard(d: DashboardResponse | undefined): d is StaffDashboard {
  return d?.kind === "staff";
}

const MODE_LABELS: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", credit: "Credit", other: "Other", bank: "Bank", cheque: "Cheque" };
export function paymentModeLabel(mode: string) {
  return MODE_LABELS[mode] ?? mode.charAt(0).toUpperCase() + mode.slice(1);
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
