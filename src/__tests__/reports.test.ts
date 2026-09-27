import type { ReportTableOut } from "@/api/types";
import { pickReportChart } from "@/features/reports/chart";
import {
  badgeTone,
  cardLayout,
  cellFormat,
  dayKey,
  EMPTY_CELL,
  escapeHtml,
  exportCell,
  exportFileName,
  formatCell,
  formatStat,
  isNumericFormat,
  parseDay,
  shortDay,
  statTone,
  tableHtml,
  visibleColumns
} from "@/features/reports/format";
import { appHref, invoiceIdFromHref } from "@/features/reports/links";
import { addDays, customRangeError, isRangePreset, isValidDay } from "@/features/reports/ranges";

describe("report cell formatting", () => {
  it("formats by column format", () => {
    expect(formatCell(100596, "money")).toBe("₹1,00,596");
    expect(formatCell(3592.71, "money")).toBe("₹3,592.71");
    expect(formatCell(-400, "money")).toBe("−₹400");
    expect(formatCell(1470, "qty")).toBe("1,470");
    expect(formatCell(2.5, "qty")).toBe("2.5");
    expect(formatCell(37.1, "percent")).toBe("37.1%");
    expect(formatCell(40, "percent")).toBe("40%");
    expect(formatCell("2026-09-25", "date")).toBe("25 Sep 2026");
    expect(formatCell("NM/2627/0086", "mono")).toBe("NM/2627/0086");
    expect(formatCell(true, "text")).toBe("Yes");
    expect(formatCell("Cash", "badge")).toBe("Cash");
  });

  it("formats datetimes in local time", () => {
    const iso = new Date(2026, 8, 27, 14, 5).toISOString();
    expect(formatCell(iso, "datetime")).toBe("27 Sep 2026, 2:05 pm");
  });

  it("shows an em dash for empty values but exports blanks", () => {
    expect(formatCell(null, "money")).toBe(EMPTY_CELL);
    expect(formatCell(undefined)).toBe(EMPTY_CELL);
    expect(formatCell("", "text")).toBe(EMPTY_CELL);
    expect(exportCell(null, "money")).toBe("");
    expect(exportCell(0, "money")).toBe("₹0");
  });

  it("honours per-row format overrides", () => {
    expect(cellFormat({ mode: "Cash", modeFormat: "badge" }, { key: "mode", label: "Mode" })).toBe("badge");
    expect(cellFormat({ mode: "Cash", modeFormat: "nonsense" }, { key: "mode", label: "Mode", format: "text" })).toBe("text");
    expect(cellFormat({}, { key: "amount", label: "Amount" })).toBe("text");
  });

  it("formats stats and tones", () => {
    expect(formatStat({ label: "Net sales", value: 100596, format: "money" })).toBe("₹1,00,596");
    expect(formatStat({ label: "Top seller", value: "Hemant Patle", format: "text" })).toBe("Hemant Patle");
    expect(formatStat({ label: "Bills", value: 28 })).toBe("28");
    expect(formatStat({ label: "Margin", value: 37.1, format: "percent" })).toBe("37.1%");
    expect(statTone("positive")).toBe("success");
    expect(statTone("negative")).toBe("danger");
    expect(statTone("warning")).toBe("warning");
    expect(statTone(undefined)).toBe("accent");
  });

  it("picks badge tones from words", () => {
    expect(badgeTone("Return")).toBe("danger");
    expect(badgeTone("Sale")).toBe("success");
    expect(badgeTone("Lost")).toBe("danger");
    expect(badgeTone("UPI")).toBe("info");
    expect(badgeTone("Something")).toBe("neutral");
  });

  it("knows numeric formats", () => {
    expect(isNumericFormat("money")).toBe(true);
    expect(isNumericFormat("qty")).toBe(true);
    expect(isNumericFormat("percent")).toBe(true);
    expect(isNumericFormat("date")).toBe(false);
    expect(isNumericFormat(undefined)).toBe(false);
  });

  it("parses days without timezone drift", () => {
    expect(parseDay("2026-09-01")?.getDate()).toBe(1);
    expect(parseDay("nope")).toBeNull();
    expect(shortDay("2026-09-27")).toBe("27 Sep");
    expect(dayKey("2026-09-27")).toBe("2026-09-27");
    expect(dayKey(new Date(2026, 0, 5, 23, 0))).toBe("2026-01-05");
    expect(dayKey("garbage")).toBeNull();
  });
});

