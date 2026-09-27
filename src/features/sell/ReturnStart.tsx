import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { api, errorMessage } from "@/api";
import type { OriginalBillResponse } from "@/api/types";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { uuid } from "@/lib/id";
import { useConnectivity } from "@/state/connectivity";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, Divider, EmptyState, Input, Row, Stack, Stepper, Text } from "@/ui";
import { useCart } from "./cart";

type Found = Extract<OriginalBillResponse, { found: true }>;

/** Returns start from the original bill: find it, choose what comes back. */
export function ReturnStart({ initialBill }: { initialBill?: string }) {
  const theme = useTheme();
  const online = useConnectivity((s) => s.online);
  const startReturn = useCart((s) => s.startReturn);
  const [billNumber, setBillNumber] = useState(initialBill ?? "");
  const [bill, setBill] = useState<Found | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const find = useMutation({
    mutationFn: () => api.sales.originalBill(billNumber.trim().toUpperCase()),
    onSuccess: (data) => {
      if (data.found) {
        setBill(data);
        setQty({});
      }
    }
  });
  const selected = bill?.items.filter((i) => (qty[i.originalItemId] ?? 0) > 0) ?? [];
  const refund = selected.reduce((s, i) => s + toNumber(i.unitRefund) * (qty[i.originalItemId] ?? 0), 0);

  if (!online)
    return (
      <EmptyState
        icon="cloud-offline-outline"
        tone="warning"
        title="Returns need internet"
        body="We check the original bill on the server so nothing is refunded twice. Try again when you're back online."
        compact
      />
    );

  return (
    <Stack gap={3}>
      <Card style={{ gap: 12 }}>
        <Text variant="title">Find the original bill</Text>
        <Row gap={2} align="flex-end">
          <Input
            label="Bill number"
            value={billNumber}
            onChangeText={(t) => setBillNumber(t.toUpperCase())}
            placeholder="e.g. MG/2627/0142"
            autoCapitalize="characters"
            autoCorrect={false}
            containerStyle={{ flex: 1 }}
            returnKeyType="search"
            onSubmitEditing={() => billNumber.trim() && find.mutate()}
            icon="receipt-outline"
          />
          <Button label="Find" onPress={() => find.mutate()} loading={find.isPending} disabled={!billNumber.trim()} />
        </Row>
        {find.isError ? (
          <Text variant="small" color="danger">
            {errorMessage(find.error)}
          </Text>
        ) : null}
        {find.data && !find.data.found ? (
          <Text variant="small" color="danger">
            No bill {billNumber} in your stores. Check the number on the receipt.
          </Text>
        ) : null}
      </Card>
      {bill ? (
        <Card padded={false}>
          <View style={{ padding: 16, gap: 4 }}>
            <Row justify="space-between">
              <Text variant="title">{bill.invoice.billNumber}</Text>
              <Text variant="bodyStrong" tabular>
                {formatMoney(bill.invoice.total)}
              </Text>
            </Row>
            <Text variant="small" color="textMuted">
              {formatDate(bill.invoice.date)} · {bill.customer?.name ?? "Walk-in customer"}
            </Text>
          </View>
          <Divider />
          {bill.items.map((item) => (
            <View key={item.originalItemId} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {item.itemName}
                </Text>
                <Text variant="small" color="textMuted">
                  {[item.size, item.colour].filter(Boolean).join(" / ")} · {formatMoney(item.unitRefund)} each
                </Text>
                {item.returnableQty <= 0 ? <Badge label="Already returned" tone="neutral" /> : <Badge label={`Sold ${item.soldQty} · can return ${item.returnableQty}`} tone="info" showIcon={false} />}
              </View>
              {item.returnableQty > 0 ? (
                <Stepper
                  value={qty[item.originalItemId] ?? 0}
                  min={0}
                  max={item.returnableQty}
                  onChange={(v) => setQty({ ...qty, [item.originalItemId]: v })}
                  label={`${item.itemName} return quantity`}
                  compact
                />
              ) : null}
            </View>
          ))}
          <View style={{ padding: 16 }}>
            <Button
              label={selected.length ? `Return ${selected.length} item${selected.length === 1 ? "" : "s"} · ${formatMoney(refund)}` : "Choose what's coming back"}
              size="lg"
              fullWidth
              disabled={!selected.length}
              onPress={() =>
                startReturn(
                  { invoiceId: bill.invoice.id, billNumber: bill.invoice.billNumber, date: bill.invoice.date, total: bill.invoice.total },
                  bill.customer ? { id: bill.customer.id, name: bill.customer.name, mobile: bill.customer.mobile ?? "", state: bill.customer.state ?? undefined } : null,
                  selected.map((i) => ({
                    key: uuid(),
                    variantId: i.variantId,
                    itemName: i.itemName,
                    detail: [i.size, i.colour].filter(Boolean).join(" / "),
                    barcode: i.barcode,
                    qty: qty[i.originalItemId] ?? 1,
                    mrp: toNumber(i.mrp),
                    rate: toNumber(i.rate),
                    gstRate: toNumber(i.gstRate),
                    discountPercent: 0,
                    discountAmount: 0,
                    availableQty: null,
                    originalItemId: i.originalItemId,
                    maxQty: i.returnableQty
                  })),
                  bill.invoice.taxType
                )
              }
            />
          </View>
        </Card>
      ) : null}
    </Stack>
  );
}
