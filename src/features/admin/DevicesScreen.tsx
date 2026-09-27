import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import type { DeviceRow } from "@/api/types";
import { useSession } from "@/auth/session";
import { formatDate, formatRelative } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, confirm, EmptyState, ErrorState, Header, IconCircle, Row, Screen, SectionTitle, SkeletonList, Stack, Text, toast } from "@/ui";
import { Callout } from "./components";
import { adminKeys, useAdminMutation, useMyDevices } from "./hooks";
import { platformIcon } from "./roles";

function DeviceCard({ device, current, onSignOut, busy, index }: { device: DeviceRow; current: boolean; onSignOut: () => void; busy: boolean; index: number }) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={theme.reduceMotion ? undefined : FadeInDown.duration(240).delay(Math.min(index, 8) * 40)}
      exiting={theme.reduceMotion ? undefined : FadeOut.duration(160)}
      layout={theme.reduceMotion ? undefined : LinearTransition}
    >
      <Card style={{ gap: theme.space[3], borderColor: current ? theme.colors.accent : theme.colors.border, borderWidth: current ? 2 : 1 }}>
        <Row gap={3} align="flex-start">
          <IconCircle icon={platformIcon(device.platform)} tone={current ? "accent" : "neutral"} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {device.name || "Phone"}
            </Text>
            <Text variant="small" color="textMuted">
              {current ? "Active now" : `Last used ${formatRelative(device.lastUsedAt)}`}
            </Text>
            <Text variant="caption" color="textFaint">
              Signed in {formatDate(device.createdAt)}
              {device.platform ? ` · ${device.platform}` : ""}
            </Text>
          </View>
          {current ? <Badge label="This phone" tone="accent" icon="phone-portrait" /> : null}
        </Row>
        <Button
          label={current ? "Sign out of this phone" : "Sign out"}
          icon="log-out-outline"
          variant={current ? "secondary" : "danger"}
          size="sm"
          onPress={onSignOut}
          loading={busy}
          accessibilityLabel={current ? "Sign out of this phone" : `Sign out ${device.name || "phone"}`}
          style={{ alignSelf: "flex-start" }}
        />
      </Card>
    </Animated.View>
  );
}

export function DevicesScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const query = useMyDevices();
  const [busy, setBusy] = useState<string | null>(null);
  const revoke = useAdminMutation((id: string) => api.devices.revoke(id), { invalidate: [adminKeys.devices] });
  const devices = query.data?.devices ?? [];
  const currentId = query.data?.currentDeviceId;
  const others = devices.filter((d) => d.id !== currentId);
  const current = devices.find((d) => d.id === currentId);

  const signOut = async (device: DeviceRow) => {
    if (device.id === currentId) {
      const ok = await confirm({ title: "Sign out of this phone?", message: "You'll need your email and password or a code to sign in again.", confirmLabel: "Sign out", destructive: true });
      if (!ok) return;
      await useSession.getState().signOut();
      qc.clear();
      return;
    }
    const ok = await confirm({
      title: `Sign out ${device.name || "this phone"}?`,
      message: "Anyone using it is signed out right away and needs your password or a code to get back in.",
      confirmLabel: "Sign out",
      destructive: true
    });
    if (!ok) return;
    setBusy(device.id);
    revoke.mutate(device.id, { onSettled: () => setBusy(null) });
  };

  const signOutOthers = async () => {
    const ok = await confirm({
      title: `Sign out ${others.length} other phone${others.length === 1 ? "" : "s"}?`,
      message: "Only this phone stays signed in. Use this if you lost a phone or signed in on someone else's.",
      confirmLabel: "Sign out others",
      destructive: true
    });
    if (!ok) return;
    setBusy("others");
    const results = await Promise.allSettled(others.map((d) => api.devices.revoke(d.id)));
    setBusy(null);
    await qc.invalidateQueries({ queryKey: adminKeys.devices });
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) toast.error(errorMessage((failed[0] as PromiseRejectedResult).reason));
    else toast.success("Other phones signed out.");
  };

  return (
    <Screen header={<Header back title="Signed-in phones" subtitle={query.data ? `${devices.length} phone${devices.length === 1 ? "" : "s"}` : undefined} />} onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      {query.isPending ? (
        <SkeletonList rows={3} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : !devices.length ? (
        <EmptyState icon="phone-portrait-outline" title="No phones signed in" body="Phones you sign in on show up here." />
      ) : (
        <>
          <Callout icon="shield-checkmark-outline" tone="info">
            These are the phones signed in to your owner account. Staff phones are on each staff member’s page.
          </Callout>
          {current ? <DeviceCard device={current} current onSignOut={() => signOut(current)} busy={false} index={0} /> : null}
          {others.length ? (
            <Stack gap={3}>
              <SectionTitle title={`Other phones (${others.length})`} />
              {others.map((device, i) => (
                <DeviceCard key={device.id} device={device} current={false} onSignOut={() => signOut(device)} busy={busy === device.id} index={i + 1} />
              ))}
              {others.length > 1 ? <Button label="Sign out all other phones" icon="log-out-outline" variant="danger" onPress={signOutOthers} loading={busy === "others"} fullWidth /> : null}
            </Stack>
          ) : (
            <Text variant="small" color="textMuted" align="center" style={{ paddingHorizontal: theme.space[4] }}>
              No other phones are signed in.
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}
