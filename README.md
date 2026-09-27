# WowCity Seller (mobile)

Point-of-sale app for WowCity shops on Android and iOS: billing with barcode scanning (works offline), receipt printing, purchases and stock, dues, reports, staff and shop settings.

- Progress, blockers and how to build: [`STATUS.md`](STATUS.md)
- How the code is organised and the UI rules: [`docs/dev-guide.md`](docs/dev-guide.md)
- API reference: `docs/api.md` (backend: the `wow-city` repo); exact types: `src/api/types.ts`
- Product spec: `docs/mobile-app-spec.md`, `docs/mobile-app-plan.md`
- Design system and appearance modes: `docs/design.md`
- Screenshots of the current build: `docs/screenshots/`

## Quick start

```bash
npm install
cp .env.example .env.local     # EXPO_PUBLIC_API_URL=https://<server>/api/v1, or EXPO_PUBLIC_MOCK=1 for demo data
npx expo start                 # scan the QR with a development build (camera/Bluetooth need one)
npm run check                  # typecheck + lint + unit tests
```
