# WowCity Seller mobile app: plan

**Decisions**
- Android and iOS ship together.
- Billing keeps working without internet and syncs later.
- Every web feature is in the first release.
- Receipt paper width is a setting (58 mm or 80 mm), since the shops' paper is not fixed yet.

## Stack

| Area | Choice | Why |
|---|---|---|
| App | Expo (React Native) + TypeScript, Expo Router | One codebase for Android and iOS. Same language as this backend. |
| Builds and updates | EAS Build (store builds), EAS Update (fixes without a store release) | No local Android Studio or Xcode needed. |
| API access | `@wowcity/api-client`, generated from this repo's OpenAPI spec | The app and the server can never disagree on a field. |
| Server data | TanStack Query | Caching, retries and background refresh. |
| Offline | expo-sqlite (catalogue, customers and pending bills), sync queue with idempotency keys | Bills never double-post when the network returns. |
| Sign-in | Refresh token in expo-secure-store; access token in memory | Matches `/api/v1/auth/*` (rotation and reuse detection). |
| Scanning | expo-camera barcode scanning, plus Bluetooth HID scanners (they type like a keyboard) | Works with or without a scanner gun. |
| Receipt printing | Bluetooth ESC/POS module (development build), 58/80 mm setting; expo-print for A4 PDF | Standard thermal printers; A4 for GST invoices. |
| Labels | expo-print to PDF on A4 sheets (same templates as the web); ESC/POS/TSPL label printers later | Reuses the label layouts. |
| Photos | expo-image-picker/camera, uploaded straight to R2 via `/api/r2/product-image-upload` | Native uploads need no CORS. |
| Styling | NativeWind (Tailwind classes) with the web's colour tokens | Same look as the web app. |
| Errors | Sentry (optional) | Crash reports from the field. |

## Repositories

- `wow-city` (this repo): database, API, web app, and the source of the OpenAPI spec and API client.
- `wowcity-seller-app` (new): the Expo app. It installs `@wowcity/api-client`.
- `wowcity-buyer-app` (later): same stack, same client.

## Phase 1 (this repo): every feature as an API

Web form handlers become shared services, called by both the web and `/api/v1`. The table shows what exists today and what is still to do.

| Area | Endpoints |
|---|---|
| Session | done: login, refresh, logout, me |
| Billing | done: lookup, customers, post sale/return, bills, bill detail |
| Offline sync | **new**: `GET /sync/catalog?since=` (items, prices, GST, stock per store), `GET /sync/customers?since=` |
| Purchases | purchase list/detail, post purchase, return to supplier, suppliers CRUD |
| Stock | list (done), item detail, adjust, transfer, edit product, photos |
| Products | listing overview, save listing, custom columns |
| Labels | label items, templates, record print, print jobs |
| Money | dues list, party statement, record payment/due, customers list/profile/edit |
| Reports | all 23 via `GET /reports/{slug}` (reuses the report registry), plus CSV |
| Staff | list, create, access, shifts, PIN reset, status, sign-out, lockdown, devices |
| Stores and settings | stores CRUD and close/reopen, profile, tax, invoice settings, password |
| Onboarding | seller sign-up from the phone |

Deliverables:
- `/api/v1/openapi.json`
- the generated `@wowcity/api-client`
- integration tests for every endpoint

## Phase 2 (new repo): app

1. **Shell:** sign-in (owner and staff), store picker, role-based tabs, secure token handling, update checks.
2. **Billing:** scanning, cart, discounts, customers, split tender, credit, estimates, returns, receipt print, WhatsApp/UPI share. Works offline.
3. **Stock, purchases and suppliers,** including camera photos.
4. **Money:** dues, customers, reports with charts.
5. **Shop admin:** staff, stores, settings, labels, online listing.
6. **Launch:** hardening on real devices and printers, then Play Store and App Store submission.

## Offline billing rules

- The device keeps a catalogue snapshot per store, refreshed with `since=`, and a queue of unsent bills.
- **Numbering:** a bill made offline gets its final bill number when it syncs. Until then the receipt shows a temporary reference.
- **Stock:** stock is checked on the server at sync time. If an item sold out meanwhile, the bill still posts and is flagged as oversold for the owner to see, so the customer's bill is never lost.
- **Retries:** every bill carries an idempotency key, so retries never create duplicates.

## Store release (Play Store and App Store)

One Expo codebase builds both apps. EAS Build compiles the iOS app in the cloud, so no Mac is needed, and EAS Submit uploads builds to both stores.

**Accounts (owner to create):**
- Google Play Console: one-time USD 25.
- Apple Developer Program: USD 99 a year. Enrol as an organisation (needs a D-U-N-S number) so the listing shows the company name.

**Build setup:**
- Bundle ID `com.luzzan.wowcity.seller` on both platforms.
- A development build instead of Expo Go, because Bluetooth printing needs native code.
- Android App Bundle (.aab) for Play; iOS builds go through TestFlight first.
- EAS Update ships JavaScript-only fixes without a store release. Native changes (new permissions or modules) still need a store release.

**Things the stores require, so they are in scope for release 1:**
- **Delete account inside the app.** Apple rejects apps that allow sign-up without it. Needs `DELETE /api/v1/account` (the owner closes the shop; data kept only as tax law requires).
- **Privacy policy URL** (for example `https://luzzan.com/privacy`), plus Play's Data safety form and Apple's privacy labels. The app collects name, phone, email and customer contacts for billing, and does no tracking or ads.
- **Permission messages:** camera (barcode scanning and product photos), Bluetooth (receipt printer), photo library (product photos). Each is asked for only when first used.
- **A reviewer login.** Store reviewers cannot receive our codes, so keep one demo shop with a password login, or a fixed test number, and give it in the review notes.
- **Sign in with Apple** is not needed: the app has no Google or Facebook sign-in, only email and mobile codes.
- **Payments:** the app is a business tool with no in-app purchases. If a paid subscription is added later, selling it inside the iOS app would have to use Apple's in-app purchase.

**Release path:** internal testing (Play internal track and TestFlight) → closed test with a few shops. New personal Play accounts must run a closed test with at least 12 testers for 14 days before going public; organisation accounts are exempt. Then production.