describe("report layout", () => {
  const columns = [
    { key: "date", label: "Date", format: "datetime" as const },
    { key: "bill", label: "Bill", format: "mono" as const, hrefKey: "href" },
    { key: "customer", label: "Customer" },
    { key: "store", label: "Store", hideOnMobile: true },
    { key: "qty", label: "Qty", format: "qty" as const, total: true },
    { key: "net", label: "Net", format: "money" as const, total: true },
    { key: "due", label: "Due", format: "money" as const, total: true }
  ];

  it("hides mobile-hidden columns in card mode", () => {
    expect(visibleColumns(columns, true).map((c) => c.key)).toEqual(["date", "bill", "customer", "qty", "net", "due"]);
    expect(visibleColumns(columns, false)).toHaveLength(7);
  });

  it("chooses a title and a main figure for cards", () => {
    const layout = cardLayout(visibleColumns(columns, true));
    expect(layout.title?.key).toBe("bill");
    expect(layout.date?.key).toBe("date");
    expect(layout.value?.key).toBe("net");
    expect(layout.details.map((c) => c.key)).toEqual(["customer", "qty", "due"]);
    const simple = cardLayout([
      { key: "name", label: "Name" },
      { key: "balance", label: "Balance", format: "money", total: true },
      { key: "age", label: "Age", format: "qty" }
    ]);
    expect(simple.title?.key).toBe("name");
    expect(simple.value?.key).toBe("balance");
  });
});

describe("exports", () => {
  it("names files from the report, table and period", () => {
    expect(exportFileName("sale", "bills", { from: "2026-09-21", to: "2026-09-27" })).toBe("sale-bills-2026-09-21-to-2026-09-27.csv");
    expect(exportFileName("stock", "in", null)).toBe("stock-in.csv");
    expect(exportFileName("gstr1", "B2C (small)", { from: "2026-08-01", to: "2026-08-01" }, "pdf")).toBe("gstr1-b2c-small-2026-08-01.pdf");
  });

  it("escapes HTML", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;");
  });

  it("renders a printable table with totals", () => {
    const table: ReportTableOut = {
      key: "dues",
      columns: [
        { key: "name", label: "Customer" },
        { key: "balance", label: "Balance", format: "money", total: true }
      ],
      rows: [
        { name: "A <script>", balance: 1200 },
        { name: "B", balance: 300, emphasis: true }
      ],
      truncated: true,
      totals: { name: "Total", balance: 1500 }
    };
    const html = tableHtml({ title: "Customer dues", periodLabel: "Today", table, stats: [{ label: "Owing", value: 2, format: "qty" }] });
    expect(html).toContain('<th style="text-align:right">Balance</th>');
    expect(html).toContain("A &lt;script&gt;");
    expect(html).toContain("₹1,500");
    expect(html).toContain('class="em"');
    expect(html).toContain("Only the first rows");
    expect(html).toContain("Owing");
  });
});

describe("web links", () => {
  it("maps known web paths to app routes", () => {
    expect(appHref("/app/sale/invoices/ff3b34ae-137f-4471")).toBe("/bills/ff3b34ae-137f-4471");
    expect(appHref("/app/dues/customer/abc-1")).toBe("/dues/customer/abc-1");
    expect(appHref("/app/dues/supplier/abc-2")).toBe("/dues/supplier/abc-2");
    expect(appHref("/app/insights/customers/c9?tab=bills")).toBe("/customers/c9");
    expect(appHref("/app/purchase/123")).toBeNull();
    expect(appHref(null)).toBeNull();
    expect(appHref(42)).toBeNull();
    expect(invoiceIdFromHref("/app/sale/invoices/x1")).toBe("x1");
    expect(invoiceIdFromHref("/app/dues/customer/x1")).toBeNull();
  });
});

