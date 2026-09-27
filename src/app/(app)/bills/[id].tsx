import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { api, errorMessage } from "@/api";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useCart } from "@/features/sell/cart";
import { formatMoney } from "@/lib/format";
import { printReceipt, shareReceiptPdf, whatsappReceipt } from "@/printing/print";
import { receiptFromInvoice } from "@/printing/receipt";
import { ReceiptPreview } from "@/printing/ReceiptPreview";
import { usePreferences } from "@/state/preferences";
import { Badge, Button, Card, confirm, ErrorState, Header, Row, Screen, Segmented, SkeletonCards, Stack, Text, toast } from "@/ui";

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.me);
  const paper = usePreferences((s) => s.paperWidth);
  const defaultFormat = usePreferences((s) => s.receiptFormat);
  const [format, setFormat] = useState<"thermal" | "a4">(defaultFormat);
  const bill = useQuery({ queryKey: ["sales", "invoice", id], queryFn: () => api.sales.get(id) });
  const run = (fn: () => Promise<unknown>) => fn().catch((e) => toast.error(errorMessage(e)));

  if (bill.isLoading)
    return (
      <Screen header={<Header back title="Bill" />}>
        <SkeletonCards count={3} height={140} />
      </Screen>
    );
  if (bill.isError || !bill.data)
    return (
      <Screen header={<Header back title="Bill" />}>
        <ErrorState message={errorMessage(bill.error)} onRetry={() => bill.refetch()} />
      </Screen>
    );

  const invoice = bill.data;
  const receipt = receiptFromInvoice(invoice);
  const canReturn = can(me, "sale.return") && !invoice.isEstimate && invoice.status === "posted";
  return (
    <Screen header={<Header back title={invoice.billNumber} subtitle={invoice.store.name} />} onRefresh={() => bill.refetch()} refreshing={bill.isRefetching}>
      <Row gap={2} wrap>
        {invoice.isEstimate ? <Badge label="Estimate · stock not changed" tone="info" /> : null}
        {invoice.status === "cancelled" ? <Badge label="Cancelled" tone="danger" /> : null}
        {invoice.totals.due > 0 ? <Badge label={`Due ${formatMoney(invoice.totals.due)}`} tone="warning" /> : <Badge label="Paid" tone="success" />}
        {invoice.soldBy ? <Badge label={`By ${invoice.soldBy}`} tone="neutral" icon="person-outline" /> : null}
      </Row>
      <Card style={{ gap: 12 }}>
        <Segmented
          options={[
            { key: "thermal", label: `Receipt ${paper} mm`, icon: "receipt-outline" },
            { key: "a4", label: "A4 invoice", icon: "document-text-outline" }
          ]}
          value={format}
          onChange={setFormat}
        />
        <Row gap={2}>
          <Button label="Reprint" icon="print-outline" onPress={() => run(() => printReceipt(receipt, format))} style={{ flex: 1 }} />
          <Button label="Share PDF" icon="share-outline" variant="secondary" onPress={() => run(() => shareReceiptPdf(receipt, format))} style={{ flex: 1 }} />
        </Row>
        <Button label="WhatsApp" icon="logo-whatsapp" variant="soft" onPress={() => run(() => whatsappReceipt(receipt))} fullWidth />
      </Card>
      <ReceiptPreview receipt={receipt} />
      <Stack gap={2}>
        {canReturn ? (
          <Button
            label="Return items from this bill"
            icon="return-down-back-outline"
            variant="secondary"
            onPress={async () => {
              const cart = useCart.getState();
              if (cart.mode === "sale" && cart.lines.length) {
                const ok = await confirm({
                  title: "Start a return?",
                  message: `The bill you're making (${cart.lines.length} item${cart.lines.length === 1 ? "" : "s"}) will be cleared.`,
                  confirmLabel: "Clear and start return",
                  cancelLabel: "Keep my bill",
                  destructive: true
                });
                if (!ok) return;
              }
              useCart.getState().reset("return");
              router.push(`/sell?returnBill=${encodeURIComponent(invoice.billNumber)}`);
            }}
            fullWidth
          />
        ) : null}
        {invoice.customer && invoice.totals.due > 0 && can(me, "reports.due") ? (
          <Text variant="small" color="textMuted" align="center">
            Record the customer&apos;s payment from Dues.
          </Text>
        ) : null}
      </Stack>
    </Screen>
  );
}
