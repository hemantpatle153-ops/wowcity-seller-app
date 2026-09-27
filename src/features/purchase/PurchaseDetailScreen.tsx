import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { PurchaseBill } from "@/api/types";
import { can, isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatDate, formatDateTime, formatMoney, formatQty, maskMobile } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, Badge, Button, Card, Divider, ErrorState, Header, Icon, Row, Screen, SectionTitle, Skeleton, SkeletonCards, Stack, Text } from "@/ui";
import { moneyOrDash } from "./PurchasesScreen";
import { payModeLabel, purchaseKeys } from "./queries";

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "success" | "warning" }) {
  return (
    <Row justify="space-between" gap={3}>
      <Text variant={strong ? "bodyStrong" : "body"} color={strong ? "text" : "textMuted"}>
        {label}
      </Text>
      <Text variant={strong ? "bodyStrong" : "body"} color={tone ?? "text"} tabular>
        {value}
      </Text>
    </Row>
  );
}

const m = (n: number) => formatMoney(n, { decimals: 2 });

export function usePurchaseBill(id: string) {
  return useQuery({ queryKey: purchaseKeys.bill(id), queryFn: () => api.purchases.get(id), enabled: !!id });
}

export function returnableQty(item: PurchaseBill["items"][number]) {
  return Math.max(0, Math.min(item.qty - item.returned, item.inStock));
}