describe("ranges", () => {
  it("validates presets and custom days", () => {
    expect(isRangePreset("7d")).toBe(true);
    expect(isRangePreset("week")).toBe(false);
    expect(isValidDay("2026-02-29")).toBe(false);
    expect(isValidDay("2028-02-29")).toBe(true);
    expect(isValidDay("2026-9-1")).toBe(false);
    expect(customRangeError("2026-09-01", "2026-09-27", "2026-09-27")).toBeNull();
    expect(customRangeError("2026-09-28", "2026-09-27", "2026-09-30")).toMatch(/after/);
    expect(customRangeError("2026-09-01", "2026-10-01", "2026-09-27")).toMatch(/future/);
    expect(customRangeError("x", "2026-09-01", "2026-09-27")).toMatch(/start/);
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("report charts", () => {
  const bills: ReportTableOut = {
    key: "bills",
    columns: [
      { key: "date", label: "Date", format: "datetime" },
      { key: "customer", label: "Customer" },
      { key: "qty", label: "Qty", format: "qty", total: true },
      { key: "net", label: "Net", format: "money", total: true },
      { key: "due", label: "Due", format: "money", total: true }
    ],
    rows: [
      { date: new Date(2026, 8, 26, 10).toISOString(), customer: "A", qty: 1, net: 100, due: 0 },
      { date: new Date(2026, 8, 27, 10).toISOString(), customer: "B", qty: 1, net: 200, due: 0 },
      { date: new Date(2026, 8, 27, 12).toISOString(), customer: "C", qty: 1, net: 50, due: 0 }
    ],
    truncated: false,
    totals: null
  };

  it("sums the main money column per day", () => {
    const chart = pickReportChart(bills);
    expect(chart?.kind).toBe("bars");
    expect(chart?.title).toBe("Net by day");
    expect(chart?.data.map((d) => d.value)).toEqual([100, 250]);
    expect(chart?.data[1].label).toBe("27 Sep");
  });

  it("ranks names for undated reports even with a date column", () => {
    const chart = pickReportChart(
      {
        key: "dues",
        columns: [
          { key: "name", label: "Customer" },
          { key: "balance", label: "Balance", format: "money", total: true },
          { key: "since", label: "Since", format: "date" }
        ],
        rows: [
          { name: "A", balance: 100, since: "2026-09-01" },
          { name: "B", balance: 300, since: "2026-09-02" }
        ],
        truncated: false,
        totals: null
      },
      { dated: false }
    );
    expect(chart?.kind).toBe("hbars");
    expect(chart?.title).toBe("Top by balance");
    expect(chart?.data.map((d) => d.label)).toEqual(["B", "A"]);
  });

  it("ranks names when there is no date", () => {
    const chart = pickReportChart({
      key: "staff",
      columns: [
        { key: "staff", label: "Staff" },
        { key: "bills", label: "Bills", format: "qty", total: true },
        { key: "amount", label: "Amount", format: "money", total: true }
      ],
      rows: [
        { staff: "Ravi", bills: 3, amount: 500 },
        { staff: "Hemant", bills: 5, amount: 900 },
        { staff: "Meena", bills: 1, amount: 0 }
      ],
      truncated: false,
      totals: null
    });
    expect(chart?.kind).toBe("hbars");
    expect(chart?.data.map((d) => d.label)).toEqual(["Hemant", "Ravi"]);
  });

  it("stays out of the way when a chart would not help", () => {
    expect(pickReportChart(undefined)).toBeNull();
    expect(pickReportChart({ ...bills, rows: bills.rows.slice(0, 1) })).toBeNull();
    // Single day.
    expect(pickReportChart({ ...bills, rows: bills.rows.slice(1) })).toBeNull();
    // No numeric column.
    expect(pickReportChart({ key: "x", columns: [{ key: "a", label: "A" }], rows: [{ a: "1" }, { a: "2" }], truncated: false, totals: null })).toBeNull();
    // Negative values or summary tables.
    expect(
      pickReportChart({
        key: "summary",
        columns: [
          { key: "line", label: "Line" },
          { key: "amount", label: "Amount", format: "money" }
        ],
        rows: [
          { line: "Sales", amount: 100 },
          { line: "Cost", amount: -60 }
        ],
        truncated: false,
        totals: null
      })
    ).toBeNull();
  });
});
