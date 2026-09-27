import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import { ApiError } from "@/api/errors";
import type { PurchaseResponse } from "@/api/types";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useScanListener } from "@/features/scan/scanResult";
import { formatMoney, formatQty, formatRelative, isoDay } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import {
  AnimatedNumber,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  confirm,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Input,
  ListRow,
  PressableScale,
  Row,
  SectionTitle,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  SkeletonCards,
  Stack,
  Text,
  toast
} from "@/ui";
import { blankItem, draftHasContent, restockItem, usePurchaseDraft, type ItemDraft } from "./draft";
import { ItemCard } from "./ItemCard";
import { calculatePurchase, num } from "./math";
import { buildPurchaseRequest, validateDraft, type ItemErrors } from "./payload";
import { CodeSheet, ItemMenuSheet, NotFoundSheet, SuccessSheet } from "./PurchaseSheets";
import { invalidateAfterPurchase, usePurchaseSetup } from "./queries";
import { SupplierSheet } from "./SupplierSheet";
import { PaymentsCard, TotalsCard } from "./TotalsCard";

function useDraftHydrated() {
  const [hydrated, setHydrated] = useState(() => usePurchaseDraft.persist.hasHydrated());
  useEffect(() => usePurchaseDraft.persist.onFinishHydration(() => setHydrated(true)), []);
  return hydrated;
}

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDay(d);
};

