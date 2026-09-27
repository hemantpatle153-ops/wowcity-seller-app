import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { qrSvg } from "./qr";
import type { ReceiptData } from "./receipt";

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const m = (n: number) => esc(formatMoney(n, { decimals: 2 }));

function title(r: ReceiptData) {
  if (r.kind === "estimate") return "ESTIMATE";
  if (r.kind === "return") return r.refundMode === "credit_note" ? "CREDIT NOTE" : "SALE RETURN";
  return r.shop.gstin ? "TAX INVOICE" : "BILL OF SUPPLY";
}

function modeLabel(mode: string) {
  return ({ cash: "Cash", upi: "UPI", card: "Card", other: "Other", credit: "Credit", bank: "Bank" } as Record<string, string>)[mode] ?? mode;
}

/** Thermal roll receipt (58 or 80 mm). Black on white, compact, monospace-friendly. */
export function thermalHtml(r: ReceiptData, paperMm: 58 | 80) {
  const width = paperMm === 58 ? 48 : 72; // printable mm
  const small = paperMm === 58;
  const rows = r.lines
    .map(
      (l) => `<tr><td colspan="3" class="name">${esc(l.name)}${l.detail ? ` <span class="muted">${esc(l.detail)}</span>` : ""}</td></tr>
<tr><td>${esc(formatQty(l.qty))} × ${m(l.rate)}${l.discount > 0 ? ` <span class="muted">−${m(l.discount)}</span>` : ""}</td><td class="r muted">${l.gstRate}%</td><td class="r">${m(l.net)}</td></tr>`
    )
    .join("");
  const gst = r.gstSummary
    .filter((g) => g.taxable > 0)
    .map((g) =>
      r.interState
        ? `<tr><td>GST ${g.rate}%</td><td class="r">${m(g.taxable)}</td><td class="r">IGST ${m(g.igst)}</td></tr>`
        : `<tr><td>GST ${g.rate}%</td><td class="r">${m(g.taxable)}</td><td class="r">${m(g.cgst + g.sgst)}</td></tr>`
    )
    .join("");
  const pays = r.payments.map((p) => `<tr><td>${esc(modeLabel(p.mode))}${p.reference ? ` <span class="muted">${esc(p.reference)}</span>` : ""}</td><td class="r">${m(p.amount)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
@page { size: ${paperMm}mm auto; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; padding: 2mm; width: ${width + 4}mm; font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; font-size: ${small ? 9 : 10.5}pt; color: #000; background: #fff; }
.c { text-align: center; } .r { text-align: right; white-space: nowrap; } .b { font-weight: 700; }
.muted { color: #444; font-size: 0.85em; }
h1 { font-size: 1.35em; margin: 0; } h2 { font-size: 1em; margin: 2mm 0 1mm; letter-spacing: 0.08em; }
table { width: 100%; border-collapse: collapse; } td { padding: 0.4mm 0; vertical-align: top; }
.name { padding-top: 1.2mm; font-weight: 600; }
hr { border: 0; border-top: 1px dashed #000; margin: 1.5mm 0; }
.total td { font-size: 1.3em; font-weight: 800; padding-top: 1mm; }
.qr { width: ${small ? 30 : 36}mm; margin: 1mm auto 0; } .qr svg { width: 100%; height: auto; }
.prov { border: 1px solid #000; padding: 1mm; margin: 1mm 0; }
</style></head><body>
<div class="c"><h1>${esc(r.shop.name)}</h1>
${r.store.name && r.store.name !== r.shop.name ? `<div>${esc(r.store.name)}</div>` : ""}
${r.store.address ? `<div class="muted">${esc(r.store.address)}</div>` : ""}
${r.store.phone ? `<div class="muted">Ph ${esc(r.store.phone)}</div>` : ""}
${r.shop.gstin ? `<div class="muted">GSTIN ${esc(r.shop.gstin)}</div>` : ""}
<h2>${title(r)}</h2></div>
${r.provisional ? `<div class="prov c b">Saved offline · Ref ${esc(r.number)}<br><span class="muted">Final bill number is given when the phone syncs.</span></div>` : ""}
<table><tr><td>${r.provisional ? "Ref" : "Bill"} <b>${esc(r.number)}</b></td><td class="r">${esc(formatDateTime(r.date))}</td></tr>
${r.customer ? `<tr><td colspan="2">${esc(r.customer.name)}${r.customer.mobile ? ` · ${esc(r.customer.mobile)}` : ""}</td></tr>` : ""}
${r.customer?.gstin ? `<tr><td colspan="2" class="muted">GSTIN ${esc(r.customer.gstin)}</td></tr>` : ""}
${r.soldBy ? `<tr><td colspan="2" class="muted">Billed by ${esc(r.soldBy)}</td></tr>` : ""}</table>
<hr><table>${rows}</table><hr>
<table>
<tr><td>Items</td><td class="r">${esc(formatQty(r.totals.quantity))}</td></tr>
${r.totals.discount > 0 ? `<tr><td>Discount</td><td class="r">−${m(r.totals.discount)}</td></tr>` : ""}
<tr><td>Taxable value</td><td class="r">${m(r.totals.taxable)}</td></tr>
<tr><td>GST</td><td class="r">${m(r.totals.gst)}</td></tr>
${r.totals.roundOff !== 0 ? `<tr><td>Round off</td><td class="r">${m(r.totals.roundOff)}</td></tr>` : ""}
<tr class="total"><td>${r.kind === "return" ? "REFUND" : "TOTAL"}</td><td class="r">${m(r.totals.net)}</td></tr>
</table>
${pays ? `<hr><table>${pays}${r.totals.change > 0 ? `<tr><td>Change</td><td class="r">${m(r.totals.change)}</td></tr>` : ""}${r.totals.due > 0 ? `<tr class="b"><td>Balance due</td><td class="r">${m(r.totals.due)}</td></tr>` : ""}</table>` : r.totals.due > 0 ? `<hr><table><tr class="b"><td>Balance due</td><td class="r">${m(r.totals.due)}</td></tr></table>` : ""}
${gst ? `<hr><table><tr class="muted"><td>Rate</td><td class="r">Taxable</td><td class="r">Tax</td></tr>${gst}</table>` : ""}
${r.totals.savings > 0 ? `<hr><div class="c b">You saved ${m(r.totals.savings)} on MRP</div>` : ""}
${r.upi ? `<hr><div class="c">Scan to pay ${m(r.upi.amount)} by UPI<div class="qr">${r.upi.svg || qrSvg(r.upi.uri)}</div><div class="muted">${esc(r.upi.upiId)}</div></div>` : ""}
${r.terms ? `<hr><div class="muted c">${esc(r.terms).replace(/\n/g, "<br>")}</div>` : ""}
<div class="c muted" style="margin-top:2mm">Thank you! Visit again.</div>
</body></html>`;
}

/** A4 GST invoice. */
export function a4Html(r: ReceiptData) {
  const rows = r.lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td><b>${esc(l.name)}</b>${l.detail ? `<div class="muted">${esc(l.detail)}</div>` : ""}</td><td>${esc(l.hsn)}</td><td class="r">${esc(formatQty(l.qty))}</td><td class="r">${m(l.mrp)}</td><td class="r">${m(l.rate)}</td><td class="r">${l.discount > 0 ? m(l.discount) : "—"}</td><td class="r">${l.gstRate}%</td><td class="r">${m(l.net)}</td></tr>`
    )
    .join("");
  const gst = r.gstSummary
    .map((g) => `<tr><td>${g.rate}%</td><td class="r">${m(g.taxable)}</td>${r.interState ? `<td class="r">${m(g.igst)}</td>` : `<td class="r">${m(g.cgst)}</td><td class="r">${m(g.sgst)}</td>`}</tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
@page { size: A4; margin: 14mm; }
body { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 10pt; color: #111; }
.row { display: flex; justify-content: space-between; gap: 16px; }
h1 { margin: 0; font-size: 20pt; } h2 { margin: 0; font-size: 13pt; letter-spacing: 0.1em; }
.muted { color: #555; font-size: 9pt; } .r { text-align: right; } .b { font-weight: 700; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; }
th { background: #f2f2f2; text-align: left; font-size: 9pt; } th, td { padding: 6px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
.box { border: 1px solid #ccc; border-radius: 6px; padding: 10px; flex: 1; }
.totals td { border: 0; padding: 3px 6px; } .grand td { font-size: 13pt; font-weight: 800; border-top: 2px solid #111; }
.prov { border: 2px dashed #111; padding: 8px; margin: 8px 0; text-align: center; font-weight: 700; }
.qr svg { width: 110px; height: 110px; }
</style></head><body>
<div class="row"><div><h1>${esc(r.shop.name)}</h1>${r.shop.legalName ? `<div>${esc(r.shop.legalName)}</div>` : ""}<div class="muted">${esc(r.store.name)} · ${esc(r.store.address)}${r.store.state ? `, ${esc(r.store.state)}` : ""}</div>${r.store.phone ? `<div class="muted">Phone ${esc(r.store.phone)}</div>` : ""}${r.shop.gstin ? `<div class="b">GSTIN ${esc(r.shop.gstin)}</div>` : ""}</div>
<div class="r"><h2>${title(r)}</h2><div>${r.provisional ? "Reference" : "Invoice no."} <b>${esc(r.number)}</b></div><div>${esc(formatDateTime(r.date))}</div>${r.soldBy ? `<div class="muted">Billed by ${esc(r.soldBy)}</div>` : ""}</div></div>
${r.provisional ? `<div class="prov">Saved offline. The final invoice number is assigned when this phone syncs.</div>` : ""}
<div class="row" style="margin-top:12px"><div class="box"><div class="muted">Billed to</div>${r.customer ? `<div class="b">${esc(r.customer.name)}</div><div>${esc(r.customer.mobile)}</div><div class="muted">${esc(r.customer.address)} ${esc(r.customer.state)}</div>${r.customer.gstin ? `<div>GSTIN ${esc(r.customer.gstin)}</div>` : ""}` : "<div class='b'>Walk-in customer</div>"}</div>
<div class="box"><div class="muted">Place of supply</div><div class="b">${esc(r.customer?.state || r.store.state)}</div><div class="muted">${r.interState ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}</div></div></div>
<table><thead><tr><th>#</th><th>Item</th><th>HSN</th><th class="r">Qty</th><th class="r">MRP</th><th class="r">Rate</th><th class="r">Disc.</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="row" style="margin-top:12px; align-items:flex-start">
<div style="flex:1">${gst ? `<table><thead><tr><th>GST</th><th class="r">Taxable</th>${r.interState ? `<th class="r">IGST</th>` : `<th class="r">CGST</th><th class="r">SGST</th>`}</tr></thead><tbody>${gst}</tbody></table>` : ""}
${r.payments.length ? `<table><thead><tr><th>Paid by</th><th class="r">Amount</th></tr></thead><tbody>${r.payments.map((p) => `<tr><td>${esc(modeLabel(p.mode))} ${esc(p.reference)}</td><td class="r">${m(p.amount)}</td></tr>`).join("")}</tbody></table>` : ""}
${r.bank ? `<p class="muted">Bank: ${esc(r.bank.name)} · ${esc(r.bank.accountName)} · A/c ${esc(r.bank.accountNumber)} · IFSC ${esc(r.bank.ifsc)}</p>` : ""}</div>
<div style="width:260px"><table class="totals">
<tr><td>Items</td><td class="r">${esc(formatQty(r.totals.quantity))}</td></tr>
<tr><td>Taxable value</td><td class="r">${m(r.totals.taxable)}</td></tr><tr><td>GST</td><td class="r">${m(r.totals.gst)}</td></tr>
${r.totals.discount > 0 ? `<tr><td>Discount</td><td class="r">${m(r.totals.discount)}</td></tr>` : ""}
${r.totals.roundOff !== 0 ? `<tr><td>Round off</td><td class="r">${m(r.totals.roundOff)}</td></tr>` : ""}
<tr class="grand"><td>${r.kind === "return" ? "Refund" : "Total"}</td><td class="r">${m(r.totals.net)}</td></tr>
${r.totals.due > 0 ? `<tr class="b"><td>Balance due</td><td class="r">${m(r.totals.due)}</td></tr>` : ""}
</table>${r.upi ? `<div class="r qr">${r.upi.svg || qrSvg(r.upi.uri)}<div class="muted">Pay ${m(r.upi.amount)} · ${esc(r.upi.upiId)}</div></div>` : ""}</div></div>
${r.terms ? `<p class="muted">${esc(r.terms).replace(/\n/g, "<br>")}</p>` : ""}
<p class="muted" style="margin-top:24px">This is a computer-generated invoice.</p>
</body></html>`;
}

/** Plain-text summary for WhatsApp/SMS. */
export function receiptText(r: ReceiptData) {
  const lines = [
    `*${r.shop.name}*`,
    `${title(r) === "TAX INVOICE" ? "Bill" : title(r)} ${r.number}${r.provisional ? " (provisional)" : ""} · ${formatDateTime(r.date)}`,
    "",
    ...r.lines.map((l) => `${l.name}${l.detail ? ` (${l.detail})` : ""} × ${formatQty(l.qty)} = ${formatMoney(l.net, { decimals: 2 })}`),
    "",
    `*${r.kind === "return" ? "Refund" : "Total"}: ${formatMoney(r.totals.net, { decimals: 2 })}*`
  ];
  if (r.totals.savings > 0) lines.push(`You saved ${formatMoney(r.totals.savings, { decimals: 2 })} on MRP`);
  if (r.totals.due > 0) lines.push(`Balance due: ${formatMoney(r.totals.due, { decimals: 2 })}`);
  if (r.upi) lines.push("", `Pay by UPI: ${r.upi.uri}`);
  lines.push("", "Thank you! 🙏");
  return lines.join("\n");
}
