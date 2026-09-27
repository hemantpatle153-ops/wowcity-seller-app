# WowCity Seller — Mobile App Specification

This file describes the future mobile app direction for WowCity Seller. The first implementation priority remains the desktop local-hosted seller POS described in `instructions.md` and governed by `agents.md`. The mobile design should be prepared now through database/API decisions so the phone app can be added without rebuilding the whole system.

## 1. Mobile Product Scope

There are two future mobile product families:

| Mobile Product | User | Purpose | Build Timing |
|---|---|---|---|
| WowCity Seller Mobile POS | Seller owner/admin and workers | Purchase/restock, POS billing, barcode scanning by phone camera, invoice print/download/share, worker-limited operations. | After desktop MVP foundation. |
| WowCity User App/Web | Buyers | Discover nearby clothing inventory by location/radius, search products, view shop inventory, see in-stock/out-of-stock, then visit shop to buy. | Later phase after seller system and public listing data are stable. |

## 2. Seller Mobile POS Roles

| Role | Mobile Access |
|---|---|
| Seller owner | Full seller mobile access: POS, purchase/restock, stock, reports, workers, store status, product visibility, images. |
| Seller admin/store manager | Access based on permissions assigned by owner. |
| Worker/cashier | Limited mobile access by default: POS billing, own bill history, invoice print/share, maybe purchase/restock if granted. |
| Purchase worker | Purchase/restock-only phone access if seller grants it. |
| Accountant | Reports/GST/due access if granted; no POS by default. |

Worker accounts are created by seller owner/admin. Workers do not self-signup. Workers log in with assigned username and password/PIN. Seller can disable any worker or all workers immediately.

## 3. Mobile App Login Screens

### 3.1 Seller Login

| Field | Control | Notes |
|---|---|---|
| Phone/email/username | Text input | Same seller identity as desktop. |
| Password/PIN | Password input | Secure auth. |
| Login button | Primary button | Loads seller owner/admin session. |
| Forgot password | Link | Recovery. |

### 3.2 Worker Login

| Field | Control | Notes |
|---|---|---|
| Shop Code | Text input | **Required.** Resolves to the seller/tenant (`seller_id`) first. |
| Worker username | Text input | Unique **within the seller** only (key `(seller_id, username)`); not globally unique. |
| Password/PIN | Password/PIN input | Worker credential. |
| Login as Worker | Primary button | Authenticates `(seller_id, username, password)`; rejects disabled workers. Loads worker permissions and assigned store(s). |

### 3.3 New Seller Signup

Mobile signup can mirror desktop but should be simplified:

1. Owner details.
2. Shop details.
3. Address/location map pin.
4. GST/business details.
5. Finish and open seller dashboard.

## 4. Mobile Navigation Model

### Seller Owner Bottom Navigation

| Tab | Purpose |
|---|---|
| Home | Today's sale, stock alerts, pending dues, quick actions. |
| Sell | POS billing with barcode camera scanner. |
| Purchase | Product creation/restock, image upload, barcode print request. |
| Stock | Search stock, low stock, public status, out-of-stock. |
| Insights | **Customer Insights (read-only):** search by product/customer name/mobile, see what customers bought, export CSV. Marketing decisions on the go. |
| More | Reports, workers, stores, settings. |

### Worker Bottom Navigation

| Tab | Purpose |
|---|---|
| Sell | Main POS screen. |
| Bills | Own bills, reprint/share invoice. |
| Stock | Optional stock lookup if granted. |
| Profile | Login/session info. |

## 5. Mobile POS Billing Screen

**Desktop reference:** Sale Entry in `instructions.md`, `PDF-A p.3-p.4`, `PDF-B p.7-p.8`.

### Mobile Layout

- Header: store name, role, active session, network status.
- Large scan button: `Scan Barcode` opens camera scanner.
- Search bar: item/barcode/customer search.
- Cart list: product image thumbnail, item name, size/colour, qty stepper, rate, discount, line total.
- Customer section: cash customer default, mobile number, customer selector.
- Totals card: total qty, MRP, discount, GST, net sale.
- Payment card: cash/UPI/card/credit amount, tender, cash return.
- Sticky footer: `Save`, `Save & Print`, `Download Invoice`, `Share` after save.

### Mobile POS Inputs

| Label | Control Type | Backend Field | Notes |
|---|---|---|---|
| Scan Barcode | Camera scanner button | `scan_barcode` | Decoded barcode uses `(seller_id, barcode)`. |
| Manual Barcode | Text input | `scan_barcode` | Fallback when camera fails. |
| Item Search | Search input | `item_search_query` | Filters current seller/store stock. |
| Customer Mobile | Phone input | `customer_mobile` | Finds or attaches customer. |
| Sale Mode | Segmented control | cash/credit/return | Matches desktop Cash/Credit/Return modes. |
| Qty | Stepper/input | `sale_items[].quantity` | Touch-friendly. |
| Discount | Numeric input | `%` or amount | Permission-controlled. |
| Payment Mode | Selector | `payments[].payment_mode` | Cash/UPI/card/credit. |
| Amount | Numeric input | `payments[].amount` | Tender amount. |

