# PLAN.md — Dealz K.K. Inventory System

## Phase 1: Project Setup + Auth

- [x] Scaffold Vite + React 18 + TypeScript project
- [x] Install dependencies: `@supabase/supabase-js`, `@tanstack/react-query`, `react-router-dom`, `react-hook-form`, `@hookform/resolvers`, `zod`, `qrcode.react`, `qrcode`, `html5-qrcode`, `@tanstack/react-table`, `date-fns`
- [x] Configure Tailwind CSS + shadcn/ui (init + install base components)
- [x] Create `.env.local` / `.env.example` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [x] Create `src/lib/supabase.ts` — Supabase client singleton (typed with `Database`)
- [x] Create `src/lib/utils.ts` — `cn()`, `formatPrice()`, `formatCode()`, `formatDate()`, `formatDateTime()`
- [x] Create `src/lib/constants.ts` — Grade/status/source arrays with labels and colors
- [x] Create `src/lib/query-client.ts` — QueryClient config (2min stale time)
- [x] Create `src/lib/query-keys.ts` — Query key factories for all domains
- [x] Create `src/hooks/use-auth.ts` — Auth hook (getSession, onAuthStateChange, signIn, signOut)
- [x] Create `src/components/layout/protected-route.tsx` — Redirect to login if unauthenticated
- [x] Create `src/pages/admin/login.tsx` — Staff login form (React Hook Form + Zod)
- [x] Create `src/validators/auth.ts` — Login schema
- [x] Create `src/routes.tsx` — `createBrowserRouter` with all admin routes
- [x] Update `src/App.tsx` — `RouterProvider` + `QueryClientProvider`
- [x] Create `src/components/layout/admin-layout.tsx` — Sidebar + content area (shadcn SidebarProvider)
- [x] Create `src/components/layout/sidebar.tsx` — Navigation sections (Dashboard, Inventory, Catalog, etc.)
- [x] Create `src/components/layout/top-header.tsx` — Staff name, logout, QR scan shortcut
- [x] Create `src/components/layout/breadcrumb-nav.tsx` — Dynamic breadcrumbs from route
- [x] Create `src/components/layout/index.ts` — Barrel exports

## Phase 2: Database Schema

- [ ] Initialize Supabase CLI (`supabase init`, `supabase link`) *(requires live Supabase project)*
- [x] Create `supabase/migrations/20260210000001_initial_schema.sql`:
  - [x] 17 custom enum types (condition_grade, item_status, source_type, etc.)
  - [x] `update_updated_at()` trigger function
  - [x] `product_models` table + trigger + indexes
  - [x] `config_groups` table + trigger + indexes
  - [x] `photo_groups` table + trigger + indexes
  - [x] `photo_group_media` table + index
  - [x] `suppliers` table + trigger
  - [x] `items` table (without kaitori FK) + trigger + indexes
  - [x] `sell_groups` table + trigger + indexes + CHECK (no grade J)
  - [x] `sell_group_items` table + unique constraint + index
  - [x] `customers` table + trigger + indexes + CHECK (email or phone)
  - [x] `orders` table + trigger + indexes
  - [x] `order_items` table + unique constraint + index
  - [x] `kaitori_price_list` table + trigger + indexes
  - [x] `kaitori_requests` table + trigger + indexes + CHECK (revision reason)
  - [x] `kaitori_request_media` table + index
  - [x] Deferred FK: `items.kaitori_request_id → kaitori_requests`
  - [x] 6 sequences (p_code_seq, pg_code_seq, g_code_seq, kt_code_seq, ord_code_seq, cust_code_seq)
  - [x] `generate_code(prefix, seq_name)` function
- [x] Create `supabase/migrations/20260210000002_rls_and_storage.sql`:
  - [x] Enable RLS on all 14 tables
  - [x] Staff full access policies (auth.role() = 'authenticated')
  - [x] Public read policies (sell_groups, product_models, config_groups, photo_groups, photo_group_media, sell_group_items, kaitori_price_list)
  - [x] Storage buckets: `photo-group-media` (public), `kaitori-media` (public), `id-documents` (private)
- [x] Create `supabase/seed.sql` — Sample product models, config groups, suppliers
- [ ] Run `supabase db push` to apply migrations *(requires live Supabase project)*
- [x] Generate TypeScript types: `supabase gen types typescript > src/lib/database.types.ts` *(placeholder written manually, regenerate after db push)*
- [x] Create `src/lib/types.ts` — Row/Insert/Update type aliases, enum types, joined types (e.g., `ItemWithRelations`)

