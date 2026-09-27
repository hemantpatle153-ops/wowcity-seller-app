import { View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { formatMoney, formatQty } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { uuid } from "@/lib/id";
import { useTheme } from "@/theme/ThemeProvider";
import { AnimatedNumber, Badge, Button, Card, Chip, Divider, IconButton, Input, Row, SectionTitle, Select, Stack, Text } from "@/ui";
import { usePurchaseDraft, type PaymentDraft, type PayMode } from "./draft";
import { MoneyInput, Pair } from "./ItemCard";
import { purchaseDue, typingDecimal, type PurchaseTotals } from "./math";
import { payModes } from "./queries";

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "success" | "textMuted" }) {
  return (
    <Row justify="space-between" gap={3}>
      <Text variant={strong ? "title" : "body"} color={strong ? "text" : "textMuted"} style={{ flexShrink: 1 }}>
        {label}
      </Text>
      <Text variant={strong ? "title" : "body"} weight={strong ? "800" : "500"} color={tone ?? "text"} tabular>
        {value}
      </Text>
    </Row>
  );
}

const m = (n: number) => formatMoney(n, { decimals: 2 });

/** Bill totals preview with bill discount and TCS. The server recomputes on save. */
export function TotalsCard({ totals }: { totals: PurchaseTotals }) {
  const draft = usePurchaseDraft();
  return (
    <Stack gap={2}>
      <SectionTitle title="Bill total" />
      <Card style={{ gap: 10 }}>
        <View style={{ alignItems: "center", gap: 2, paddingVertical: 4 }}>
          <Text variant="small" color="textMuted" weight="700" uppercase>
            Purchase total
          </Text>
          <AnimatedNumber value={totals.total} variant="hero" format={(n) => formatMoney(n, { decimals: "auto" })} />
          <Text variant="small" color="textMuted" tabular>
            {formatQty(totals.qty)} pcs · {draft.items.length} item{draft.items.length === 1 ? "" : "s"} · GST {draft.mode === "inclusive" ? "included" : "extra"}
          </Text>
        </View>
        <Divider />
        <Line label="Gross (qty × rate)" value={m(totals.gross)} />
        {totals.lineDiscount > 0 ? <Line label="Item discounts" value={`−${m(totals.lineDiscount)}`} tone="success" /> : null}
        {totals.extraDiscount > 0 ? <Line label="Bill discount" value={`−${m(totals.extraDiscount)}`} tone="success" /> : null}
        <Line label="Taxable value" value={m(totals.taxable)} />
        <Line label="GST" value={m(totals.gst)} />
        {totals.tcs > 0 ? <Line label="TCS" value={m(totals.tcs)} /> : null}
        {totals.roundOff !== 0 ? <Line label="Round off" value={formatMoney(totals.roundOff, { decimals: 2, sign: true })} /> : null}
        {totals.mrpValue > 0 ? <Line label="Stock value at MRP" value={m(totals.mrpValue)} /> : null}
        <Divider />
        <Text variant="small" weight="700" color="textMuted">
          Bill discount and TCS
        </Text>
        <Row gap={2} wrap>
          {[0, 2, 5, 10].map((p) => (
            <Chip
              key={p}
              label={p ? `${p}%` : "None"}
              selected={(draft.extraDiscountPercent || "0") === String(p) && !draft.extraDiscountAmount}
              onPress={() => draft.set({ extraDiscountPercent: p ? String(p) : "", extraDiscountAmount: "" })}
            />
          ))}
        </Row>
        <Pair>
          <View style={{ flexGrow: 1, flexBasis: 120 }}>
            <Input
              label="Discount %"
              value={draft.extraDiscountPercent}
              onChangeText={(t) => draft.set({ extraDiscountPercent: typingDecimal(t, 3) })}
              keyboardType="decimal-pad"
              placeholder="0"
              right={
                <Text variant="body" color="textMuted">
                  %
                </Text>
              }
            />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 120 }}>
            <MoneyInput label="Discount ₹" value={draft.extraDiscountAmount} onChangeText={(extraDiscountAmount) => draft.set({ extraDiscountAmount })} places={2} />
          </View>
        </Pair>
        <MoneyInput label="TCS ₹" value={draft.tcsAmount} onChangeText={(tcsAmount) => draft.set({ tcsAmount })} places={2} hint="Tax collected at source, if the supplier charged it." />
      </Card>
    </Stack>
  );
}