export function PurchaseDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const bill = usePurchaseBill(id);
  const data = bill.data;

  if (bill.isLoading) {
    return (
      <Screen header={<Header back title="Purchase" />}>
        <Skeleton height={180} radius={theme.radius.card} />
        <SkeletonCards count={3} height={80} />
      </Screen>
    );
  }
  if (bill.isError || !data) {
    return (
      <Screen header={<Header back title="Purchase" />}>
        <ErrorState message={errorMessage(bill.error)} onRetry={() => bill.refetch()} />
      </Screen>
    );
  }

  const t = data.totals;
  const canReturn = isOwner(me) && data.items.some((i) => returnableQty(i) > 0);
  const printable = !!data.labelJobId && can(me, "barcode.print");
  const hasFooter = canReturn || printable;
  const returnedQty = data.returns.reduce((n, r) => n + r.qty, 0);

  return (
    <Screen
      header={<Header back title={data.supplier?.name ?? "Purchase"} subtitle={[data.invoice ? `Inv ${data.invoice}` : null, formatDate(data.date)].filter(Boolean).join(" · ")} />}
      onRefresh={() => bill.refetch()}
      refreshing={bill.isRefetching}
      footerSpace={hasFooter ? (theme.fontScale > 1.1 && canReturn && printable ? 150 : 80) : 0}
      footer={
        hasFooter ? (
          <View
            style={{
              padding: 16,
              paddingBottom: Math.max(insets.bottom, 12),
              flexDirection: theme.fontScale > 1.1 ? "column" : "row",
              gap: 10,
              backgroundColor: theme.colors.surface,
              borderTopWidth: 1,
              borderColor: theme.colors.border
            }}
          >
            {printable ? (
              <Button
                label="Print labels"
                icon="barcode-outline"
                variant={canReturn ? "secondary" : "primary"}
                size="lg"
                style={theme.fontScale > 1.1 ? undefined : { flex: 1 }}
                onPress={() => router.push(`/labels?job=${data.labelJobId}`)}
              />
            ) : null}
            {canReturn ? (
              <Button
                label="Return"
                accessibilityLabel="Return to supplier"
                icon="return-up-back-outline"
                size="lg"
                style={theme.fontScale > 1.1 ? undefined : { flex: 1 }}
                onPress={() => router.push(`/purchases/${data.id}/return`)}
              />
            ) : null}
          </View>
        ) : undefined
      }
    >
      <Animated.View entering={theme.reduceMotion ? undefined : FadeInDown.springify().damping(18)}>
        <Card style={{ gap: 10 }}>
          <View style={{ alignItems: "center", gap: 4, paddingVertical: 6 }}>
            <Text variant="small" color="textMuted" weight="700" uppercase>
              Bill total
            </Text>
            <Text variant="hero" tabular accessibilityLabel={t ? `Bill total ${m(t.total)}` : "Bill total hidden"}>
              {t ? formatMoney(t.total, { decimals: "auto" }) : "—"}
            </Text>
            <Row gap={2} wrap justify="center">
              <Badge label={`${formatQty(t?.qty ?? data.items.reduce((n, i) => n + i.qty, 0))} pcs`} icon="cube-outline" />
              <Badge label={data.pricing === "inclusive" ? "GST included" : "GST extra"} tone="info" showIcon={false} />
              <Badge label={data.store} icon="storefront-outline" />
              {t ? t.due > 0 ? <Badge label={`Due ${formatMoney(t.due)}`} tone="warning" icon="time-outline" /> : <Badge label="Paid" tone="success" /> : null}
            </Row>
          </View>
          {t ? (
            <>
              <Divider />
              <Line label="Gross" value={m(t.gross)} />
              {t.discount > 0 ? <Line label="Discount" value={`−${m(t.discount)}`} tone="success" /> : null}
              <Line label="Taxable value" value={m(t.taxable)} />
              <Line label="GST" value={m(t.gst)} />
              {t.tcs > 0 ? <Line label="TCS" value={m(t.tcs)} /> : null}
              {t.roundOff !== 0 ? <Line label="Round off" value={formatMoney(t.roundOff, { decimals: 2, sign: true })} /> : null}
              <Line label="Total" value={m(t.total)} strong />
              <Line label="Paid" value={m(t.paid)} />
              <Line label="Due on this bill" value={m(t.due)} strong tone={t.due > 0 ? "warning" : undefined} />
              {t.outstanding !== t.due ? <Line label="Still open (after later payments)" value={m(t.outstanding)} /> : null}
              {t.mrp > 0 ? <Line label="Stock value at MRP" value={m(t.mrp)} /> : null}
            </>
          ) : (
            <Row gap={2}>
              <Icon name="eye-off-outline" size={18} color="textMuted" />
              <Text variant="small" color="textMuted" style={{ flex: 1 }}>
                Costs are hidden for your account.
              </Text>
            </Row>
          )}
        </Card>
      </Animated.View>

      {data.supplier ? (
        <Card style={{ gap: 12 }}>
          <Row gap={3}>
            <Avatar name={data.supplier.name} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title" numberOfLines={1}>
                {data.supplier.name}
              </Text>
              <Text variant="small" color="textMuted" numberOfLines={2}>
                {[maskMobile(data.supplier.mobile), data.supplier.gstin ? `GSTIN ${data.supplier.gstin}` : null, data.supplier.state].filter(Boolean).join(" · ") || "No contact details"}
              </Text>
            </View>
          </Row>
          {isOwner(me) ? <Button label="Supplier statement" icon="document-text-outline" variant="soft" onPress={() => router.push(`/dues/supplier/${data.supplier!.id}`)} /> : null}
        </Card>
      ) : (
        <Card>
          <Row gap={3}>
            <Icon name="business-outline" color="textMuted" />
            <Text color="textMuted">No supplier on this purchase.</Text>
          </Row>
        </Card>
      )}

      <Stack gap={2}>
        <SectionTitle title={`Items · ${data.items.length}`} />
        <Card padded={false}>
          {data.items.map((item, index) => (
            <View key={item.id}>
              {index ? <Divider inset={16} /> : null}
              <View style={{ padding: 14, gap: 6 }}>
                <Row gap={3} align="flex-start">
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text variant="small" color="textMuted" numberOfLines={1}>
                      {[item.detail, item.barcode].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" tabular>
                    {moneyOrDash(item.total, 2)}
                  </Text>
                </Row>
                <Text variant="small" color="textMuted" tabular>
                  {formatQty(item.qty)} × {moneyOrDash(item.rate, 2)}
                  {item.discount ? ` − ${m(item.discount)}` : ""} · GST {item.gstRate}%{item.gst !== null ? ` ${m(item.gst)}` : ""}
                </Text>
                <Row gap={2} wrap>
                  <Badge label={`MRP ${formatMoney(item.mrp)}`} showIcon={false} />
                  <Badge label={`Sells at ${formatMoney(item.price)}`} tone="accent" showIcon={false} />
                  <Badge label={`${formatQty(item.inStock)} in stock`} icon="layers-outline" tone={item.inStock > 0 ? "neutral" : "warning"} />
                  {item.returned > 0 ? <Badge label={`${formatQty(item.returned)} returned`} tone="info" icon="return-up-back-outline" /> : null}
                </Row>
              </View>
            </View>
          ))}
        </Card>
      </Stack>

      {data.payments.length ? (
        <Stack gap={2}>
          <SectionTitle title="Payments" />
          <Card padded={false}>
            {data.payments.map((p, index) => (
              <View key={`${p.at}-${index}`}>
                {index ? <Divider inset={16} /> : null}
                <Row gap={3} style={{ padding: 14 }}>
                  <Icon name="wallet-outline" color="success" />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" weight="600">
                      {payModeLabel(p.mode)}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </Text>
                    <Text variant="small" color="textMuted">
                      {formatDateTime(p.at)}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" tabular>
                    {m(p.amount)}
                  </Text>
                </Row>
              </View>
            ))}
          </Card>
        </Stack>
      ) : null}

      {data.returns.length ? (
        <Stack gap={2}>
          <SectionTitle title={`Returns · ${formatQty(returnedQty)} pcs`} />
          <Card padded={false}>
            {data.returns.map((r, index) => (
              <View key={r.id}>
                {index ? <Divider inset={16} /> : null}
                <Row gap={3} style={{ padding: 14 }}>
                  <Icon name="return-up-back-outline" color="info" />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" weight="600">
                      {r.number} · {formatQty(r.qty)} pcs
                    </Text>
                    <Text variant="small" color="textMuted" numberOfLines={2}>
                      {[formatDate(r.date), r.reason].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" tabular>
                    {t ? m(r.amount) : "—"}
                  </Text>
                </Row>
              </View>
            ))}
          </Card>
        </Stack>
      ) : null}
    </Screen>
  );
}