## Phase 3: Core Inventory Pages

### Shared Components
- [x] `src/components/shared/status-badge.tsx` — Colored badge for any status
- [x] `src/components/shared/grade-badge.tsx` — S/A/B/C/D/J with specific colors
- [x] `src/components/shared/search-bar.tsx` — Debounced input (400ms)
- [x] `src/components/shared/data-table.tsx` — Generic sortable/paginated table (`@tanstack/react-table`)
- [x] `src/components/shared/confirm-dialog.tsx` — Confirmation modal
- [x] `src/components/shared/empty-state.tsx` — "No results" placeholder
- [x] `src/components/shared/loading-skeleton.tsx` — Skeleton variants (table, cards, form)
- [x] `src/components/shared/price-display.tsx` — Yen formatting (¥12,345)
- [x] `src/components/shared/code-display.tsx` — Monospaced code (P000417)
- [x] `src/components/shared/page-header.tsx` — Page title + action buttons
- [x] `src/components/shared/qr-scanner-camera.tsx` — Camera QR reader (html5-qrcode)
- [x] `src/components/shared/manual-code-input.tsx` — Fallback text input for P-code
- [x] `src/components/shared/media-uploader.tsx` — Drag-and-drop upload to Supabase Storage
- [x] `src/components/shared/image-gallery.tsx` — Thumbnail grid with lightbox
- [x] `src/components/shared/index.ts` — Barrel exports
- [x] `src/hooks/use-debounce.ts` — Generic debounce hook

### Suppliers (simplest CRUD — establishes pattern)
- [x] `src/services/suppliers.ts` — CRUD + item counts
- [x] `src/validators/supplier.ts` — supplierSchema (name required, type required)
- [x] `src/hooks/use-suppliers.ts` — useSuppliers, useSupplier, useCreateSupplier, useUpdateSupplier
- [x] `src/pages/admin/suppliers.tsx` — List page (DataTable + SearchBar)
- [x] `src/components/items/supplier-form-dialog.tsx` — Create/edit dialog

### Product Models
- [x] `src/services/product-models.ts` — CRUD + linked config/PG counts
- [x] `src/validators/product-model.ts` — productModelSchema
- [x] `src/hooks/use-product-models.ts` — query + mutation hooks
- [x] `src/pages/admin/products.tsx` — List page (DataTable: brand, model, form factor, screen size)
- [x] `src/pages/admin/product-detail.tsx` — Detail with linked config groups and photo groups
- [x] Product table — inlined in products.tsx using DataTable
- [x] `src/components/items/product-form.tsx`

### Config Groups
- [x] `src/services/config-groups.ts` — CRUD + filter by product model + status toggle
- [x] `src/validators/config-group.ts` — configGroupSchema
- [x] `src/hooks/use-config-groups.ts` — query + mutation hooks
- [x] `src/pages/admin/configs.tsx` — List page with product model filter + DRAFT/CONFIRMED toggle
- [x] Config table — inlined in configs.tsx using DataTable
- [x] `src/components/items/config-form-dialog.tsx`

### Photo Groups + Media
- [x] `src/services/photo-groups.ts` — CRUD + media upload/delete/reorder + code generation
- [x] `src/validators/photo-group.ts` — photoGroupSchema
- [x] `src/hooks/use-photo-groups.ts` — query + mutation + media hooks
- [x] `src/pages/admin/photo-groups.tsx` — Card grid view (hero thumbnail, PG-code, color, status)
- [x] `src/pages/admin/photo-group-detail.tsx` — Detail + media gallery + drag-and-drop upload
- [x] Photo group grid — inlined in photo-groups.tsx
- [x] Photo group form — inlined in photo-groups.tsx as create dialog

### Items
- [x] `src/services/items.ts` — getItems, getItemById, getItemByCode, createItem, createBulkItems, updateItem, generateItemCode, getItemStats, getIntakeItems
- [x] `src/validators/item.ts` — intakeItemSchema, bulkIntakeSchema, itemEditSchema
- [x] `src/hooks/use-items.ts` — all query + mutation hooks
- [x] `src/pages/admin/items.tsx` — List page (search, filter by status/grade/source/supplier)
- [x] Item table + filters — inlined in items.tsx using DataTable

