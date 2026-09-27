import { router } from "expo-router";
import { View } from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import type { RolePreset, StaffMember } from "@/api/types";
import { formatMoney, formatMoneyShort, formatRelative } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, Badge, Button, Card, confirm, EmptyState, ErrorState, Header, Icon, IconButton, IconCircle, Row, Screen, SectionTitle, SkeletonCards, StatTile, Stack, Text, type Tone } from "@/ui";
import { StickyFooter } from "./components";
import { adminKeys, useAdminMutation, useStaffList } from "./hooks";
import { matchPreset, roleIcons, roleLabel, statusBadge } from "./roles";

const avatarTone: Record<StaffMember["status"], Tone> = { active: "accent", disabled: "neutral", locked: "warning", off_shift: "info" };

function StaffCard({ member, presets, index }: { member: StaffMember; presets: RolePreset[]; index: number }) {
  const theme = useTheme();
  const status = statusBadge(member.status);
  const role = matchPreset(member.permissions, presets);
  const stores = member.stores.map((s) => s.name).join(", ") || "No open store";
  return (
    <Animated.View entering={theme.reduceMotion ? undefined : FadeInDown.duration(260).delay(Math.min(index, 8) * 40)} layout={theme.reduceMotion ? undefined : LinearTransition}>
      <Card
        onPress={() => router.push({ pathname: "/staff/[id]", params: { id: member.id } })}
        accessibilityLabel={`${member.displayName}, ${status.label}, ${roleLabel(member.permissions, presets)}. Today ${formatMoney(member.salesToday.amount)}. Open`}
        style={{ gap: theme.space[3] }}
      >
        <Row gap={3} align="flex-start">
          <Avatar name={member.displayName} size={48} tone={avatarTone[member.status]} />
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {member.displayName}
            </Text>
            <Text variant="small" color="textMuted" numberOfLines={1}>
              @{member.username}
            </Text>
            <View style={{ marginTop: 4 }}>
              <Badge label={status.label} tone={status.tone} icon={status.icon} />
            </View>
          </View>
          <Icon name="chevron-forward" size={18} color="textFaint" />
        </Row>
        <View style={{ gap: 4 }}>
          <Row gap={2}>
            <Icon name={roleIcons[role]} size={16} color="textMuted" />
            <Text variant="small" weight="600" style={{ flex: 1 }}>
              {roleLabel(member.permissions, presets)}
            </Text>
          </Row>
          <Row gap={2} align="flex-start">
            <Icon name="storefront-outline" size={16} color="textMuted" />
            <Text variant="small" color="textMuted" numberOfLines={2} style={{ flex: 1 }}>
              {stores}
            </Text>
          </Row>
        </View>
        <View style={{ flexDirection: "row", borderRadius: theme.radius.control, backgroundColor: theme.colors.surfaceSunken, padding: theme.space[3], gap: theme.space[3] }}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="textMuted">
              Today
            </Text>
            <Text variant="bodyStrong" tabular numberOfLines={1}>
              {formatMoney(member.salesToday.amount, { decimals: 0 })}
            </Text>
            <Text variant="caption" color="textMuted" tabular>
              {member.salesToday.bills} bill{member.salesToday.bills === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="textMuted">
              Last 30 days
            </Text>
            <Text variant="bodyStrong" tabular numberOfLines={1}>
              {formatMoneyShort(member.sales30d.amount)}
            </Text>
            <Text variant="caption" color="textMuted" tabular>
              {member.sales30d.bills} bills
            </Text>
          </View>
          <View style={{ flex: 1.1 }}>
            <Text variant="caption" color="textMuted">
              Last sign-in
            </Text>
            <Text variant="small" weight="600" numberOfLines={2}>
              {member.lastLoginAt ? formatRelative(member.lastLoginAt) : "Never"}
            </Text>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

function LockdownCard({ locked, count }: { locked: number; count: number }) {
  const theme = useTheme();
  const lockdown = useAdminMutation((lock: boolean) => api.staff.lockdown(lock), { invalidate: [adminKeys.staff] });
  const lock = async () => {
    const ok = await confirm({
      title: "Lock out all staff?",
      message:
        "Every staff member is signed out on every phone right away and can't sign in until you unlock. Use it after closing time or if a phone is lost. You can still bill as the owner, and nothing is deleted.",
      confirmLabel: "Lock all staff",
      destructive: true
    });
    if (ok) lockdown.mutate(true);
  };
  const unlock = async () => {
    const ok = await confirm({
      title: "Unlock staff?",
      message: "Staff locked by the emergency switch can sign in again. Anyone you disabled separately stays disabled, and working hours still apply.",
      confirmLabel: "Unlock staff"
    });
    if (ok) lockdown.mutate(false);
  };
  if (locked > 0)
    return (
      <Card style={{ gap: theme.space[3], borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft }}>
        <Row gap={3} align="flex-start">
          <IconCircle icon="lock-closed" tone="warning" size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">Staff are locked out</Text>
            <Text variant="small">
              {locked} of {count} can’t sign in because of the emergency lock.
            </Text>
          </View>
        </Row>
        <Button label="Unlock staff" icon="lock-open-outline" variant="success" onPress={unlock} loading={lockdown.isPending} fullWidth />
      </Card>
    );
  return (
    <Card style={{ gap: theme.space[3] }}>
      <Row gap={3} align="flex-start">
        <IconCircle icon="shield-half-outline" tone="danger" size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">Emergency lock</Text>
          <Text variant="small" color="textMuted">
            Signs every staff member out at once and stops new sign-ins until you unlock.
          </Text>
        </View>
      </Row>
      <Button label="Lock all staff" icon="lock-closed-outline" variant="danger" onPress={lock} loading={lockdown.isPending} disabled={count === 0} fullWidth />
    </Card>
  );
}

export function StaffListScreen() {
  const theme = useTheme();
  const query = useStaffList();
  const staff = query.data?.staff ?? [];
  const presets = query.data?.rolePresets ?? [];
  const active = staff.filter((s) => s.status === "active").length;
  const locked = staff.filter((s) => s.status === "locked").length;
  const todaySales = staff.reduce((t, s) => t + s.salesToday.amount, 0);
  const addStaff = () => router.push("/staff/new");
  const sorted = [...staff].sort((a, b) => Number(a.status === "disabled") - Number(b.status === "disabled") || a.displayName.localeCompare(b.displayName));
  return (
    <Screen
      header={<Header back title="Staff" subtitle={query.data ? `${staff.length} ${staff.length === 1 ? "person" : "people"} · ${active} can sign in now` : undefined} right={<IconButton icon="person-add-outline" label="Add staff" onPress={addStaff} />} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      footerSpace={staff.length ? 96 : 0}
      footer={
        staff.length ? (
          <StickyFooter>
            <Button label="Add staff" icon="person-add" size="lg" fullWidth onPress={addStaff} />
          </StickyFooter>
        ) : null
      }
    >
      {query.isPending ? (
        <SkeletonCards count={4} height={150} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : !staff.length ? (
        <EmptyState icon="people-outline" title="No staff yet" body="Add your cashier or manager. They sign in with the shop code, a username and their own PIN." action="Add staff" onAction={addStaff} />
      ) : (
        <>
          <LockdownCard locked={locked} count={staff.filter((s) => s.status !== "disabled").length} />
          <Row gap={3}>
            <StatTile label="Sales today" value={formatMoney(todaySales, { decimals: 0 })} icon="trending-up-outline" tone="success" />
            <StatTile label="Can sign in now" value={`${active} of ${staff.length}`} icon="people-outline" tone="info" />
          </Row>
          <Stack gap={3}>
            <SectionTitle title="Team" />
            {sorted.map((member, i) => (
              <StaffCard key={member.id} member={member} presets={presets} index={i} />
            ))}
          </Stack>
          <Text variant="caption" color="textFaint" align="center" style={{ paddingHorizontal: theme.space[4] }}>
            Staff sign in with shop code, username and PIN. Changes apply on their next tap.
          </Text>
        </>
      )}
    </Screen>
  );
}
