// Renders the WowCity Seller icon set from SVG (run: node scripts/make-icons.mjs).
import { chromium } from "playwright-core";

const BLUE = "#1E5BD8";
const mark = (fg) => `<path d="M12 16 h40 l-3 7 H15 z" fill="${fg}" opacity="0.92"/><path d="M14 28 L21 50 L28 34 L32 44 L36 34 L43 50 L50 28" stroke="${fg}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
const svg = (size, body, bg = "none") => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${bg !== "none" ? `<rect width="64" height="64" fill="${bg}"/>` : ""}${body}</svg>`;
const scaled = (inner, scale) => `<g transform="translate(${32 - 32 * scale} ${32 - 32 * scale}) scale(${scale})">${inner}</g>`;
const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B7BFF"/><stop offset="1" stop-color="#1747B8"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/>`;

const files = [
  ["assets/images/icon.png", 1024, gradient + scaled(mark("#FFFFFF"), 0.78)],
  ["assets/images/android-icon-foreground.png", 1024, scaled(mark("#FFFFFF"), 0.5)],
  ["assets/images/android-icon-background.png", 1024, gradient],
  ["assets/images/android-icon-monochrome.png", 1024, scaled(mark("#000000"), 0.5)],
  ["assets/images/splash-icon.png", 512, scaled(mark("#FFFFFF"), 0.9)],
  ["assets/images/favicon.png", 96, `<rect width="64" height="64" rx="16" fill="${BLUE}"/>` + scaled(mark("#FFFFFF"), 0.8)]
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage();
for (const [path, size, body] of files) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, body)}</body></html>`);
  await page.locator("svg").screenshot({ path, omitBackground: true });
  console.log("wrote", path);
}
await browser.close();
