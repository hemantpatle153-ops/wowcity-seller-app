# WowCity Seller — developer guide

How the app is put together, and the conventions every screen follows.

## Layout

```
src/
  app/                 Expo Router routes (thin: import a screen from features/ or build it here)
    (auth)/            welcome, owner, staff, signup (shown when signed out)
    (app)/(tabs)/      home, sell, bills, purchase, stock, more, profile (visible per role)
    (app)/...          pushed screens: sell/checkout, sell/receipt, scan, bills/[id], settings/*, ...
  api/                 client.ts (tokens, refresh, errors), endpoints.ts (one function per call), types.ts
  auth/                session store (useSession), permissions (can, isOwner, tabsFor), token storage
  features/<area>/     screen components, hooks and logic for one area
  offline/             SQLite store (memory on web/tests), catalogue/customer sync, bill queue
  printing/            receipt model, HTML (58/80 mm, A4), PDF/share/WhatsApp, printers/ (ESC/POS)
  mock/                in-app fake backend (EXPO_PUBLIC_MOCK=1)
  state/               preferences (persisted), connectivity, query client
  theme/               tokens (5 modes x 5 accents), ThemeProvider, useTheme
  ui/                  design-system components (import from "@/ui")
```

## Rules

- **Colours:** only `theme.colors.*` tokens (or `<Text color="textMuted">`). No hex values in components. Over camera/photos use `media` tokens.
- **Type:** `<Text variant="caption|small|body|bodyStrong|title|heading|display|hero">`. Money and quantities use `tabular`.
- **Touch targets:** 48 dp minimum (`Button`, `IconButton`, `ListRow`, `Chip` already are).
- **Accessibility:** every pressable has an `accessibilityLabel`; status is never colour-only (use `Badge` with text/icon).
- **React Compiler:** it memoises component bodies, so never write `thing!.id` for a value that can be null during render; guard with an early return instead.
- **Motion:** Reanimated only; skip or shorten animations when `theme.reduceMotion`. Shared values: use `.set()` / `.get()` (React Compiler friendly).
- **Haptics:** `haptic.tap/select/success/warning/error` from `@/lib/haptics` (respects the setting).
- **Server data:** TanStack Query. Query keys start with the area: `["sales", ...]`, `["stock", ...]`, `["purchases", ...]`, `["dues", ...]`, `["customers", ...]`, `["reports", ...]`, `["staff", ...]`, `["stores", ...]`, `["settings", ...]`, `["dashboard", ...]`. Invalidate the area after a mutation.
- **Errors:** show `errorMessage(error)` (the server's `error.message`). Lists use `ErrorState` with retry; forms show the message inline or `toast.error`.
- **Loading:** skeletons (`SkeletonList`, `SkeletonCards`, `Skeleton`), not spinners.
- **Empty:** `EmptyState` with an icon, one line and one action.
- **Lists:** `@shopify/flash-list` for long lists, pull-to-refresh, `ListRow` rows.
- **Pickers/quick actions:** `Sheet` (bottom sheet) or `Select`. Confirmations: `await confirm({...})`.
- **Permissions:** hide what a person can't do (`can(me, "perm")`, `isOwner(me)`); the server still enforces.
- **Idempotency:** every create that can be retried sends a key generated once per form (`uuid()`), reused on retry.
- **Money:** display with `formatMoney` (₹, Indian grouping). Send decimals as strings where the API accepts them.
- **Forms that fully replace a record** (PATCH variant, PATCH customer, POST stores, PUT settings/invoice) must send every field, starting from the loaded values.

## UI kit (`@/ui`)

`Screen` (safe area, scroll, pull to refresh, sticky `footer`), `Header` (back, title, right actions), `Card`, `Row`, `Stack`, `Divider`,
`Button` (primary/secondary/soft/ghost/danger/success, sizes, loading, icon), `IconButton`, `PressableScale`,
`Input`, `SearchBar`, `Select` (searchable sheet), `Chip`, `ChipRow`, `Segmented`, `Stepper`, `ToggleRow`,
`ListRow`, `SectionTitle`, `Badge`, `Avatar`, `IconCircle`, `StatTile`, `AnimatedNumber`,
`Skeleton*`, `EmptyState`, `ErrorState`, `Sheet`, `toast`, `confirm`, `Icon` (Ionicons names).
`StorePill` (store switcher) is in `@/ui/StorePill`. `MenuSection` (grouped menu) is in `@/features/more/MenuGrid`.

## Running

```bash
npm install
cp .env.example .env.local        # set EXPO_PUBLIC_API_URL, or EXPO_PUBLIC_MOCK=1 for the demo backend
npx expo start                    # dev server (use a development build for camera/Bluetooth)
npm run check                     # typecheck + lint + tests
npm run export:web && npm run screenshots   # mock web build and screenshots in docs/screenshots
```

Demo sign-in (mock): owner `owner@luzzan.in` / `demo1234` or code `123456`; staff shop `LUZ482`, `ravi` (cashier) or `meena` (manager), PIN `1234`.
