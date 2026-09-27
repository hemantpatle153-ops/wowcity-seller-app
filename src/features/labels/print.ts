import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { LabelFieldKey, LabelTemplate } from "@/api/types";
import { isPrintCancel } from "@/lib/printCancel";
import { confirm } from "@/ui/Confirm";
import { labelSheetHtml, type LabelEntry } from "./labelHtml";

const pt = (mm: number) => Math.round((mm / 25.4) * 72);

/** On web expo-print would print the whole app; print the sheet from a hidden frame instead. */
function printHtmlOnWeb(html: string) {
  return new Promise<void>((resolve, reject) => {
    try {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      document.body.appendChild(frame);
      const doc = frame.contentWindow?.document;
      if (!doc || !frame.contentWindow) throw new Error("Printing is not available in this browser.");
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(() => frame.remove(), 1000);
        resolve();
      }, 250);
    } catch (error) {
      reject(error);
    }
  });
}

export type PrintOutcome = "sent" | "cancelled";

/**
 * Opens the system print dialog with the label sheet (AirPrint / Android print service / browser).
 * "sent" only means the dialog closed without a known cancel: Android and browsers never say whether
 * anything printed, so callers confirm with the person before recording the print.
 */
export async function printLabelSheet(template: LabelTemplate, entries: LabelEntry[], fields: LabelFieldKey[], shop: string): Promise<PrintOutcome> {
  const html = labelSheetHtml(template, entries, fields, shop);
  if (Platform.OS === "web") {
    await printHtmlOnWeb(html);
    return "sent";
  }
  try {
    await Print.printAsync({ html, width: pt(template.page.width), height: pt(template.page.height) });
    return "sent";
  } catch (error) {
    if (isPrintCancel(error)) return "cancelled";
    throw error;
  }
}

/** Renders the sheet to a PDF and opens the share sheet (send to a desktop or a label printer app). */
export async function shareLabelSheet(template: LabelTemplate, entries: LabelEntry[], fields: LabelFieldKey[], shop: string): Promise<PrintOutcome> {
  const html = labelSheetHtml(template, entries, fields, shop);
  if (Platform.OS === "web") {
    await printHtmlOnWeb(html);
    return "sent";
  }
  const { uri } = await Print.printToFileAsync({ html, width: pt(template.page.width), height: pt(template.page.height) });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone.");
  try {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Barcode labels", UTI: "com.adobe.pdf" });
    return "sent";
  } catch (error) {
    if (isPrintCancel(error)) return "cancelled";
    throw error;
  }
}

/** Ask whether the labels really came out, so cancelled or failed prints never enter the history. */
export function confirmLabelsPrinted(count: number, mode: "print" | "share") {
  return confirm({
    title: mode === "print" ? "Did the labels print?" : "Did you print or send the labels?",
    message: `Save this print of ${count} label${count === 1 ? "" : "s"} to print history only if they came out. You can reprint any job from History.`,
    confirmLabel: "Yes, save to history",
    cancelLabel: "No, don't save"
  });
}
