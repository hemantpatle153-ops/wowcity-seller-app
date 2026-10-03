import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatMoney, formatQty } from "@/lib/format";
import { useConnectivity } from "@/state/connectivity";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Chip, EmptyState, Icon, IconButton, PressableScale, SearchBar, Segmented, Text, toast } from "@/ui";
import { StorePill } from "@/ui/StorePill";
import { addHitToCart } from "./addToCart";
import { useCart, type CartLine } from "./cart";
import { resolveBarcode, useCatalogSearch, type CatalogHit } from "./catalog";
import { CartLineRow } from "./CartLineRow";
import { balanceBadge, CustomerSheet } from "./CustomerSheet";
import { LineEditSheet } from "./LineEditSheet";
import { ReturnStart } from "./ReturnStart";
import { SearchResults } from "./SearchResults";
import { useCartTotals } from "./totals";

/** POS: scan or search, build the cart, then charge. Works offline. */
export function SellScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ returnBill?: string }>();
  const me = useSession((s) => s.me);
  const storeId = useSession((s) => s.storeId);
  const online = useConnectivity((s) => s.online);
  const cart = useCart();
  const canDiscount = can(me, "sale.discount_override");
  const canSell = can(me, "sale.create");
  const canReturn = can(me, "sale.return");
  const totals = useCartTotals(canDiscount);
  const [q, setQ] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [editing, setEditing] = useState<CartLine | null>(null);
  const search = useCatalogSearch(storeId, q);

  // Opened from a bill's "Return items" action.
  useEffect(() => {
    if (params.returnBill && canReturn && cart.mode !== "return") cart.setMode("return");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.returnBill]);

  useEffect(() => {
    if (!canSell && canReturn && cart.mode !== "return") cart.setMode("return");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSell, canReturn]);

  const pick = (hit: CatalogHit) => {
    const feedback = addHitToCart(hit);
    if (feedback.ok) toast.success(`Added ${feedback.title}`);
    else toast.warning(feedback.title);
    setQ("");
  };

  /** Bluetooth/USB scanner guns type the code and press Enter. */
  const submit = async () => {
    const term = q.trim();
    if (!term || !storeId) return;
    const hit = await resolveBarcode(storeId, term).catch(() => null);
    if (hit) pick(hit);
    else if (search.data?.items.length === 1) pick(search.data.items[0]);
  };

  const remove = (line: CartLine) => {
    cart.remove(line.key);
    toast.info(`Removed ${line.itemName}`, { label: "Undo", onPress: () => useCart.getState().undoRemove() });
  };

  const returnMode = cart.mode === "return";
  const empty = cart.lines.length === 0;
  const primaryLabel = returnMode ? `Refund ${formatMoney(totals.net)}` : cart.billType === "estimate" ? `Save estimate · ${formatMoney(totals.net)}` : `Charge ${formatMoney(totals.net)}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.bg }} behavior="padding">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 12, backgroundColor: theme.colors.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text variant="heading" accessibilityRole="header">
              {returnMode ? "Return" : cart.billType === "estimate" ? "Estimate" : "New bill"}
            </Text>
          </View>
          {!online ? <Badge label="Offline" tone="warning" icon="cloud-offline-outline" /> : null}
          <StorePill />
        </View>
        {canSell && canReturn ? (
          <Segmented
            accessibilityLabel="Bill mode"
            options={[
              { key: "sale", label: "Sale", icon: "cart-outline" },
              { key: "return", label: "Return", icon: "return-down-back-outline" }
            ]}
            value={cart.mode}
            onChange={(mode) => {
              if (!empty && mode !== cart.mode) toast.info("Started a fresh bill");
              cart.setMode(mode);
            }}
          />
        ) : null}
        {!returnMode ? (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <SearchBar value={q} onChangeText={setQ} placeholder="Search item or type barcode" onSubmitEditing={submit} />
            </View>
            <PressableScale
              onPress={() => router.push("/scan?target=sell")}
              accessibilityLabel="Scan barcode with camera"
              hapticOnPress
              scaleTo={0.9}
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: theme.colors.accent,
                shadowOpacity: 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4
              }}
            >
              <Icon name="scan" size={28} color="accentText" />
            </PressableScale>
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: empty ? 24 : 180 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {!returnMode || cart.returnSource ? (
            <Animated.View layout={theme.reduceMotion ? undefined : LinearTransition} style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <PressableScale
                onPress={() => !returnMode && setCustomerOpen(true)}
                disabled={returnMode}
                accessibilityLabel={cart.customer ? `Customer ${cart.customer.name}. Tap to change` : "Add customer"}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 44,
                  paddingHorizontal: 12,
                  borderRadius: theme.radius.pill,
                  backgroundColor: cart.customer ? theme.colors.accentSoft : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: cart.customer ? theme.colors.accentSoft : theme.colors.border,
                  flexShrink: 1
                }}
              >
                <Icon name={cart.customer ? "person" : "person-add-outline"} size={18} color={cart.customer ? "accentSoftText" : "textMuted"} />
                <Text variant="small" weight="700" color={cart.customer ? "accentSoftText" : "text"} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {cart.customer ? cart.customer.name || cart.customer.mobile : "Walk-in · add customer"}
                </Text>
              </PressableScale>
              {cart.customer ? balanceBadge(cart.customer.balance) : null}
              {!returnMode ? (
                <Chip label="Estimate" icon="document-outline" selected={cart.billType === "estimate"} onPress={() => cart.set({ billType: cart.billType === "estimate" ? "invoice" : "estimate" })} />
              ) : null}
              {returnMode && cart.returnSource ? <Badge label={`Against ${cart.returnSource.billNumber}`} tone="info" icon="receipt-outline" /> : null}
            </Animated.View>
          ) : null}

          {q.trim().length >= 2 && !returnMode ? <SearchResults items={search.data?.items} source={search.data?.source} loading={search.isFetching} onPick={pick} query={q} /> : null}

          {returnMode && !cart.returnSource ? <ReturnStart initialBill={params.returnBill} /> : null}

          {empty && !returnMode && q.trim().length < 2 ? (
            <EmptyState
              icon="scan-outline"
              title="Scan or search to start"
              body="Point the camera at a barcode, use a scanner gun, or type the item name."
              action="Open scanner"
              onAction={() => router.push("/scan?target=sell")}
            />
          ) : null}

          {cart.lines.map((line, i) => (
            <CartLineRow
              key={line.key}
              line={line}
              net={Number(totals.lines[i]?.netAmount ?? 0)}
              onQty={(qty) => (qty <= 0 ? remove(line) : cart.setQty(line.key, qty))}
              onRemove={() => remove(line)}
              onEdit={() => setEditing(line)}
              returnMode={returnMode}
              offline={!online}
            />
          ))}

          {!empty ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 }}>
              <Button label="Clear bill" variant="ghost" size="sm" icon="close-circle-outline" onPress={() => cart.reset()} />
              {returnMode && cart.returnSource ? <Button label="Change bill" variant="ghost" size="sm" onPress={() => cart.reset("return")} /> : null}
            </View>
          ) : null}
        </ScrollView>

        {!empty ? (
          <Animated.View
            entering={theme.reduceMotion ? undefined : FadeInDown.springify().damping(18)}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: 16,
              paddingBottom: 12,
              gap: 10,
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text variant="small" color="textMuted" style={{ flex: 1 }}>
                {formatQty(totals.quantity)} item{totals.quantity === 1 ? "" : "s"} · GST {formatMoney(totals.gst, { decimals: 2 })}
                {totals.discount > 0 ? ` · saved ${formatMoney(totals.discount)}` : ""}
              </Text>
              {!returnMode && canDiscount ? <IconButton icon="pricetag-outline" label="Bill discount" onPress={() => router.push("/sell/checkout?focus=discount")} size={20} /> : null}
            </View>
            <Button label={primaryLabel} size="lg" iconRight="arrow-forward" onPress={() => router.push("/sell/checkout")} fullWidth testID="charge" />
          </Animated.View>
        ) : null}
      </View>

      <CustomerSheet visible={customerOpen} onClose={() => setCustomerOpen(false)} current={cart.customer} onPick={cart.setCustomer} />
      <LineEditSheet line={editing} onClose={() => setEditing(null)} canDiscount={canDiscount && !returnMode} />
    </KeyboardAvoidingView>
  );
}
