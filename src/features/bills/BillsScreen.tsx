import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useDeferredValue, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { HistoryRow } from "@/api/types";
import { isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useConnectivity } from "@/state/connectivity";
import { formatMoney, formatQty, formatRelative } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Chip, ChipRow, EmptyState, ErrorState, Header, ListRow, SearchBar, Segmented, SkeletonList, StatTile, Text } from "@/ui";
import { StorePill } from "@/ui/StorePill";
import { MyDayCard } from "@/features/home/MyDayCard";
import { QueuedBills } from "./QueuedBills";

const ranges = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" }
] as const;

/** Invoice id from a web path like "/app/sale/invoices/<id>". */
export function invoiceIdFromHref(href: string | null | undefined) {
  const match = /\/invoices\/([0-9a-f-]{36})/i.exec(href ?? "");
  return match?.[1] ?? null;
}

export function BillsScreen({ back }: { back?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const [view, setView] = useState<"bills" | "returns">("bills");
  const [range, setRange] = useState<(typeof ranges)[number]["key"]>("today");
  const [q, setQ] = useState("");
  const [allStores, setAllStores] = useState(isOwner(me));
  const storeId = useSession((s) => s.storeId);
  const query = useDeferredValue(q.trim());
  const online = useConnectivity((s) => s.online);
  const sales = useInfiniteQuery({
    queryKey: ["sales", "list", view, range, query, allStores ? "all" : storeId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.sales.list({ view, range, q: query || undefined, store: allStores ? undefined : (storeId ?? undefined), page: pageParam }),
    getNextPageParam: (last) => (last.page * 30 < last.total ? last.page + 1 : undefined),
    enabled: online
  });
  const rows = sales.data?.pages.flatMap((p) => p.rows) ?? [];
  const summary = sales.data?.pages[0]?.summary;
  const staff = !isOwner(me);

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {staff && !back && online ? <MyDayCard /> : null}
        <Segmented
          options={[
            { key: "bills", label: "Bills", icon: "receipt-outline" },
            { key: "returns", label: "Returns", icon: "return-down-back-outline" }
          ]}
          value={view}
          onChange={setView}
        />
        <SearchBar value={q} onChangeText={setQ} placeholder="Bill number, customer or mobile" />
      </View>
      <ChipRow options={ranges.map((r) => ({ key: r.key, label: r.label }))} value={range} onChange={setRange} />
      {summary ? (
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16 }}>
          <StatTile
            label={staff ? "My sales" : "Sales"}
            value={formatMoney(summary.sales)}
            icon="trending-up"
            hint={`${summary.bills} bill${summary.bills === 1 ? "" : "s"} · ${formatQty(summary.items)} item${summary.items === 1 ? "" : "s"}`}
          />
          <StatTile
            label="Due"
            value={formatMoney(summary.due)}
            icon="time-outline"
            tone={summary.due > 0 ? "warning" : "success"}
            hint={summary.returnCount ? `${summary.returnCount} returns · ${formatMoney(summary.returns)}` : "No returns"}
          />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 16 }}>
        <QueuedBills />
      </View>
      {staff ? (
        <Text variant="small" color="textMuted" style={{ paddingHorizontal: 16 }}>
          Showing bills you made.
        </Text>
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: HistoryRow }) => {
    const invoiceId = view === "bills" ? item.id : invoiceIdFromHref(item.href);
    return (
      <View style={{ marginHorizontal: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.card, overflow: "hidden" }}>
        <ListRow
          title={item.number}
          subtitle={[item.customer ?? "Walk-in", item.mobile].filter(Boolean).join(" · ")}
          meta={[formatRelative(item.at), `${formatQty(item.quantity)} item${item.quantity === 1 ? "" : "s"}`, item.by, allStores ? item.store : null].filter(Boolean).join(" · ")}
          value={formatMoney(item.amount)}
          right={
            item.badge ? (
              <Badge label={item.badge.label} tone={item.badge.variant === "warning" ? "warning" : "info"} showIcon={false} />
            ) : item.due > 0 ? (
              <Badge label={`Due ${formatMoney(item.due)}`} tone="warning" />
            ) : null
          }
          chevron={!!invoiceId}
          onPress={invoiceId ? () => router.push(`/bills/${invoiceId}`) : undefined}
        />
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
      <Header
        back={back}
        large={!back}
        title="Bills"
        right={
          isOwner(me) ? (
            <Chip label={allStores ? "All stores" : "This store"} icon={allStores ? "albums-outline" : "storefront-outline"} selected={!allStores} onPress={() => setAllStores(!allStores)} />
          ) : (
            <StorePill />
          )
        }
      />
      <FlashList
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          !online && !rows.length ? (
            <EmptyState
              icon="cloud-offline-outline"
              tone="warning"
              title="Bill history needs internet"
              body="Bills you make now are kept on this phone (above) and sync when you're back online."
              compact
            />
          ) : sales.isLoading ? (
            <SkeletonList rows={6} withAvatar={false} />
          ) : sales.isError ? (
            <ErrorState message={errorMessage(sales.error)} onRetry={() => sales.refetch()} />
          ) : (
            <EmptyState
              icon={view === "bills" ? "receipt-outline" : "return-down-back-outline"}
              title={view === "bills" ? "No bills yet" : "No returns"}
              body={query ? `Nothing matches “${query}”.` : `Nothing for ${ranges.find((r) => r.key === range)?.label.toLowerCase()}.`}
              action={view === "bills" && !query ? "Make a bill" : undefined}
              onAction={() => router.push("/sell")}
            />
          )
        }
        onEndReached={() => sales.hasNextPage && !sales.isFetchingNextPage && sales.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={<View style={{ minHeight: 32 }}>{sales.isFetchingNextPage ? <SkeletonList rows={2} withAvatar={false} /> : null}</View>}
        refreshControl={
          <RefreshControl refreshing={sales.isRefetching && !sales.isFetchingNextPage} onRefresh={() => sales.refetch()} tintColor={theme.colors.accent} colors={[theme.colors.accent]} />
        }
      />
    </View>
  );
}
