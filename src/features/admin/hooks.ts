/** Server data for owner admin screens (staff, devices, stores, settings). */
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useRef } from "react";
import { api, errorMessage } from "@/api";
import { isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { haptic } from "@/lib/haptics";
import { confirm, toast } from "@/ui";

export const adminKeys = {
  staff: ["staff"] as const,
  staffList: ["staff", "list"] as const,
  staffDetail: (id: string) => ["staff", "detail", id] as const,
  devices: ["staff", "devices", "mine"] as const,
  stores: ["stores"] as const,
  settings: ["settings"] as const
};

export function useIsOwner() {
  return isOwner(useSession((s) => s.me));
}

export function useStaffList() {
  const owner = useIsOwner();
  return useQuery({ queryKey: adminKeys.staffList, queryFn: () => api.staff.list(), enabled: owner });
}

export function useStaffDetail(id: string | undefined) {
  const owner = useIsOwner();
  return useQuery({ queryKey: adminKeys.staffDetail(id ?? ""), queryFn: () => api.staff.get(id!), enabled: owner && !!id });
}

export function useMyDevices() {
  const owner = useIsOwner();
  return useQuery({ queryKey: adminKeys.devices, queryFn: () => api.devices.list(), enabled: owner });
}

export function useStores() {
  const owner = useIsOwner();
  return useQuery({ queryKey: adminKeys.stores, queryFn: () => api.stores.list(), enabled: owner });
}

export function useSettings() {
  const owner = useIsOwner();
  return useQuery({ queryKey: adminKeys.settings, queryFn: () => api.settings.get(), enabled: owner });
}

/**
 * A mutation that toasts the server's message, gives haptic feedback, invalidates the given
 * areas, and optionally refreshes /me (so store pickers and settings on bills stay current).
 */
export function useAdminMutation<V, R extends { message?: string }>(
  fn: (vars: V) => Promise<R>,
  options: { invalidate?: QueryKey[]; refreshMe?: boolean; toast?: boolean; onSuccess?: (result: R, vars: V) => void } = {}
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      haptic.success();
      await Promise.all((options.invalidate ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })));
      if (options.refreshMe) void useSession.getState().refreshMe();
      if (options.toast !== false && result?.message) toast.success(result.message);
      options.onSuccess?.(result, vars);
    },
    onError: (error) => {
      haptic.error();
      if (options.toast !== false) toast.error(errorMessage(error));
    }
  });
}

/**
 * Asks before leaving a form with unsaved changes. Call `allowLeave()` right before navigating
 * away after a successful save.
 */
export function useUnsavedGuard(dirty: boolean) {
  const navigation = useNavigation();
  const skip = useRef(false);
  usePreventRemove(dirty, ({ data }) => {
    if (skip.current) {
      navigation.dispatch(data.action);
      return;
    }
    void confirm({ title: "Discard changes?", message: "You have changes that are not saved yet.", confirmLabel: "Discard", destructive: true }).then((ok) => {
      if (ok) navigation.dispatch(data.action);
    });
  });
  return {
    allowLeave: () => {
      skip.current = true;
    }
  };
}
