# PAGE & COMPONENT MAP — Dealz K.K.

## Overview

The app has 3 main areas:
1. **Admin Panel** — Staff-facing (behind Supabase Auth)
2. **Public Shop** — Customer-facing (no auth required to browse)
3. **Customer Portal** — Customer account (PIN-based auth)

---

## Route Structure

```
/                           → Redirect to /admin/dashboard
/admin/login                → Staff login (Supabase Auth)
/admin/dashboard            → Dashboard overview
/admin/items                → Item list
/admin/items/intake         → Bulk item intake
/admin/items/:id            → Item detail / edit
/admin/items/scan           → QR scanner → item lookup
/admin/inspection           → IT inspection queue
/admin/inspection/:id       → Inspect single item
/admin/products             → Product model list
/admin/products/:id         → Product model detail
/admin/configs              → Config group list
/admin/photo-groups         → Photo group list
/admin/photo-groups/:id     → Photo group detail + media
/admin/sell-groups          → Sell group list
/admin/sell-groups/:id      → Sell group detail + assign items
/admin/orders               → Order list
/admin/orders/:id           → Order detail
/admin/orders/packing       → Packing station (QR scan to verify)
/admin/suppliers            → Supplier list
/admin/customers            → Customer list
/admin/customers/:id        → Customer detail
/admin/kaitori              → Kaitori request list (staff review)
/admin/kaitori/:id          → Kaitori request detail (inspect + pay)
/admin/kaitori/price-list   → Kaitori price list management
/admin/reports              → Reports & analytics

/shop                       → Public shop browse page
/shop/:productSlug          → Product detail (grade breakdown)
/shop/checkout/:sellGroupId → Checkout for specific G-code

/sell                       → Kaitori landing page (sell your device)
/sell/assess                → Kaitori self-assessment form
/sell/quote/:kaitoiId       → View quote result
/sell/status/:kaitoiId      → Track Kaitori request status

/order/:sellGroupCode       → Live selling direct link → checkout

/account/login              → Customer login (PIN-based)
/account/register           → Customer registration
/account/dashboard          → Customer dashboard
/account/orders             → Order history
/account/orders/:id         → Order detail + tracking
/account/kaitori            → Kaitori request history
/account/settings           → Profile, address, bank details
/account/verify-id          → ID verification upload (本人確認)
```

---

## Admin Panel Pages

### Layout: `AdminLayout`
- Sidebar navigation with sections: Dashboard, Inventory, Selling, Orders, Kaitori, Settings
- Top header with: staff name, logout, QR scan shortcut
- Components: `Sidebar`, `TopHeader`, `BreadcrumbNav`

---

### 1. Dashboard (`/admin/dashboard`)

**Purpose**: Overview of key metrics and pending actions.

**Components**:
- `StatsCardGrid` — Total items by status, orders pending, Kaitori pending
- `RecentActivityFeed` — Latest inspections, orders, Kaitori payments
- `AlertBanner` — Items needing attention (REPAIR overdue, unverified PGs)

**Data Needs**:
- `items` — count grouped by `item_status`
- `orders` — count grouped by `order_status`
- `kaitori_requests` — count grouped by `request_status`
- Recent activity from multiple tables (last 20 actions)

---

### 2. Item List (`/admin/items`)

**Purpose**: Browse, search, and filter all physical items.

**Components**:
- `ItemTable` — Sortable table with columns: P-code, model, config, grade, status, source
- `ItemFilters` — Filter by: status, grade, source_type, supplier, date range
- `SearchBar` — Search by P-code, model name, brand
- `BulkActions` — Bulk status change, bulk assign to sell group

**Data Needs**:
- `items` joined with `product_models`, `config_groups`, `photo_groups`, `suppliers`

---

### 3. Bulk Item Intake (`/admin/items/intake`)

**Purpose**: Rapidly create multiple P-items from a supplier shipment.

**Components**:
- `IntakeForm` — Select supplier, source_type, optionally pre-assign PG/config
- `IntakeItemRow` — Repeating row: auto-generated P-code, purchase price, notes
- `QRPrintQueue` — After save, queue of QR stickers to print
- `QRPrintPreview` — Print layout for QR stickers (P-code + model name)

**Data Needs**:
- `suppliers` (dropdown)
- `photo_groups` (optional pre-assign dropdown)
- `config_groups` (optional pre-assign dropdown)
- Write to `items`
- Call `generate_code('P', 'p_code_seq')` for each item

