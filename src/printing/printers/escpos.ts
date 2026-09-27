import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import type { ReceiptData } from "../receipt";

/**
 * ESC/POS command encoder for 58 mm (32 columns) and 80 mm (48 columns) thermal printers.
 * Produces raw bytes to write to a Bluetooth (BLE/SPP) or network printer.
 */
export class EscPos {
  private bytes: number[] = [];
  constructor(readonly columns: number) {
    this.raw(0x1b, 0x40); // initialise
    this.raw(0x1b, 0x74, 0x00); // code page PC437
  }

  raw(...values: number[]) {
    this.bytes.push(...values);
    return this;
  }

  text(value: string) {
    // Thermal printers use a single-byte code page; replace characters they cannot print.
    const safe = value.replace(/₹/g, "Rs.").replace(/[−–—]/g, "-").replace(/[×]/g, "x").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    for (const ch of safe) {
      const code = ch.charCodeAt(0);
      this.bytes.push(code < 128 ? code : 0x3f);
    }
    return this;
  }

  line(value = "") {
    return this.text(value).raw(0x0a);
  }

  align(mode: "left" | "center" | "right") {
    return this.raw(0x1b, 0x61, mode === "left" ? 0 : mode === "center" ? 1 : 2);
  }

  bold(on: boolean) {
    return this.raw(0x1b, 0x45, on ? 1 : 0);
  }

  size(width: 1 | 2, height: 1 | 2) {
    return this.raw(0x1d, 0x21, ((width - 1) << 4) | (height - 1));
  }

  rule(char = "-") {
    return this.line(char.repeat(this.columns));
  }

  /** Left and right text on one line, padded to the paper width. */
  pair(left: string, right: string) {
    const space = this.columns - right.length;
    const l = left.length > space - 1 ? left.slice(0, Math.max(0, space - 1)) : left;
    return this.line(l + " ".repeat(Math.max(1, space - l.length)) + right);
  }

  /** Wrap long text to the paper width. */
  wrap(value: string) {
    const words = value.split(/\s+/);
    let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length > this.columns) {
        this.line(current.trim());
        current = word;
      } else current += " " + word;
    }
    if (current.trim()) this.line(current.trim());
    return this;
  }

  /** Native QR (GS ( k), model 2. */
  qr(data: string, moduleSize = 6) {
    const payload = Array.from(data).map((c) => c.charCodeAt(0) & 0xff);
    const len = payload.length + 3;
    this.raw(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    this.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize);
    this.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    this.raw(0x1d, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...payload);
    this.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  feed(lines = 3) {
    return this.raw(0x1b, 0x64, lines);
  }

  cut() {
    return this.raw(0x1d, 0x56, 0x42, 0x00);
  }

  build() {
    return Uint8Array.from(this.bytes);
  }
}

const rs = (n: number) => formatMoney(n, { decimals: 2 });

/** Encode a receipt for a thermal printer. */
export function encodeReceipt(r: ReceiptData, paperMm: 58 | 80): Uint8Array {
  const p = new EscPos(paperMm === 58 ? 32 : 48);
  p.align("center")
    .bold(true)
    .size(2, 2)
    .line(r.shop.name.slice(0, p.columns / 2))
    .size(1, 1)
    .bold(false);
  if (r.store.name && r.store.name !== r.shop.name) p.line(r.store.name);
  if (r.store.address) p.wrap(r.store.address);
  if (r.shop.gstin) p.line(`GSTIN ${r.shop.gstin}`);
  p.bold(true)
    .line(r.kind === "estimate" ? "ESTIMATE" : r.kind === "return" ? "SALE RETURN" : r.shop.gstin ? "TAX INVOICE" : "BILL")
    .bold(false);
  if (r.provisional) p.line("SAVED OFFLINE - PROVISIONAL");
  p.align("left")
    .pair(`${r.provisional ? "Ref" : "Bill"} ${r.number}`, "")
    .line(formatDateTime(r.date));
  if (r.customer) p.line(`${r.customer.name}${r.customer.mobile ? " " + r.customer.mobile : ""}`);
  p.rule();
  for (const l of r.lines) {
    p.wrap(`${l.name}${l.detail ? " " + l.detail : ""}`);
    p.pair(`  ${formatQty(l.qty)} x ${rs(l.rate)}${l.discount > 0 ? ` -${rs(l.discount)}` : ""}`, rs(l.net));
  }
  p.rule();
  p.pair("Items", formatQty(r.totals.quantity));
  if (r.totals.discount > 0) p.pair("Discount", `-${rs(r.totals.discount)}`);
  p.pair("Taxable", rs(r.totals.taxable)).pair("GST", rs(r.totals.gst));
  if (r.totals.roundOff) p.pair("Round off", rs(r.totals.roundOff));
  p.bold(true)
    .size(1, 2)
    .pair(r.kind === "return" ? "REFUND" : "TOTAL", rs(r.totals.net))
    .size(1, 1)
    .bold(false);
  for (const pay of r.payments) p.pair(pay.mode.toUpperCase(), rs(pay.amount));
  if (r.totals.change > 0) p.pair("Change", rs(r.totals.change));
  if (r.totals.due > 0) p.bold(true).pair("Balance due", rs(r.totals.due)).bold(false);
  if (r.totals.savings > 0)
    p.align("center")
      .line(`You saved ${rs(r.totals.savings)}`)
      .align("left");
  if (r.upi)
    p.align("center")
      .line(`Scan to pay ${rs(r.upi.amount)}`)
      .qr(r.upi.uri, paperMm === 58 ? 5 : 6)
      .line(r.upi.upiId)
      .align("left");
  if (r.terms) p.rule().wrap(r.terms);
  return p.align("center").line("Thank you! Visit again.").feed(4).cut().build();
}
