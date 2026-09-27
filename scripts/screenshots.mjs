// Screenshots of key screens in several appearance modes, from the mock-mode web export.
// Usage: npm run export:web && node scripts/screenshots.mjs [light,dark,comfort] [screen-filter]
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const DIST = new URL("../dist/", import.meta.url).pathname;
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
const modes = (process.argv[2] ?? "light,dark,comfort").split(",");
const only = process.argv[3];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ttf": "font/ttf", ".wav": "audio/wav", ".ico": "image/x-icon", ".json": "application/json" };

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  let file = join(DIST, path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

const prefs = (appearance) => JSON.stringify({ state: { appearance, accent: "blue", textSize: "default", reduceMotion: "on", haptics: false, scanSound: false, paperWidth: 80, receiptFormat: "thermal", printerName: null, printerAddress: null, autoPrintAfterSave: false, lastStoreByShop: {}, lastShopCode: "", lastUsername: "" }, version: 1 });

async function settle(page, ms = 900) {
  await page.waitForTimeout(ms);
}

async function tap(page, text) {
  await page.getByText(text, { exact: true }).first().click();
}

/** Each step: [name, async (page) => {...}] — screenshot taken after it runs. */
const steps = [
  ["01-welcome", async () => {}],
  ["02-owner-sign-in", async (p) => { await tap(p, "Sign in as owner"); }],
  ["03-store-picker", async (p) => {
    await tap(p, "Password");
    await p.getByLabel("Email").fill("owner@luzzan.in");
    await p.locator("input[type=password]").fill("demo1234");
    await p.getByRole("button", { name: "Sign in" }).last().click();
    await settle(p, 2500);
  }],
  ["04-home", async (p) => { await p.getByText("MG Road", { exact: false }).first().click(); await settle(p, 2500); }],
  ["05-sell-empty", async (p) => { await p.goto(`${base}/sell`); await settle(p, 2500); }],
  ["06-sell-search", async (p) => { await p.getByLabel("Search item or type barcode").fill("kurta"); await settle(p, 1800); }],
  ["07-sell-cart", async (p) => {
    await p.getByText(/Kurta/).nth(1).click().catch(() => {});
    await settle(p, 600);
    await p.getByLabel("Search item or type barcode").fill("jeans");
    await settle(p, 1500);
    await p.getByText(/Jeans/).nth(1).click().catch(() => {});
    await p.getByLabel("Search item or type barcode").fill("saree");
    await settle(p, 1500);
    await p.getByText(/Saree/).nth(1).click().catch(() => {});
    await settle(p, 1500);
  }],
  ["08-checkout", async (p) => { await p.getByTestId("charge").click(); await settle(p, 1500); }],
  ["09-receipt", async (p) => { await p.getByRole("button", { name: "Save", exact: true }).click(); await settle(p, 3000); }],
  ["10-bills", async (p) => { await p.goto(`${base}/bills`); await settle(p, 2500); }],
  ["11-settings-appearance", async (p) => { await p.goto(`${base}/settings/appearance`); await settle(p, 1500); }]
];

for (const mode of modes) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript((value) => {
    if (!sessionStorage.getItem("__seeded")) {
      localStorage.clear();
      localStorage.setItem("wowcity.preferences.v1", value);
      sessionStorage.setItem("__seeded", "1");
    }
  }, prefs(mode));
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[${mode}] page error:`, e.message));
  await page.goto(base);
  await settle(page, 2500);
  for (const [name, run] of steps) {
    try {
      await run(page);
      await settle(page, 500);
      if (!only || name.includes(only)) await page.screenshot({ path: `${OUT}${name}-${mode}.png` });
      console.log(`✓ ${mode} ${name}`);
    } catch (error) {
      console.error(`✗ ${mode} ${name}: ${error.message.split("\n")[0]}`);
      await page.screenshot({ path: `${OUT}${name}-${mode}-FAILED.png` }).catch(() => {});
    }
  }
  await context.close();
}
await browser.close();
server.close();