---

### 4. Item Detail (`/admin/items/:id`)

**Purpose**: View and edit a single item's full record.

**Components**:
- `ItemHeader` — P-code, QR display, status badge, grade badge
- `ItemSpecsCard` — Config group details (CPU, RAM, storage)
- `ItemPhotoGroupCard` — Assigned PG with thumbnail, verified status
- `ItemHistoryTimeline` — Audit log (created, inspected, assigned to G, packed)
- `ItemEditForm` — Edit grade, status, notes, PG/config assignment
- `QRCodeDisplay` — Large QR for printing

**Data Needs**:
- `items` with all joins (product_model, config_group, photo_group, supplier)
- `sell_group_items` → which G-code (if any)
- `order_items` → which order (if any)
- `kaitori_requests` (if source_type = KAITORI)

---

### 5. QR Scanner (`/admin/items/scan`)

**Purpose**: Scan a QR code to instantly pull up an item.

**Components**:
- `QRScannerCamera` — Camera-based QR reader
- `ManualCodeInput` — Fallback: type P-code manually
- Redirects to `/admin/items/:id` on successful scan

**Data Needs**:
- `items` lookup by `item_code`

---

### 6. IT Inspection Queue (`/admin/inspection`)

**Purpose**: List of items awaiting inspection (status = INTAKE).

**Components**:
- `InspectionQueue` — Table of INTAKE items, sorted by created_at
- `ScanToInspect` — QR scan button to start inspection
- `InspectionStats` — Count remaining, inspected today

**Data Needs**:
- `items` where `item_status = 'INTAKE'` joined with product_models, config_groups

---

### 7. Inspect Single Item (`/admin/inspection/:id`)

**Purpose**: Full IT inspection workflow for one item.

**Components**:
- `InspectionHeader` — P-code, model name, supplier info
- `PhotoGroupVerifier` — Show current PG photos, toggle "verified" or reassign
- `SpecsVerificationForm` — Confirm/edit CPU, RAM, storage, OS
- `ConditionGrader` — Select grade S/A/B/C/D/J with visual guide
- `ACAdapterCheck` — Select CORRECT / INCORRECT / MISSING
- `InspectionNotesField` — Free text for specs_notes and condition_notes
- `InspectionSubmitBar` — Save + set status (AVAILABLE / REPAIR / grade J)

**Data Needs**:
- `items` full record
- `photo_groups` + `photo_group_media` for visual comparison
- `config_groups` for spec verification
- Write: update `items` (grade, status, inspected_by, inspected_at, notes)

---

### 8. Product Models (`/admin/products`)

**Purpose**: Manage the product model catalog.

**Components**:
- `ProductTable` — List of models with brand, name, form factor
- `ProductForm` — Create/edit product model
- `ProductDetail` — View model with linked config groups and photo groups

**Data Needs**:
- `product_models` with counts of linked `config_groups` and `photo_groups`

---

### 9. Config Groups (`/admin/configs`)

**Purpose**: Manage spec variants.

**Components**:
- `ConfigTable` — List with model, CPU, RAM, storage, status
- `ConfigForm` — Create/edit config group
- `ConfigStatusToggle` — DRAFT → CONFIRMED

**Data Needs**:
- `config_groups` joined with `product_models`

---

### 10. Photo Groups (`/admin/photo-groups`)

**Purpose**: Manage visual identity groups.

**Components**:
- `PhotoGroupGrid` — Card grid with hero thumbnail, PG-code, color, status
- `PhotoGroupDetail` — Full media gallery with upload/reorder/delete
- `MediaUploader` — Drag-and-drop upload to Supabase Storage
- `PhotoGroupForm` — Create/edit PG (assign model, color)

**Data Needs**:
- `photo_groups` joined with `product_models`, `photo_group_media`
- Supabase Storage for upload/download

---

### 11. Sell Group List (`/admin/sell-groups`)

**Purpose**: Manage selling groups.

**Components**:
- `SellGroupTable` — G-code, model, config, grade, price, item count, active toggle
- `SellGroupFilters` — Filter by active, grade, model

**Data Needs**:
- `sell_groups` joined with `product_models`, `config_groups`, `photo_groups`
- `sell_group_items` count per group

---

### 12. Sell Group Detail (`/admin/sell-groups/:id`)

**Purpose**: View and manage a single sell group, assign/remove items.

