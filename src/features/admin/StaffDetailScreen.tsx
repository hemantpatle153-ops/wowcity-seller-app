import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import type { DeviceRow, StaffDetailResponse, StaffMember } from "@/api/types";
import { useSession } from "@/auth/session";
import { formatMoney, formatMoneyShort, formatRelative } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  confirm,
  Divider,
  EmptyState,
  ErrorState,
  Header,
  IconCircle,
  Input,
  ListRow,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  Skeleton,
  SkeletonCards,
  Stack,
  Text
} from "@/ui";
import { ActionTile, Callout, CredentialsSheet } from "./components";
import { adminKeys, useAdminMutation, useStaffDetail, useStaffList } from "./hooks";
import { activityLabel, matchPreset, platformIcon, roleIcons, roleLabel, statusBadge } from "./roles";
import { shiftSummary } from "./shifts";
import { generatePin, mobileError, nameError, secretError } from "./validation";

function ProfileSheet({ member, visible, onClose }: { member: StaffMember; visible: boolean; onClose: () => void }) {
  const [name, setName] = useState(member.displayName);
  const [mobile, setMobile] = useState(member.mobile ?? "");
  const [touched, setTouched] = useState(false);
  const save = useAdminMutation(() => api.staff.updateProfile(member.id, { displayName: name.trim(), mobile: mobile.trim() || undefined }), {
    invalidate: [adminKeys.staff],
    onSuccess: onClose
  });
  const errors = { name: nameError(name), mobile: mobileError(mobile) };
  const dirty = name.trim() !== member.displayName || mobile.trim() !== (member.mobile ?? "");
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Edit profile"
      footer={
        <Button
          label="Save"
          size="lg"
          fullWidth
          disabled={!dirty}
          loading={save.isPending}
          onPress={() => {
            setTouched(true);
            if (!errors.name && !errors.mobile) save.mutate(undefined);
          }}
        />
      }
    >
      <Input label="Name" value={name} onChangeText={setName} autoCapitalize="words" error={touched ? errors.name : null} maxLength={80} />
      <Input label="Mobile (optional)" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" error={touched || mobile.length >= 10 ? errors.mobile : null} maxLength={16} />
      <Text variant="small" color="textMuted">
        Their username @{member.username} stays the same.
      </Text>
    </Sheet>
  );
}

function ResetPinSheet({ member, visible, onClose, onDone }: { member: StaffMember; visible: boolean; onClose: () => void; onDone: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [generated, setGenerated] = useState(false);
  const [touched, setTouched] = useState(false);
  const reset = useAdminMutation((value: string) => api.staff.resetPin(member.id, { password: value }), {
    invalidate: [adminKeys.staff],
    onSuccess: (_, value) => {
      setPin("");
      setTouched(false);
      onDone(value);
    }
  });
  const error = secretError(pin);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`New PIN for ${member.displayName}`}
      footer={
        <Button
          label="Set new PIN"
          size="lg"
          fullWidth
          loading={reset.isPending}
          onPress={() => {
            setTouched(true);
            if (!error) reset.mutate(pin);
          }}
        />
      }
    >
      <Callout icon="log-out-outline" tone="warning">
        They’ll be signed out on every phone and must sign in again with the new PIN.
      </Callout>
      <Input
        label="New PIN or password"
        value={pin}
        onChangeText={(v) => {
          setPin(v);
          setGenerated(false);
        }}
        secureTextEntry
        secureToggle
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        hint="At least 6 characters. A 6-digit number is easiest at the counter."
        error={touched ? error : null}
        maxLength={72}
      />
      <Button
        label="Generate a PIN"
        icon="sparkles-outline"
        variant="soft"
        onPress={() => {
          setPin(generatePin());
          setGenerated(true);
        }}
      />
      {generated && pin ? (
        <Text variant="title" tabular align="center" style={{ letterSpacing: 6 }} accessibilityLabel={`PIN ${pin.split("").join(" ")}`}>
          {pin}
        </Text>
      ) : null}
    </Sheet>
  );
}

function DeviceItem({ device, onSignOut, busy }: { device: DeviceRow; onSignOut: () => void; busy: boolean }) {
  return (
    <ListRow
      icon={platformIcon(device.platform)}
      iconTone="neutral"
      title={device.name || "Phone"}
      subtitle={`Last used ${formatRelative(device.lastUsedAt)}`}
      meta={`Signed in ${formatRelative(device.createdAt)}`}
      right={<Button label="Sign out" size="sm" variant="secondary" onPress={onSignOut} loading={busy} accessibilityLabel={`Sign out ${device.name || "phone"}`} />}
    />
  );
}

function Loading() {
  return (
    <Stack gap={4}>
      <Card style={{ alignItems: "center", gap: 12 }}>
        <Skeleton width={72} height={72} radius={36} />
        <Skeleton width="50%" height={20} />
        <Skeleton width="30%" height={14} />
      </Card>
      <SkeletonCards count={3} height={88} />
    </Stack>
  );
}

