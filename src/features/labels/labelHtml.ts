/**
 * Printable label sheets (A4 sticker sheets or a thermal roll) laid out from the template geometry
 * in millimetres, with a Code 128 barcode per label. Printed through expo-print (PDF).
 */
import type { LabelFieldKey, LabelItem, LabelTemplate } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { code128Svg } from "./code128";

export type LabelContent = Pick<LabelItem, "barcode" | "name" | "brand" | "size" | "color" | "mrp" | "price">;
export type LabelEntry = { item: LabelContent; copies: number };
export type PlacedLabel = { x: number; y: number; item: LabelContent };

export const defaultLabelFields: LabelFieldKey[] = ["shop", "name", "variant", "mrp", "price", "code"];

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function variantText(item: Pick<LabelContent, "size" | "color" | "brand">, withBrand = false) {
  return [withBrand ? item.brand : null, item.size, item.color].filter(Boolean).join(" · ");
}

/** Every copy of every item, placed on pages row by row. */
export function layoutPages(template: LabelTemplate, entries: LabelEntry[]): PlacedLabel[][] {
  const perPage = Math.max(1, template.columns * template.rows);
  const all = entries.flatMap((e) => Array.from({ length: Math.max(0, Math.floor(e.copies)) }, () => e.item));
  const pages: PlacedLabel[][] = [];
  all.forEach((item, index) => {
    const slot = index % perPage;
    if (slot === 0) pages.push([]);
    const col = slot % template.columns;
    const row = Math.floor(slot / template.columns);
    pages[pages.length - 1].push({
      x: Math.round((template.margin.left + col * (template.label.width + template.gap.x)) * 100) / 100,
      y: Math.round((template.margin.top + row * (template.label.height + template.gap.y)) * 100) / 100,
      item
    });
  });
  return pages;
}

/** Type sizes (pt) that suit the label height. */
export function labelTypeScale(heightMm: number) {
  const name = Math.max(5.5, Math.min(11, heightMm * 0.24));
  return { name, small: Math.max(4.8, name * 0.78), price: Math.max(6, name * 1.15), code: Math.max(4.5, name * 0.7) };
}

function labelInner(item: LabelContent, fields: LabelFieldKey[], shop: string) {
  const has = (k: LabelFieldKey) => fields.includes(k);
  const variant = variantText(item, true);
  const prices = [
    has("mrp") && item.mrp ? `<span class="mrp">MRP ${esc(formatMoney(item.mrp))}</span>` : "",
    has("price") && item.price ? `<span class="price">${esc(formatMoney(item.price))}</span>` : ""
  ].join("");
  return [
    has("shop") && shop ? `<div class="shop">${esc(shop)}</div>` : "",
    has("name") ? `<div class="name">${esc(item.name)}</div>` : "",
    has("variant") && variant ? `<div class="variant">${esc(variant)}</div>` : "",
    prices ? `<div class="prices">${prices}</div>` : "",
    has("code") && item.barcode ? `<div class="bc">${code128Svg(item.barcode)}</div><div class="code">${esc(item.barcode)}</div>` : ""
  ].join("");
}

export function labelSheetHtml(template: LabelTemplate, entries: LabelEntry[], fields: LabelFieldKey[], shop: string) {
  const pages = layoutPages(template, entries);
  const t = labelTypeScale(template.label.height);
  const pageHtml = pages
    .map((labels) => `<section class="page">${labels.map((l) => `<div class="label" style="left:${l.x}mm;top:${l.y}mm">${labelInner(l.item, fields, shop)}</div>`).join("")}</section>`)
    .join("");
  const roll = template.columns === 1 && template.rows === 1;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Labels</title>
<style>
@page { size: ${template.page.width}mm ${template.page.height}mm; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; }
.page { position: relative; width: ${template.page.width}mm; height: ${template.page.height}mm; overflow: hidden; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.label { position: absolute; width: ${template.label.width}mm; height: ${template.label.height}mm; padding: ${roll ? 1.2 : 1.8}mm ${roll ? 1.5 : 2.2}mm; border-radius: ${template.radius}mm; display: flex; flex-direction: column; overflow: hidden; line-height: 1.15; }
.shop { font-size: ${t.small.toFixed(1)}pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.name { font-size: ${t.name.toFixed(1)}pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.variant { font-size: ${t.small.toFixed(1)}pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prices { display: flex; justify-content: space-between; align-items: baseline; gap: 1mm; }
.mrp { font-size: ${t.small.toFixed(1)}pt; }
.price { font-size: ${t.price.toFixed(1)}pt; font-weight: 800; margin-left: auto; }
.bc { flex: 1; min-height: 4mm; margin-top: 0.6mm; }
.bc svg { display: block; width: 100%; height: 100%; }
.code { font-size: ${t.code.toFixed(1)}pt; text-align: center; letter-spacing: 0.08em; font-family: "SFMono-Regular", Menlo, Consolas, monospace; }
</style></head><body>${pageHtml}</body></html>`;
}
