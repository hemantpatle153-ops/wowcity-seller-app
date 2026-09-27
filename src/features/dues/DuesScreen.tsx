import { FlashList } from "@shopify/flash-list";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { PartyBalanceRow } from "@/api/types";
import { can, isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatMoney, formatRelative, maskMobile } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, Badge, ChipRow, EmptyState, ErrorState, Header, ListRow, Row, SearchBar, Segmented, SkeletonList, Text } from "@/ui";
import { balanceLabel, balanceState, balanceTone, isParty, type DuesFilter, type Party } from "./logic";
import { useDebounced } from "./useDebounced";

const PAGE_SIZE = 50;

function SummaryStrip({ party, owing, owingCount, advance, advanceCount }: { party: Party; owing: number; owingCount: number; advance: number; advanceCount: number }) {
  const theme = useTheme();
  const cell = (label: string, value: string, sub: string, tone: "warning" | "info") => (
    <View
      style={{ flex: 1, minWidth: 150, padding: theme.space[3], borderRadius: theme.radius.card, backgroundColor: theme.colors[tone === "warning" ? "warningSoft" : "infoSoft"], gap: 2 }}
      accessible
      accessibilityLabel={`${label}: ${value}, ${sub}`}
    >
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="title" color={tone} tabular numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" color="textMuted">
        {sub}
      </Text>
    </View>
  );
  return (
    <Row gap={3} wrap style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }}>
      {cell(party === "customer" ? "Customers owe you" : "You owe suppliers", formatMoney(owing, { decimals: 0 }), `${owingCount} ${owingCount === 1 ? party : `${party}s`}`, "warning")}
      {cell(party === "customer" ? "Advances held" : "Advances paid", formatMoney(advance, { decimals: 0 }), `${advanceCount} ${advanceCount === 1 ? party : `${party}s`}`, "info")}
    </Row>
  );
}

function PartyRow({ row, party }: { row: PartyBalanceRow; party: Party }) {
  const state = balanceState(row.balance);
  const sub = [row.mobile ? maskMobile(row.mobile) : null, row.lastActivity ? formatRelative(row.lastActivity) : "No activity"].filter(Boolean).join(" · ");
  return (
    <ListRow
      left={<Avatar name={row.name} size={42} tone={balanceTone(row.balance)} />}
      title={row.name}
      subtitle={sub}
      right={
        <View style={{ alignItems: "flex-end", gap: 4, maxWidth: 150 }}>
          <Text variant="bodyStrong" tabular color={state === "owing" ? "warning" : state === "advance" ? "info" : "textMuted"} numberOfLines={1}>
            {formatMoney(Math.abs(row.balance), { decimals: "auto" })}
          </Text>
          <Badge label={state === "owing" ? (party === "customer" ? "Owes" : "You owe") : state === "advance" ? "Advance" : "Settled"} tone={balanceTone(row.balance)} showIcon={false} />
        </View>
      }
      chevron
      onPress={() => router.push({ pathname: "/dues/[party]/[id]", params: { party, id: row.id } })}
      accessibilityLabel={`${row.name}, ${balanceLabel(row.balance, party)}. ${sub}`}
      accessibilityHint="Opens the statement"
    />
  );
}

/** Dues: who owes the shop and whom the shop owes, with filters, search and statements. */
export function DuesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ party?: string; filter?: string }>();
  const me = useSession((s) => s.me);
  const owner = isOwner(me);
  const [party, setParty] = useState<Party>(owner && isParty(params.party) ? params.party : "customer");
  const [filter, setFilter] = useState<DuesFilter>(params.filter === "advance" || params.filter === "settled" || params.filter === "all" ? params.filter : "owing");
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim(), 300);
  const [pulling, setPulling] = useState(false);
  const allowed = can(me, "reports.due");

  const query = useInfiniteQuery({
    queryKey: ["dues", "list", party, filter, search],
    queryFn: ({ pageParam }) => api.dues.list({ party, filter, q: search || undefined, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.reduce((n, p) => n + p.items.length, 0) < last.total && last.items.length >= PAGE_SIZE ? pages.length + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: allowed
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const summary = query.data?.pages[0]?.summary;
  const refresh = () => {
    setPulling(true);
    query.refetch().finally(() => setPulling(false));
  };

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
        <Header back title="Dues" />
        <EmptyState icon="lock-closed-outline" title="Dues are hidden" body="Ask the shop owner to give you access to dues." tone="warning" />
      </View>
    );
  }

  const filters: { key: DuesFilter; label: string; count?: number }[] = [
    { key: "owing", label: party === "customer" ? "Owing" : "To pay", count: summary?.owingCount },
    { key: "advance", label: "Advance", count: summary?.advanceCount },
    { key: "settled", label: "Settled", count: summary?.settledCount },
    { key: "all", label: "All", count: summary ? summary.owingCount + summary.advanceCount + summary.settledCount : undefined }
  ];

  const empty = () => {
    if (query.isLoading) return <SkeletonList rows={8} />;
    if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
    if (search) return <EmptyState icon="search-outline" title="No match" body={`Nobody matches “${search}”.`} action="Clear search" onAction={() => setQ("")} compact />;
    if (filter === "owing")
      return (
        <EmptyState
          icon="happy-outline"
          tone="success"
          title={party === "customer" ? "Nobody owes you" : "You owe no supplier"}
          body={party === "customer" ? "All customer bills are paid up." : "Every supplier bill is paid."}
          action="Show everyone"
          onAction={() => setFilter("all")}
        />
      );
    return <EmptyState icon="wallet-outline" title="Nothing here" body="No one matches this filter." action="Show everyone" onAction={() => setFilter("all")} compact />;
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
      <Header back title="Dues" subtitle={party === "customer" ? "Customer balances" : "Supplier balances"} />
      <View style={{ gap: theme.space[2], paddingBottom: theme.space[2] }}>
        {owner ? (
          <View style={{ paddingHorizontal: theme.space[4] }}>
            <Segmented
              accessibilityLabel="Whose dues"
              options={[
                { key: "customer", label: "Customers", icon: "people-outline" },
                { key: "supplier", label: "Suppliers", icon: "business-outline" }
              ]}
              value={party}
              onChange={(p) => {
                setParty(p);
                setFilter("owing");
              }}
            />
          </View>
        ) : null}
        <View style={{ paddingHorizontal: theme.space[4] }}>
          <SearchBar value={q} onChangeText={setQ} placeholder={party === "customer" ? "Search name or mobile" : "Search supplier"} />
        </View>
        <ChipRow options={filters} value={filter} onChange={setFilter} />
      </View>
      <FlashList
        data={items}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <PartyRow row={item} party={party} />}
        ListHeaderComponent={
          summary && !search ? <SummaryStrip party={party} owing={summary.owing} owingCount={summary.owingCount} advance={summary.advance} advanceCount={summary.advanceCount} /> : null
        }
        ListEmptyComponent={empty()}
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <SkeletonList rows={2} />
          ) : items.length && !query.hasNextPage && (query.data?.pages[0]?.total ?? 0) > PAGE_SIZE ? (
            <Text variant="caption" color="textFaint" align="center" style={{ padding: 16 }}>
              That&apos;s everyone.
            </Text>
          ) : null
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={refresh} tintColor={theme.colors.accent} colors={[theme.colors.accent]} progressBackgroundColor={theme.colors.surface} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}
