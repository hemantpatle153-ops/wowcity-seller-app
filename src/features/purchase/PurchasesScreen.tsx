import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useDeferredValue, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { PurchaseListRow } from "@/api/types";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatDate, formatMoney, formatQty, isoDay } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Chip, ChipRow, EmptyState, ErrorState, Header, Icon, IconButton, Input, ListRow, PressableScale, Row, SearchBar, Sheet, SkeletonList, Text } from "@/ui";
import { useSuppliers } from "./queries";

const ranges = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "fy", label: "This FY" },
  { key: "custom", label: "Custom" }
] as const;
type RangeKey = (typeof ranges)[number]["key"];
const statuses = [
  { key: "all", label: "All" },
  { key: "due", label: "Due" },
  { key: "paid", label: "Paid" }
] as const;
type StatusKey = (typeof statuses)[number]["key"];

const PAGE = 40;
const dash = "—";
export const moneyOrDash = (n: number | null | undefined, decimals: number | "auto" = "auto") => (n === null || n === undefined ? dash : formatMoney(n, { decimals }));

function FilterPill({ label, value, onPress, active }: { label: string; value: string; onPress: () => void; active: boolean }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${label}: ${value}. Change`}
      scaleTo={0.95}
      style={{
        minHeight: 40,
        paddingHorizontal: 12,
        borderRadius: theme.radius.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
        backgroundColor: active ? theme.colors.accentSoft : theme.colors.surface,
        marginVertical: 4,
        maxWidth: 240
      }}
    >
      <Text variant="small" color={active ? "accentSoftText" : "textMuted"}>
        {label}
      </Text>
      <Text variant="small" weight="700" color={active ? "accentSoftText" : "text"} numberOfLines={1} style={{ flexShrink: 1 }}>
        {value}
      </Text>
    </PressableScale>
  );
}

export function PurchasesScreen({ initialSupplier = "" }: { initialSupplier?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const [range, setRange] = useState<RangeKey>("30d");
  const [custom, setCustom] = useState(() => {
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { from: isoDay(from), to: isoDay() };
  });
  const [customOpen, setCustomOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(custom);
  const [status, setStatus] = useState<StatusKey>("all");
  const [store, setStore] = useState<string>("");
  const [supplier, setSupplier] = useState<string>(initialSupplier);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const suppliers = useSuppliers("");
  const stores = me?.stores ?? [];
  const filters = { range, from: range === "custom" ? custom.from : undefined, to: range === "custom" ? custom.to : undefined, status: status === "all" ? undefined : status, store: store || undefined, supplier: supplier || undefined, q: query || undefined };
  const list = useInfiniteQuery({
    queryKey: ["purchases", "list", filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.purchases.list({ ...filters, page: pageParam }),
    getNextPageParam: (last, pages) => (pages.length * PAGE < last.total ? pages.length + 1 : undefined)
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const first = list.data?.pages[0];
  const summary = first?.summary;
  const supplierName = suppliers.data?.suppliers.find((s) => s.id === supplier)?.name;
  const filtered = !!(query || status !== "all" || store || supplier);

  const header = (
    <View style={{ gap: 10, paddingBottom: 12 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Supplier or invoice number" />
      </View>
      <ChipRow
        options={ranges.map((r) => ({ key: r.key, label: r.key === "custom" && range === "custom" ? `${formatDate(custom.from)} – ${formatDate(custom.to)}` : r.label, icon: r.key === "custom" ? ("calendar-outline" as const) : undefined }))}
        value={range}
        onChange={(key) => {
          if (key === "custom") {
            setDraftRange(custom);
            setCustomOpen(true);
          } else setRange(key);
        }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: "center" }} style={{ flexGrow: 0 }}>
        {statuses.map((s) => (
          <Chip key={s.key} label={s.label} selected={status === s.key} onPress={() => setStatus(s.key)} icon={s.key === "due" ? "time-outline" : s.key === "paid" ? "checkmark-circle-outline" : undefined} />
        ))}
        <View style={{ width: 1, height: 24, backgroundColor: theme.colors.border, marginHorizontal: 4 }} />
        {stores.length > 1 ? (
          <View style={{ minWidth: 0 }}>
            <SelectPill label="Store" value={store} allLabel="All stores" options={stores.map((s) => ({ value: s.id, label: s.name }))} onChange={setStore} />
          </View>
        ) : null}
        <SelectPill label="Supplier" value={supplier} allLabel="All" options={(suppliers.data?.suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))} onChange={setSupplier} currentLabel={supplierName} />
      </ScrollView>
      {summary ? (
        <View style={{ marginHorizontal: 16, padding: 14, gap: 8, borderRadius: theme.radius.card, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 10, columnGap: 16 }}>
            {[
              { label: "Purchased", value: formatMoney(summary.amount, { decimals: 0 }), tone: "text" as const },
              { label: "GST", value: formatMoney(summary.gst, { decimals: 0 }), tone: "text" as const },
              { label: "Due", value: formatMoney(summary.due, { decimals: 0 }), tone: summary.due > 0 ? ("warning" as const) : ("success" as const) }
            ].map((stat) => (
              <View key={stat.label} style={{ flexGrow: 1, flexBasis: theme.fontScale > 1.1 ? 130 : 88, gap: 2 }} accessible accessibilityLabel={`${stat.label} ${stat.value}`}>
                <Text variant="caption" color="textMuted" weight="700" uppercase>
                  {stat.label}
                </Text>
                <Text variant="title" color={stat.tone} tabular numberOfLines={1} adjustsFontSizeToFit>
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" color="textMuted">
            {summary.bills} bill{summary.bills === 1 ? "" : "s"} · {formatQty(summary.qty)} pcs{filtered ? " · totals for the whole period" : ""}
          </Text>
        </View>
      ) : null}
      {first ? (
        <Text variant="small" color="textMuted" style={{ paddingHorizontal: 16 }}>
          {first.total} bill{first.total === 1 ? "" : "s"} · {formatDate(first.range.from)} to {formatDate(first.range.to)}
        </Text>
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: PurchaseListRow }) => (
    <PressableScale
      onPress={() => router.push(`/purchases/${item.id}`)}
      scaleTo={0.985}
      accessibilityLabel={`${item.supplier}, ${item.invoice ? `invoice ${item.invoice}, ` : ""}${formatDate(item.date)}, ${formatQty(item.qty)} pieces, ${moneyOrDash(item.amount)}${item.due ? `, due ${formatMoney(item.due)}` : ""}`}
      style={{ marginHorizontal: 16, padding: 14, gap: 6, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.card }}
    >
      <Row gap={3} align="flex-start">
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1} color={item.supplierId ? "text" : "textMuted"}>
            {item.supplier}
          </Text>
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {[item.invoice ? `Inv ${item.invoice}` : "No invoice no.", formatDate(item.date)].join(" · ")}
          </Text>
        </View>
        <Text variant="bodyStrong" tabular>
          {moneyOrDash(item.amount)}
        </Text>
      </Row>
      <Row gap={2} wrap>
        <Badge label={`${formatQty(item.qty)} pcs`} icon="cube-outline" />
        {stores.length > 1 ? <Badge label={item.store} icon="storefront-outline" /> : null}
        {item.due === null ? null : item.due > 0 ? <Badge label={`Due ${formatMoney(item.due)}`} tone="warning" icon="time-outline" /> : <Badge label="Paid" tone="success" />}
      </Row>
    </PressableScale>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
      <Header
        back
        title="Purchases"
        right={
          <Row gap={0}>
            <IconButton icon="business-outline" label="Suppliers" onPress={() => router.push("/suppliers")} />
            {can(me, "purchase.create") ? <IconButton icon="add-circle" label="New purchase" color="accent" onPress={() => router.navigate("/purchase")} /> : null}
          </Row>
        }
      />
      <FlashList
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          list.isLoading ? (
            <SkeletonList rows={6} withAvatar={false} />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (
            <EmptyState
              icon="cube-outline"
              title={filtered ? "No matching purchases" : "No purchases in this period"}
              body={filtered ? "Try another filter or clear the search." : "Supplier bills you enter show up here."}
              action={filtered ? "Clear filters" : can(me, "purchase.create") ? "New purchase" : undefined}
              onAction={() => {
                if (filtered) {
                  setQ("");
                  setStatus("all");
                  setStore("");
                  setSupplier("");
                } else router.navigate("/purchase");
              }}
            />
          )
        }
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={<View style={{ minHeight: 24 }}>{list.isFetchingNextPage ? <SkeletonList rows={2} withAvatar={false} /> : null}</View>}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => list.refetch()} tintColor={theme.colors.accent} colors={[theme.colors.accent]} />}
      />
      <Sheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom dates"
        footer={
          <Button
            label="Show purchases"
            size="lg"
            fullWidth
            disabled={!/^\d{4}-\d{2}-\d{2}$/.test(draftRange.from) || !/^\d{4}-\d{2}-\d{2}$/.test(draftRange.to) || draftRange.from > draftRange.to}
            onPress={() => {
              setCustom(draftRange);
              setRange("custom");
              setCustomOpen(false);
            }}
          />
        }
      >
        <Input label="From" value={draftRange.from} onChangeText={(t) => setDraftRange({ ...draftRange, from: t.replace(/[^0-9-]/g, "").slice(0, 10) })} placeholder="YYYY-MM-DD" icon="calendar-outline" />
        <Input
          label="To"
          value={draftRange.to}
          onChangeText={(t) => setDraftRange({ ...draftRange, to: t.replace(/[^0-9-]/g, "").slice(0, 10) })}
          placeholder="YYYY-MM-DD"
          icon="calendar-outline"
          error={draftRange.from > draftRange.to ? "The start date is after the end date." : null}
        />
      </Sheet>
    </View>
  );
}

/** A filter pill that opens a searchable list; the first option clears the filter. */
function SelectPill({ label, value, allLabel, options, onChange, currentLabel }: { label: string; value: string; allLabel: string; options: { value: string; label: string }[]; onChange: (v: string) => void; currentLabel?: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ("");
  };
  return (
    <>
      <FilterPill label={label} value={value ? (currentLabel ?? options.find((o) => o.value === value)?.label ?? "…") : allLabel} active={!!value} onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.length > 8 ? <SearchBar value={q} onChangeText={setQ} placeholder={`Search ${label.toLowerCase()}`} /> : null}
        <View style={{ marginHorizontal: -theme.space[4] }}>
          {[{ value: "", label: allLabel }, ...shown].map((o) => (
            <ListRow
              key={o.value || "all"}
              title={o.label}
              right={o.value === value ? <Icon name="checkmark-circle" color="accent" /> : undefined}
              accessibilityLabel={`${o.label}${o.value === value ? ", selected" : ""}`}
              onPress={() => pick(o.value)}
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}