### Mobile POS Save Behavior

- Validate worker active status at save time.
- Validate available stock from Supabase before final sale.
- Create sale invoice, sale items, payments, stock ledger, inventory update, customer ledger if needed.
- Generate invoice PDF/print payload.
- Log worker activity.
- Update public listing state if stock reaches zero.

## 6. Mobile Purchase / Restock Screen

**Desktop reference:** Purchase Entry in `instructions.md`, `PDF-A p.1-p.2`, `PDF-B p.1-p.6`.

### Mobile Layout

- Header: supplier selector, GST type, purchase date, invoice number.
- Scanner section: `Scan Existing Barcode` or `Create New Product`.
- Item cards instead of a wide desktop grid.
- Each item card contains product name, brand, size, colour, style, qty, purchase rate, MRP, sale rate, GST, discounts.
- Expandable `Images & Public Listing` area per product.
- Totals card with taxable value, GST, total quantity, gross purchase, due.
- Footer: `Save Draft`, `Save Purchase`, `Print Barcode Labels`.

### Mobile Purchase Inputs

| Label | Control Type | Backend Field | Notes |
|---|---|---|---|
| Supplier | Searchable dropdown | `supplier_id` | Add supplier flow available. |
| GST Type | Dropdown | `gst_pricing_mode` | Inclusive/exclusive. |
| Invoice No. | Text input | `supplier_invoice_number` | Supplier reference. |
| Scan Barcode | Camera scanner | `barcode` | Existing barcode restocks; new barcode can be generated. |
| Product Name | Text/search input | `products.name` | Creates product through purchase flow. |
| Brand / Size / Colour / Style | Dropdown/text | variant fields | Clothing-focused fields. |
| GST Slab | Dropdown | `gst_rate_id` | Uses GST options from `instructions.md`. |
| Quantity | Number input/stepper | `qty` | Restock quantity. |
| Purchase Rate | Number input | `purchase_rate` | Sensitive internal. |
| MRP / Sale Rate | Number inputs | `mrp`, `sale_rate` | Optional public fields if toggled. |
| Product Images | Camera/gallery upload | `product_images[]` | Max 4 images stored in R2. |
| Show on User App | Toggle | `is_public_enabled` | Master public toggle. |
| Field Visibility | Toggle list | `publication_fields` | Seller chooses fields for user app. |
| Custom Columns | Dynamic inputs | `custom_field_values` | Seller-specific. |

### Mobile Purchase Save Behavior

- New barcode generation is seller-scoped.
- Existing barcode under same seller restocks matching variant.
- Images upload to Cloudflare R2 and metadata is stored in Supabase.
- Final save increases stock and updates public listing state.
- Barcode print can create a PDF job for A4 labels; printing can happen from desktop or supported mobile printer flow later.

## 7. Mobile Barcode Scanner

### Scanner Requirements

| Requirement | Details |
|---|---|
| Camera permission | Request only when scanner opens. |
| Manual fallback | Always provide manual barcode input. |
| Seller scope | Decoded barcode is resolved with current `seller_id`. |
| Store scope | POS sale checks selected/assigned store inventory. |
| Feedback | Vibration/beep on scan success where supported. |
| Duplicate prevention | Avoid adding same scan repeatedly within a short debounce window. |
| Low light support | Torch toggle where device supports it. |

### Scan Use Cases

| Use Case | Result |
|---|---|
| Sale scan existing product | Adds product to cart or increments qty. |
| Purchase scan existing product | Restocks product. |
| Purchase scan unknown barcode | Offers create new product with that barcode. |
| Barcode print verification | Confirms printed label maps to correct item. |

## 8. Mobile Invoice, Print, and Download

| Feature | Mobile Behavior |
|---|---|
| Invoice preview | Show after sale save. |
| Download PDF | Save/share PDF from mobile. |
| Print | Support browser/system print or future Bluetooth/thermal printer integration. |
| Share | Future WhatsApp/share sheet. |
| Reprint | Bills screen lets authorized user reprint/download. |
| Worker logging | Print/download/share actions are logged. |

## 9. Mobile Worker Controls for Seller Owner

Seller owner mobile app should later include emergency staff control:

| Control | Behavior |
|---|---|
| Disable Worker | Immediately blocks worker's next server action and login. |
| Disable All Workers | Off-time lockdown. |
| Worker Logs | View who sold what, when, from which device/store. |
| Store Access | Change assigned store(s). |
| Permission Toggle | Grant/revoke POS, purchase, reports, discounts. |

## 10. Mobile Reports

Desktop should have full reports first. Mobile can start with summaries:

