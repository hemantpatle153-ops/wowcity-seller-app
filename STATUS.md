# WowCity Seller — status

_Last updated: 27 Sep 2026 (autonomous build session). Every feature area from the brief is built and runs end to end against the mock backend; `npm run check` is clean (177 tests), `expo-doctor` 21/21, screenshots of every area in `docs/screenshots/`._

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
| Purchase | New purchase as item cards: supplier search/add/free text, store, GST mode, date, invoice no.; scan to restock or create a product with that barcode; duplicate / another size; photos up to 4 (presigned upload); online listing fields; custom columns; totals, bill discount, TCS, payments; persisted draft; idempotent save; label printing. Purchase list/detail, owner return to supplier (debit note), suppliers CRUD with GSTIN/state checks. |
| Labels | Search items, copies, label templates and fields, live preview with a Code128 barcode, A4/roll printing via the system dialog, print history and reprint. |
| Stock | Paged list with search, camera scan, status chips, store switch, sort and facet filters, summary (cost only with permission); item detail with photos, per-store stock, siblings, movements; owner adjust and transfer; full product edit; WowCity online listing editor with buyer preview; custom columns (add, reorder, archive). |
| Money | Dues (customers/suppliers, filters, statements with running balance, record payment, add due, WhatsApp reminder), customers (segments, profiles, edit). |
| Reports | Every report from `/reports`: ranges, views, search, stat tiles, auto chart, cards/table view, totals, CSV share, PDF export. Owner Home dashboard with animated numbers, 14-day trend, payment mix, dues, stock alerts, top items, team, profit, recent bills; staff "My day" on the Bills tab. Themed chart kit. |
| Admin | Staff list, add-staff wizard (shares sign-in details), detail with PIN reset / sign out everywhere / disable, access (role presets + permissions + stores), working hours, emergency lock-all; signed-in phones; stores (add/edit, close temporarily or merge, reopen); settings: business profile, tax & rounding, invoice & UPI/bank (live QR), change password; delete account (type the shop code; friendly "email support" fallback while the backend returns 404). |
| Mock mode | `EXPO_PUBLIC_MOCK=1`: an in-app backend answers every endpoint with a realistic seeded shop, including sales, stock, purchases, dues, reports, staff. Demo sign-in: owner `owner@luzzan.in` / `demo1234` (or code `123456`); staff shop `LUZ482`, `ravi` (cashier) or `meena` (manager), PIN `1234`. Settings → Offline & sync has a "Simulate no internet" switch in demo builds. |
| Quality | `npm run check` = `tsc --noEmit` + ESLint (React Compiler rules) + Jest (API client/refresh, sale maths, cart/payload, offline queue/sync, theme contrast, receipts/ESC-POS, mock backend). Web export + Playwright screenshots in `docs/screenshots/`. |

## Next

- Hardware testing on real phones (camera scanning speed, SQLite with a large catalogue, print dialog on Android/iOS).
- Bluetooth ESC/POS transport in a development build (see blockers).

## Fixed after the build (backend and app, verified against the real API)

- `DELETE /api/v1/account` exists; More → Delete account closes the shop.
- Product photos after purchase: Stock → item → Photos (take or pick, make cover, remove), via `/products/{id}/images`.
- `/stock` hides `unitCost` and `costValue` from staff without cost permission, and returns an `image` URL, so stock rows show thumbnails.
- Saving an item edit only changes fields that were sent; staff without cost permission can no longer wipe the internal note.
- `POST /suppliers` and `POST /stores` return the new id.
- Store picker: the first pick after sign-in opens the app (it used to reopen the picker).

## Production readiness pass

- **Dates:** every date field uses a themed calendar (report and purchase-list custom ranges, purchase date, back-dated dues, date-type custom columns).
- **Stores:** "Use my location" pins the store (foreground permission only, asked when tapped) and fills empty address fields.
- **Labels:** a cancelled print is never recorded; after the dialog closes the app asks whether the labels printed and saves to history only on yes. Receipt print/share treats a closed dialog as a cancel.
- **Shared counter phones:** queued bills belong to the person who made them and only post under their login; every sign-out clears the cart, drafts, cached screens and the offline catalogue/customers (waiting bills are kept).
- **Money:** returns preview and print the amount the server actually refunds (what was paid per unit); a single payment follows the total when discounts change; save can't be double-tapped; auto-print uses the server's invoice.
- **Offline:** the phone's catalogue refreshes every 3 minutes online and after purchases, so scans bill current prices; rate-limited bills retry; discard is only offered for bills the server rejected.
- **Builds:** shop builds contain no mock backend or demo sign-ins (metro swaps in a stub); production builds refuse to start without `EXPO_PUBLIC_API_URL` or with mock mode on; iOS privacy manifest; unused Bluetooth permissions removed until the printer module; friendly crash screen with Try again.
- **Other fixes from review:** debit-note amounts hidden without cost access, empty purchase drafts dated today, stock "Print label" adds the item, +91 mobile paste, old customer states normalised, payments refresh Sell balances, toasts above sheets and reachable with screen readers.

## Blockers / needs the owner

| Blocker | Why | What to do |
|---|---|---|
| Store accounts | Needed to publish | Google Play Console (USD 25) and Apple Developer Program (USD 99/yr, organisation enrolment needs a D-U-N-S number). Then `eas init` to create the EAS project and set `EAS_PROJECT_ID`/`EXPO_OWNER`. |
| Bluetooth printing | Needs a native BLE/SPP module in a development build and a real printer to test | Everything above the transport is ready (ESC/POS encoding for 58/80 mm incl. QR, settings, test print). Add e.g. `react-native-ble-plx` (its config plugin adds the Android Bluetooth permissions, which were removed until then), implement `BluetoothTransport` in `src/printing/printers/bluetooth.ts`, test on hardware. Until then receipts print through the system dialog/PDF. |
| Production API URL | Not known to the app yet | Set `EXPO_PUBLIC_API_URL` (e.g. `https://<your-domain>/api/v1`) in EAS → Environment variables for preview and production. Production builds stop with a clear error if it's missing. Also set `EAS_PROJECT_ID` (from `eas init`) so over-the-air updates are enabled. |
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
