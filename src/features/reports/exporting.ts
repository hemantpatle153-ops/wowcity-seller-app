import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { api } from "@/api";
import type { Query } from "@/api/client";
import type { ReportResponse, ReportTableOut } from "@/api/types";
import { exportFileName, tableHtml } from "./format";

/** Web: hand the browser a file to save. */
function downloadOnWeb(text: string, name: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Fetch one table as CSV from the server (same filters as on screen) and share it
 * (share sheet on phones, a download on the web). Returns the file name.
 */
export async function shareReportCsv(slug: string, filters: Query, table: ReportTableOut, period: ReportResponse["period"]) {
  const text = await api.reports.exportCsv(slug, { ...filters, table: table.key });
  const name = exportFileName(slug, table.key, period, "csv");
  if (Platform.OS === "web") {
    downloadOnWeb(text, name, "text/csv;charset=utf-8");
    return name;
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: name, UTI: "public.comma-separated-values-text" });
  return name;
}

/** Render one table to a simple PDF and share it (print dialog on the web). */
export async function shareReportPdf(report: ReportResponse, table: ReportTableOut, shopName?: string) {
  const html = tableHtml({ title: report.title, shopName, periodLabel: report.period?.label ?? null, table, stats: report.stats });
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: exportFileName(report.slug, table.key, report.period, "pdf"), UTI: "com.adobe.pdf" });
}
