import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { DuesStatementResponse, StatementEntry } from "@/api/types";
import { isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatDate, formatMoney, formatTime, maskMobile } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { AnimatedNumber, Avatar, Button, Card, Divider, EmptyState, ErrorState, Header, Icon, IconButton, PressableScale, Row, Screen, SectionTitle, Skeleton, SkeletonList, Stack, Text, toast } from "@/ui";
import { invoiceIdFromHref } from "@/features/reports/links";
import { openPath } from "@/features/reports/navigate";
import { EntrySheet } from "./EntrySheet";
import { balanceHeadline, balanceState, balanceTone, telUrl, whatsappUrl, type Party } from "./logic";

async function openUrl(url: string | null, failure: string) {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    toast.error(failure);
  }
}

function EntryRow({ entry, party, last }: { entry: StatementEntry; party: Party; last: boolean }) {
  const theme = useTheme();
  const invoiceId = invoiceIdFromHref(entry.href);
  const up = entry.increase > 0;
  const amount = up ? entry.increase : entry.decrease;
  // For a customer, "up" means they owe more (a bill on credit); "down" means they paid.
  const tone = up ? "warning" : "success";
  const reference = entry.reference && !entry.label.includes(entry.reference) ? entry.reference : null;
  const details = [formatDate(entry.at), formatTime(entry.at), reference, entry.mode ? entry.mode.toUpperCase() : null].filter(Boolean).join(" · ");
  const body = (
    <Row gap={3} align="flex-start" style={{ paddingHorizontal: theme.space[4] }}>
      <View style={{ alignItems: "center", width: 28, alignSelf: "stretch" }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors[up ? "warningSoft" : "successSoft"], marginTop: 10 }}>
          <Icon name={up ? "arrow-up" : "arrow-down"} size={16} color={tone} />
        </View>
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: theme.colors.border, marginTop: 2 }} /> : null}
      </View>
      <View style={{ flex: 1, paddingVertical: 10, gap: 2 }}>
        <Text variant="body" weight="600" numberOfLines={2}>
          {entry.label}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={2}>
          {details}
        </Text>
        {invoiceId ? (
          <Text variant="caption" color="accent" weight="700">
            View bill
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", paddingVertical: 10, gap: 2 }}>
        <Text variant="bodyStrong" tabular color={tone}>
          {up ? "+" : "−"}
          {formatMoney(amount)}
        </Text>
        <Text variant="caption" color="textMuted" tabular>
          Bal {formatMoney(entry.balance, { decimals: "auto" })}
        </Text>
      </View>
    </Row>
  );
  const label = `${entry.label}, ${up ? "added" : "paid"} ${formatMoney(amount)}, balance ${formatMoney(entry.balance)}. ${details}`;
  if (invoiceId)
    return (
      <PressableScale onPress={() => openPath(`/bills/${invoiceId}`)} accessibilityLabel={label} accessibilityHint="Opens the bill" scaleTo={0.99}>
        {body}
      </PressableScale>
    );
  return (
    <View accessible accessibilityLabel={label}>
      {body}
    </View>
  );
}

function BalanceHero({ data, party }: { data: DuesStatementResponse; party: Party }) {
  const theme = useTheme();
  const tone = balanceTone(data.balance);
  const bg = tone === "warning" ? "warningSoft" : tone === "info" ? "infoSoft" : "successSoft";
  return (
    <View style={{ borderRadius: theme.radius.card + 4, padding: theme.space[5], gap: 8, backgroundColor: theme.colors[bg], borderWidth: 1, borderColor: theme.colors.border }}>
      <Text variant="small" weight="700" color={tone === "warning" ? "warning" : tone === "info" ? "info" : "success"} uppercase>
        {balanceHeadline(data.balance, party, data.party.name.split(" ")[0])}
      </Text>
      <AnimatedNumber value={Math.abs(data.balance)} variant="hero" format={(n) => formatMoney(n, { decimals: "auto" })} />
      <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }} />
      <Row gap={4} wrap>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Text variant="caption" color="textMuted">
            {party === "customer" ? "Billed on credit" : "Purchased"}
          </Text>
          <Text variant="bodyStrong" tabular>
            {formatMoney(data.totals.increase)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Text variant="caption" color="textMuted">
            {party === "customer" ? "Received" : "Paid"}
          </Text>
          <Text variant="bodyStrong" tabular>
            {formatMoney(data.totals.decrease)}
          </Text>
        </View>
      </Row>
    </View>
  );
}

