import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeInDown, LinearTransition } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import type { StoreRow } from "@/api/types";
import { formatMoneyShort, formatNumber } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, confirm, EmptyState, ErrorState, Header, IconButton, IconCircle, Row, Screen, SectionTitle, Segmented, Select, Sheet, SkeletonCards, Stack, Text, ToggleRow } from "@/ui";
import { Callout, StickyFooter } from "./components";
import { adminKeys, useAdminMutation, useStores } from "./hooks";

export function storeAddress(store: Pick<StoreRow, "address_line_1" | "address_line_2" | "city" | "state" | "pincode">) {
  return [store.address_line_1, store.address_line_2, store.city, [store.state, store.pincode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: "29%", flexGrow: 0 }}>
      <Text variant="bodyStrong" tabular numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StoreCard({ store, index, onClose, onReopen }: { store: StoreRow; index: number; onClose: () => void; onReopen: () => void }) {
  const theme = useTheme();
  const address = storeAddress(store);
  return (
    <Animated.View entering={theme.reduceMotion ? undefined : FadeInDown.duration(260).delay(Math.min(index, 8) * 50)} layout={theme.reduceMotion ? undefined : LinearTransition}>
      <Card style={{ gap: theme.space[3], opacity: store.is_active ? 1 : 0.92 }}>
        <Row gap={3} align="flex-start">
          <IconCircle icon={store.is_active ? "storefront" : "storefront-outline"} tone={store.is_active ? "accent" : "neutral"} size={44} />
          <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
            <Text variant="title" numberOfLines={2}>
              {store.name}
            </Text>
            {address ? (
              <Text variant="small" color="textMuted" numberOfLines={3}>
                {address}
              </Text>
            ) : null}
          </View>
          <IconButton icon="create-outline" label={`Edit ${store.name}`} variant="soft" size={20} onPress={() => router.push({ pathname: "/stores/edit", params: { id: store.id } })} />
        </Row>
        <Row gap={2} wrap>
          {store.is_active ? <Badge label="Open" tone="success" /> : <Badge label="Closed" tone="danger" icon="lock-closed" />}
          {store.is_discoverable ? <Badge label="On WowCity" tone="info" icon="globe-outline" /> : <Badge label="Hidden from buyers" tone="neutral" icon="eye-off-outline" />}
          {store.invoice_prefix ? <Badge label={`Bill prefix ${store.invoice_prefix}`} tone="neutral" icon="receipt-outline" /> : null}
        </Row>
        {store.stats ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: theme.space[3], columnGap: theme.space[3], padding: theme.space[3], borderRadius: theme.radius.control, backgroundColor: theme.colors.surfaceSunken }}>
            <Stat label="Sales today" value={formatMoneyShort(store.stats.salesToday)} />
            <Stat label="Bills today" value={formatNumber(store.stats.billsToday)} />
            <Stat label="Units in stock" value={formatNumber(store.stats.units)} />
            <Stat label="Items in stock" value={formatNumber(store.stats.skus)} />
            <Stat label="Staff" value={formatNumber(store.stats.staff)} />
          </View>
        ) : null}
        {store.gstin ? (
          <Text variant="caption" color="textMuted" tabular>
            GSTIN {store.gstin}
          </Text>
        ) : null}
        <Row gap={2}>
          <Button label="Edit details" icon="create-outline" variant="secondary" size="sm" onPress={() => router.push({ pathname: "/stores/edit", params: { id: store.id } })} style={{ flex: 1 }} />
          {store.is_active ? (
            <Button label="Close store" icon="lock-closed-outline" variant="ghost" size="sm" onPress={onClose} style={{ flex: 1 }} />
          ) : (
            <Button label="Reopen" icon="lock-open-outline" variant="soft" size="sm" onPress={onReopen} style={{ flex: 1 }} />
          )}
        </Row>
      </Card>
    </Animated.View>
  );
}

