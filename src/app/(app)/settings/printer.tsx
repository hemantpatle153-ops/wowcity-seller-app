import { useState } from "react";
import { Platform } from "react-native";
import { errorMessage } from "@/api";
import { MOCK_MODE } from "@/api/config";
import { useSession } from "@/auth/session";
import { getBluetoothTransport } from "@/printing/printers/bluetooth";
import { systemPrinter } from "@/printing/printers/system";
import { printReceipt } from "@/printing/print";
import type { ReceiptData } from "@/printing/receipt";
import { ReceiptPreview } from "@/printing/ReceiptPreview";
import { usePreferences } from "@/state/preferences";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, Header, Icon, ListRow, Row, Screen, SectionTitle, Segmented, Stack, Text, toast, ToggleRow } from "@/ui";

function sampleReceipt(shop: string, gstin: string | null, upiId: string | null): ReceiptData {
  return {
    kind: "sale",
    number: "SAMPLE/0001",
    provisional: false,
    date: new Date().toISOString(),
    shop: { name: shop, legalName: "", gstin: gstin ?? "" },
    store: { name: shop, address: "", state: "", phone: "" },
    customer: null,
    soldBy: null,
    lines: [
      { name: "Cotton Kurta", detail: "M / Blue", hsn: "6204", qty: 1, mrp: 1299, rate: 1149, discount: 0, gstRate: 12, net: 1149 },
      { name: "Leggings", detail: "Free / Black", hsn: "6104", qty: 2, mrp: 399, rate: 349, discount: 0, gstRate: 5, net: 698 }
    ],
    gstSummary: [
      { rate: 5, taxable: 664.76, cgst: 16.62, sgst: 16.62, igst: 0 },
      { rate: 12, taxable: 1025.89, cgst: 61.55, sgst: 61.56, igst: 0 }
    ],
    interState: false,
    totals: { quantity: 3, mrp: 2097, discount: 0, taxable: 1690.65, gst: 156.35, roundOff: 0, net: 1847, paid: 2000, due: 0, savings: 250, change: 153 },
    payments: [{ mode: "cash", amount: 1847, reference: "" }],
    terms: "Goods once sold can be exchanged within 7 days with the bill.",
    upi: upiId ? { uri: `upi://pay?pa=${upiId}&pn=${encodeURIComponent(shop)}&am=1847.00&cu=INR`, amount: 1847, upiId } : null,
    bank: null
  };
}

export default function PrinterSettings() {
  const theme = useTheme();
  const prefs = usePreferences();
  const me = useSession((s) => s.me);
  const [testing, setTesting] = useState(false);
  const bluetooth = getBluetoothTransport();
  const sample = sampleReceipt(me?.shopName ?? "Your shop", me?.settings.gstin ?? null, me?.settings.upiId ?? null);

  const test = async () => {
    setTesting(true);
    try {
      await systemPrinter.printTest({ paper: prefs.paperWidth });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Screen header={<Header back title="Receipt printer" />}>
      <SectionTitle title="Paper" />
      <Card style={{ gap: 12 }}>
        <Segmented
          accessibilityLabel="Paper width"
          options={[
            { key: "58", label: "58 mm roll" },
            { key: "80", label: "80 mm roll" }
          ]}
          value={String(prefs.paperWidth) as "58" | "80"}
          onChange={(v) => prefs.set({ paperWidth: v === "58" ? 58 : 80 })}
        />
        <Text variant="small" color="textMuted">
          Measure your roll: 58 mm is about the width of a credit card; 80 mm is wider. Wrong width shrinks or cuts off the receipt.
        </Text>
      </Card>

      <SectionTitle title="Default format" />
      <Card style={{ gap: 12 }}>
        <Segmented
          options={[
            { key: "thermal", label: "Thermal receipt", icon: "receipt-outline" },
            { key: "a4", label: "A4 invoice", icon: "document-text-outline" }
          ]}
          value={prefs.receiptFormat}
          onChange={(v) => prefs.set({ receiptFormat: v })}
        />
        <ToggleRow
          label="Print after every bill"
          hint="Opens the print dialog as soon as a bill is saved."
          value={prefs.autoPrintAfterSave}
          onChange={(v) => prefs.set({ autoPrintAfterSave: v })}
          icon="flash-outline"
        />
      </Card>

      <SectionTitle title="Printer" />
      <Card padded={false}>
        <ListRow
          title="System print / PDF"
          subtitle="AirPrint, Android print services, or save as PDF"
          icon="print-outline"
          right={!prefs.printerAddress ? <Badge label="In use" tone="success" /> : undefined}
          onPress={() => prefs.set({ printerAddress: null, printerName: null })}
        />
        <ListRow
          title="Bluetooth thermal printer"
          subtitle={bluetooth.isSupported() ? "Scan for nearby ESC/POS printers" : "Needs the WowCity development build and a printer to test with"}
          icon="bluetooth"
          iconTone={bluetooth.isSupported() ? "accent" : "neutral"}
          right={<Badge label={bluetooth.isSupported() ? "Available" : "Coming soon"} tone={bluetooth.isSupported() ? "info" : "neutral"} showIcon={false} />}
          onPress={async () => {
            if (!bluetooth.isSupported()) {
              toast.info(Platform.OS === "web" || MOCK_MODE ? "Bluetooth printing works in the phone app build." : "Bluetooth printing arrives with the next app build. Use System print for now.");
              return;
            }
            const devices = await bluetooth.scan(8000).catch(() => []);
            if (!devices.length) toast.warning("No printers found. Turn the printer on and try again.");
            else prefs.set({ printerAddress: devices[0].address, printerName: devices[0].name });
          }}
        />
      </Card>

      <Row gap={2}>
        <Button label="Test print" icon="print-outline" onPress={test} loading={testing} style={{ flex: 1 }} />
        <Button label="Print sample bill" icon="receipt-outline" variant="secondary" onPress={() => printReceipt(sample).catch((e) => toast.error(errorMessage(e)))} style={{ flex: 1 }} />
      </Row>

      <SectionTitle title="Preview" />
      <Stack gap={2} style={{ alignSelf: "center", width: prefs.paperWidth === 58 ? 260 : 340, maxWidth: "100%" }}>
        <ReceiptPreview receipt={sample} compact />
      </Stack>
      <Row gap={2} style={{ paddingHorizontal: 4 }}>
        <Icon name="information-circle-outline" color="textMuted" size={18} />
        <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
          Printed receipts are always black on white, whatever the app&apos;s appearance. {theme.mode === "comfort" ? "Eye Comfort only changes the screen." : ""}
        </Text>
      </Row>
    </Screen>
  );
}
