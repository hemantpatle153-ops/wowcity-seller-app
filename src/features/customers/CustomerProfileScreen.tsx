import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { api, errorMessage } from "@/api";
import type { CustomerDetailResponse } from "@/api/types";
import { isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatDate, formatMoney, formatNumber, formatRelative, maskMobile } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { AnimatedNumber, Avatar, Badge, Button, Card, EmptyState, ErrorState, Header, IconButton, ListRow, Row, Screen, SectionTitle, Skeleton, SkeletonList, Stack, Text, toast } from "@/ui";
import { balanceLabel, balanceTone, telUrl, whatsappUrl } from "@/features/dues/logic";
import { openPath } from "@/features/reports/navigate";

async function open(url: string | null, failure: string) {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    toast.error(failure);
  }
}

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: "45%",
        minWidth: 140,
        padding: theme.space[3],
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 2
      }}
    >
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text variant="caption" color="textFaint" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function Profile({ data }: { data: CustomerDetailResponse }) {
  const theme = useTheme();
  const c = data.customer;
  const st = data.stats;
  const balance = st?.balance ?? 0;
  const tel = telUrl(c.mobile);
  const wa = whatsappUrl(c.mobile, `Hi ${c.name.split(" ")[0]},`);
  const place = [c.address, c.city, c.state].filter(Boolean).join(", ");
  const bills = st?.bills ?? 0;
  return (
    <>
      <Card style={{ gap: 14 }}>
        <Row gap={3}>
          <Avatar name={c.name} size={60} tone={balance > 0 ? "warning" : "accent"} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" numberOfLines={2}>
              {c.name}
            </Text>
            <Text variant="small" color="textMuted">
              {c.mobile ? maskMobile(c.mobile) : "No mobile number"}
            </Text>
            {place ? (
              <Text variant="small" color="textMuted" numberOfLines={2}>
                {place}
              </Text>
            ) : null}
            {c.gstin ? (
              <Text variant="caption" color="textFaint">
                GSTIN {c.gstin}
              </Text>
            ) : null}
          </View>
        </Row>
        <Row gap={2} wrap>
          <Button label="Call" icon="call-outline" variant="soft" size="sm" disabled={!tel} onPress={() => open(tel, "Can't start a call on this device.")} style={{ flexGrow: 1 }} />
          <Button label="WhatsApp" icon="logo-whatsapp" variant="soft" size="sm" disabled={!wa} onPress={() => open(wa, "WhatsApp isn't available.")} style={{ flexGrow: 1 }} />
          <Button
            label="Statement"
            icon="document-text-outline"
            variant="soft"
            size="sm"
            onPress={() => router.push({ pathname: "/dues/[party]/[id]", params: { party: "customer", id: c.id } })}
            style={{ flexGrow: 1 }}
          />
        </Row>
      </Card>

      <Row gap={2} wrap>
        <Stat label="Total spent" hint={bills ? `Avg ${formatMoney((st?.spent ?? 0) / bills, { decimals: 0 })} per visit` : undefined}>
          <AnimatedNumber value={st?.spent ?? 0} variant="heading" />
        </Stat>
        <Stat label="Visits" hint={`${formatNumber(st?.items ?? 0)} items bought`}>
          <AnimatedNumber value={bills} variant="heading" format={(n) => formatNumber(Math.round(n))} />
        </Stat>
        <Stat label="First visit" hint={st?.firstVisit ? formatRelative(st.firstVisit) : undefined}>
          <Text variant="title">{st?.firstVisit ? formatDate(st.firstVisit) : "—"}</Text>
        </Stat>
        <Stat label="Last visit" hint={st?.lastVisit ? formatRelative(st.lastVisit) : undefined}>
          <Text variant="title">{st?.lastVisit ? formatDate(st.lastVisit) : "—"}</Text>
        </Stat>
      </Row>

      <Card
        onPress={() => router.push({ pathname: "/dues/[party]/[id]", params: { party: "customer", id: c.id } })}
        accessibilityLabel={`Balance: ${balanceLabel(balance, "customer")}. Open statement`}
        style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="small" color="textMuted">
            Balance
          </Text>
          <Text variant="title" tabular color={balance > 0 ? "warning" : balance < 0 ? "info" : "text"}>
            {formatMoney(Math.abs(balance))}
          </Text>
        </View>
        <Badge label={balanceLabel(balance, "customer")} tone={balanceTone(balance)} />
        <IconButton icon="chevron-forward" label="Open statement" color="textFaint" onPress={() => router.push({ pathname: "/dues/[party]/[id]", params: { party: "customer", id: c.id } })} />
      </Card>

      <Stack gap={1}>
        <SectionTitle title={`Recent bills${data.bills.length ? ` (${data.bills.length})` : ""}`} />
        <Card padded={false} style={{ paddingVertical: 4 }}>
          {data.bills.length ? (
            data.bills.map((b) => (
              <ListRow
                key={b.id}
                icon="receipt-outline"
                title={b.bill_number}
                subtitle={`${formatDate(b.invoice_datetime)} · ${formatNumber(b.total_quantity)} item${b.total_quantity === 1 ? "" : "s"}`}
                right={
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text variant="bodyStrong" tabular>
                      {formatMoney(b.net_sale_amount)}
                    </Text>
                    {b.amount_due > 0 ? <Badge label={`Due ${formatMoney(b.amount_due, { decimals: 0 })}`} tone="warning" showIcon={false} /> : null}
                  </View>
                }
                chevron
                onPress={() => openPath(`/bills/${b.id}`)}
                accessibilityLabel={`Bill ${b.bill_number}, ${formatDate(b.invoice_datetime)}, ${formatMoney(b.net_sale_amount)}`}
              />
            ))
          ) : (
            <EmptyState icon="receipt-outline" title="No bills yet" body="Bills with this customer's number show up here." compact />
          )}
        </Card>
      </Stack>
      <Text variant="caption" color="textFaint" align="center" style={{ paddingTop: theme.space[2] }}>
        Customer since {formatDate(c.created_at)}
      </Text>
    </>
  );
}

export function CustomerProfileScreen({ id }: { id: string }) {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const owner = isOwner(me);
  const [pulling, setPulling] = useState(false);
  const query = useQuery({ queryKey: ["customers", "detail", id], queryFn: () => api.customers.get(id), enabled: owner });
  const data = query.data;

  if (!owner)
    return (
      <Screen header={<Header back title="Customer" />}>
        <EmptyState icon="lock-closed-outline" tone="warning" title="Owner only" body="Customer profiles are visible to the shop owner." />
      </Screen>
    );

  return (
    <Screen
      onRefresh={() => {
        setPulling(true);
        query.refetch().finally(() => setPulling(false));
      }}
      refreshing={pulling}
      header={
        <Header
          back
          title={data?.customer.name ?? "Customer"}
          right={data ? <IconButton icon="create-outline" label="Edit customer" onPress={() => router.push({ pathname: "/customers/[id]/edit", params: { id } })} /> : undefined}
        />
      }
    >
      {data ? (
        <Profile data={data} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <View style={{ gap: 16 }} accessibilityLabel="Loading customer">
          <Skeleton height={150} radius={theme.radius.card} />
          <Row gap={2}>
            <Skeleton height={80} radius={theme.radius.card} style={{ flex: 1 }} width="auto" />
            <Skeleton height={80} radius={theme.radius.card} style={{ flex: 1 }} width="auto" />
          </Row>
          <SkeletonList rows={4} />
        </View>
      )}
    </Screen>
  );
}