/** One customer's or supplier's running statement, with payment/due actions. */
export function StatementScreen({ party, id }: { party: Party; id: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const owner = isOwner(me);
  const [sheet, setSheet] = useState<{ kind: "payment" | "due"; key: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pulling, setPulling] = useState(false);
  const allowed = party === "customer" ? owner || !!me?.permissions.includes("reports.due") : owner;

  const query = useQuery({
    queryKey: ["dues", "statement", party, id],
    queryFn: () => api.dues.statement(party, id),
    enabled: allowed
  });
  const data = query.data;
  const refresh = () => {
    setPulling(true);
    query.refetch().finally(() => setPulling(false));
  };

  if (!allowed) {
    return (
      <Screen header={<Header back title="Statement" />}>
        <EmptyState icon="lock-closed-outline" tone="warning" title="Owner only" body="Only the shop owner can see supplier statements." action="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const canRecord = party === "customer" || owner;
  const reminderUrl = data?.reminder?.whatsappUrl ?? null;
  const tel = telUrl(data?.party.mobile);
  const wa = reminderUrl ?? whatsappUrl(data?.party.mobile);
  const entries = data ? [...data.entries].reverse() : [];

  const footer =
    data && canRecord ? (
      <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12), gap: 8, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border, flexDirection: "row", flexWrap: "wrap" }}>
        {owner ? (
          <Button
            label="Add due"
            icon="add"
            variant="secondary"
            size="lg"
            style={{ flexGrow: 1 }}
            onPress={() => {
              haptic.tap();
              setSheet({ kind: "due", key: Date.now() });
              setSheetOpen(true);
            }}
          />
        ) : null}
        <Button
          label="Record payment"
          icon={owner ? undefined : "wallet-outline"}
          size="lg"
          variant="primary"
          onPress={() => {
            setSheet({ kind: "payment", key: Date.now() });
            setSheetOpen(true);
          }}
          style={{ flexGrow: 1, minWidth: 200 }}
        />
      </View>
    ) : null;

  return (
    <Screen
      onRefresh={data ? refresh : undefined}
      refreshing={pulling}
      footerSpace={data && canRecord ? 90 : 0}
      footer={footer}
      header={
        <Header
          back
          title={data?.party.name ?? "Statement"}
          subtitle={party === "customer" ? "Customer statement" : "Supplier statement"}
          right={
            data ? (
              <>
                {tel ? <IconButton icon="call-outline" label={`Call ${data.party.name}`} onPress={() => openUrl(tel, "Can't start a call on this device.")} /> : null}
                {wa && !reminderUrl ? <IconButton icon="logo-whatsapp" label={`WhatsApp ${data.party.name}`} onPress={() => openUrl(wa, "WhatsApp isn't available.")} /> : null}
              </>
            ) : undefined
          }
        />
      }
    >
      {data ? (
        <>
          <Card>
            <Row gap={3}>
              <Avatar name={data.party.name} size={52} tone={balanceTone(data.balance)} />
              <View style={{ flex: 1 }}>
                <Text variant="title" numberOfLines={3}>
                  {data.party.name}
                </Text>
                <Text variant="small" color="textMuted" numberOfLines={2}>
                  {[data.party.mobile ? maskMobile(data.party.mobile) : "No mobile", data.party.city ?? data.party.state ?? null].filter(Boolean).join(" · ")}
                </Text>
                {data.party.gstin ? (
                  <Text variant="caption" color="textFaint" style={{ fontVariant: ["tabular-nums"] }}>
                    GSTIN {data.party.gstin}
                  </Text>
                ) : null}
                {party === "customer" && owner ? (
                  <Button
                    label="View profile"
                    variant="ghost"
                    size="sm"
                    iconRight="chevron-forward"
                    onPress={() => router.push({ pathname: "/customers/[id]", params: { id: data.party.id } })}
                    style={{ alignSelf: "flex-start", paddingHorizontal: 0, marginTop: 2 }}
                  />
                ) : null}
              </View>

            </Row>
          </Card>

          <BalanceHero data={data} party={party} />

          {reminderUrl ? (
            <Button label="Send WhatsApp reminder" icon="logo-whatsapp" variant="soft" onPress={() => openUrl(reminderUrl, "WhatsApp isn't available.")} fullWidth />
          ) : null}

          <Stack gap={1}>
            <Row justify="space-between">
              <SectionTitle title="Statement" />
              <Text variant="caption" color="textFaint">
                {entries.length ? "Newest first" : ""}
              </Text>
            </Row>
            <Card padded={false} style={{ paddingVertical: 6 }}>
              {entries.length ? (
                entries.map((e, i) => <EntryRow key={e.id} entry={e} party={party} last={i === entries.length - 1} />)
              ) : (
                <EmptyState icon="document-text-outline" title="No entries yet" body={canRecord ? "Record a payment or add a due to start the statement." : "Bills on credit will show up here."} compact />
              )}
              {entries.length ? (
                <>
                  <Divider style={{ marginTop: 6 }} />
                  <Row justify="space-between" style={{ paddingHorizontal: theme.space[4], paddingTop: 12, paddingBottom: 8 }}>
                    <Text variant="bodyStrong">Balance</Text>
                    <Text variant="title" tabular color={balanceState(data.balance) === "owing" ? "warning" : "text"}>
                      {formatMoney(data.balance, { decimals: "auto" })}
                    </Text>
                  </Row>
                </>
              ) : null}
            </Card>
          </Stack>

          {sheet ? (
            <EntrySheet
              key={sheet.key}
              visible={sheetOpen}
              onClose={() => setSheetOpen(false)}
              party={party}
              partyId={data.party.id}
              partyName={data.party.name}
              balance={data.balance}
              kind={sheet.kind}
            />
          ) : null}
        </>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <View accessibilityLabel="Loading statement" style={{ gap: 16 }}>
          <Skeleton height={84} radius={theme.radius.card} />
          <Skeleton height={190} radius={theme.radius.card} />
          <SkeletonList rows={5} withAvatar />
        </View>
      )}
    </Screen>
  );
}
