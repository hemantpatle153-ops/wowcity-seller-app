import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/api";
import type { OwnerDashboard, StaffDashboard } from "@/api/types";
import { can, isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatRelative } from "@/lib/format";
import { useConnectivity } from "@/state/connectivity";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, ChipRow, ErrorState, Row, Screen, Skeleton, SkeletonCards, Stack, Text } from "@/ui";
import { StorePill } from "@/ui/StorePill";
import { MyDayCard } from "./MyDayCard";
import {
  ActivityCard,
  DuesCard,
  HeroCard,
  ListingsCard,
  PaymentMixCard,
  ProfitCard,
  QuickActions,
  RecentBillsCard,
  ReturnsPurchasesRow,
  Section,
  StockAlertsCard,
  TeamCard,
  TopItemsCard,
  TrendCard
} from "./sections";
import { greeting, useDashboard } from "./useDashboard";

function HomeSkeleton() {
  const theme = useTheme();
  return (
    <View accessibilityLabel="Loading your dashboard" accessibilityRole="progressbar" style={{ gap: theme.space[4] }}>
      <View style={{ borderRadius: theme.radius.card + 4, padding: 20, gap: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
        <Skeleton width={110} height={14} />
        <Skeleton width={200} height={40} />
        <Skeleton width={180} height={22} radius={999} />
        <Row gap={4}>
          <Skeleton width={70} height={34} />
          <Skeleton width={70} height={34} />
          <Skeleton width={90} height={34} />
        </Row>
      </View>
      <Row gap={2}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={88} radius={theme.radius.card} style={{ flex: 1 }} width="auto" />
        ))}
      </Row>
      <SkeletonCards count={1} height={230} />
      <SkeletonCards count={2} height={160} />
    </View>
  );
}

function Freshness({ updatedAt, failed, fetching }: { updatedAt: number; failed: boolean; fetching: boolean }) {
  const online = useConnectivity((s) => s.online);
  if (fetching) return <Badge label="Updating…" tone="info" icon="sync-outline" />;
  if (failed || !online) return <Badge label={`Offline · updated ${formatRelative(updatedAt).toLowerCase()}`} tone="warning" icon="cloud-offline-outline" />;
  return null;
}

function OwnerHome({ data, showSuppliers }: { data: OwnerDashboard; showSuppliers: boolean }) {
  let i = 0;
  return (
    <>
      <Section index={i++}>
        <HeroCard data={data} />
      </Section>
      <Section index={i++}>
        <QuickActions />
      </Section>
      <Section index={i++}>
        <TrendCard trend={data.trend} />
      </Section>
      <Section index={i++}>
        <PaymentMixCard mix={data.paymentMix} />
      </Section>
      <Section index={i++}>
        <DuesCard dues={data.dues} showSuppliers={showSuppliers} />
      </Section>
      <Section index={i++}>
        <StockAlertsCard stock={data.stock} />
      </Section>
      <Section index={i++}>
        <ProfitCard profit={data.profit} />
      </Section>
      <Section index={i++}>
        <ReturnsPurchasesRow returns={data.returns} purchases={data.purchases} />
      </Section>
      <Section index={i++}>
        <TopItemsCard items={data.topItems} />
      </Section>
      <Section index={i++}>
        <TeamCard team={data.team} />
      </Section>
      <Section index={i++}>
        <RecentBillsCard bills={data.recentBills} />
      </Section>
      <Section index={i++}>
        <ListingsCard listings={data.listings} />
      </Section>
      <Section index={i++}>
        <ActivityCard activity={data.activity} />
      </Section>
    </>
  );
}

function StaffHome({ data }: { data: StaffDashboard }) {
  return (
    <>
      <Section index={0}>
        <MyDayCard />
      </Section>
      <Section index={1}>
        <QuickActions />
      </Section>
      {data.stock ? (
        <Section index={2}>
          <StockAlertsCard stock={data.stock} />
        </Section>
      ) : null}
      <Section index={3}>
        <RecentBillsCard bills={data.recentBills} title="My recent bills" />
      </Section>
    </>
  );
}

/** Home tab: owner dashboard (or a simpler "My day" for staff). */
export function HomeScreen() {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const owner = isOwner(me);
  const [store, setStore] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const query = useDashboard(owner ? store : null);
  const data = query.data;

  const refresh = () => {
    setPulling(true);
    query.refetch().finally(() => setPulling(false));
  };

  const stores = data?.kind === "owner" ? data.stores : [];
  const firstName = (me?.displayName ?? "").split(" ")[0];

  return (
    <Screen
      onRefresh={refresh}
      refreshing={pulling}
      header={
        <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[2], paddingBottom: theme.space[2], gap: 2 }}>
          <Row gap={2}>
            <Text variant="small" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </Text>
            <StorePill />
          </Row>
          <Text variant="heading" numberOfLines={1} accessibilityRole="header">
            {me?.shopName ?? "Home"}
          </Text>
        </View>
      }
    >
      {owner && stores.length > 1 ? (
        <View style={{ marginHorizontal: -theme.space[4], marginTop: -theme.space[2] }}>
          <ChipRow
            options={[{ key: "all", label: "All stores", icon: "layers-outline" as const }, ...stores.map((s) => ({ key: s.id, label: s.name }))]}
            value={store ?? "all"}
            onChange={(key) => setStore(key === "all" ? null : key)}
          />
        </View>
      ) : null}
      {data ? (
        <Stack gap={4}>
          {query.isError || query.isPlaceholderData ? (
            <Row>
              <Freshness updatedAt={query.dataUpdatedAt} failed={query.isError} fetching={query.isPlaceholderData && query.isFetching} />
            </Row>
          ) : null}
          {data.kind === "owner" ? <OwnerHome data={data} showSuppliers={owner && can(me, "reports.purchase")} /> : <StaffHome data={data} />}
          {query.isError ? (
            <Text variant="caption" color="textMuted" align="center">
              {errorMessage(query.error)}
            </Text>
          ) : null}
        </Stack>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <HomeSkeleton />
      )}
    </Screen>
  );
}
