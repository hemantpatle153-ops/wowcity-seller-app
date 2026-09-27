# WowCity Seller — status

_Last updated: 27 Sep 2026 (autonomous build session)._

## Done

| Area | What works |
|---|---|
| Foundation | Expo SDK 57, TypeScript strict, Expo Router (typed routes), TanStack Query, zustand, Reanimated 4. `app.config.ts` (name, `com.luzzan.wowcity.seller`, camera/photos/Bluetooth permission text), `eas.json` (development / preview / production). Brand icon, adaptive icon, splash. `expo-doctor` 21/21. |
| API client | Typed client for every endpoint (`src/api/endpoints.ts`, types in `src/api/types.ts` extracted from the backend). Access token in memory, refresh token in the keychain/keystore, rotation, one shared refresh for concurrent 401s, one retry, clean `error.message`s, raw (un-enveloped) endpoints handled. |
| Theme | Five appearance modes (System, Light, Dark, AMOLED Black, Eye Comfort), five accents, four text sizes, reduce motion, haptics, scan beep. Contrast of every accent/status/text token is unit-tested at 4.5:1 in all modes. Cross-fade on mode change. |
| Sign-in | Owner: one-time code by email/mobile or password. Staff: shop code + username + PIN/password (remembered on shared phones). Sign-up wizard (owner, shop, address, GST) verified by code, shows the new shop code. Store picker. Role-based tabs (owner: Home, Sell, Purchase, Stock, More; staff: Sell, Bills, Purchase/Stock if allowed, Profile). Permission-aware menus from `/me`. Offline banner above the tabs. |
| Sell (POS) | Camera scanner (torch, debounce, beep + haptic, manual entry), scanner-gun input, local-first barcode lookup, name search (server when online, phone catalogue offline), cart with steppers, swipe-to-remove + undo, line price/discount (permission), customer find/create, bill discount, split tender cash/UPI/card + credit, quick-cash notes, on-screen UPI QR, advance use and keep-change-as-advance, estimates, GST inclusive/exclusive, returns against the original bill (cash or credit note). Totals use the server's exact maths (ported, unit-tested). Cart survives app restarts. |
| Offline | SQLite catalogue per store + customers, synced with `/sync/*` cursors; bill queue with idempotency keys, posted with `offline: true` when back online (auto on reconnect and every 30 s), temporary `OFF-XXXX-DDMM` reference on offline receipts, retry / discard UI, provisional reprint. |
| Receipts | On-screen preview, 58/80 mm thermal HTML and A4 GST invoice (UPI QR), print via the system dialog, PDF share, WhatsApp text. ESC/POS encoder (`src/printing/printers/escpos.ts`) behind a printer abstraction ready for Bluetooth. Printer settings with test print. |
| Bills | Bills/returns history (ranges, search, summaries, infinite scroll; staff see their own), bill detail with reprint/share/WhatsApp and "return items". |
| Mock mode | `EXPO_PUBLIC_MOCK=1`: an in-app backend answers every endpoint with a realistic seeded shop, including sales, stock, purchases, dues, reports, staff. Demo sign-in: owner `owner@luzzan.in` / `demo1234` (or code `123456`); staff shop `LUZ482`, `ravi` (cashier) or `meena` (manager), PIN `1234`. Settings → Offline & sync has a "Simulate no internet" switch in demo builds. |
| Quality | `npm run check` = `tsc --noEmit` + ESLint (React Compiler rules) + Jest (API client/refresh, sale maths, cart/payload, offline queue/sync, theme contrast, receipts/ESC-POS, mock backend). Web export + Playwright screenshots in `docs/screenshots/`. |

## In progress (this session)

- Purchase entry (item cards, scan/restock/new product, photos up to 4, listing fields), purchase list/detail, returns to supplier, suppliers, barcode labels.
- Stock list/filters, item detail, adjust, transfer, edit product, online listing, custom columns.
- Home dashboard with animated numbers and charts, dues and statements, record payment, customers, reports with charts and CSV.
- Staff (create, access, shifts, PIN reset, disable, sign out, lockdown), devices, stores, shop settings, delete account.

## Blockers / needs the owner

| Blocker | Why | What to do |
|---|---|---|
| Store accounts | Needed to publish | Google Play Console (USD 25) and Apple Developer Program (USD 99/yr, organisation enrolment needs a D-U-N-S number). Then `eas init` to create the EAS project and set `EAS_PROJECT_ID`/`EXPO_OWNER`. |
| Bluetooth printing | Needs a native BLE/SPP module in a development build and a real printer to test | Everything above the transport is ready (ESC/POS encoding for 58/80 mm incl. QR, settings, test print). Add e.g. `react-native-ble-plx`, implement `BluetoothTransport` in `src/printing/printers/bluetooth.ts`, test on hardware. Until then receipts print through the system dialog/PDF. |
| `DELETE /api/v1/account` | Backend endpoint not built yet | App calls it with `{ confirm: <shop code> }` and shows a friendly "email support" message on 404. |
| API gaps noticed | From reading the backend | No v1 endpoint to add photos to an existing product outside a purchase; `/stock` returns `unitCost` to staff without cost permission (app hides it); `POST /suppliers` and `POST /stores` don't return the new id. |
| Privacy policy URL, reviewer login | Store listing | Publish e.g. `https://luzzan.com/privacy`; keep a demo shop with a password login for App Review. |
| Maps | Store location | No Google Maps key is needed yet (stores take a Google Maps link and optional lat/long). |

## How to run

```bash
npm install
cp .env.example .env.local        # EXPO_PUBLIC_API_URL=https://<server>/api/v1   (or EXPO_PUBLIC_MOCK=1)
npx expo start                    # Expo Go works for most screens; camera + Bluetooth want a dev build
npm run check                     # typecheck, lint, tests
npx expo-doctor
npm run export:web && npm run screenshots   # mock web build + screenshots (Chromium at /opt/pw-browsers/chromium)
```

### Builds (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest init                                   # once: creates the EAS project
npx eas-cli@latest build --profile development --platform android   # dev client APK (camera, Bluetooth)
npx eas-cli@latest build --profile preview --platform all           # internal test builds
npx eas-cli@latest build --profile production --platform all        # store builds (AAB + IPA)
npx eas-cli@latest submit --profile production --platform android   # Play internal track
npx eas-cli@latest submit --profile production --platform ios       # TestFlight
```

Set `EXPO_PUBLIC_API_URL` for each profile in EAS (Environment variables) — never commit secrets.