/** What was paid to the supplier on this bill; the rest stays as due. */
export function PaymentsCard({ total }: { total: number }) {
  const theme = useTheme();
  const draft = usePurchaseDraft();
  const payments = draft.payments;
  const { paid, due, over } = purchaseDue(total, payments);
  const setPayment = (key: string, patch: Partial<PaymentDraft>) => draft.set({ payments: payments.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const add = (mode: PayMode, amount: string) => {
    haptic.select();
    draft.set({ payments: [...payments, { key: uuid(), mode, amount, referenceNo: "" }].slice(0, 6) });
  };
  return (
    <Stack gap={2}>
      <SectionTitle title="Paid to supplier" />
      <Card style={{ gap: 12 }}>
        <Row gap={2} wrap>
          <Chip label="Nothing paid" icon="time-outline" selected={!payments.length} onPress={() => draft.set({ payments: [] })} />
          <Chip
            label="Paid in full"
            icon="checkmark-done"
            selected={payments.length === 1 && due === 0 && over === 0 && total > 0}
            onPress={() => draft.set({ payments: [{ key: uuid(), mode: payments[0]?.mode ?? "cash", amount: String(total), referenceNo: payments[0]?.referenceNo ?? "" }] })}
          />
        </Row>
        {payments.map((p, index) => (
          <Animated.View
            key={p.key}
            entering={theme.reduceMotion ? undefined : FadeIn.duration(180)}
            exiting={theme.reduceMotion ? undefined : FadeOut.duration(150)}
            layout={theme.reduceMotion ? undefined : LinearTransition}
            style={{ gap: 8, padding: 12, borderRadius: theme.radius.control, backgroundColor: theme.colors.surfaceSunken }}
          >
            <Row gap={2} align="flex-end">
              <View style={{ flex: 1 }}>
                <Select
                  label={`Payment ${index + 1}`}
                  value={p.mode}
                  options={payModes.map((mode) => ({ value: mode.key, label: mode.label, icon: mode.icon }))}
                  onChange={(mode) => setPayment(p.key, { mode })}
                  sheetTitle="Paid by"
                />
              </View>
              <IconButton icon="trash-outline" label={`Remove payment ${index + 1}`} color="danger" onPress={() => draft.set({ payments: payments.filter((x) => x.key !== p.key) })} />
            </Row>
            <MoneyInput label="Amount" value={p.amount} onChangeText={(amount) => setPayment(p.key, { amount })} places={2} />
            {p.mode !== "cash" ? (
              <Input
                label="Reference (UTR, cheque no.)"
                value={p.referenceNo}
                onChangeText={(referenceNo) => setPayment(p.key, { referenceNo: referenceNo.slice(0, 60) })}
                autoCapitalize="characters"
              />
            ) : null}
          </Animated.View>
        ))}
        {payments.length < 6 ? (
          <Button label={payments.length ? "Add another payment" : "Record a payment"} icon="add" variant="soft" onPress={() => add(payments.length ? "upi" : "cash", String(due || ""))} />
        ) : null}
        <Divider />
        <Row justify="space-between">
          <Text variant="body" color="textMuted">
            Paid now
          </Text>
          <Text variant="bodyStrong" tabular>
            {m(paid)}
          </Text>
        </Row>
        <Row justify="space-between">
          <Text variant="title">Due to supplier</Text>
          {over > 0 ? (
            <Badge label={`Paid ${m(over)} more than the bill`} tone="warning" />
          ) : due > 0 ? (
            <Badge label={m(due)} tone="warning" icon="time-outline" />
          ) : (
            <Badge label="Fully paid" tone="success" />
          )}
        </Row>
      </Card>
    </Stack>
  );
}
