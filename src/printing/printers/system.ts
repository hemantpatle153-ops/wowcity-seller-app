import * as Print from "expo-print";
import { a4Html, thermalHtml } from "../html";
import type { ReceiptPrinter } from "./types";

/** mm → PDF points. */
const pt = (mm: number) => Math.round((mm / 25.4) * 72);

/** Page height for a roll receipt: grows with the number of lines. */
export function thermalHeightMm(lines: number, extras: number) {
  return 95 + lines * 9 + extras * 6;
}

/** The phone's own print dialog (AirPrint / Android print services) or a PDF. */
export const systemPrinter: ReceiptPrinter = {
  kind: "system",
  label: "System print",
  isAvailable: async () => true,
  print: async (receipt, { paper, format }) => {
    if (format === "a4") {
      await Print.printAsync({ html: a4Html(receipt) });
      return;
    }
    await Print.printAsync({
      html: thermalHtml(receipt, paper),
      width: pt(paper),
      height: pt(thermalHeightMm(receipt.lines.length, receipt.gstSummary.length + receipt.payments.length + (receipt.upi ? 8 : 0)))
    });
  },
  printTest: async ({ paper }) => {
    const html = `<html><body style="width:${paper - 10}mm;font-family:sans-serif;text-align:center"><h3>WowCity Seller</h3><p>Test print · ${paper} mm paper</p><p style="font-family:monospace">${"0123456789".repeat(6).slice(0, paper === 58 ? 32 : 48)}</p><p>If this fits the roll, you're set.</p></body></html>`;
    await Print.printAsync({ html, width: pt(paper), height: pt(80) });
  }
};