**Components**:
- `SellGroupHeader` — G-code, model, grade, price, active toggle
- `SellGroupItemList` — P-items currently assigned, with remove action
- `AvailableItemPicker` — Browse AVAILABLE items matching config + grade to add
- `SellGroupForm` — Edit price, active status
- `ShareLinkGenerator` — Generate live-selling link for this G-code

**Data Needs**:
- `sell_groups` with joins
- `sell_group_items` joined with `items`
- `items` (available, matching config + grade, not already assigned)

---

### 13. Order List (`/admin/orders`)

**Purpose**: View and manage all orders.

**Components**:
- `OrderTable` — ORD-code, customer, G-code, qty, status, source, date
- `OrderFilters` — Filter by status, source, date range

**Data Needs**:
- `orders` joined with `customers`, `sell_groups`

---

### 14. Order Detail (`/admin/orders/:id`)

**Purpose**: View order details, manage status, see assigned items.

**Components**:
- `OrderHeader` — ORD-code, status badge, customer info, shipping address
- `OrderItemList` — P-items assigned to this order, packed status
- `OrderStatusStepper` — Visual status flow with action buttons
- `OrderStatusActions` — Confirm, mark packed, mark shipped

**Data Needs**:
- `orders` with customer join
- `order_items` joined with `items`

---

### 15. Packing Station (`/admin/orders/packing`)

**Purpose**: Scan QR codes to verify and pack items for shipment.

**Components**:
- `PackingScanner` — QR scan input
- `PackingVerification` — Shows order info, expected items, scanned items
- `PackingChecklist` — Green check per item scanned, red for mismatches
- `PackingComplete` — All items scanned, mark order as PACKED

**Data Needs**:
- `order_items` joined with `items` and `orders`
- Write: update `order_items.packed_at`, `order_items.packed_by`
- Write: update `orders.order_status` → PACKED

---

### 16. Supplier List (`/admin/suppliers`)

**Components**:
- `SupplierTable` — Name, type, contact, item count
- `SupplierForm` — Create/edit supplier

**Data Needs**:
- `suppliers` with `items` count

---

### 17. Customer List (`/admin/customers`)

**Components**:
- `CustomerTable` — CUST-code, name, email, phone, is_seller, id_verified
- `CustomerFilters` — Filter by seller status, verified status

**Data Needs**:
- `customers` with order count, kaitori request count

---

### 18. Customer Detail (`/admin/customers/:id`)

**Components**:
- `CustomerHeader` — CUST-code, name, contact info, seller status
- `CustomerOrderHistory` — Orders table
- `CustomerKaitoriHistory` — Kaitori requests table
- `IDVerificationReview` — View uploaded ID, approve/reject
- `BankDetailsCard` — Bank info (for sellers)

**Data Needs**:
- `customers` full record
- `orders` for this customer
- `kaitori_requests` for this customer

---

### 19. Kaitori Request List (`/admin/kaitori`)

**Purpose**: Staff queue of Kaitori requests to review, inspect, and pay.

**Components**:
- `KaitoriTable` — KT-code, seller name, model, status, quote price, date
- `KaitoriFilters` — Filter by status (RECEIVED, INSPECTING, PRICE_REVISED, APPROVED)
- `KaitoriStatusTabs` — Tab per status for quick navigation

**Data Needs**:
- `kaitori_requests` joined with `customers`, `product_models`

---

### 20. Kaitori Request Detail (`/admin/kaitori/:id`)

**Purpose**: Staff reviews a Kaitori request — inspect, revise price, pay.

**Components**:
- `KaitoriHeader` — KT-code, status, seller info, delivery method
- `KaitoriSellerAssessment` — What the seller declared (battery, screen, body)
- `KaitoriMediaGallery` — Photos uploaded by seller
- `KaitoriStaffInspection` — Staff enters their findings, compare vs declared
- `KaitoriPriceRevision` — Revise price + reason (if discrepancy)
- `KaitoriPaymentForm` — Process cash or bank transfer payment
- `KaitoriToInventory` — Button to create P-code and send to intake pipeline

**Data Needs**:
- `kaitori_requests` full record
- `kaitori_request_media` for photos
- `customers` for seller details and bank info
- `product_models`, `config_groups` for model info
- Write: update request status, final_price, payment fields
- Write: create `items` record (source_type = KAITORI)

---

### 21. Kaitori Price List (`/admin/kaitori/price-list`)

**Purpose**: Manage the fixed pricing matrix for auto-quotes.

