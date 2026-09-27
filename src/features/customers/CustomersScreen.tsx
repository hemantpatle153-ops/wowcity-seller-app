import { FlashList } from "@shopify/flash-list";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { CustomerRow, CustomersResponse } from "@/api/types";
import { isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatMoney, formatMoneyShort, formatNumber, formatRelative, maskMobile } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, Badge, ChipRow, EmptyState, ErrorState, Header, ListRow, Row, SearchBar, Select, SkeletonList, Text } from "@/ui";
import { useDebounced } from "@/features/dues/useDebounced";

const PAGE_SIZE = 50;

type Segment = "all" | "repeat" | "new" | "lapsed" | "dues" | "top";
type Sort = "spent" | "recent" | "visits" | "dues" | "name";

const sortOptions: { value: Sort; label: string; icon: "cash-outline" | "time-outline" | "repeat-outline" | "wallet-outline" | "text-outline" }[] = [
  { value: "spent", label: "Most spent", icon: "cash-outline" },
  { value: "recent", label: "Recent visit", icon: "time-outline" },
  { value: "visits", label: "Most visits", icon: "repeat-outline" },
  { value: "dues", label: "Highest dues", icon: "wallet-outline" },
  { value: "name", label: "Name A–Z", icon: "text-outline" }
];

function SummaryTiles({ s }: { s: CustomersResponse["summary"] }) {
  const theme = useTheme();
  const tile = (label: string, value: string, hint: string, tone?: "warning" | "success") => (
    <View
      key={label}
      accessible
      accessibilityLabel={`${label}: ${value}. ${hint}`}
      style={{ flexGrow: 1, flexBasis: "45%", minWidth: 140, padding: theme.space[3], borderRadius: theme.radius.card, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 2 }}
    >
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="title" tabular color={tone ?? "text"} numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" color="textFaint" numberOfLines={1}>
        {hint}
      </Text>
    </View>
  );
  return (
    <Row gap={2} wrap style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }}>
      {tile("Customers", formatNumber(s.customers), `${formatNumber(s.buyers)} have bought`)}
      {tile("Total spent", formatMoneyShort(s.spent), "All-time, all customers")}
      {tile("Repeat buyers", formatNumber(s.repeat), `${formatNumber(s.newThisMonth)} new this month`, "success")}
      {tile("With dues", formatNumber(s.withDues), `${formatMoney(s.dues, { decimals: 0 })} to collect`, s.withDues ? "warning" : undefined)}
    </Row>
  );
}

function CustomerListRow({ row }: { row: CustomerRow }) {
  const sub = [row.mobile ? maskMobile(row.mobile) : "No mobile", row.city].filter(Boolean).join(" · ");
  const meta = row.bills ? `${row.bills} visit${row.bills === 1 ? "" : "s"} · last ${formatRelative(row.lastVisit).toLowerCase()}` : "No purchases yet";
  return (
    <ListRow
      left={<Avatar name={row.name} size={42} tone={row.balance > 0 ? "warning" : "accent"} />}
      title={row.name}
      subtitle={sub}
      meta={meta}
      right={
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text variant="bodyStrong" tabular>
            {formatMoney(row.spent, { decimals: 0 })}
          </Text>
          {row.balance > 0 ? <Badge label={`Owes ${formatMoney(row.balance, { decimals: 0 })}`} tone="warning" showIcon={false} /> : row.balance < 0 ? <Badge label="Advance" tone="info" showIcon={false} /> : null}
        </View>
      }
      chevron
      onPress={() => router.push({ pathname: "/customers/[id]", params: { id: row.id } })}
      accessibilityLabel={`${row.name}, spent ${formatMoney(row.spent)}, ${meta}${row.balance > 0 ? `, owes ${formatMoney(row.balance)}` : ""}`}
    />
  );
}

/** Customers (owner only): segments, sort, search and profiles. */
export function CustomersScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const owner = isOwner(me);
  const [segment, setSegment] = useState<Segment>("all");
  const [sort, setSort] = useState<Sort>("spent");
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim(), 300);
  const [pulling, setPulling] = useState(false);

  const query = useInfiniteQuery({
    queryKey: ["customers", "list", segment, sort, search],
    queryFn: ({ pageParam }) => api.customers.list({ segment, sort, q: search || undefined, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.reduce((n, p) => n + p.items.length, 0) < last.total && last.items.length >= PAGE_SIZE ? pages.length + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: owner
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const first = query.data?.pages[0];
  const s = first?.summary;

  if (!owner) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
        <Header back title="Customers" />
        <EmptyState icon="lock-closed-outline" tone="warning" title="Owner only" body="Customer profiles are visible to the shop owner." />
      </View>
    );
  }

  const segments: { key: Segment; label: string; count?: number }[] = [
    { key: "all", label: "All", count: s?.customers },
    { key: "repeat", label: "Repeat", count: s?.repeat },
    { key: "new", label: "New", count: s?.newThisMonth },
    { key: "lapsed", label: "Lapsed", count: s?.lapsed },
    { key: "dues", label: "With dues", count: s?.withDues },
    { key: "top", label: "Top" }
  ];

  const refresh = () => {
    setPulling(true);
    query.refetch().finally(() => setPulling(false));
  };

  const empty = () => {
    if (query.isLoading) return <SkeletonList rows={8} />;
    if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
    if (search) return <EmptyState icon="search-outline" title="No match" body={`No customer matches “${search}”.`} action="Clear search" onAction={() => setQ("")} compact />;
    if (segment !== "all") return <EmptyState icon="people-outline" title="Nobody here yet" body="No customer fits this group right now." action="Show all customers" onAction={() => setSegment("all")} compact />;
    return <EmptyState icon="people-outline" title="No customers yet" body="Add a customer's mobile to a bill and they show up here." action="New bill" onAction={() => router.push("/sell")} />;
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
      <Header back title="Customers" subtitle={s ? `${formatNumber(s.customers)} customers` : undefined} />
      <View style={{ gap: theme.space[2], paddingBottom: theme.space[2] }}>
        <View style={{ paddingHorizontal: theme.space[4] }}>
          <SearchBar value={q} onChangeText={setQ} placeholder="Search name, mobile or city" />
        </View>
        <ChipRow options={segments} value={segment} onChange={setSegment} />
      </View>
      <FlashList
        data={items}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <CustomerListRow row={item} />}
        ListHeaderComponent={
          <View>
            {s && !search && segment === "all" ? <SummaryTiles s={s} /> : null}
            <Row gap={3} style={{ paddingHorizontal: theme.space[4], paddingVertical: theme.space[1] }}>
              <Text variant="small" color="textMuted" style={{ flex: 1 }}>
                {first ? `${formatNumber(first.total)} shown` : " "}
              </Text>
              <View style={{ width: 190 }}>
                <Select value={sort} options={sortOptions} onChange={setSort} sheetTitle="Sort customers by" />
              </View>
            </Row>
          </View>
        }
        ListEmptyComponent={empty()}
        ListFooterComponent={query.isFetchingNextPage ? <SkeletonList rows={2} /> : null}
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