| Report | Mobile Version |
|---|---|
| Today's Sale | Cards for total sale, cash/UPI/credit, item count. |
| Worker Sale | Worker-wise sale summary and bill list. |
| Stock Search | Barcode/product stock with public status. |
| Low/Out of Stock | Quick replenishment list. |
| Customer Due | Simple due list. |
| Supplier Due | Owner/admin only. |
| P&L | Owner/accountant only, summary first. |
| GST | Mobile view only; export/download can remain desktop first. |

## 11. Future WowCity User App/Web

The user app/web is buyer-facing and comes later. The seller system should prepare the public data model now.

### Buyer Experience

1. User opens WowCity user app/web.
2. App detects user city/location or user enters location manually.
3. User selects radius.
4. App shows shops and inventory within that radius.
5. User can search for a product or scroll inventory.
6. Product cards show seller-approved fields only.
7. Out-of-stock products show out-of-stock for that specific seller.
8. User visits shop to buy; seller completes sale in WowCity Seller POS.

### User App Screens

| Screen | Purpose |
|---|---|
| Location Select | Current location, city input, radius selector. |
| Marketplace Feed | Product cards from nearby shops. |
| Search Results | Product/shop results filtered by radius. |
| Product Detail | Images, approved attributes, price if seller allows, stock status, shop info. |
| Shop Profile | Store name, public address/contact/hours if seller allows. |
| Saved/Favorites | Optional future feature. |

### Public Product Card Fields

| Field | Source | Visibility |
|---|---|---|
| Product image | R2 image via public-safe URL/proxy | Product public + image exists. |
| Product name | Seller product | Field toggle. |
| Brand | Product brand | Field toggle. |
| Size | Variant | Field toggle. |
| Colour | Variant | Field toggle. |
| Style/category | Product/variant | Field toggle. |
| Price/MRP/sale rate | Pricing | Field toggle. |
| Store name/city | Store | Store public toggle. |
| Distance | Store coordinates | User location/radius query. |
| Stock status | Inventory/public listing | Always safe as in-stock/out-of-stock if product is public. |

### User App Data Safety

The user app must not receive buying price, supplier, cost, profit, margin, exact internal stock quantity if seller disables it, customer details, worker logs, accounting, reports, or hidden custom fields.

## 12. API Readiness for Mobile

Design APIs/RPCs so desktop and mobile can share logic:

| API Family | Purpose |
|---|---|
| Auth/session | Seller/worker login, role, seller/store context. |
| Product lookup | Barcode/item search under seller/store. |
| Purchase save | Shared purchase transaction endpoint. |
| Sale save | Shared sale transaction endpoint. |
| Image upload | R2 upload authorization + metadata save. |
| Invoice | Generate/download/print/share invoice. |
| Reports | Summary and detailed endpoints with permissions. |
| Worker admin | Worker disable/enable/logs. |
| Public listings | Future user app read-only listing/search/radius. |

## 13. Network and Offline Behavior

The system is internet-connected. Final stock/accounting writes need Supabase sync. Mobile can support temporary local UI drafts during poor network, but:

- Do not show unsynced drafts as final inventory.
- Do not allow offline final sale if it could oversell stock.
- Do not publish public inventory changes until the server transaction succeeds.
- Show clear network status.
- Let users retry failed uploads/saves.

## 14. Mobile Build Roadmap

### Stage M1: Responsive Desktop Foundation

- Ensure desktop components can be reused responsively.
- Keep business logic server-side/shared.
- Build reusable POS cart, barcode search, invoice, and permission modules.

### Stage M2: Seller Mobile MVP

- Seller/worker login.
- POS sale with camera scanner.
- Invoice download/share.
- Own bill history for worker.
- Owner worker logs and disable worker.

### Stage M3: Mobile Purchase and Images

- Purchase/restock on phone.
- Camera/gallery upload up to 4 images.
- Public visibility toggles.
- Barcode print job creation.

### Stage M4: Mobile Reports and Admin

- Owner dashboard.
- Stock search/low-stock.
- Sales summaries.
- Customer/supplier due summaries.
- Store settings.

### Stage M5: WowCity User App/Web

- Public listing data model hardened.
- Location/radius search.
- Marketplace feed and search.
- Product/shop detail.
- Out-of-stock display.

## 15. Mobile Testing Checklist

| Test | Expected Result |
|---|---|
| Worker logs in with assigned username | Worker sees only allowed tabs. |
| Disabled worker attempts sale | Save is blocked. |
| Phone scans barcode in POS | Item resolves only under current seller and store. |
| Phone scans unknown barcode in purchase | Create-new-product flow opens. |
| Upload 5th image | App blocks upload after 4 images. |
| Sell last unit | Product becomes out of stock in public listing. |
| Credit sale without customer | App requires customer. |
| Invoice download | PDF downloads/shares correctly. |
| Owner disables all workers | All worker sessions blocked for new actions. |
| User app reads public listing | Only seller-approved public fields appear. |
