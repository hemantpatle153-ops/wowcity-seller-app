import { CODE128_PATTERNS, code128Bars, code128BValues, code128Checksum, code128Svg, encodeCode128B, START_B, STOP } from "@/features/labels/code128";
import { labelSheetHtml, layoutPages } from "@/features/labels/labelHtml";
import type { LabelTemplate } from "@/api/types";

/** Decode widths back to symbol values (proves the table and the bar/space order are consistent). */
function decode(widths: number[]) {
  const symbols: number[] = [];
  let i = 0;
  while (i < widths.length) {
    const size = widths.length - i === 7 ? 7 : 6;
    const pattern = widths.slice(i, i + size).join("");
    symbols.push(CODE128_PATTERNS.indexOf(pattern as (typeof CODE128_PATTERNS)[number]));
    i += size;
  }
  return symbols;
}

describe("Code 128-B", () => {
  it("has 107 unique patterns of 11 modules (stop 13)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = Array.from(p, Number).reduce((a, b) => a + b, 0);
      expect(sum).toBe(i === STOP ? 13 : 11);
    });
  });

  it("computes the check symbol (Wikipedia example PJJ123C)", () => {
    const values = code128BValues("PJJ123C");
    expect(values).toEqual([48, 42, 42, 17, 18, 19, 35]);
    expect(code128Checksum(values)).toBe(879 % 103);
  });

  it("encodes start, data, check and stop, and decodes back", () => {
    const code = encodeCode128B("8901234500017");
    expect(code.symbols[0]).toBe(START_B);
    expect(code.symbols[code.symbols.length - 1]).toBe(STOP);
    expect(code.modules).toBe(11 * (13 + 3) + 2);
    expect(decode(code.widths)).toEqual(code.symbols);
    // bars and spaces alternate, starting and ending with a bar
    expect(code.widths.length % 2).toBe(1);
  });

  it("lays bars out after the quiet zone", () => {
    const { bars, total } = code128Bars("A1", 10);
    expect(bars[0][0]).toBe(10);
    expect(total).toBe(encodeCode128B("A1").modules + 20);
    const svg = code128Svg("A1");
    expect(svg).toContain("<svg");
    expect(svg.match(/<rect/g)?.length).toBe(bars.length);
  });

  it("replaces characters outside code set B", () => {
    expect(code128BValues("é")).toEqual([31]);
  });
});

describe("label sheets", () => {
  const a4: LabelTemplate = {
    key: "a4-3x8",
    name: "A4",
    description: "",
    page: { width: 210, height: 297 },
    columns: 3,
    rows: 8,
    label: { width: 63.5, height: 33.9 },
    margin: { top: 12.9, left: 7.2 },
    gap: { x: 2.5, y: 0 },
    radius: 2
  };
  const item = { barcode: "8901234500017", name: "Cotton <kurta>", brand: "Biba", size: "M", color: "Red", mrp: 1299, price: 999 };

  it("fills pages row by row using the template geometry", () => {
    const pages = layoutPages(a4, [{ item, copies: 30 }]);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(24);
    expect(pages[1]).toHaveLength(6);
    expect(pages[0][1]).toMatchObject({ x: 7.2 + 63.5 + 2.5, y: 12.9 });
    expect(pages[0][3]).toMatchObject({ x: 7.2, y: 12.9 + 33.9 });
  });

  it("renders escaped HTML with a barcode per label and the chosen fields only", () => {
    const html = labelSheetHtml(a4, [{ item, copies: 2 }], ["name", "mrp", "code"], "Luzzan");
    expect(html).toContain("@page { size: 210mm 297mm");
    expect(html).toContain("Cotton &lt;kurta&gt;");
    expect(html.match(/class="label"/g)?.length).toBe(2);
    expect(html.match(/<svg/g)?.length).toBe(2);
    expect(html).not.toContain("Luzzan");
    expect(html).toContain("MRP");
  });
});
