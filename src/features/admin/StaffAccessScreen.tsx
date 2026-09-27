import { router } from "expo-router";
import { useState } from "react";
import { api, errorMessage } from "@/api";
import type { PermissionGroup, RolePreset, StaffMember, WorkerGrantablePermission } from "@/api/types";
import { useSession } from "@/auth/session";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, ErrorState, Header, Screen, SectionTitle, SkeletonCards, Stack, Text } from "@/ui";
import { Callout, PermissionEditor, RolePicker, StickyFooter, StorePicker } from "./components";
import { adminKeys, useAdminMutation, useStaffDetail, useStaffList, useUnsavedGuard } from "./hooks";
import { matchPreset, normalizePermissions, samePermissions } from "./roles";

function AccessForm({ member, groups, presets }: { member: StaffMember; groups: PermissionGroup[]; presets: RolePreset[] }) {
  const theme = useTheme();
  const stores = useSession((s) => s.me?.stores ?? []);
  const [permissions, setPermissions] = useState<WorkerGrantablePermission[]>(normalizePermissions(member.permissions));
  const [storeIds, setStoreIds] = useState<string[]>(member.stores.map((s) => s.id).filter((id) => stores.some((s) => s.id === id)));
  const [showAll, setShowAll] = useState(() => matchPreset(member.permissions, presets) === "custom");
  const initialStores = member.stores.map((s) => s.id);
  const dirty = !samePermissions(permissions, member.permissions) || storeIds.length !== initialStores.length || storeIds.some((id) => !initialStores.includes(id));
  const guard = useUnsavedGuard(dirty);
  const save = useAdminMutation(() => api.staff.updateAccess(member.id, { permissions, storeIds }), {
    invalidate: [adminKeys.staff],
    onSuccess: () => {
      guard.allowLeave();
      router.back();
    }
  });
  const error = !permissions.length ? "Give at least one permission." : !storeIds.length ? "Pick at least one store." : null;
  return (
    <Screen
      header={<Header back title="Access" subtitle={member.displayName} />}
      footerSpace={110}
      footer={
        <StickyFooter error={dirty ? error : null} note={!dirty ? "No changes yet" : null}>
          <Button label="Save access" size="lg" fullWidth disabled={!dirty || !!error} loading={save.isPending} onPress={() => save.mutate(undefined)} />
        </StickyFooter>
      }
    >
      <Stack gap={2}>
        <SectionTitle title="Role" />
        <RolePicker presets={presets} permissions={permissions} onChange={setPermissions} onCustom={() => setShowAll(true)} />
      </Stack>
      <Stack gap={2}>
        <SectionTitle title="What they can do" action={showAll ? "Hide" : `Fine-tune (${permissions.length})`} onAction={() => setShowAll(!showAll)} />
        {showAll ? (
          <>
            <PermissionEditor groups={groups} permissions={permissions} onChange={setPermissions} />
            <Callout icon="link-outline" tone="info">
              Some permissions need others: making bills also lets them see bills, and printing labels lets them see label jobs. Those switches turn on by themselves.
            </Callout>
          </>
        ) : (
          <Text variant="small" color="textMuted">
            {groups
              .flatMap((g) => g.items)
              .filter((i) => permissions.includes(i.key))
              .map((i) => i.label)
              .join(" · ") || "Nothing yet"}
          </Text>
        )}
      </Stack>
      <Stack gap={2}>
        <SectionTitle title="Stores they can work in" />
        <StorePicker stores={stores} value={storeIds} onChange={setStoreIds} error={!storeIds.length ? "Pick at least one store." : null} />
      </Stack>
      <Text variant="caption" color="textFaint" align="center" style={{ paddingHorizontal: theme.space[4] }}>
        Changes apply on their next tap. Owner-only tools like staff, stores and settings are never shared.
      </Text>
    </Screen>
  );
}

export function StaffAccessScreen({ id }: { id: string }) {
  const detail = useStaffDetail(id);
  const list = useStaffList();
  if (detail.data && list.data) return <AccessForm member={detail.data.member} groups={list.data.permissionGroups} presets={list.data.rolePresets} />;
  const error = detail.error ?? list.error;
  return (
    <Screen header={<Header back title="Access" />}>
      {error ? (
        <ErrorState
          message={errorMessage(error)}
          onRetry={() => {
            void detail.refetch();
            void list.refetch();
          }}
        />
      ) : (
        <SkeletonCards count={5} height={76} />
      )}
    </Screen>
  );
}
