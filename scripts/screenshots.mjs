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

const prefs = (appearance) =>
  JSON.stringify({
    state: {
      appearance,
      accent: "blue",
      textSize: "default",
      reduceMotion: "on",
      haptics: false,
      scanSound: false,
      paperWidth: 80,
      receiptFormat: "thermal",
      printerName: null,
      printerAddress: null,
      autoPrintAfterSave: false,
      lastStoreByShop: {},
      lastShopCode: "",
      lastUsername: ""
    },
    version: 1
  });

async function settle(page, ms = 900) {
  await page.waitForTimeout(ms);
}

async function tap(page, text) {
  await page.getByText(text, { exact: true }).first().click();
}

async function ownerLogin(p) {
  await tap(p, "Sign in as owner");
  await tap(p, "Password");
  await p.getByLabel("Email").fill("owner@luzzan.in");
  await p.locator("input[type=password]").fill("demo1234");
  await p.getByRole("button", { name: "Sign in" }).last().click();
  await settle(p, 2500);
  await p.getByText("MG Road", { exact: false }).first().click();
  await settle(p, 2500);
}

async function addItems(p, names) {
  for (const name of names) {
    await p.getByLabel("Search item or type barcode").fill(name.toLowerCase());
    await settle(p, 1500);
    await p
      .getByText(new RegExp(name))
      .nth(1)
      .click()
      .catch(() => {});
    await settle(p, 500);
  }
}

/** Flows of steps: [name, async (page) => {...}] — a screenshot is taken after each step. */
const flows = {
  owner: [
    ["01-welcome", async () => {}],
    [
      "02-owner-sign-in",
      async (p) => {
        await tap(p, "Sign in as owner");
      }
    ],
    [
      "03-store-picker",
      async (p) => {
        await tap(p, "Password");
        await p.getByLabel("Email").fill("owner@luzzan.in");
        await p.locator("input[type=password]").fill("demo1234");
        await p.getByRole("button", { name: "Sign in" }).last().click();
        await settle(p, 2500);
      }
    ],
    [
      "04-home",
      async (p) => {
        await p.getByText("MG Road", { exact: false }).first().click();
        await settle(p, 2500);
      }
    ],
    [
      "05-sell-empty",
      async (p) => {
        await p.goto(`${base}/sell`);
        await settle(p, 2500);
      }
    ],
    [
      "06-sell-search",
      async (p) => {
        await p.getByLabel("Search item or type barcode").fill("kurta");
        await settle(p, 1800);
      }
    ],
    [
      "07-sell-cart",
      async (p) => {
        await p
          .getByText(/Kurta/)
          .nth(1)
          .click()
          .catch(() => {});
        await settle(p, 600);
        await addItems(p, ["Jeans", "Saree"]);
        await settle(p, 1500);
      }
    ],
    [
      "08-customer-sheet",
      async (p) => {
        await p.getByLabel("Add customer").click();
        await settle(p, 800);
        await p.getByLabel("Name or mobile number").fill("98");
        await settle(p, 1500);
      }
    ],
    [
      "08b-checkout",
      async (p) => {
        await p
          .getByText(/Owes|Advance|98/)
          .first()
          .click()
          .catch(() => {});
        await settle(p, 800);
        await p.getByTestId("charge").click();
        await settle(p, 1500);
      }
    ],
    [
      "09-receipt",
      async (p) => {
        await p.getByRole("button", { name: "Save", exact: true }).click();
        await settle(p, 3000);
      }
    ],
    [
      "10-bills",
      async (p) => {
        await p.goto(`${base}/bills`);
        await settle(p, 2500);
      }
    ],
    [
      "11-settings-appearance",
      async (p) => {
        await p.goto(`${base}/settings/appearance`);
        await settle(p, 1500);
      }
    ],
    [
      "12-more",
      async (p) => {
        await p.goto(`${base}/more`);
        await settle(p, 1500);
      }
    ],
    [
      "13-printer",
      async (p) => {
        await p.goto(`${base}/settings/printer`);
        await settle(p, 1500);
      }
    ]
  ],
  offline: [
    [
      "20-offline-settings",
      async (p) => {
        await ownerLogin(p);
        await p.goto(`${base}/settings/offline`);
        await settle(p, 2500);
        await p.getByLabel("Simulate no internet (demo)").click();
        await settle(p, 800);
      }
    ],
    [
      "21-offline-sell",
      async (p) => {
        await p.goto(`${base}/sell`);
        await settle(p, 3000);
        await addItems(p, ["Kurta", "Leggings"]);
        await settle(p, 800);
      }
    ],
    [
      "22-offline-receipt",
      async (p) => {
        await p.getByTestId("charge").click();
        await settle(p, 1200);
        await p.getByRole("button", { name: "Save", exact: true }).click();
        await settle(p, 2500);
      }
    ],
    [
      "23-offline-bills",
      async (p) => {
        await p
          .getByTestId("new-bill")
          .click()
          .catch(() => {});
        await settle(p, 800);
        await p.goto(`${base}/bills`);
        await settle(p, 3000);
      }
    ],
    [
      "24-back-online",
      async (p) => {
        await p.goto(`${base}/settings/offline`);
        await settle(p, 2000);
        await p.getByLabel("Simulate no internet (demo)").click();
        await settle(p, 4000);
      }
    ]
  ],
  staff: [
    [
      "30-staff-sign-in",
      async (p) => {
        await tap(p, "Staff sign in");
        await p.getByLabel("Shop code").fill("LUZ482");
        await p.getByLabel("Username").fill("ravi");
        await p.locator("input[type=password]").fill("1234");
      }
    ],
    [
      "31-staff-sell",
      async (p) => {
        await p.getByRole("button", { name: "Sign in" }).last().click();
        await settle(p, 3000);
      }
    ],
    [
      "32-staff-bills",
      async (p) => {
        await p.goto(`${base}/bills`);
        await settle(p, 2500);
      }
    ],
    [
      "33-staff-profile",
      async (p) => {
        await p.goto(`${base}/profile`);
        await settle(p, 2000);
      }
    ]
  ]
};
const flowNames = (process.env.FLOWS ?? "owner,offline,staff").split(",");

for (const mode of modes) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript((value) => {
    if (!sessionStorage.getItem("__seeded")) {
      localStorage.clear();
      localStorage.setItem("wowcity.preferences.v1", value);
      sessionStorage.setItem("__seeded", "1");
    }
  }, prefs(mode));
  for (const flow of flowNames) {
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`[${mode}] page error:`, e.message));
    await page.goto(base);
    await page.evaluate(() => sessionStorage.removeItem("wowcity.refreshToken"));
    await page.goto(base);
    await settle(page, 2500);
    for (const [name, run] of flows[flow]) {
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
    await page.close();
  }
  await context.close();
}
await browser.close();
server.close();