function CloseSheet({ store, stores, visible, onClose }: { store: StoreRow | null; stores: StoreRow[]; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const [mode, setMode] = useState<"temporary" | "merge">("temporary");
  const [target, setTarget] = useState<string>("");
  const targets = stores.filter((s) => s.is_active && s.id !== store?.id);
  const storeId = store?.id ?? "";
  const close = useAdminMutation(() => api.stores.close(storeId, mode === "merge" ? { mode, targetStoreId: target } : { mode }), {
    invalidate: [adminKeys.stores, adminKeys.staff],
    refreshMe: true,
    onSuccess: onClose
  });
  const targetName = targets.find((t) => t.id === target)?.name;
  const submit = async () => {
    if (!store) return;
    const ok = await confirm({
      title: `Close ${store.name}?`,
      message:
        mode === "merge"
          ? `All its stock moves to ${targetName}. No one can bill in ${store.name} and it disappears from WowCity. You can reopen it later.`
          : `No one can bill in ${store.name} and it disappears from WowCity. Its stock stays where it is. You can reopen it any time.`,
      confirmLabel: "Close store",
      destructive: true
    });
    if (ok) close.mutate(undefined);
  };
  const lastOpen = targets.length === 0;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={store ? `Close ${store.name}` : "Close store"}
      footer={<Button label="Close store" variant="danger" size="lg" fullWidth disabled={lastOpen || (mode === "merge" && !target)} loading={close.isPending} onPress={submit} />}
    >
      {lastOpen ? (
        <Callout icon="alert-circle-outline" tone="warning">
          This is your only open store. Open or add another store before closing it.
        </Callout>
      ) : (
        <>
          <Segmented
            accessibilityLabel="How to close"
            options={[
              { key: "temporary", label: "Close for now", icon: "pause-circle-outline" },
              { key: "merge", label: "Merge stock", icon: "git-merge-outline" }
            ]}
            value={mode}
            onChange={setMode}
          />
          <Animated.View key={mode} entering={theme.reduceMotion ? undefined : FadeIn.duration(180)} style={{ gap: theme.space[3] }}>
            {mode === "temporary" ? (
              <Text variant="body" color="textMuted">
                For renovations or a season break. Stock stays in this store, staff can’t bill here, and buyers won’t see it.
              </Text>
            ) : (
              <>
                <Text variant="body" color="textMuted">
                  Shutting it for good? Move every item’s stock to another store in one step.
                </Text>
                <Select label="Move stock to" value={target} onChange={setTarget} placeholder="Choose a store" options={targets.map((t) => ({ value: t.id, label: t.name, hint: t.city ?? undefined, icon: "storefront-outline" as const }))} />
              </>
            )}
          </Animated.View>
          <Callout icon="document-text-outline" tone="info">
            Bills and reports from this store are kept.
          </Callout>
        </>
      )}
    </Sheet>
  );
}

function ReopenSheet({ store, visible, onClose }: { store: StoreRow | null; visible: boolean; onClose: () => void }) {
  const [recall, setRecall] = useState(false);
  const storeId = store?.id ?? "";
  const reopen = useAdminMutation(() => api.stores.reopen(storeId, { recallInventory: recall }), { invalidate: [adminKeys.stores, adminKeys.staff], refreshMe: true, onSuccess: onClose });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={store ? `Reopen ${store.name}` : "Reopen store"}
      footer={<Button label="Reopen store" icon="lock-open-outline" variant="success" size="lg" fullWidth loading={reopen.isPending} onPress={() => reopen.mutate(undefined)} />}
    >
      <Text variant="body" color="textMuted">
        Staff assigned to it can bill here again and, if it’s discoverable, buyers see it on WowCity.
      </Text>
      <Card>
        <ToggleRow label="Bring back moved stock" hint="If you merged this store, move that stock back here." value={recall} onChange={setRecall} icon="return-up-back-outline" />
      </Card>
    </Sheet>
  );
}

export function StoresScreen() {
  const query = useStores();
  const stores = query.data?.stores ?? [];
  const open = stores.filter((s) => s.is_active);
  const closed = stores.filter((s) => !s.is_active);
  const [closing, setClosing] = useState<StoreRow | null>(null);
  const [reopening, setReopening] = useState<StoreRow | null>(null);
  const [sheet, setSheet] = useState<null | "close" | "reopen">(null);
  const [sheetKey, setSheetKey] = useState(0);
  const add = () => router.push("/stores/edit");
  return (
    <Screen
      header={<Header back title="Stores" subtitle={query.data ? `${open.length} open${closed.length ? ` · ${closed.length} closed` : ""}` : undefined} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      footerSpace={96}
      footer={
        <StickyFooter>
          <Button label="Add store" icon="add" size="lg" fullWidth onPress={add} />
        </StickyFooter>
      }
    >
      {query.isPending ? (
        <SkeletonCards count={3} height={220} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : !stores.length ? (
        <EmptyState icon="storefront-outline" title="No stores yet" body="Add your shop's address so bills carry it and buyers can find you." action="Add store" onAction={add} />
      ) : (
        <>
          <Stack gap={3}>
            {open.map((store, i) => (
              <StoreCard
                key={store.id}
                store={store}
                index={i}
                onClose={() => {
                  setClosing(store);
                  setSheetKey((k) => k + 1);
                  setSheet("close");
                }}
                onReopen={() => undefined}
              />
            ))}
          </Stack>
          {closed.length ? (
            <Stack gap={3}>
              <SectionTitle title={`Closed (${closed.length})`} />
              {closed.map((store, i) => (
                <StoreCard
                  key={store.id}
                  store={store}
                  index={open.length + i}
                  onClose={() => undefined}
                  onReopen={() => {
                    setReopening(store);
                    setSheetKey((k) => k + 1);
                    setSheet("reopen");
                  }}
                />
              ))}
            </Stack>
          ) : null}
        </>
      )}
      <CloseSheet key={`c${sheetKey}`} store={closing} stores={stores} visible={sheet === "close"} onClose={() => setSheet(null)} />
      <ReopenSheet key={`r${sheetKey}`} store={reopening} visible={sheet === "reopen"} onClose={() => setSheet(null)} />
    </Screen>
  );
}