**Components**:
- `PriceListTable` — Model, config, battery/screen/body conditions, price, active
- `PriceListForm` — Create/edit price entries
- `PriceListBulkEdit` — Bulk update prices for a model

**Data Needs**:
- `kaitori_price_list` joined with `product_models`, `config_groups`

---

### 22. Reports (`/admin/reports`)

**Components**:
- `InventoryReport` — Items by status, grade, source over time
- `SalesReport` — Revenue, orders, by channel (shop/live)
- `KaitoriReport` — Purchase volume, quote accuracy, payment stats
- `InspectionReport` — Items inspected per day, average time

**Data Needs**:
- Aggregated queries across all tables

---

## Public Shop Pages

### Layout: `ShopLayout`
- Top navigation: Shop, Sell Your Device, My Account
- Clean, customer-friendly design
- Components: `ShopHeader`, `ShopFooter`

---

### 23. Shop Browse (`/shop`)

**Purpose**: Browse all available products.

**Components**:
- `ShopSearchBar` — Text search
- `ShopFilters` — Brand, form factor, price range, grade
- `ShopSortSelect` — Price low/high, newest, most available
- `ProductCardGrid` — Level 1 cards (model + config grouped)
  - `ProductCard` — Hero image, name, specs summary, stock count, price range

**Data Needs**:
- `sell_groups` (active) joined with `product_models`, `config_groups`, `photo_groups`
- `sell_group_items` count (only AVAILABLE, unordered items)
- `photo_group_media` (hero role) for thumbnails

---

### 24. Product Detail (`/shop/:productSlug`)

**Purpose**: Level 2 — grade breakdown for a specific model + config.

**Components**:
- `ProductGallery` — Photo group images (hero + gallery)
- `ProductSpecs` — Full spec list from config group
- `GradeBreakdownTable` — Each available grade with qty, price, add-to-order button
  - `GradeRow` — Grade badge, description, quantity, price, action

**Data Needs**:
- `sell_groups` for this model + config, grouped by grade
- `sell_group_items` count per G-code
- `photo_group_media` for gallery
- `product_models` + `config_groups` for specs

---

### 25. Checkout (`/shop/checkout/:sellGroupId` or `/order/:sellGroupCode`)

**Purpose**: Complete an order for a specific G-code (shared by shop and live-selling).

**Components**:
- `CheckoutProductSummary` — Model, grade, price, photo
- `QuantitySelector` — Select quantity (max = available stock)
- `CustomerAuthGate` — Login or register (PIN-based)
- `ShippingAddressForm` — Address input (or use saved default)
- `OrderConfirmation` — Review and confirm
- `OrderSuccessPage` — Order code, expected delivery, link to track

**Data Needs**:
- `sell_groups` + joins for product display
- `sell_group_items` count for max quantity
- `customers` for auth
- Write: create `orders` and `order_items`
- Edge Function: `reserve-items` (atomically assign P-items to order)

---

## Kaitori Public Pages

### 26. Kaitori Landing (`/sell`)

**Purpose**: Marketing page encouraging users to sell their devices.

**Components**:
- `KaitoriHero` — "Sell your device" headline, CTA
- `HowItWorks` — 4-step visual flow
- `KaitoriCTA` — Start assessment button

---

### 27. Kaitori Self-Assessment (`/sell/assess`)

**Purpose**: Seller fills in device info and gets instant quote.

**Components**:
- `ModelSelector` — Pick brand → model → config (cascading dropdowns)
- `ConditionQuiz` — Simple questions with visual aids:
  - `BatteryQuestion` — Good / Fair / Poor (with descriptions)
  - `ScreenQuestion` — Good / Fair / Poor / Cracked
  - `BodyQuestion` — Good / Fair / Poor / Damaged
- `PhotoUploader` — Upload front, back, screen, damage photos
- `SellerNotesField` — Optional text
- `QuoteResult` — Instant price display after submission
- `DeliveryMethodPicker` — Ship or walk-in
- `CustomerAuthGate` — Login or register before submitting

**Data Needs**:
- `product_models` (filtered to phones, laptops, tablets)
- `config_groups` for selected model
- `kaitori_price_list` for quote calculation
- `customers` for auth
- Write: create `kaitori_requests`, `kaitori_request_media`
- Edge Function: `kaitori-quote` (calculate price from matrix)

---

### 28. Quote Result (`/sell/quote/:kaitoriId`)

