import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "@/api";
import { can } from "@/auth/permissions";
import { useCurrentStore, useSession } from "@/auth/session";
import { useCart, type CartPayment, type PayMode } from "@/features/sell/cart";
import { balanceBadge, CustomerSheet } from "@/features/sell/CustomerSheet";
import { useLastReceipt } from "@/features/sell/lastReceipt";
import { saveCurrentBill } from "@/features/sell/save";
import { quickCash } from "@/features/sell/tender";
import { useCartTotals } from "@/features/sell/totals";
import { formatMoney, formatQty, toNumber } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { printReceipt } from "@/printing/print";
import { QrCode } from "@/printing/QrCode";
import { upiUri } from "@/printing/receipt";
import { usePreferences } from "@/state/preferences";
import { useConnectivity } from "@/state/connectivity";
import { useTheme } from "@/theme/ThemeProvider";
import { AnimatedNumber, Badge, Button, Card, Chip, Divider, Header, Icon, IconButton, Input, PressableScale, Row, Screen, SectionTitle, Segmented, Sheet, Stack, Text, toast, ToggleRow } from "@/ui";

const modes: { key: PayMode | "credit"; label: string; icon: "cash-outline" | "qr-code-outline" | "card-outline" | "time-outline" | "ellipsis-horizontal" }[] = [
  { key: "cash", label: "Cash", icon: "cash-outline" },
  { key: "upi", label: "UPI", icon: "qr-code-outline" },
  { key: "card", label: "Card", icon: "card-outline" },
  { key: "credit", label: "Credit", icon: "time-outline" }
];

function TotalRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "success" | "textMuted" }) {
  return (
    <Row justify="space-between">
      <Text variant={strong ? "title" : "body"} color={tone ?? (strong ? "text" : "textMuted")}>
        {label}
      </Text>
      <Text variant={strong ? "title" : "body"} weight={strong ? "800" : "500"} color={tone ?? "text"} tabular>
        {value}
      </Text>
    </Row>
  );
}

