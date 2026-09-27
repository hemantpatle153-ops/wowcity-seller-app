import { router } from "expo-router";
import { View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { errorMessage } from "@/api";
import { formatMoney, formatRelative } from "@/lib/format";
import { retryQueued, syncNow, useMyQueue, useOffline } from "@/offline/useQueue";
import type { QueuedBill } from "@/offline/types";
import { useSession } from "@/auth/session";
import { useConnectivity } from "@/state/connectivity";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, Divider, ListRow, Row, SectionTitle, Text, toast, type Tone } from "@/ui";

export function queueStatus(entry: QueuedBill): { label: string; tone: Tone; icon: "time-outline" | "sync" | "alert-circle" | "checkmark-circle" } {
  switch (entry.status) {
    case "syncing":
      return { label: "Sending…", tone: "info", icon: "sync" };
    case "failed":
      return { label: "Needs attention", tone: "danger", icon: "alert-circle" };
    case "synced":
      return { label: entry.billNumber ? `Synced · ${entry.billNumber}` : "Synced", tone: "success", icon: "checkmark-circle" };
    default:
      return { label: "Waiting to sync", tone: "warning", icon: "time-outline" };
  }
}

/** Bills saved on this phone that haven't reached the server (or just did). */
export function QueuedBills({ showSynced = false }: { showSynced?: boolean }) {
  const theme = useTheme();
  const queue = useMyQueue();
  const syncing = useOffline((s) => s.syncing);
  const online = useConnectivity((s) => s.online);
  const storeId = useSession((s) => s.storeId);
  const visible = queue.filter((q) => showSynced || q.status !== "synced").reverse();
  if (!visible.length) return null;
  const waiting = visible.filter((q) => q.status !== "synced").length;
  return (
    <Animated.View entering={theme.reduceMotion ? undefined : FadeIn} layout={theme.reduceMotion ? undefined : LinearTransition} style={{ gap: 8 }}>
      <SectionTitle title={`On this phone · ${waiting} waiting`} />
      <Card padded={false} style={{ overflow: "hidden", borderColor: waiting ? theme.colors.warning : theme.colors.border }}>
        <View style={{ padding: 12, gap: 8, backgroundColor: waiting ? theme.colors.warningSoft : theme.colors.successSoft }}>
          <Text variant="small" color={waiting ? "warning" : "success"} weight="600">
            {!waiting
              ? "Recently synced from this phone."
              : online
                ? "These bills are being sent to the server. Bill numbers arrive after sync."
                : "You're offline. These bills are safe on this phone and will sync automatically."}
          </Text>
          {online && waiting ? (
            <Row gap={2}>
              <Button
                label="Sync now"
                icon="cloud-upload-outline"
                size="sm"
                loading={syncing}
                onPress={async () => {
                  const outcome = await retryQueued().catch((e) => {
                    toast.error(errorMessage(e));
                    return null;
                  });
                  if (outcome?.synced.length) toast.success(`${outcome.synced.length} bill${outcome.synced.length === 1 ? "" : "s"} synced`);
                  void syncNow(storeId, { catalog: false, customers: false });
                }}
              />
            </Row>
          ) : null}
        </View>
        {visible.map((entry, i) => {
          const status = queueStatus(entry);
          return (
            <View key={entry.id}>
              {i > 0 ? <Divider inset={16} /> : null}
              <ListRow
                title={entry.billNumber ?? entry.reference}
                subtitle={[entry.summary.customer ?? "Walk-in", formatRelative(entry.createdAt), entry.summary.kind === "return" ? "Return" : entry.summary.estimate ? "Estimate" : null]
                  .filter(Boolean)
                  .join(" · ")}
                meta={entry.status === "failed" ? (entry.lastError ?? undefined) : undefined}
                value={formatMoney(entry.summary.total)}
                below={<Badge label={status.label} tone={status.tone} icon={status.icon} />}
                chevron
                onPress={() => (entry.status === "synced" && entry.invoiceId && entry.summary.kind === "sale" ? router.push(`/bills/${entry.invoiceId}`) : router.push(`/bills/queued/${entry.id}`))}
              />
            </View>
          );
        })}
      </Card>
    </Animated.View>
  );
}
