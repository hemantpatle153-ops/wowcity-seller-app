import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { ProductListItem } from "@/api/types";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { Thumb } from "@/features/stock/Thumb";
import { useDebounced } from "@/features/stock/useDebounced";
import { formatMoney, formatQty } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, ChipRow, EmptyState, ErrorState, Header, IconCircle, PressableScale, SearchBar, Skeleton, SkeletonList, Text } from "@/ui";

const PAGE = 40;
type Filter = "all" | "live" | "listed" | "unlisted" | "nophoto" | "instock";

function priceRange(p: ProductListItem) {
  if (p.minPrice === null) return "—";
  if (p.maxPrice === null || p.maxPrice === p.minPrice) return formatMoney(p.minPrice);
  return `${formatMoney(p.minPrice)}–${formatMoney(p.maxPrice, { symbol: false })}`;
}

function SummaryTile({ label, value, icon, tone, selected, onPress }: { label: string; value: number; icon: "globe" | "list" | "image-outline" | "alert-circle-outline"; tone: "success" | "info" | "warning" | "accent"; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${label}: ${value}. Show these`}
      accessibilityState={{ selected }}
      scaleTo={0.96}
      style={{
        flexGrow: 1,
        flexBasis: "45%",
        minHeight: 72,
        padding: theme.space[3],
        gap: 4,
        borderRadius: theme.radius.card,
        backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconCircle icon={icon} tone={tone} size={28} />
        <Text variant="heading" tabular>
          {value}
        </Text>
      </View>
      <Text variant="caption" color={selected ? "accentSoftText" : "textMuted"} numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}

function ProductRow({ item, onPress }: { item: ProductListItem; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      accessibilityLabel={[item.name, item.brand, priceRange(item), `${formatQty(item.stock)} in stock`, item.live ? `live in ${item.live} stores` : item.listed ? `listed in ${item.listed} stores, not live` : "not listed", !item.image ? "no photo" : null].filter(Boolean).join(", ")}
      accessibilityHint="Opens the online listing"
      style={{
        flexDirection: "row",
        gap: theme.space[3],
        marginHorizontal: theme.space[4],
        marginBottom: theme.space[2],
        padding: theme.space[3],
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border
      }}
    >
      <Thumb url={item.image} size={64} icon={item.image ? "shirt-outline" : "camera-outline"} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {item.name}
        </Text>
        <Text variant="small" color="textMuted" numberOfLines={1}>
          {[item.brand, item.category, `${item.variants} variant${item.variants === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text variant="body" weight="700" tabular>
            {priceRange(item)}
          </Text>
          <Text variant="small" color={item.stock > 0 ? "textMuted" : "danger"} tabular>
            {item.stock > 0 ? `${formatQty(item.stock)} in stock` : "Out of stock"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {item.live ? (
            <Badge label={`Live in ${item.live} store${item.live === 1 ? "" : "s"}`} tone="success" icon="globe" />
          ) : item.listed ? (
            <Badge label={`Listed · not live`} tone="warning" icon="pause-circle-outline" />
          ) : (
            <Badge label="Not listed" tone="neutral" icon="eye-off-outline" />
          )}
          {!item.image ? <Badge label="No photo" tone="warning" icon="camera-outline" /> : null}
        </View>
      </View>
    </PressableScale>
  );
}

/** `/products`: which products are on WowCity, and which should be. */
export function ProductsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const [filter, setFilter] = useState<Filter>("all");
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const products = useInfiniteQuery({
    queryKey: ["products", "list", filter, q],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.products.list({ q: q || undefined, filter: filter === "all" ? undefined : filter, page: pageParam }),
    getNextPageParam: (last, pages) => (pages.length * PAGE < last.total ? pages.length + 1 : undefined),
    placeholderData: (previous) => previous,
    enabled: can(me, "product.view")
  });
  const first = products.data?.pages[0];
  const items = products.data?.pages.flatMap((p) => p.items) ?? [];
  const s = first?.summary;
  const toggle = (next: Filter) => setFilter(filter === next ? "all" : next);

  const header = (
    <View style={{ gap: theme.space[3], paddingBottom: theme.space[3] }}>
      <View style={{ paddingHorizontal: theme.space[4] }}>
        <SearchBar value={text} onChangeText={setText} placeholder="Search products" />
      </View>
      {s ? (
        <Animated.View entering={theme.reduceMotion ? undefined : FadeInDown.duration(220)} style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space[2], paddingHorizontal: theme.space[4] }}>
          <SummaryTile label="Live on WowCity" value={s.live} icon="globe" tone="success" selected={filter === "live"} onPress={() => toggle("live")} />
          <SummaryTile label="Listed" value={s.listed} icon="list" tone="info" selected={filter === "listed"} onPress={() => toggle("listed")} />
          <SummaryTile label="Need a photo" value={s.noPhoto} icon="image-outline" tone="warning" selected={filter === "nophoto"} onPress={() => toggle("nophoto")} />
          <SummaryTile label={`Not listed · ${s.unlistedInStock} in stock`} value={s.products - s.listed} icon="alert-circle-outline" tone="accent" selected={filter === "unlisted"} onPress={() => toggle("unlisted")} />
        </Animated.View>
      ) : products.isLoading ? (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: theme.space[4] }}>
          <Skeleton height={72} radius={theme.radius.card} style={{ flex: 1 }} />
          <Skeleton height={72} radius={theme.radius.card} style={{ flex: 1 }} />
        </View>
      ) : null}
      <ChipRow
        options={[
          { key: "all", label: "All", count: s?.products },
          { key: "live", label: "Live", count: s?.live },
          { key: "listed", label: "Listed", count: s?.listed },
          { key: "unlisted", label: "Unlisted", count: s ? s.products - s.listed : undefined },
          { key: "nophoto", label: "No photo", count: s?.noPhoto },
          { key: "instock", label: "In stock" }
        ]}
        value={filter}
        onChange={setFilter}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
      <Header back title="Online listing" subtitle="What buyers see on WowCity" />
      <FlashList
        data={items}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <ProductRow item={item} onPress={() => router.push(`/products/${item.id}/listing`)} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !can(me, "product.view") ? (
            <ErrorState message="You don't have permission to see products." />
          ) : products.isLoading ? (
            <SkeletonList rows={6} />
          ) : products.isError ? (
            <ErrorState message={errorMessage(products.error)} onRetry={() => products.refetch()} />
          ) : q || filter !== "all" ? (
            <EmptyState
              icon="search-outline"
              title="Nothing here"
              body={q ? `No products match “${q}”.` : "No products in this view."}
              action="Show all"
              onAction={() => {
                setText("");
                setFilter("all");
              }}
            />
          ) : (
            <EmptyState icon="globe-outline" title="No products yet" body="Products appear after your first purchase." />
          )
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (products.hasNextPage && !products.isFetchingNextPage) void products.fetchNextPage();
        }}
        ListFooterComponent={products.isFetchingNextPage ? <SkeletonList rows={2} /> : null}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={products.isRefetching && !products.isFetchingNextPage && !products.isLoading}
            onRefresh={() => void products.refetch()}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
      />
    </View>
  );
}
