import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { StockItem } from "@/api/types";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useScanListener } from "@/features/scan/scanResult";
import { formatMoneyShort, formatNumber, formatQty } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Chip, ChipRow, EmptyState, ErrorState, Header, Icon, IconButton, ListRow, PressableScale, SearchBar, Sheet, Skeleton, SkeletonList, Text, toast } from "@/ui";
import { findVariantByCode } from "./resolveCode";
import { StockFilterSheet } from "./StockFilterSheet";
import { StockRow } from "./StockRow";
import { activeFilterChips, canSeeCost, clearFacets, defaultStockFilters, facetCount, shortStoreName, statusCounts, stockQuery, type StockFilters, type StockStatus } from "./stockLogic";
import { useDebounced } from "./useDebounced";

const PAGE = 40;

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: "20%", minWidth: theme.fontScale > 1.05 ? 130 : 64, gap: 2 }}>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="title" weight="800" tabular numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Stock tab: every variant with live quantities, search, scan, status chips, filters and store switch. */
export function StockScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const sessionStore = useSession((s) => s.storeId);
  const stores = me?.stores ?? [];
  const [filters, setFilters] = useState<StockFilters>(defaultStockFilters);
  const [text, setText] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const q = useDebounced(text.trim(), 300);
  const effective: StockFilters = { ...filters, q };
  const key = stockQuery(effective);

  const stock = useInfiniteQuery({
    queryKey: ["stock", "list", key],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.stock.list(stockQuery(effective, pageParam)),
    getNextPageParam: (last, pages) => (pages.length * PAGE < last.total ? pages.length + 1 : undefined),
    placeholderData: (previous) => previous
  });
  const first = stock.data?.pages[0];
  const items = stock.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = statusCounts(first?.summary);
  const showCost = canSeeCost(me);
  const allStores = !filters.store && stores.length > 1;
  const chips = activeFilterChips(filters);
  const currentStore = stores.find((s) => s.id === filters.store);
  const filtered = !!q || filters.status !== "all" || chips.length > 0;

  const openItem = useCallback((item: StockItem) => router.push(`/stock/${item.id}`), []);

  const resolve = async (code: string) => {
    setResolving(true);
    try {
      const id = await findVariantByCode(code, sessionStore ?? stores[0]?.id ?? null);
      if (id) {
        haptic.success();
        router.push(`/stock/${id}`);
      } else {
        toast.warning(`No item with barcode ${code}`);
        setText(code);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setResolving(false);
    }
  };

  useScanListener("stock", (code) => {
    void resolve(code);
  });

  const setStatus = (status: StockStatus) => setFilters((f) => ({ ...f, status }));

  const header = (
    <View style={{ gap: theme.space[3], paddingBottom: theme.space[3] }}>
      <ChipRow
        options={[
          { key: "all", label: "All", count: counts?.all },
          { key: "in", label: "In stock", count: counts?.in, icon: "checkmark-circle-outline" },
          { key: "low", label: "Low", count: counts?.low, icon: "alert-circle-outline" },
          { key: "out", label: "Out", count: counts?.out, icon: "close-circle-outline" }
        ]}
        value={filters.status}
        onChange={setStatus}
      />
      {first ? (
        <Animated.View
          entering={theme.reduceMotion ? undefined : FadeInDown.duration(220)}
          style={{
            marginHorizontal: theme.space[4],
            padding: theme.space[4],
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            flexDirection: "row",
            flexWrap: "wrap",
            rowGap: theme.space[3],
            columnGap: theme.space[4]
          }}
          accessibilityLabel={`${first.summary.skus} items, ${formatQty(first.summary.units)} units, worth ${formatMoneyShort(first.summary.mrpValue)} at MRP`}
        >
          <Metric label="SKUs" value={formatNumber(first.summary.skus)} />
          <Metric label="Units" value={formatNumber(first.summary.units)} />
          <Metric label="MRP value" value={formatMoneyShort(first.summary.mrpValue)} />
          {showCost ? <Metric label="Cost value" value={formatMoneyShort(first.summary.costValue)} /> : null}
          <Text variant="caption" color="textFaint" style={{ flexBasis: "100%" }}>
            {currentStore ? shortStoreName(currentStore.name) : stores.length > 1 ? "All your stores" : (stores[0]?.name ?? "")} · totals ignore filters
          </Text>
        </Animated.View>
      ) : stock.isLoading ? (
        <View style={{ marginHorizontal: theme.space[4] }}>
          <Skeleton height={112} radius={theme.radius.card} />
        </View>
      ) : null}
      {chips.length ? (
        <Animated.View layout={theme.reduceMotion ? undefined : LinearTransition} entering={theme.reduceMotion ? undefined : FadeIn} exiting={theme.reduceMotion ? undefined : FadeOut}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: theme.space[4], alignItems: "center" }}>
            {chips.map((chip) => (
              <Chip
                key={chip.key}
                label={chip.label}
                icon="close"
                selected
                onPress={() => setFilters((f) => (chip.key === "sort" ? { ...f, sort: "name" } : { ...f, [chip.key]: null }))}
              />
            ))}
            <Button label="Clear" variant="ghost" size="sm" onPress={() => setFilters((f) => clearFacets(f))} />
          </ScrollView>
        </Animated.View>
      ) : null}
      {first && filtered ? (
        <Text variant="small" color="textMuted" style={{ paddingHorizontal: theme.space[4] }} accessibilityLiveRegion="polite">
          {first.total} match{first.total === 1 ? "" : "es"}
        </Text>
      ) : null}
    </View>
  );

  const empty = stock.isLoading ? (
    <SkeletonList rows={7} />
  ) : stock.isError ? (
    <ErrorState message={errorMessage(stock.error)} onRetry={() => stock.refetch()} />
  ) : filtered ? (
    <EmptyState
      icon="search-outline"
      title="Nothing matches"
      body={q ? `No items for “${q}” with these filters.` : "Try another status or clear the filters."}
      action="Clear filters"
      onAction={() => {
        setText("");
        setFilters((f) => ({ ...clearFacets(f), status: "all" }));
      }}
    />
  ) : (
    <EmptyState
      icon="cube-outline"
      title="No stock yet"
      body="Items appear here after you record a purchase."
      action={can(me, "purchase.create") ? "Record a purchase" : undefined}
      onAction={() => router.push("/purchase")}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
      <Header
        title="Stock"
        large
        right={
          stores.length > 1 ? (
            <PressableScale
              onPress={() => setStoreOpen(true)}
              accessibilityLabel={`Store filter: ${currentStore ? currentStore.name : "All stores"}. Tap to change`}
              scaleTo={0.95}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                minHeight: 40,
                paddingHorizontal: 12,
                borderRadius: theme.radius.pill,
                backgroundColor: currentStore ? theme.colors.accentSoft : theme.colors.surfaceSunken,
                borderWidth: 1,
                borderColor: currentStore ? theme.colors.accentSoft : theme.colors.border,
                maxWidth: 190
              }}
            >
              <Icon name={currentStore ? "storefront" : "albums-outline"} size={16} color={currentStore ? "accentSoftText" : "textMuted"} />
              <Text variant="small" weight="600" numberOfLines={1} color={currentStore ? "accentSoftText" : "text"} style={{ flexShrink: 1 }}>
                {currentStore ? shortStoreName(currentStore.name) : "All stores"}
              </Text>
              <Icon name="chevron-down" size={14} color={currentStore ? "accentSoftText" : "textMuted"} />
            </PressableScale>
          ) : undefined
        }
      />
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: theme.space[4], paddingBottom: theme.space[3] }}>
        <View style={{ flex: 1 }}>
          <SearchBar value={text} onChangeText={setText} placeholder="Search stock" onSubmitEditing={() => text.trim() && resolve(text.trim())} />
        </View>
        <IconButton
          icon="options-outline"
          label={facetCount(filters) ? `Sort and filter, ${facetCount(filters)} active` : "Sort and filter"}
          variant="soft"
          badge={facetCount(filters) || undefined}
          onPress={() => setFilterOpen(true)}
        />
        <PressableScale
          onPress={() => router.push("/scan?target=stock")}
          disabled={resolving}
          accessibilityLabel="Scan a barcode to open the item"
          hapticOnPress
          scaleTo={0.9}
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            backgroundColor: theme.colors.accent,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: theme.colors.accent,
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 3
          }}
        >
          <Icon name={resolving ? "hourglass-outline" : "scan"} size={26} color="accentText" />
        </PressableScale>
      </View>

      <FlashList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <StockRow item={item} stores={stores} showStores={allStores} onPress={openItem} />}
        extraData={allStores}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (stock.hasNextPage && !stock.isFetchingNextPage) void stock.fetchNextPage();
        }}
        ListFooterComponent={
          stock.isFetchingNextPage ? (
            <SkeletonList rows={2} />
          ) : items.length && !stock.hasNextPage && items.length > 8 ? (
            <Text variant="small" color="textFaint" align="center" style={{ padding: theme.space[4] }}>
              That’s all {first?.total} items
            </Text>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={stock.isRefetching && !stock.isFetchingNextPage && !stock.isLoading}
            onRefresh={() => void stock.refetch()}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
      />

      <StockFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        facets={first?.facets}
        total={first?.total}
        loading={stock.isFetching}
      />

      <Sheet visible={storeOpen} onClose={() => setStoreOpen(false)} title="Show stock for" subtitle="Quantities and totals follow this choice">
        <View style={{ marginHorizontal: -theme.space[4] }}>
          {[{ id: "", name: "All stores" }, ...stores].map((store) => {
            const selected = (filters.store ?? "") === store.id;
            return (
              <ListRow
                key={store.id || "all"}
                title={store.id ? shortStoreName(store.name) : store.name}
                subtitle={store.id ? store.name : `${stores.length} stores, with a per-store breakdown`}
                icon={store.id ? "storefront-outline" : "albums-outline"}
                right={selected ? <Icon name="checkmark-circle" color="accent" /> : undefined}
                accessibilityLabel={`${store.name}${selected ? ", selected" : ""}`}
                onPress={() => {
                  setFilters((f) => ({ ...f, store: store.id || null }));
                  setStoreOpen(false);
                }}
              />
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}