### Bulk Item Intake
- [x] `src/pages/admin/bulk-intake.tsx`
- [x] `src/components/items/intake-form.tsx` — Supplier + source type + defaults
- [x] Intake item row — inlined in bulk-intake.tsx
- [x] QR code display — inlined in bulk-intake.tsx using qrcode.react
- [x] QR print queue + preview — inlined in bulk-intake.tsx

### Item Detail
- [x] `src/pages/admin/item-detail.tsx`
- [x] Item header, specs card, photo group card, edit form — all inlined in item-detail.tsx

### QR Scanner
- [x] `src/pages/admin/qr-scanner.tsx` — Camera mode + manual fallback, navigate to item on scan

### IT Inspection Queue
- [x] `src/services/dashboard.ts` — getDashboardStats (items by status/grade, recent inspections)
- [x] `src/hooks/use-dashboard.ts` — useDashboardStats
- [x] `src/pages/admin/inspection-queue.tsx` — INTAKE items sorted oldest-first
- [x] Inspection queue table + stats — inlined in inspection-queue.tsx

### Inspect Single Item
- [x] `src/validators/inspection.ts` — inspectionSchema (grade, status, PG verified, config, AC adapter, notes)
- [x] `src/pages/admin/inspect-item.tsx`
- [x] Inspection header, photo group verifier, specs verification, condition grader, AC adapter check, notes, submit bar — all inlined in inspect-item.tsx

### Dashboard
- [x] `src/pages/admin/dashboard.tsx`
- [x] Stats card grid, recent activity, quick actions — inlined in dashboard.tsx

## Phase 4: Sell Groups + Orders

### Sell Groups
- [x] `src/services/sell-groups.ts` — CRUD + assign/remove items + code generation + share link
- [x] `src/validators/sell-group.ts` — sellGroupSchema (no grade J constraint)
- [x] `src/hooks/use-sell-groups.ts` — query + mutation hooks
- [x] `src/pages/admin/sell-groups.tsx` — List page (G-code, model, config, grade, price, item count, active)
- [x] `src/pages/admin/sell-group-detail.tsx` — Detail + assign/remove items + share link
- [x] Sell group table, form, item list, available item picker, share link — inlined in pages

### Orders
- [x] `src/services/orders.ts` — CRUD + status transitions + item assignment
- [x] `src/validators/order.ts` — orderSchema
- [x] `src/hooks/use-orders.ts` — query + mutation hooks
- [x] `src/pages/admin/orders.tsx` — List page (ORD-code, customer, G-code, qty, status, source)
- [x] `src/pages/admin/order-detail.tsx` — Detail + status stepper + assigned items
- [x] Order table, status stepper, order item list — inlined in pages

### Packing Station
- [x] `src/pages/admin/packing-station.tsx` — QR scan to verify + pack items
- [x] Packing scanner, verification, checklist — inlined using shared QRScannerCamera + ManualCodeInput

### Edge Function: reserve-items
- [ ] `supabase/functions/reserve-items/index.ts` — Atomically assign P-items to order *(deferred — requires Supabase Edge Function deployment)*

### Update Dashboard
- [ ] Add order stats to dashboard (orders by status, pending count)
- [ ] Add sell group stats (active groups, total items in groups)

## Phase 5: Shop Page

### Shop Layout
- [x] `src/components/layout/shop-layout.tsx` — Top nav: Shop, Sell Your Device, My Account
- [x] `src/components/layout/shop-header.tsx`
- [x] `src/components/layout/shop-footer.tsx`

### Shop Browse (`/shop`)
- [x] `src/pages/shop/browse.tsx` — Public catalog
- [x] `src/services/shop.ts` — Shop queries (products, brands, product detail, sell group by code)
- [x] `src/hooks/use-shop.ts` — useShopProducts, useProductDetail, useSellGroupByCode, useShopBrands
- [x] Search bar, filters, sort, product card grid, product card — inlined in browse.tsx

### Product Detail (`/shop/product/:id`)
- [x] `src/pages/shop/product-detail.tsx` — Level 2: grade breakdown
- [x] Product gallery, specs, grade breakdown table — inlined in product-detail.tsx

### Checkout (`/shop/checkout/:sellGroupId` and `/order/:sellGroupCode`)
- [x] `src/pages/shop/checkout.tsx` — Shared checkout for shop and live-selling
- [x] Product summary, quantity selector, shipping form, order confirmation, success view — inlined in checkout.tsx

### Live Selling Direct Link (`/order/:sellGroupCode`)
- [x] Route to shared checkout page with sell group pre-selected

