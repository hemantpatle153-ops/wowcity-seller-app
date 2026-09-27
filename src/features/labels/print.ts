import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { LabelFieldKey, LabelTemplate } from "@/api/types";
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

/** Opens the system print dialog with the label sheet (AirPrint / Android print service / browser). */
export async function printLabelSheet(template: LabelTemplate, entries: LabelEntry[], fields: LabelFieldKey[], shop: string) {
  const html = labelSheetHtml(template, entries, fields, shop);
  if (Platform.OS === "web") return printHtmlOnWeb(html);
  await Print.printAsync({ html, width: pt(template.page.width), height: pt(template.page.height) });
}

/** Renders the sheet to a PDF and opens the share sheet (send to a desktop or a label printer app). */
export async function shareLabelSheet(template: LabelTemplate, entries: LabelEntry[], fields: LabelFieldKey[], shop: string) {
  const html = labelSheetHtml(template, entries, fields, shop);
  if (Platform.OS === "web") return printHtmlOnWeb(html);
  const { uri } = await Print.printToFileAsync({ html, width: pt(template.page.width), height: pt(template.page.height) });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Barcode labels", UTI: "com.adobe.pdf" });
}
