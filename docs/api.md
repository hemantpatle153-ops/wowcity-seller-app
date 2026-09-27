# WowCity API v1 (mobile POS)

The buyer app uses a separate public API: see `docs/buyer-api.md`.

The seller mobile app and future apps talk to this server over JSON at `/api/v1`. The web app uses the same business logic, so a bill posted from a phone follows exactly the same rules as one posted at the counter PC.

## Conventions

- Send `Authorization: Bearer <accessToken>` on every call except sign-in and refresh. Cookies are never accepted here.
- Success returns `{ "data": … }`. Failure returns `{ "error": { "code", "message" } }`; `message` is safe to show the user.
- Status codes:

  | Code | Meaning |
  |---|---|
  | 401 | Sign in again. Refresh once; if that fails, show the login screen. |
  | 403 | No permission. |
  | 422 | Rejected input or business rule. |
  | 429 | Too many attempts. |

- Money comes back as numbers or decimal strings in rupees. The server recomputes every total, so the app only proposes items, quantities, discounts and tender.

## Sessions

| Call | Body | Returns |
|---|---|---|
| `POST /auth/owner-login` | `{ email, password, deviceName?, platform? }` | tokens |
| `POST /auth/staff-login` | `{ shopCode, username, pin, deviceName?, platform? }` | tokens |
| `POST /auth/otp/request` | `{ identifier, purpose: "login" \| "signup" }` | `{ sentTo, channel }`. `identifier` is an email or a mobile number (10-digit Indian numbers get +91). For `login` the reply is the same whether or not the account exists |
| `POST /auth/otp/verify` | `{ identifier, code, purpose, deviceName?, platform?, shop? }` | `login`: tokens. `signup`: `{ shopCode, …tokens }` (201); `shop` holds ownerName, phone, shopName, businessType?, gstin?, legalName?, addressLine1, addressLine2?, city, state, pincode |
| `POST /auth/signup` | shop details plus `{ email, password }` | `{ shopCode, …tokens }` (201): password sign-up |
| `POST /auth/refresh` | `{ refreshToken }` | new tokens (the old refresh token stops working) |
| `POST /auth/logout` | — | `{ signedOut: true }` |
| `DELETE /account` | `{ confirm: "<shop code>" }` (owner only) | `{ deleted: true }`. Closes the shop: it leaves the marketplace, staff and devices are signed out, the owner's login and contact details are deleted. Bills and ledgers are kept only as tax law requires. Required by the App Store and Play Store |

Codes: 5 sends per email/mobile an hour, 20 per network an hour, and 8 wrong codes lock that email/mobile for 15 minutes. A code lasts 10 minutes. Sign-up errors: `409 already_registered` when the login already has a shop.

Tokens look like `{ accessToken, refreshToken, tokenType: "Bearer", expiresIn: 900 }`.

- The access token lasts 15 minutes. The refresh token lasts 30 days and rotates on every use.
- Keep the refresh token in the device's secure storage.
- Reusing an old refresh token signs that device out, because it means the token leaked.

A phone is also signed out when:
- the owner signs it out in Settings or Staff
- the owner resets the staff member's PIN, disables them, or uses "sign out everywhere"
- the staff member is outside their working hours
- the owner changes their own password

## Endpoints

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/me` | any | Actor, permissions, stores, shop settings (rounding, print format, UPI, terms) |
| GET | `/dashboard?store=` | any | Owner overview or the staff member's own day |
| GET | `/catalog/lookup?q=&storeId=&inStock=` | sale.* | Exact barcode first, else a name search. Includes rate, MRP, GST and stock |
| GET | `/customers/search?q=` | sale.create / sale.return | Name or mobile, with balance |
| GET | `/sales/original-bill?billNumber=` | sale.return | A bill's lines and how much is still returnable |
| POST | `/sales` | sale.create / sale.return | Sale, estimate or return (payload below) |
| GET | `/sales?range=today&view=bills\|returns&page=` | sale.* | Staff see only their own bills |
| GET | `/sales/{invoiceId}` | sale.* | Full invoice for on-screen, thermal or A4 print and sharing |
| GET | `/stock?q=&store=&status=&page=` | stock.view | Same filters as the web Stock page. Each item has `image` (thumbnail URL or null); `unitCost` and `summary.costValue` are null without purchase.view_cost |
| GET | `/sync/catalog?storeId=&sinceAt=&sinceId=&limit=` | sale.* / stock.view | Offline catalogue for one store: items, barcodes, price, MRP, GST and stock. Changed rows only after the first call |
| GET | `/sync/customers?sinceAt=&sinceId=&limit=` | sale.create / sale.return | Offline customer list with current balances |
| GET | `/products/{productId}/images` | stock.view | Photos, cover first |
| POST | `/products/{productId}/images` | product.images.manage | `{ objectKey, contentType, variantId? }` after uploading: get a URL from `POST /api/r2/product-image-upload` (`{ productId, fileName, contentType, sizeBytes }`), PUT the file to it, then send the returned `objectKey` here. Max 4 photos, 5 MB each |
| PATCH | `/products/{productId}/images/{imageId}` | product.images.manage | `{ primary: true }` makes it the cover buyers see first |
| DELETE | `/products/{productId}/images/{imageId}` | product.images.manage | Removes the photo and its file; the next photo becomes the cover |
| GET | `/reports` | any | Reports this person may open, grouped |
| GET | `/reports/{slug}?range=&from=&to=&store=&view=&q=` | per report | Stats, notes and tables with totals (up to 5,000 rows per table) |
| GET | `/api/reports/{slug}/export?…&table=` | per report | CSV download of one table (needs reports.export for staff) |

### Offline sync

1. **First run:** call `/sync/catalog?storeId=…` with no cursor. Store the items locally, then call again with `sinceAt` and `sinceId` from `data.next` while `data.hasMore` is true.
2. **Later:** call with the saved cursor to get only the items whose price, stock, details or barcodes changed. Items with `active: false` were removed from sale.
3. **Customers:** `/sync/customers` works the same way.

### Sale payload

```json
{
  "kind": "sale",
  "storeId": "uuid",
  "billType": "invoice",
  "taxType": "inclusive",
  "idempotencyKey": "device-generated-uuid",
  "customer": { "id": "uuid?", "name": "", "mobile": "", "state": "" },
  "rows": [{ "variantId": "uuid", "itemName": "Cotton Kurta", "qty": "1", "mrp": "1499", "rate": "1199", "discountPercent": "0", "discountAmount": "0" }],
  "extraDiscountPercent": "0",
  "extraDiscountAmount": "0",
  "payments": [{ "mode": "upi", "amount": "1199", "referenceNo": "" }],
  "useAdvance": false,
  "creditChangeToAccount": false
}
```

- **Offline bills:** a bill made without internet is sent with `"offline": true` when it syncs. It posts even if stock ran out in the meantime: stock may go below zero and the line is flagged as oversold for the owner. Only device sessions can use this.
- **Retries:** generate `idempotencyKey` once per bill and resend the same key after a network error. The server never posts the same bill twice.
- **Returns:** use `kind: "return"` with `refundMode` (`cash` or `credit_note`), `originalSaleInvoiceId`, and `originalItemId` on each row.
- **Bill types:** `billType` is `invoice` or `estimate`. Estimates do not move stock.
- **Discounts:** staff without `sale.discount_override` always bill at catalogue prices.