**Components**:
- `QuoteDisplay` — Price, model, conditions declared
- `AcceptRejectButtons` — Accept quote or cancel
- `DeliveryInstructions` — Shipping address/label or walk-in directions

**Data Needs**:
- `kaitori_requests` for this ID

---

### 29. Kaitori Status Tracker (`/sell/status/:kaitoriId`)

**Components**:
- `KaitoriStatusStepper` — Visual progress (Quoted → Accepted → Shipped → Received → Inspecting → Paid)
- `PriceRevisionAlert` — If price revised, show new price + accept/reject
- `PaymentConfirmation` — When paid, show amount + method

**Data Needs**:
- `kaitori_requests` for this ID
- Supabase Realtime subscription for status changes

---

## Customer Portal Pages

### Layout: `CustomerLayout`
- Simple header with: My Orders, My Sales (if seller), Settings, Logout

---

### 30. Customer Login (`/account/login`)

**Components**:
- `CustomerLoginForm` — Last name + email or phone + PIN
- `RegisterLink` — Link to registration

**Data Needs**:
- Edge Function: `customer-auth` (verify PIN)

---

### 31. Customer Registration (`/account/register`)

**Components**:
- `CustomerRegisterForm` — Last name, first name, email, phone, create PIN
- `PINSetup` — Enter + confirm 6-digit PIN

**Data Needs**:
- Write: create `customers` with hashed PIN
- Edge Function: `customer-auth` (register)

---

### 32. Customer Dashboard (`/account/dashboard`)

**Components**:
- `RecentOrders` — Last 5 orders with status
- `RecentKaitori` — Last 5 Kaitori requests (if seller)
- `QuickActions` — Shop, Sell Device, Update Profile

**Data Needs**:
- `orders` for this customer (last 5)
- `kaitori_requests` for this customer (last 5)

---

### 33. Order History (`/account/orders`)

**Components**:
- `OrderHistoryTable` — ORD-code, date, product, qty, price, status

**Data Needs**:
- `orders` joined with `sell_groups`, `product_models`

---

### 34. Order Detail (`/account/orders/:id`)

**Components**:
- `OrderStatusTracker` — Visual progress
- `OrderSummary` — Product, grade, qty, price, shipping address

**Data Needs**:
- `orders` full record with joins

---

### 35. Kaitori History (`/account/kaitori`)

**Components**:
- `KaitoriHistoryTable` — KT-code, model, date, status, quote, final price

**Data Needs**:
- `kaitori_requests` for this customer

---

### 36. Account Settings (`/account/settings`)

**Components**:
- `ProfileForm` — Edit name, email, phone
- `AddressForm` — Default shipping address
- `BankDetailsForm` — Bank info (for sellers)
- `PINChangeForm` — Change 6-digit PIN
- `SellerToggle` — Enable seller features

**Data Needs**:
- `customers` full record
- Write: update `customers`

---

### 37. ID Verification (`/account/verify-id`)

**Components**:
- `IDUploader` — Upload government-issued ID photo
- `IDVerificationStatus` — Pending / Verified / Rejected
- `IDRequirementInfo` — Explain 本人確認 requirement

**Data Needs**:
- `customers.id_document_url`, `id_verified`, `id_verified_at`
- Supabase Storage upload to `id-documents` bucket

---

## Shared Components

| Component | Used In | Purpose |
|-----------|---------|---------|
| `QRCodeDisplay` | Item detail, intake, print | Render QR from P-code |
| `QRScannerCamera` | Scan page, packing, inspection | Camera-based QR reader |
| `StatusBadge` | Everywhere | Colored badge for any status/grade |
| `GradeBadge` | Items, sell groups, shop | S/A/B/C/D/J with color coding |
| `SearchBar` | List pages | Debounced search input |
| `DataTable` | All list pages | Sortable, paginated table (shadcn) |
| `ConfirmDialog` | Destructive actions | "Are you sure?" modal |
| `ToastNotifications` | Everywhere | Success/error toasts |
| `EmptyState` | List pages | "No items found" placeholder |
| `LoadingSkeleton` | All pages | Skeleton while data loading |
| `PriceDisplay` | Shop, orders, kaitori | Format ¥ price with locale |
| `CodeDisplay` | Everywhere | Monospaced code display (P000417) |
| `MediaUploader` | Photo groups, kaitori | Drag-and-drop file upload |
| `ImageGallery` | Photo groups, shop, kaitori | Thumbnail grid with lightbox |
