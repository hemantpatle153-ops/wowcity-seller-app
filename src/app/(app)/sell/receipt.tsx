import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import { useLastReceipt } from "@/features/sell/lastReceipt";
import { formatMoney } from "@/lib/format";
import { printReceipt, shareReceiptPdf, whatsappReceipt } from "@/printing/print";
import { receiptFromInvoice } from "@/printing/receipt";
import { ReceiptPreview } from "@/printing/ReceiptPreview";
import { usePreferences } from "@/state/preferences";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, Icon, Row, Screen, Segmented, Stack, Text, toast } from "@/ui";

export default function ReceiptScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { result, change } = useLastReceipt();
  const prefs = usePreferences();
  const [format, setFormat] = useState<"thermal" | "a4">(prefs.receiptFormat);
  const saved = result?.status === "saved" ? result : null;
  // Swap in the server's invoice (final numbers, UPI QR, store address) once it loads.
  const invoice = useQuery({ queryKey: ["sales", "invoice", saved?.invoiceId], enabled: !!saved && saved.response && "invoiceId" in saved.response, queryFn: () => api.sales.get(saved!.invoiceId) });
  const receipt = invoice.data ? receiptFromInvoice(invoice.data) : result?.receipt;

  useEffect(() => {
    if (!result) router.replace("/sell");
  }, [result]);
  if (!result || !receipt) return null;

  const queued = result.status === "queued";
  const run = (fn: () => Promise<unknown>) => fn().catch((e) => toast.error(errorMessage(e)));
  return (
    <Screen
      edges={["top"]}
      footerSpace={90}
      footer={
        <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.colors.bg }}>
          <Button label="New bill" icon="add" size="lg" fullWidth onPress={() => router.dismissTo("/sell")} testID="new-bill" />
        </View>
      }
    >
      <Stack gap={2} style={{ alignItems: "center", paddingTop: 16 }}>
        <Animated.View
          entering={theme.reduceMotion ? undefined : ZoomIn.springify().damping(12)}
          style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: queued ? theme.colors.warningSoft : theme.colors.successSoft, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name={queued ? "cloud-upload-outline" : "checkmark-done"} size={46} color={queued ? "warning" : "success"} />
        </Animated.View>
        <Text variant="heading" align="center" accessibilityRole="header">
          {queued ? "Saved on this phone" : receipt.kind === "estimate" ? "Estimate saved" : receipt.kind === "return" ? "Return saved" : "Bill saved"}
        </Text>
        <Text variant="body" color="textMuted" align="center">
          {queued ? `Ref ${receipt.number}. It gets its bill number when you're back online.` : saved?.message}
        </Text>
        {change > 0 ? <Badge label={`Give back ${formatMoney(change)} change`} tone="success" icon="cash-outline" /> : null}
      </Stack>

      <Card style={{ gap: 12 }}>
        <Segmented
          options={[
            { key: "thermal", label: `Receipt ${prefs.paperWidth} mm`, icon: "receipt-outline" },
            { key: "a4", label: "A4 invoice", icon: "document-text-outline" }
          ]}
          value={format}
          onChange={setFormat}
        />
        <Row gap={2}>
          <Button label="Print" icon="print-outline" onPress={() => run(() => printReceipt(receipt, format))} style={{ flex: 1 }} />
          <Button label="Share" icon="share-outline" variant="secondary" onPress={() => run(() => shareReceiptPdf(receipt, format))} style={{ flex: 1 }} />
        </Row>
        <Button
          label={receipt.customer?.mobile ? `WhatsApp ${receipt.customer.mobile}` : "Send on WhatsApp"}
          icon="logo-whatsapp"
          variant="soft"
          onPress={() => run(() => whatsappReceipt(receipt))}
          fullWidth
        />
      </Card>

      <ReceiptPreview receipt={receipt} />
      {saved && "invoiceId" in saved.response ? <Button label="Open bill" variant="ghost" onPress={() => router.push(`/bills/${saved.invoiceId}`)} /> : null}
    </Screen>
  );
}
