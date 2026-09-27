import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import { isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatMoney, formatQty } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { uuid } from "@/lib/id";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, Chip, confirm, EmptyState, ErrorState, Header, Icon, Input, Row, Screen, SectionTitle, SkeletonCards, Stack, Text, toast } from "@/ui";
import { QtyButton } from "./ItemCard";
import { returnableQty, usePurchaseBill } from "./PurchaseDetailScreen";

const reasons = ["Damaged", "Defective", "Wrong size", "Wrong colour", "Excess stock"];

/** Owner: send items back to the supplier (debit note). */
export function ReturnScreen({ id }: { id: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const bill = usePurchaseBill(id);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [requestId] = useState(() => uuid());
  const [error, setError] = useState<string | null>(null);
  const data = bill.data;

  const lines = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([purchaseItemId, n]) => ({ purchaseItemId, qty: n }));
  const pieces = lines.reduce((n, l) => n + l.qty, 0);
  const amount = data?.totals
    ? lines.reduce((sum, l) => {
        const item = data.items.find((i) => i.id === l.purchaseItemId);
        return item && item.total !== null && item.qty > 0 ? sum + (item.total / item.qty) * l.qty : sum;
      }, 0)
    : null;

  const submit = useMutation({
    mutationFn: () => api.purchases.returnToSupplier(id, { requestId, reason: reason.trim().slice(0, 200) || undefined, lines }),
    onSuccess: (result) => {
      haptic.success();
      toast.success(result.message);
      for (const area of ["purchases", "stock", "dues", "dashboard", "reports"]) void qc.invalidateQueries({ queryKey: [area] });
      router.back();
    },
    onError: (e) => {
      haptic.error();
      setError(errorMessage(e));
    }
  });

  if (!isOwner(me)) {
    return (
      <Screen header={<Header back title="Return to supplier" />}>
        <EmptyState icon="lock-closed-outline" title="Only the owner can return stock" body="Ask the shop owner to make this return." />
      </Screen>
    );
  }
  if (bill.isLoading) {
    return (
      <Screen header={<Header back title="Return to supplier" />}>
        <SkeletonCards count={4} height={92} />
      </Screen>
    );
  }
  if (bill.isError || !data) {
    return (
      <Screen header={<Header back title="Return to supplier" />}>
        <ErrorState message={errorMessage(bill.error)} onRetry={() => bill.refetch()} />
      </Screen>
    );
  }

  const go = async () => {
    setError(null);
    const ok = await confirm({
      title: `Return ${formatQty(pieces)} pcs to ${data.supplier?.name ?? "the supplier"}?`,
      message: `Stock goes down at ${data.store} and a debit note is made${amount ? ` for about ${formatMoney(amount, { decimals: 2 })}` : ""}.`,
      confirmLabel: "Make return"
    });
    if (ok) submit.mutate();
  };

  return (
    <Screen
      header={<Header back title="Return to supplier" subtitle={[data.supplier?.name, data.invoice ? `Inv ${data.invoice}` : null].filter(Boolean).join(" · ")} />}
      footerSpace={110}
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
          <Button
            label={pieces ? `Return ${formatQty(pieces)} pcs${amount ? ` · ${formatMoney(amount, { decimals: 0 })}` : ""}` : "Choose items to return"}
            icon="return-up-back-outline"
            size="lg"
            fullWidth
            disabled={!pieces}
            loading={submit.isPending}
            onPress={go}
          />
        </View>
      }
    >
      <Stack gap={2}>
        <SectionTitle title="How many of each" action={pieces ? "Clear" : undefined} onAction={() => setQty({})} />
        {data.items.map((item) => {
          const max = returnableQty(item);
          const value = qty[item.id] ?? 0;
          const left = item.qty - item.returned;
          return (
            <Animated.View key={item.id} layout={theme.reduceMotion ? undefined : LinearTransition}>
              <Card style={{ gap: 10, borderColor: value ? theme.colors.accent : theme.colors.border, borderWidth: value ? 2 : 1 }}>
                <Row gap={3} align="flex-start">
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text variant="small" color="textMuted" numberOfLines={1}>
                      {[item.detail, item.barcode].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  {max > 0 ? <Chip label={`All ${formatQty(max)}`} selected={value === max} onPress={() => setQty({ ...qty, [item.id]: value === max ? 0 : max })} /> : null}
                </Row>
                <Row gap={3} justify="space-between" wrap>
                  <Row gap={2} wrap style={{ flexShrink: 1 }}>
                    <Badge label={`Bought ${formatQty(item.qty)}`} showIcon={false} />
                    {item.returned ? <Badge label={`${formatQty(item.returned)} already returned`} tone="info" showIcon={false} /> : null}
                    <Badge label={`${formatQty(item.inStock)} in stock`} tone={item.inStock < left ? "warning" : "neutral"} icon="layers-outline" />
                  </Row>
                  {max > 0 ? (
                    <View
                      accessibilityRole="adjustable"
                      accessibilityLabel={`Return quantity for ${item.name}: ${value}`}
                      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                      onAccessibilityAction={(e) => setQty({ ...qty, [item.id]: Math.min(max, Math.max(0, value + (e.nativeEvent.actionName === "increment" ? 1 : -1))) })}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      <QtyButton icon="remove" size={48} label="One less" disabled={value <= 0} onPress={() => setQty({ ...qty, [item.id]: Math.max(0, value - 1) })} />
                      <Text variant="title" tabular weight="700" style={{ minWidth: 36, textAlign: "center" }}>
                        {formatQty(value)}
                      </Text>
                      <QtyButton icon="add" size={48} label="One more" disabled={value >= max} onPress={() => setQty({ ...qty, [item.id]: Math.min(max, value + 1) })} />
                    </View>
                  ) : (
                    <Text variant="small" color="textMuted">
                      {left <= 0 ? "All returned" : "None in stock to return"}
                    </Text>
                  )}
                </Row>
              </Card>
            </Animated.View>
          );
        })}
      </Stack>
      <Stack gap={2}>
        <SectionTitle title="Reason" />
        <Row gap={2} wrap>
          {reasons.map((r) => (
            <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(reason === r ? "" : r)} />
          ))}
        </Row>
        <Input value={reason} onChangeText={(t) => setReason(t.slice(0, 200))} placeholder="Add a note for the debit note (optional)" multiline accessibilityLabel="Return reason" />
      </Stack>
      {pieces ? (
        <Animated.View entering={theme.reduceMotion ? undefined : FadeIn}>
          <Text variant="small" color="textMuted" align="center">
            {`Stock goes down at ${data.store}. The supplier's balance is reduced by the debit note.`}
          </Text>
        </Animated.View>
      ) : null}
    </Screen>
  );
}