/** Purchase tab: enter a supplier bill as item cards, one-handed, with a draft that survives restarts. */
export function NewPurchaseScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const sessionStoreId = useSession((s) => s.storeId);
  const canCreate = can(me, "purchase.create");
  const canView = can(me, "purchase.view", "purchase.create");
  const hydrated = useDraftHydrated();
  const setupQuery = usePurchaseSetup(canCreate);
  const setup = setupQuery.data;
  const draft = usePurchaseDraft();

  const [supplierOpen, setSupplierOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<ItemDraft | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [looking, setLooking] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Errors show after the first save attempt and then update live as the person fixes them.
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<(PurchaseResponse & { supplier: string | null; billTotal: number }) | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const itemsY = useRef(0);
  const cardY = useRef<Record<string, number>>({});

  // A draft from another shop (someone else signed in on this phone) is not ours to keep.
  useEffect(() => {
    if (!hydrated || !me) return;
    const state = usePurchaseDraft.getState();
    if (state.shopCode && state.shopCode !== me.shopCode) state.reset({ shopCode: me.shopCode });
    else if (!state.shopCode) state.set({ shopCode: me.shopCode });
  }, [hydrated, me]);

  const stores = setup?.stores ?? [];
  const storeId = draft.storeId && stores.some((s) => s.id === draft.storeId) ? draft.storeId : stores.some((s) => s.id === sessionStoreId) ? sessionStoreId : (stores[0]?.id ?? null);
  const totals = calculatePurchase(draft.items, {
    mode: draft.mode,
    extraDiscountPercent: draft.extraDiscountPercent,
    extraDiscountAmount: draft.extraDiscountAmount,
    tcsAmount: draft.tcsAmount,
    roundingMode: setup?.roundingMode
  });
  const supplierInfo = draft.supplier?.id ? setup?.suppliers.find((s) => s.id === draft.supplier?.id) : null;
  const hasContent = draftHasContent(draft);
  const validation = attempted && setup ? validateDraft({ ...draft, storeId }, setup) : null;
  const errors: Record<string, ItemErrors> = validation?.items ?? {};
  const formError = validation?.form ?? serverError;

  const addCard = (item: ItemDraft) => {
    const state = usePurchaseDraft.getState();
    state.setAllCollapsed(true);
    state.addItem(item);
    setServerError(null);
    // Bring the new card into view above the footer.
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: !theme.reduceMotion }), 250);
  };

  const lookup = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code || !setup) return;
    setCodeOpen(false);
    const existing = usePurchaseDraft.getState().items.find((i) => i.entry.toUpperCase() === code);
    if (existing) {
      usePurchaseDraft.getState().updateItem(existing.key, { qty: String(Math.round((num(existing.qty) + 1) * 1000) / 1000) });
      haptic.success();
      toast.success(`${existing.itemName || code}: one more (${formatQty(num(existing.qty) + 1)})`);
      return;
    }
    setLooking(code);
    try {
      const hit = await api.purchases.barcodeLookup(code);
      if (hit.found) {
        addCard(restockItem(setup, hit));
        haptic.success();
        toast.success(`Restocking ${hit.itemName}`);
      } else {
        haptic.warning();
        setNotFound(code);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLooking(null);
    }
  };
  useScanListener("purchase", (code) => void lookup(code));

  const save = useMutation({
    mutationFn: () => {
      const state = usePurchaseDraft.getState();
      return api.purchases.post(buildPurchaseRequest({ ...state, storeId }, setup));
    },
    onSuccess: (result) => {
      const state = usePurchaseDraft.getState();
      haptic.success();
      toast.success(result.message);
      setSuccess({ ...result, supplier: state.supplier?.name ?? null, billTotal: totals.total });
      state.reset({ shopCode: me?.shopCode ?? null, storeId: state.storeId, mode: state.mode });
      setAttempted(false);
      setServerError(null);
      invalidateAfterPurchase(qc);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    },
    onError: (error) => {
      haptic.error();
      const message = errorMessage(error);
      setServerError(message);
      toast.error(message);
      // Server row errors look like "Row 3: HSN must be 4 to 8 digits": open that card.
      const row = /^Row (\d+):/.exec(message);
      const item = row ? usePurchaseDraft.getState().items[Number(row[1]) - 1] : null;
      if (item) {
        usePurchaseDraft.getState().updateItem(item.key, { collapsed: false });
        scrollToCard(item.key);
      }
      if (error instanceof ApiError && error.isNetwork) toast.info("Nothing was lost. Tap Save again when you're back online; it won't be saved twice.");
    }
  });

  const scrollToCard = (key: string) => {
    const y = cardY.current[key];
    if (y !== undefined) setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, itemsY.current + y - 12), animated: !theme.reduceMotion }), 120);
  };

  const submit = async () => {
    const state = usePurchaseDraft.getState();
    const result = validateDraft({ ...state, storeId }, setup);
    setAttempted(true);
    setServerError(null);
    if (result.form) {
      haptic.error();
      if (result.firstInvalid) {
        state.updateItem(result.firstInvalid, { collapsed: false });
        scrollToCard(result.firstInvalid);
      }
      return;
    }
    const failed = state.items.reduce((n, i) => n + i.photos.filter((p) => p.status === "failed").length, 0);
    if (failed) {
      const ok = await confirm({ title: `${failed} photo${failed === 1 ? "" : "s"} didn't upload`, message: "Save the purchase without them? You can add photos later from Online listing.", confirmLabel: "Save without them" });
      if (!ok) return;
    }
    save.mutate();
  };

  const discard = async () => {
    setOptionsOpen(false);
    const ok = await confirm({ title: "Discard this draft?", message: "The supplier, items and photos on this purchase will be cleared.", confirmLabel: "Discard draft", destructive: true });
    if (!ok) return;
    usePurchaseDraft.getState().reset({ shopCode: me?.shopCode ?? null, storeId: draft.storeId, mode: draft.mode });
    setAttempted(false);
    setServerError(null);
    haptic.warning();
  };

  const remove = (item: ItemDraft) => {
    const removed = usePurchaseDraft.getState().removeItem(item.key);
    if (removed) toast.info(`Removed ${item.itemName || "item"}`, { label: "Undo", onPress: () => usePurchaseDraft.getState().restoreItem(removed.item, removed.index) });
  };

  // ---------------------------------------------------------------- states that aren't the form
  const header = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1 }}>
        <Text variant="heading" accessibilityRole="header">
          New purchase
        </Text>
        <Text variant="small" color="textMuted" numberOfLines={1}>
          {hasContent ? `Draft saved ${formatRelative(draft.updatedAt).toLowerCase()}` : "Restock or add new products"}
        </Text>
      </View>
      {canView ? <IconButton icon="receipt-outline" label="Purchase history" onPress={() => router.push("/purchases")} /> : null}
      <IconButton icon="ellipsis-horizontal-circle-outline" label="More options" onPress={() => setOptionsOpen(true)} />
    </View>
  );

  const options = (
    <Sheet visible={optionsOpen} onClose={() => setOptionsOpen(false)} title="Purchases">
      <View style={{ marginHorizontal: -theme.space[4] }}>
        {canView ? <ListRow title="Purchase history" subtitle="Bills from suppliers, returns" icon="receipt-outline" chevron onPress={() => (setOptionsOpen(false), router.push("/purchases"))} /> : null}
        {canView ? <ListRow title="Suppliers" icon="business-outline" chevron onPress={() => (setOptionsOpen(false), router.push("/suppliers"))} /> : null}
        {can(me, "barcode.print", "barcode.view") ? <ListRow title="Barcode labels" subtitle="Print or reprint labels" icon="barcode-outline" chevron onPress={() => (setOptionsOpen(false), router.push("/labels"))} /> : null}
        {draft.items.length > 1 ? <ListRow title="Collapse all items" icon="contract-outline" onPress={() => (setOptionsOpen(false), usePurchaseDraft.getState().setAllCollapsed(true))} /> : null}
        {hasContent ? <ListRow title="Discard draft" subtitle="Start this purchase again" icon="trash-outline" destructive onPress={discard} /> : null}
      </View>
    </Sheet>
  );

  if (!canCreate) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        {header}
        <EmptyState icon="lock-closed-outline" title="Purchases are view-only for you" body="Ask the owner for permission to add purchases." action={canView ? "See purchase history" : undefined} onAction={() => router.push("/purchases")} />
        {options}
      </View>
    );
  }

  if (!hydrated || setupQuery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        {header}
        <View style={{ padding: 16, gap: 16 }} accessibilityLabel="Loading" accessibilityRole="progressbar">
          <Skeleton height={220} radius={theme.radius.card} />
          <Row gap={3}>
            <Skeleton height={56} width="48%" radius={theme.radius.control} />
            <Skeleton height={56} width="48%" radius={theme.radius.control} />
          </Row>
          <SkeletonCards count={2} height={88} />
        </View>
      </View>
    );
  }

  if (setupQuery.isError || !setup) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        {header}
        <ErrorState message={errorMessage(setupQuery.error)} onRetry={() => setupQuery.refetch()} />
        {options}
      </View>
    );
  }

  const itemCount = draft.items.length;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {header}
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Bill details */}
        <Card style={{ gap: 14 }}>
          <PressableScale
            onPress={() => setSupplierOpen(true)}
            scaleTo={0.99}
            accessibilityLabel={draft.supplier ? `Supplier ${draft.supplier.name}. Change` : "Choose supplier"}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 }}
          >
            {draft.supplier ? <Avatar name={draft.supplier.name} size={44} /> : <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Icon name="business-outline" color="accentSoftText" /></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="caption" color="textMuted" weight="700" uppercase>
                Supplier
              </Text>
              <Text variant="bodyStrong" numberOfLines={1} color={draft.supplier ? "text" : "accent"}>
                {draft.supplier?.name ?? "Choose supplier"}
              </Text>
              <Text variant="small" color="textMuted" numberOfLines={1}>
                {draft.supplier
                  ? draft.supplier.id
                    ? [supplierInfo?.gstin, supplierInfo?.state].filter(Boolean).join(" · ") || "No GSTIN on file"
                    : "New supplier · saved with this purchase"
                  : "Optional · needed to record payments and dues"}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color="textFaint" />
          </PressableScale>

          {stores.length > 1 ? (
            <Select
              label="Stock goes to"
              value={storeId}
              options={stores.map((s) => ({ value: s.id, label: s.name, hint: [s.city, s.state].filter(Boolean).join(", "), icon: "storefront-outline" as const }))}
              onChange={(id) => draft.set({ storeId: id })}
              sheetTitle="Store"
            />
          ) : stores[0] ? (
            <Row gap={2}>
              <Icon name="storefront-outline" size={18} color="textMuted" />
              <Text variant="small" color="textMuted">
                Stock goes to {stores[0].name}
              </Text>
            </Row>
          ) : null}

          <View style={{ gap: 6 }}>
            <Text variant="small" weight="600" color="textMuted">
              Purchase rates are
            </Text>
            <Segmented
              accessibilityLabel="GST pricing"
              options={[
                { key: "exclusive", label: "GST extra", icon: "add-circle-outline" },
                { key: "inclusive", label: "GST included", icon: "checkmark-circle-outline" }
              ]}
              value={draft.mode}
              onChange={(mode) => draft.set({ mode })}
            />
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <View style={{ flexGrow: 1, flexBasis: 150, gap: 6 }}>
              <Input
                label="Purchase date"
                value={draft.date}
                onChangeText={(t) => draft.set({ date: t.replace(/[^0-9-]/g, "").slice(0, 10) })}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                icon="calendar-outline"
              />
              <Row gap={2}>
                <Chip label="Today" selected={draft.date === isoDay()} onPress={() => draft.set({ date: isoDay() })} />
                <Chip label="Yesterday" selected={draft.date === yesterday()} onPress={() => draft.set({ date: yesterday() })} />
              </Row>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 150 }}>
              <Input label="Invoice no." value={draft.invoice} onChangeText={(invoice) => draft.set({ invoice: invoice.slice(0, 40) })} placeholder="e.g. RT-118" accessibilityLabel="Supplier invoice number" autoCapitalize="characters" icon="document-text-outline" />
            </View>
          </View>
        </Card>

        {/* Add items */}
        <Stack gap={2}>
          <Row justify="space-between">
            <SectionTitle title={itemCount ? `Items · ${itemCount}` : "Items"} />
            {itemCount ? (
              <Text variant="small" color="textMuted" tabular>
                {formatQty(totals.qty)} pcs
              </Text>
            ) : null}
          </Row>
          <Row gap={3}>
            <PressableScale
              onPress={() => router.push("/scan?target=purchase")}
              hapticOnPress
              scaleTo={0.96}
              accessibilityLabel="Scan existing barcode with the camera"
              style={{ flex: 1, minHeight: 64, borderRadius: theme.radius.card, backgroundColor: theme.colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 12 }}
            >
              {looking ? <Badge label="Looking up…" tone="neutral" icon="search" /> : <Icon name="scan" size={26} color="accentText" />}
              {!looking ? (
                <Text variant="bodyStrong" color="accentText" numberOfLines={2} style={{ flexShrink: 1 }}>
                  Scan barcode
                </Text>
              ) : null}
            </PressableScale>
            <PressableScale
              onPress={() => {
                haptic.tap();
                addCard(blankItem(setup));
              }}
              scaleTo={0.96}
              accessibilityLabel="Add new product"
              style={{ flex: 1, minHeight: 64, borderRadius: theme.radius.card, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderStrong, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 12 }}
            >
              <Icon name="add-circle-outline" size={26} color="accent" />
              <Text variant="bodyStrong" numberOfLines={2} style={{ flexShrink: 1 }}>
                New product
              </Text>
            </PressableScale>
          </Row>
          <Button label="Type a barcode instead" icon="keypad-outline" variant="ghost" size="sm" onPress={() => setCodeOpen(true)} style={{ alignSelf: "center" }} />
        </Stack>

        <View onLayout={(e) => (itemsY.current = e.nativeEvent.layout.y)} style={{ gap: 12 }}>
          {draft.items.map((item, index) => (
            <ItemCard
              key={item.key}
              item={item}
              index={index}
              setup={setup}
              errors={errors[item.key]}
              calc={totals.rows[index]}
              mode={draft.mode}
              onMenu={setMenuItem}
              onLayoutY={(key, y) => (cardY.current[key] = y)}
            />
          ))}
          {!itemCount ? (
            <EmptyState
              compact
              icon="cube-outline"
              title="No items yet"
              body="Scan a barcode to restock something you already sell, or add a new product. Each item is a card you can fill one-handed."
            />
          ) : null}
        </View>

        {itemCount ? (
          <Animated.View entering={theme.reduceMotion ? undefined : FadeInDown.springify().damping(18)} layout={theme.reduceMotion ? undefined : LinearTransition} style={{ gap: 16 }}>
            <Button label="Add another item" icon="add" variant="soft" onPress={() => addCard(blankItem(setup))} />
            <TotalsCard totals={totals} />
            {draft.supplier ? <PaymentsCard total={totals.total} /> : null}
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* Sticky footer in the thumb zone */}
      <Animated.View
        entering={theme.reduceMotion ? undefined : FadeIn}
        style={{
          padding: 16,
          paddingBottom: 12,
          gap: 8,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
          borderTopLeftRadius: theme.radius.sheet,
          borderTopRightRadius: theme.radius.sheet,
          shadowColor: theme.colors.shadow,
          shadowOpacity: 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 8
        }}
      >
        {formError ? (
          <Row gap={2}>
            <Icon name="alert-circle" color="danger" size={18} />
            <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
              {formError}
            </Text>
          </Row>
        ) : null}
        <Row gap={3}>
          <View style={{ flexShrink: 1, minWidth: 96 }}>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"} · ${formatQty(totals.qty)} pcs` : "No items"}
            </Text>
            <AnimatedNumber value={totals.total} variant="title" format={(n) => formatMoney(n, { decimals: "auto" })} />
          </View>
          <Button label="Save purchase" icon="checkmark" size="lg" onPress={submit} loading={save.isPending} disabled={!itemCount} style={{ flex: 1 }} testID="save-purchase" />
        </Row>
      </Animated.View>

      <SupplierSheet
        visible={supplierOpen}
        onClose={() => setSupplierOpen(false)}
        suppliers={setup.suppliers}
        current={draft.supplier}
        onPick={(supplier) => draft.set({ supplier, payments: supplier ? draft.payments : [] })}
      />
      <CodeSheet visible={codeOpen} onClose={() => setCodeOpen(false)} onSubmit={lookup} busy={!!looking} />
      <NotFoundSheet
        code={notFound}
        onClose={() => setNotFound(null)}
        onCreate={(code) => {
          setNotFound(null);
          addCard(blankItem(setup, { entry: code }));
        }}
        onScanAgain={() => {
          setNotFound(null);
          router.push("/scan?target=purchase");
        }}
      />
      <ItemMenuSheet
        item={menuItem}
        onClose={() => setMenuItem(null)}
        onDuplicate={(item) => usePurchaseDraft.getState().duplicateItem(item.key)}
        onAnotherSize={(item) => {
          usePurchaseDraft.getState().duplicateItem(item.key, { size: "", qty: "1", restock: null, entry: "" });
          toast.info("Copied. Pick the new size.");
        }}
        onRemove={remove}
      />
      <SuccessSheet result={success} onClose={() => setSuccess(null)} />
      {options}
    </KeyboardAvoidingView>
  );
}