### Supabase Realtime
- [ ] Subscribe to sell_group_items changes for live stock count updates on shop page

## Phase 6: Kaitori (Buy from Individuals)

### Kaitori Public Pages
- [x] `src/pages/kaitori/landing.tsx` — "Sell your device" marketing page
- [x] Hero section + how-it-works 4-step flow — inlined in landing.tsx

### Kaitori Self-Assessment (`/sell/assess`)
- [x] `src/pages/kaitori/assess.tsx` — Device info + condition quiz + photo upload + instant quote
- [x] Model selector, condition quiz, photo uploader, seller notes, quote result, delivery picker — inlined as 5-step wizard in assess.tsx

### Kaitori Quote + Status
- [x] `src/pages/kaitori/status.tsx` — Track request status + accept/reject price revision
- [x] Status stepper + price revision alert — inlined in status.tsx

### Edge Function: kaitori-quote
- [ ] `supabase/functions/kaitori-quote/index.ts` — Calculate auto-quote from kaitori_price_list *(quote lookup implemented client-side via service function)*

### Kaitori Admin Pages
- [x] `src/services/kaitori.ts` — CRUD + status transitions + payment processing + quote lookup + price list
- [x] `src/validators/kaitori.ts` — kaitoriSchema, priceRevisionSchema, paymentSchema, priceListEntrySchema
- [x] `src/hooks/use-kaitori.ts` — query + mutation hooks (15 hooks)
- [x] `src/pages/admin/kaitori.tsx` — Request list with status tabs
- [x] `src/pages/admin/kaitori-detail.tsx` — Inspect + revise price + process payment
- [x] Kaitori table, header, seller assessment, media gallery, staff inspection, price revision, payment form — inlined in pages

### Kaitori Price List Management
- [x] `src/pages/admin/kaitori-price-list.tsx` — Manage pricing matrix
- [x] Price list table, form — inlined in kaitori-price-list.tsx

### Update Dashboard
- [ ] Add Kaitori stats (pending requests, recent payments)

## Phase 7: Customer Portal

### Edge Function: customer-auth
- [ ] `supabase/functions/customer-auth/index.ts` — Register (hash PIN with bcrypt) + login (verify last_name + email/phone + PIN) *(deferred — requires Supabase Edge Function deployment)*

### Customer Auth Pages
- [x] `src/services/customers.ts` — CRUD + auth (login/register/changePin via Edge Function) + customer orders/kaitori queries
- [x] `src/validators/customer.ts` — loginSchema, registerSchema, profileSchema, changePinSchema
- [x] `src/hooks/use-customers.ts` — useCustomers, useCustomer, useCustomerWithDetails, useCustomerOrders, useCustomerKaitoriRequests, useUpdateCustomer, useVerifyCustomerId
- [x] `src/hooks/use-customer-auth.ts` — CustomerAuthContext + useCustomerAuthProvider + useCustomerAuth (localStorage persistence)
- [x] `src/components/layout/customer-layout.tsx` — Header with My Orders, My Sales, Settings, Logout + CustomerAuthContext provider
- [x] `src/pages/customer/login.tsx` — Last name + email/phone + 6-digit PIN
- [x] `src/pages/customer/register.tsx` — Registration + PIN setup + shipping address

### Customer Dashboard
- [x] `src/pages/customer/dashboard.tsx` — Quick actions grid + recent orders + recent Kaitori

### Order History
- [x] `src/pages/customer/orders.tsx` — Order history list with product info
- [x] `src/pages/customer/order-detail.tsx` — Order status tracker (stepper) + product + order summary

### Kaitori History
- [x] `src/pages/customer/kaitori.tsx` — Kaitori request history with status + pricing

### Account Settings
- [x] `src/pages/customer/settings.tsx` — Profile, address, bank details, PIN change, seller toggle (3 sections)

### ID Verification (本人確認)
- [x] `src/pages/customer/verify-id.tsx` — Upload government ID + verification status + legal info

### Admin Customer Management
- [x] `src/pages/admin/customers.tsx` — Customer list (CUST-code, name, email, phone, seller status, verified)
- [x] `src/pages/admin/customer-detail.tsx` — Detail + contact info + verification + bank details + order history + Kaitori history + ID review

### Admin Reports
- [x] `src/pages/admin/reports.tsx` — KPI cards + inventory/orders/kaitori/customers/sell groups breakdowns
