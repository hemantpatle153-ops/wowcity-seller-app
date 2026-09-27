import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useDeferredValue, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "@/api";
import type { SupplierRow } from "@/api/types";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatDate, formatMoney, maskMobile } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, Badge, EmptyState, ErrorState, Header, IconButton, ListRow, PressableScale, Row, SearchBar, Sheet, SkeletonList, Text } from "@/ui";
import { useSuppliers } from "./queries";

function balanceBadge(balance: number | null) {
  if (balance === null) return null;
  if (balance > 0) return <Badge label={`You owe ${formatMoney(balance)}`} tone="warning" icon="time-outline" />;
  if (balance < 0) return <Badge label={`Advance ${formatMoney(-balance)}`} tone="success" />;
  return <Badge label="Settled" tone="neutral" icon="checkmark" />;
}

export function SuppliersScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const list = useSuppliers(query);
  const [picked, setPicked] = useState<SupplierRow | null>(null);
  const suppliers = list.data?.suppliers ?? [];
  const canEdit = can(me, "purchase.create");
  const owed = suppliers.reduce((n, s) => n + Math.max(0, s.balance ?? 0), 0);
  const costVisible = suppliers.some((s) => s.balance !== null);

  const renderRow = ({ item }: { item: SupplierRow }) => (
    <PressableScale
      onPress={() => setPicked(item)}
      scaleTo={0.985}
      accessibilityLabel={`${item.name}${item.active ? "" : ", inactive"}, ${item.bills} bills${item.balance ? `, balance ${formatMoney(item.balance)}` : ""}`}
      style={{ marginHorizontal: 16, padding: 14, gap: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.card, opacity: item.active ? 1 : 0.75 }}
    >
      <Row gap={3} align="flex-start">
        <Avatar name={item.name} tone={item.active ? "accent" : "neutral"} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {[maskMobile(item.mobile), item.gstin, item.state].filter(Boolean).join(" · ") || "No contact details"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text variant="bodyStrong" tabular>
            {item.purchased === null ? "—" : formatMoney(item.purchased, { decimals: 0 })}
          </Text>
          <Text variant="caption" color="textMuted">
            purchased
          </Text>
        </View>
      </Row>
      <Row gap={2} wrap>
        <Badge label={`${item.bills} bill${item.bills === 1 ? "" : "s"}`} icon="receipt-outline" />
        {item.lastPurchase ? <Badge label={`Last ${formatDate(item.lastPurchase)}`} showIcon={false} /> : null}
        {!item.active ? <Badge label="Inactive" tone="neutral" icon="pause-circle-outline" /> : null}
        {balanceBadge(item.balance)}
      </Row>
    </PressableScale>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
      <Header back title="Suppliers" subtitle={costVisible && owed > 0 ? `You owe ${formatMoney(owed, { decimals: 0 })} in all` : undefined} right={canEdit ? <IconButton icon="add-circle" color="accent" label="Add supplier" onPress={() => router.push("/suppliers/edit")} /> : undefined} />
      <FlashList
        data={suppliers}
        keyExtractor={(s) => s.id}
        renderItem={renderRow}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <SearchBar value={q} onChangeText={setQ} placeholder="Name, mobile or GSTIN" />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          list.isLoading ? (
            <SkeletonList rows={6} />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (
            <EmptyState
              icon="business-outline"
              title={query ? "No supplier found" : "No suppliers yet"}
              body={query ? `Nothing matches “${query}”.` : "Add the wholesalers and brands you buy from to track bills and dues."}
              action={canEdit ? "Add supplier" : undefined}
              onAction={() => router.push(query ? `/suppliers/edit?name=${encodeURIComponent(query)}` : "/suppliers/edit")}
            />
          )
        }
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={theme.colors.accent} colors={[theme.colors.accent]} />}
      />
      <Sheet visible={!!picked} onClose={() => setPicked(null)} title={picked?.name} subtitle={picked ? [maskMobile(picked.mobile), picked.gstin].filter(Boolean).join(" · ") || undefined : undefined}>
        {picked ? (
          <View style={{ marginHorizontal: -theme.space[4] }}>
            {picked.balance !== null ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {balanceBadge(picked.balance)}
                {picked.address ? <Badge label={picked.address} icon="location-outline" /> : null}
              </View>
            ) : null}
            {can(me, "reports.due") ? (
              <ListRow
                title="Statement & dues"
                subtitle="Bills, payments and balance"
                icon="document-text-outline"
                chevron
                onPress={() => {
                  setPicked(null);
                  router.push(`/dues/supplier/${picked.id}`);
                }}
              />
            ) : null}
            <ListRow
              title="Purchases"
              subtitle={`${picked.bills} bill${picked.bills === 1 ? "" : "s"}`}
              icon="receipt-outline"
              chevron
              onPress={() => {
                setPicked(null);
                router.push(`/purchases?supplier=${picked.id}`);
              }}
            />
            {canEdit ? (
              <ListRow
                title="Edit details"
                subtitle="Name, mobile, GSTIN, state, address"
                icon="create-outline"
                chevron
                onPress={() => {
                  setPicked(null);
                  router.push(`/suppliers/edit?id=${picked.id}`);
                }}
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
