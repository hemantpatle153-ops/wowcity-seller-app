import { View } from "react-native";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Divider, Row, Text } from "@/ui";
import { QrCode } from "./QrCode";
import type { ReceiptData } from "./receipt";

const rs = (n: number) => formatMoney(n, { decimals: 2 });

/** On-screen receipt: a paper-like card that follows the appearance mode. */
export function ReceiptPreview({ receipt, compact }: { receipt: ReceiptData; compact?: boolean }) {
  const theme = useTheme();
  const r = receipt;
  const kindLabel = r.kind === "estimate" ? "Estimate" : r.kind === "return" ? (r.refundMode === "credit_note" ? "Credit note" : "Sale return") : r.shop.gstin ? "Tax invoice" : "Bill";
  return (
    <View
      accessibilityLabel={`${kindLabel} ${r.number}, total ${rs(r.totals.net)}`}
      style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, padding: 16, gap: 10 }}
    >
      <View style={{ alignItems: "center", gap: 2 }}>
        <Text variant="title" align="center">
          {r.shop.name}
        </Text>
        {r.store.name && r.store.name !== r.shop.name ? (
          <Text variant="small" color="textMuted">
            {r.store.name}
          </Text>
        ) : null}
        {r.shop.gstin ? (
          <Text variant="caption" color="textMuted">
            GSTIN {r.shop.gstin}
          </Text>
        ) : null}
        <Text variant="caption" weight="800" color="textMuted" uppercase style={{ marginTop: 4 }}>
          {kindLabel}
        </Text>
      </View>
      {r.provisional ? <Badge label={`Saved offline · ref ${r.number}`} tone="warning" icon="time-outline" /> : null}
      <Row justify="space-between">
        <Text variant="small" weight="700">
          {r.provisional ? "Ref" : "Bill"} {r.number}
        </Text>
        <Text variant="small" color="textMuted">
          {formatDateTime(r.date)}
        </Text>
      </Row>
      {r.customer ? (
        <Text variant="small" color="textMuted">
          {r.customer.name} {r.customer.mobile}
        </Text>
      ) : null}
      <Divider />
      {(compact ? r.lines.slice(0, 6) : r.lines).map((l, i) => (
        <View key={i} style={{ gap: 2 }}>
          <Row justify="space-between" align="flex-start">
            <Text variant="small" weight="600" style={{ flex: 1 }} numberOfLines={2}>
              {l.name}
              {l.detail ? <Text variant="small" color="textMuted">{`  ${l.detail}`}</Text> : null}
            </Text>
            <Text variant="small" weight="700" tabular>
              {rs(l.net)}
            </Text>
          </Row>
          <Text variant="caption" color="textMuted" tabular>
            {formatQty(l.qty)} × {rs(l.rate)}
            {l.discount > 0 ? `  −${rs(l.discount)}` : ""} · GST {l.gstRate}%
          </Text>
        </View>
      ))}
      {compact && r.lines.length > 6 ? (
        <Text variant="caption" color="textMuted">
          +{r.lines.length - 6} more
        </Text>
      ) : null}
      <Divider />
      <Row justify="space-between">
        <Text variant="small" color="textMuted">
          Taxable {rs(r.totals.taxable)} · GST {rs(r.totals.gst)}
        </Text>
      </Row>
      {r.totals.discount > 0 ? (
        <Row justify="space-between">
          <Text variant="small" color="textMuted">
            Discount
          </Text>
          <Text variant="small" color="success" tabular>
            −{rs(r.totals.discount)}
          </Text>
        </Row>
      ) : null}
      <Row justify="space-between">
        <Text variant="title">{r.kind === "return" ? "Refund" : "Total"}</Text>
        <Text variant="title" weight="800" tabular>
          {rs(r.totals.net)}
        </Text>
      </Row>
      {r.payments.map((p, i) => (
        <Row key={i} justify="space-between">
          <Text variant="small" color="textMuted">
            {p.mode.toUpperCase()} {p.reference}
          </Text>
          <Text variant="small" tabular>
            {rs(p.amount)}
          </Text>
        </Row>
      ))}
      {r.totals.due > 0 ? (
        <Row justify="space-between">
          <Text variant="small" weight="700" color="warning">
            Balance due
          </Text>
          <Text variant="small" weight="700" color="warning" tabular>
            {rs(r.totals.due)}
          </Text>
        </Row>
      ) : null}
      {r.upi && !compact ? (
        <View style={{ alignItems: "center", gap: 6, paddingTop: 6 }}>
          <QrCode value={r.upi.uri} size={150} label={`UPI QR for ${rs(r.upi.amount)}`} />
          <Text variant="caption" color="textMuted">
            Scan to pay {rs(r.upi.amount)} · {r.upi.upiId}
          </Text>
        </View>
      ) : null}
      {r.totals.savings > 0 ? (
        <Text variant="small" color="success" weight="700" align="center">
          You saved {rs(r.totals.savings)} on MRP
        </Text>
      ) : null}
    </View>
  );
}