function Detail({ data }: { data: StaffDetailResponse }) {
  const theme = useTheme();
  const { member } = data;
  const shopCode = useSession((s) => s.me?.shopCode ?? "");
  const list = useStaffList();
  const presets = list.data?.rolePresets ?? [];
  const status = statusBadge(member.status);
  const [sheet, setSheet] = useState<null | "profile" | "pin">(null);
  const [profileKey, setProfileKey] = useState(0);
  const [newPin, setNewPin] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const disabled = member.status === "disabled";

  const signOutAll = useAdminMutation(() => api.staff.signOut(member.id), { invalidate: [adminKeys.staff] });
  const setStatus = useAdminMutation((next: boolean) => api.staff.setStatus(member.id, { disabled: next }), { invalidate: [adminKeys.staff] });
  const revoke = useAdminMutation((id: string) => api.devices.revoke(id), { invalidate: [adminKeys.staff], onSuccess: () => setRevoking(null) });

  const askSignOut = async () => {
    const ok = await confirm({
      title: `Sign ${member.displayName} out everywhere?`,
      message: "They're signed out on every phone right away. They can sign in again with their PIN (unless disabled or outside working hours).",
      confirmLabel: "Sign out everywhere",
      destructive: true
    });
    if (ok) signOutAll.mutate(undefined);
  };
  const askStatus = async () => {
    const ok = await confirm(
      disabled
        ? { title: `Enable ${member.displayName}?`, message: "They can sign in again with their username and PIN.", confirmLabel: "Enable" }
        : {
            title: `Disable ${member.displayName}?`,
            message: "They're signed out on every phone right away and can't sign in until you enable them again. Their bills and history stay.",
            confirmLabel: "Disable",
            destructive: true
          }
    );
    if (ok) setStatus.mutate(!disabled);
  };
  const askRevoke = async (device: DeviceRow) => {
    const ok = await confirm({
      title: `Sign out ${device.name || "this phone"}?`,
      message: `${member.displayName} will need their PIN to sign in on it again.`,
      confirmLabel: "Sign out",
      destructive: true
    });
    if (ok) {
      setRevoking(device.id);
      revoke.mutate(device.id, { onError: () => setRevoking(null) });
    }
  };

  const enter = (i: number) => (theme.reduceMotion ? undefined : FadeInDown.duration(260).delay(i * 50));
  const role = matchPreset(member.permissions, presets);

  return (
    <>
      <Animated.View entering={enter(0)}>
        <Card style={{ alignItems: "center", gap: theme.space[2], paddingVertical: theme.space[5] }}>
          <Avatar name={member.displayName} size={72} tone={disabled ? "neutral" : member.status === "locked" ? "warning" : "accent"} />
          <Text variant="heading" align="center">
            {member.displayName}
          </Text>
          <Text variant="body" color="textMuted">
            @{member.username}
            {member.mobile ? ` · ${member.mobile}` : ""}
          </Text>
          <Row gap={2} wrap justify="center">
            <Badge label={status.label} tone={status.tone} icon={status.icon} />
            {presets.length ? <Badge label={roleLabel(member.permissions, presets)} tone="accent" icon={roleIcons[role]} /> : null}
          </Row>
          <Divider style={{ alignSelf: "stretch", marginVertical: theme.space[2] }} />
          <Row gap={3} style={{ alignSelf: "stretch" }}>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text variant="title" tabular>
                {formatMoney(member.salesToday.amount, { decimals: 0 })}
              </Text>
              <Text variant="caption" color="textMuted" align="center">
                Today · {member.salesToday.bills} bills
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text variant="title" tabular>
                {formatMoneyShort(member.sales30d.amount)}
              </Text>
              <Text variant="caption" color="textMuted" align="center">
                30 days · {member.sales30d.bills} bills
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text variant="bodyStrong" align="center" numberOfLines={2}>
                {member.lastLoginAt ? formatRelative(member.lastLoginAt) : "Never"}
              </Text>
              <Text variant="caption" color="textMuted" align="center">
                Last sign-in
              </Text>
            </View>
          </Row>
        </Card>
      </Animated.View>

      <Animated.View entering={enter(1)} style={{ flexDirection: "row", gap: theme.space[2] }}>
        <ActionTile icon="keypad-outline" label="Reset PIN" onPress={() => setSheet("pin")} hint="Sets a new PIN and signs them out" />
        <ActionTile icon="log-out-outline" label="Sign out everywhere" tone="warning" onPress={askSignOut} />
        {disabled ? (
          <ActionTile icon="checkmark-circle-outline" label="Enable" tone="success" onPress={askStatus} />
        ) : (
          <ActionTile icon="ban-outline" label="Disable" tone="danger" onPress={askStatus} />
        )}
      </Animated.View>

      {member.status === "locked" ? (
        <Callout icon="lock-closed" tone="warning" title="Emergency lock is on">
          Unlock all staff from the Staff page to let them sign in.
        </Callout>
      ) : member.status === "off_shift" ? (
        <Callout icon="moon-outline" tone="info" title="Outside working hours">
          They can sign in again when their next shift starts.
        </Callout>
      ) : null}

      <Animated.View entering={enter(2)} style={{ gap: theme.space[2] }}>
        <SectionTitle title="Settings" />
        <Card padded={false} style={{ overflow: "hidden" }}>
          <ListRow
            icon="person-outline"
            title="Profile"
            subtitle={[member.displayName, member.mobile ?? "No mobile"].join(" · ")}
            chevron
            onPress={() => {
              setProfileKey((k) => k + 1);
              setSheet("profile");
            }}
          />
          <Divider inset={66} />
          <ListRow
            icon="key-outline"
            title="Access"
            subtitle={`${presets.length ? roleLabel(member.permissions, presets) : `${member.permissions.length} permissions`} · ${member.stores.map((s) => s.name).join(", ") || "No store"}`}
            chevron
            onPress={() => router.push({ pathname: "/staff/[id]/access", params: { id: member.id } })}
          />
          <Divider inset={66} />
          <ListRow
            icon="time-outline"
            title="Working hours"
            subtitle={shiftSummary(member.shifts)}
            chevron
            onPress={() => router.push({ pathname: "/staff/[id]/shifts", params: { id: member.id } })}
          />
        </Card>
      </Animated.View>

      <Animated.View entering={enter(3)} style={{ gap: theme.space[2] }}>
        <SectionTitle title={`Signed-in phones (${data.devices.length})`} />
        <Card padded={false} style={{ overflow: "hidden" }}>
          {data.devices.length ? (
            data.devices.map((device, i) => (
              <View key={device.id}>
                {i > 0 ? <Divider inset={66} /> : null}
                <DeviceItem device={device} onSignOut={() => askRevoke(device)} busy={revoking === device.id} />
              </View>
            ))
          ) : (
            <ListRow icon="phone-portrait-outline" iconTone="neutral" title="Not signed in on any phone" />
          )}
        </Card>
      </Animated.View>

      <Animated.View entering={enter(4)} style={{ gap: theme.space[2] }}>
        <SectionTitle title="Recent bills" />
        <Card padded={false} style={{ overflow: "hidden" }}>
          {data.bills.length ? (
            data.bills.map((bill, i) => (
              <View key={bill.id}>
                {i > 0 ? <Divider inset={16} /> : null}
                <ListRow
                  title={bill.number}
                  subtitle={`${bill.customer ?? "Walk-in"} · ${formatRelative(bill.at)}`}
                  value={formatMoney(bill.amount)}
                  right={bill.due > 0 ? <Badge label={`Due ${formatMoney(bill.due, { decimals: 0 })}`} tone="warning" showIcon={false} /> : undefined}
                  chevron
                  onPress={() => router.push({ pathname: "/bills/[id]", params: { id: bill.id } })}
                />
              </View>
            ))
          ) : (
            <EmptyState compact icon="receipt-outline" title="No bills yet" body="Bills they make show up here." />
          )}
        </Card>
      </Animated.View>

      <Animated.View entering={enter(5)} style={{ gap: theme.space[2] }}>
        <SectionTitle title="Activity" />
        <Card style={{ gap: 0, paddingVertical: theme.space[2] }}>
          {data.activity.length ? (
            data.activity.map((a, i) => {
              const info = activityLabel(a.action);
              const last = i === data.activity.length - 1;
              return (
                <Row key={a.id} gap={3} align="flex-start">
                  <View style={{ alignItems: "center", alignSelf: "stretch" }}>
                    <IconCircle icon={info.icon} tone="neutral" size={32} />
                    {!last ? <View style={{ flex: 1, width: 2, backgroundColor: theme.colors.border, marginVertical: 2 }} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: last ? 0 : theme.space[3], paddingTop: 4 }}>
                    <Row justify="space-between" gap={2}>
                      <Text variant="body" weight="600" style={{ flex: 1 }}>
                        {info.label}
                      </Text>
                      {a.amount !== null ? (
                        <Text variant="bodyStrong" tabular>
                          {formatMoney(a.amount)}
                        </Text>
                      ) : null}
                    </Row>
                    <Text variant="caption" color="textMuted">
                      {formatRelative(a.created_at)}
                    </Text>
                  </View>
                </Row>
              );
            })
          ) : (
            <EmptyState compact icon="pulse-outline" title="No activity yet" body="What they do in the app shows up here." />
          )}
        </Card>
      </Animated.View>

      <ProfileSheet key={profileKey} member={member} visible={sheet === "profile"} onClose={() => setSheet(null)} />
      <ResetPinSheet
        member={member}
        visible={sheet === "pin"}
        onClose={() => setSheet(null)}
        onDone={(pin) => {
          setSheet(null);
          setNewPin(pin);
        }}
      />
      <CredentialsSheet visible={!!newPin} onClose={() => setNewPin(null)} title="New PIN is set" name={member.displayName} shopCode={shopCode} username={member.username} pin={newPin ?? ""} />
    </>
  );
}

export function StaffDetailScreen({ id }: { id: string }) {
  const query = useStaffDetail(id);
  return (
    <Screen
      header={<Header back title={query.data?.member.displayName ?? "Staff"} subtitle={query.data ? `@${query.data.member.username}` : undefined} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {query.isPending ? <Loading /> : query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : <Detail data={query.data} />}
    </Screen>
  );
}