export default function Checkout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ focus?: string }>();
  const me = useSession((s) => s.me)!;
  const store = useCurrentStore();
  const online = useConnectivity((s) => s.online);
  const cart = useCart();
  const canDiscount = can(me, "sale.discount_override");
  const totals = useCartTotals(canDiscount);
  const autoPrint = usePreferences((s) => s.autoPrintAfterSave);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [upiOpen, setUpiOpen] = useState(false);
  const [saving, setSaving] = useState<null | "save" | "print">(null);
  const [error, setError] = useState<string | null>(null);
  const [credit, setCredit] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const returnMode = cart.mode === "return";
  const estimate = cart.billType === "estimate";

  // Start with the whole amount in cash; the cashier changes it if needed.
  useEffect(() => {
    if (!returnMode && !estimate && cart.payments.length === 0 && totals.net > 0) cart.setPayments([{ mode: "cash", amount: String(totals.net) }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!cart.lines.length) {
    return (
      <Screen header={<Header back title="Checkout" />}>
        <Text color="textMuted">The bill is empty.</Text>
        <Button label="Back to billing" onPress={() => router.back()} />
      </Screen>
    );
  }

  const payments = cart.payments;
  const setPayment = (index: number, patch: Partial<CartPayment>) => cart.setPayments(payments.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const paidSoFar = payments.reduce((s, p) => s + toNumber(p.amount), 0);
  const remaining = Math.max(0, Math.round((totals.net - paidSoFar) * 100) / 100);

  const chooseMode = (mode: PayMode | "credit") => {
    haptic.select();
    if (mode === "credit") {
      setCredit(true);
      cart.setPayments([]);
      if (!cart.customer) setCustomerOpen(true);
      return;
    }
    setCredit(false);
    if (payments.length <= 1) cart.setPayments([{ mode, amount: String(totals.net) }]);
    else if (!payments.some((p) => p.mode === mode)) cart.setPayments([...payments, { mode, amount: String(remaining) }]);
    if (mode === "upi" && me.settings.upiId) setUpiOpen(true);
  };

  const due = returnMode || estimate ? 0 : totals.due;
  const needsCustomer = (due > 0 || (returnMode && cart.refundMode === "credit_note")) && !cart.customer;
  const advance = cart.customer?.balance && cart.customer.balance < 0 ? -cart.customer.balance : 0;
  const discountPct = toNumber(cart.extraDiscountPercent);

  const save = async (print: boolean) => {
    if (!store) return;
    if (needsCustomer) {
      haptic.warning();
      setError(returnMode ? "Add the customer to give a credit note." : "Add the customer to keep the balance as due.");
      setCustomerOpen(true);
      return;
    }
    setSaving(print ? "print" : "save");
    setError(null);
    const change = totals.change;
    try {
      const result = await saveCurrentBill({ me, store: { id: store.id, name: store.name, state: store.state, city: store.city }, totals, canDiscount, printIntent: print ? "print" : "none" });
      haptic.success();
      useLastReceipt.getState().set(result, change);
      if (print || autoPrint) printReceipt(result.receipt).catch((e) => toast.error(errorMessage(e)));
      router.replace("/sell/receipt");
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  const title = returnMode ? "Refund" : estimate ? "Estimate" : "Checkout";
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        header={
          <Header
            back
            title={title}
            subtitle={`${formatQty(totals.quantity)} items${cart.customer ? ` · ${cart.customer.name}` : ""}`}
            right={!online ? <Badge label="Offline" tone="warning" icon="cloud-offline-outline" /> : undefined}
          />
        }
        footerSpace={150}
        footer={
          <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12), gap: 8, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border }}>
            {error ? (
              <Row gap={2}>
                <Icon name="alert-circle" color="danger" size={18} />
                <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
                  {error}
                </Text>
              </Row>
            ) : null}
            <Row gap={2}>
              <Button label="Save" variant="secondary" size="lg" onPress={() => save(false)} loading={saving === "save"} disabled={!!saving} style={{ flex: 1 }} />
              <Button
                label={online ? "Save & print" : "Save offline & print"}
                icon="print-outline"
                size="lg"
                onPress={() => save(true)}
                loading={saving === "print"}
                disabled={!!saving}
                style={{ flex: 1.6 }}
                testID="save-print"
              />
            </Row>
          </View>
        }
      >
        <Card style={{ alignItems: "center", gap: 4, paddingVertical: 20 }}>
          <Text variant="small" color="textMuted" uppercase weight="700">
            {returnMode ? "Refund amount" : estimate ? "Estimate total" : "To collect"}
          </Text>
          <AnimatedNumber value={totals.net} variant="hero" format={(n) => formatMoney(n, { decimals: "auto" })} />
          {totals.savings > 0 && !returnMode ? <Badge label={`Customer saves ${formatMoney(totals.savings)} on MRP`} tone="success" icon="sparkles" /> : null}
          <PressableScale
            onPress={() => setShowBreakdown(!showBreakdown)}
            accessibilityLabel={showBreakdown ? "Hide tax breakdown" : "Show tax breakdown"}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 40, paddingHorizontal: 8 }}
          >
            <Text variant="small" color="accent" weight="700">
              {showBreakdown ? "Hide breakdown" : "Tax & discount breakdown"}
            </Text>
            <Icon name={showBreakdown ? "chevron-up" : "chevron-down"} size={16} color="accent" />
          </PressableScale>
          {showBreakdown ? (
            <View style={{ alignSelf: "stretch", gap: 6, paddingTop: 8 }}>
              <TotalRow label="MRP total" value={formatMoney(totals.mrp, { decimals: 2 })} />
              {totals.discount > 0 ? <TotalRow label="Discount" value={`−${formatMoney(totals.discount, { decimals: 2 })}`} tone="success" /> : null}
              <TotalRow label="Taxable value" value={formatMoney(totals.taxable, { decimals: 2 })} />
              {totals.interState ? (
                <TotalRow label="IGST" value={formatMoney(totals.igst, { decimals: 2 })} />
              ) : (
                <TotalRow label="CGST + SGST" value={`${formatMoney(totals.cgst, { decimals: 2 })} + ${formatMoney(totals.sgst, { decimals: 2 })}`} />
              )}
              {totals.roundOff !== 0 ? <TotalRow label="Round off" value={formatMoney(totals.roundOff, { decimals: 2, sign: true })} /> : null}
              <Divider />
              <TotalRow label="Net" value={formatMoney(totals.net, { decimals: 2 })} strong />
            </View>
          ) : null}
        </Card>

        {/* Customer */}
        <Card onPress={returnMode ? undefined : () => setCustomerOpen(true)} accessibilityLabel={cart.customer ? `Customer ${cart.customer.name}. Change` : "Add customer"}>
          <Row gap={3}>
            <Icon name={cart.customer ? "person-circle" : "person-add-outline"} size={28} color={needsCustomer ? "danger" : "accent"} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{cart.customer ? cart.customer.name || cart.customer.mobile : "Walk-in customer"}</Text>
              <Text variant="small" color={needsCustomer ? "danger" : "textMuted"}>
                {needsCustomer ? "Needed for credit" : cart.customer ? cart.customer.mobile : "Add for WhatsApp receipts and credit"}
              </Text>
            </View>
            {balanceBadge(cart.customer?.balance)}
            {!returnMode ? <Icon name="chevron-forward" color="textFaint" /> : null}
          </Row>
        </Card>

        {returnMode ? (
          <Stack gap={2}>
            <SectionTitle title="Refund as" />
            <Segmented
              options={[
                { key: "cash", label: "Cash back", icon: "cash-outline" },
                { key: "credit_note", label: "Credit note", icon: "document-text-outline" }
              ]}
              value={cart.refundMode}
              onChange={(v) => cart.set({ refundMode: v })}
            />
            <Text variant="small" color="textMuted">
              {cart.refundMode === "credit_note" ? "The amount is kept as the customer's advance for their next purchase." : "Hand the refund to the customer in cash."}
            </Text>
          </Stack>
        ) : null}

        {!returnMode && canDiscount ? (
          <Stack gap={2}>
            <SectionTitle title="Bill discount" />
            <Card style={{ gap: 12 }}>
              <Row gap={2} wrap>
                {[0, 5, 10, 15, 20].map((p) => (
                  <Chip
                    key={p}
                    label={p ? `${p}%` : "None"}
                    selected={discountPct === p && !toNumber(cart.extraDiscountAmount)}
                    onPress={() => cart.set({ extraDiscountPercent: p ? String(p) : "", extraDiscountAmount: "" })}
                  />
                ))}
              </Row>
              <Row gap={3}>
                <Input
                  label="Percent"
                  value={cart.extraDiscountPercent}
                  onChangeText={(t) => cart.set({ extraDiscountPercent: t.replace(/[^0-9.]/g, "") })}
                  keyboardType="decimal-pad"
                  containerStyle={{ flex: 1 }}
                  autoFocus={params.focus === "discount"}
                  error={discountPct > 100 ? "Up to 100%" : null}
                />
                <Input
                  label="Flat off"
                  prefix="₹"
                  value={cart.extraDiscountAmount}
                  onChangeText={(t) => cart.set({ extraDiscountAmount: t.replace(/[^0-9.]/g, "") })}
                  keyboardType="decimal-pad"
                  containerStyle={{ flex: 1 }}
                />
              </Row>
            </Card>
          </Stack>
        ) : null}

        {!returnMode && !estimate ? (
          <Stack gap={2}>
            <SectionTitle
              title="Payment"
              action={payments.length && !credit ? "Split" : undefined}
              onAction={() => cart.setPayments([...payments, { mode: payments.some((p) => p.mode === "upi") ? "card" : "upi", amount: String(remaining) }])}
            />
            <Row gap={2} wrap>
              {modes.map((m) => (
                <Chip key={m.key} label={m.label} icon={m.icon} selected={m.key === "credit" ? credit : !credit && payments.some((p) => p.mode === m.key)} onPress={() => chooseMode(m.key)} />
              ))}
            </Row>
            {payments.map((p, i) => (
              <Card key={i} style={{ gap: 10 }}>
                <Row gap={2}>
                  <Icon name={modes.find((m) => m.key === p.mode)?.icon ?? "cash-outline"} color="accent" />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {modes.find((m) => m.key === p.mode)?.label ?? "Other"}
                  </Text>
                  {p.mode === "upi" && me.settings.upiId ? <Button label="Show QR" size="sm" variant="soft" icon="qr-code-outline" onPress={() => setUpiOpen(true)} /> : null}
                  {payments.length > 1 ? <IconButton icon="close" label="Remove payment" size={18} onPress={() => cart.setPayments(payments.filter((_, j) => j !== i))} /> : null}
                </Row>
                <Input
                  value={p.amount}
                  onChangeText={(t) => setPayment(i, { amount: t.replace(/[^0-9.]/g, "") })}
                  prefix="₹"
                  keyboardType="decimal-pad"
                  large
                  accessibilityLabel={`${p.mode} amount`}
                />
                {p.mode === "cash" ? (
                  <Row gap={2} wrap>
                    {quickCash(totals.net).map((amount) => (
                      <Chip key={amount} label={formatMoney(amount)} selected={toNumber(p.amount) === amount} onPress={() => setPayment(i, { amount: String(amount) })} />
                    ))}
                  </Row>
                ) : p.mode !== "other" ? (
                  <Input
                    value={p.referenceNo ?? ""}
                    onChangeText={(t) => setPayment(i, { referenceNo: t })}
                    placeholder={p.mode === "upi" ? "UPI ref (optional)" : "Card last 4 / slip no. (optional)"}
                  />
                ) : null}
              </Card>
            ))}
            {credit ? (
              <Card style={{ backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningSoft }}>
                <Row gap={2}>
                  <Icon name="time-outline" color="warning" />
                  <Text variant="small" color="warning" weight="600" style={{ flex: 1 }}>
                    Full amount {formatMoney(totals.net)} will be added to {cart.customer?.name ?? "the customer"}&apos;s dues.
                  </Text>
                </Row>
              </Card>
            ) : null}
            <Card style={{ gap: 8 }}>
              <TotalRow label="Received" value={formatMoney(totals.tendered, { decimals: "auto" })} />
              {totals.change > 0 ? (
                <Row justify="space-between">
                  <Text variant="title" color="success">
                    Change to return
                  </Text>
                  <AnimatedNumber value={totals.change} variant="heading" color="success" format={(n) => formatMoney(n)} />
                </Row>
              ) : null}
              {due > 0 ? (
                <Row justify="space-between">
                  <Text variant="title" color="warning">
                    On credit (due)
                  </Text>
                  <Text variant="heading" color="warning" tabular>
                    {formatMoney(due)}
                  </Text>
                </Row>
              ) : null}
            </Card>
            {advance > 0 ? (
              <ToggleRow
                label={`Use advance (${formatMoney(advance)})`}
                hint="Take this bill out of the customer's advance first."
                value={cart.useAdvance}
                onChange={(v) => cart.set({ useAdvance: v })}
                icon="wallet-outline"
              />
            ) : null}
            {totals.change > 0 && cart.customer?.id ? (
              <ToggleRow
                label="Keep change as advance"
                hint={`Don't hand back ${formatMoney(totals.change)}; save it for the next visit.`}
                value={cart.creditChangeToAccount}
                onChange={(v) => cart.set({ creditChangeToAccount: v })}
                icon="save-outline"
              />
            ) : null}
          </Stack>
        ) : null}

        {!returnMode ? (
          <Stack gap={2}>
            <SectionTitle title="Bill options" />
            <Card padded={false} style={{ paddingHorizontal: 16 }}>
              <ToggleRow
                label="Estimate only"
                hint="A quote for the customer. Stock doesn't change."
                value={estimate}
                onChange={(v) => cart.set({ billType: v ? "estimate" : "invoice" })}
                icon="document-outline"
              />
              {canDiscount ? (
                <ToggleRow
                  label="Prices exclude GST"
                  hint="Add GST on top of the item prices."
                  value={cart.taxType === "exclusive"}
                  onChange={(v) => cart.set({ taxType: v ? "exclusive" : "inclusive" })}
                  icon="calculator-outline"
                />
              ) : null}
            </Card>
          </Stack>
        ) : null}
      </Screen>

      <CustomerSheet visible={customerOpen} onClose={() => setCustomerOpen(false)} current={cart.customer} onPick={cart.setCustomer} />
      <Sheet visible={upiOpen} onClose={() => setUpiOpen(false)} title="Scan to pay by UPI" subtitle={me.settings.upiId ?? undefined}>
        {me.settings.upiId ? (
          <View style={{ alignItems: "center", gap: 12, paddingBottom: 8 }}>
            <QrCode value={upiUri(me.settings.upiId, me.shopName, toNumber(payments.find((p) => p.mode === "upi")?.amount ?? totals.net), "Bill")} size={240} label="UPI payment QR" />
            <Text variant="display" tabular>
              {formatMoney(toNumber(payments.find((p) => p.mode === "upi")?.amount ?? totals.net))}
            </Text>
            <Text variant="small" color="textMuted" align="center">
              Ask the customer to scan with any UPI app. Save the bill once the payment shows on your phone.
            </Text>
            <Button label="Payment received" icon="checkmark-circle" size="lg" fullWidth onPress={() => setUpiOpen(false)} />
          </View>
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}
