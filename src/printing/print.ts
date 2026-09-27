import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";
import { isPrintCancel } from "@/lib/printCancel";
import { usePreferences } from "@/state/preferences";
import { a4Html, receiptText, thermalHtml } from "./html";
import { bluetoothPrinter } from "./printers/bluetooth";
import { systemPrinter, thermalHeightMm } from "./printers/system";
import type { ReceiptPrinter } from "./printers/types";
import type { ReceiptData } from "./receipt";

const pt = (mm: number) => Math.round((mm / 25.4) * 72);

/** The printer chosen in Settings → Receipt printer. */
export function currentPrinter(): ReceiptPrinter {
  const prefs = usePreferences.getState();
  if (prefs.printerAddress) return bluetoothPrinter(prefs.printerAddress, prefs.printerName ?? "Printer");
  return systemPrinter;
}

/** Print a receipt. A dialog the person closed counts as done, not as an error. */
export async function printReceipt(receipt: ReceiptData, format?: "thermal" | "a4") {
  try {
    return await printReceiptUnsafe(receipt, format);
  } catch (error) {
    if (isPrintCancel(error)) return "cancelled" as const;
    throw error;
  }
}

async function printReceiptUnsafe(receipt: ReceiptData, format?: "thermal" | "a4") {
  const prefs = usePreferences.getState();
  const printer = currentPrinter();
  const options = { paper: prefs.paperWidth, format: format ?? prefs.receiptFormat };
  if (printer.kind !== "system" && !(await printer.isAvailable())) {
    // Fall back to the system dialog so the customer still gets a receipt.
    await systemPrinter.print(receipt, options);
    return "system" as const;
  }
  await printer.print(receipt, options);
  return printer.kind;
}

/** Render the receipt to a PDF file (for sharing or saving). */
export async function receiptPdf(receipt: ReceiptData, format: "thermal" | "a4") {
  const paper = usePreferences.getState().paperWidth;
  const html = format === "a4" ? a4Html(receipt) : thermalHtml(receipt, paper);
  const size = format === "a4" ? {} : { width: pt(paper), height: pt(thermalHeightMm(receipt.lines.length, receipt.gstSummary.length + receipt.payments.length + (receipt.upi ? 8 : 0))) };
  const { uri } = await Print.printToFileAsync({ html, ...size });
  return uri;
}

/** Share the PDF through the share sheet (WhatsApp, email, Drive…). */
export async function shareReceiptPdf(receipt: ReceiptData, format: "thermal" | "a4" = "a4") {
  if (Platform.OS === "web") {
    await Print.printAsync({ html: format === "a4" ? a4Html(receipt) : thermalHtml(receipt, usePreferences.getState().paperWidth) });
    return;
  }
  const uri = await receiptPdf(receipt, format);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone.");
  try {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Bill ${receipt.number}`, UTI: "com.adobe.pdf" });
  } catch (error) {
    if (!isPrintCancel(error)) throw error;
  }
}

/** Open WhatsApp with the bill summary for the customer's number. */
export async function whatsappReceipt(receipt: ReceiptData, mobile?: string) {
  const digits = (mobile ?? receipt.customer?.mobile ?? "").replace(/\D/g, "");
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const text = encodeURIComponent(receiptText(receipt));
  const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  await Linking.openURL(url);
}
