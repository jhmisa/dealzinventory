# Manual Order Creation — Design Spec

## Goal

Allow admin staff to create orders manually from the admin panel — for walk-ins, social media inquiries, phone orders, and reserved purchases. Staff selects a customer, configures shipping with Yamato delivery scheduling, picks individual items with photos, and submits the order.

## Scope

Three connected changes:

1. **Customer address book** — multiple saved shipping addresses per customer with C/O (Care of) field
2. **Expanded order sources** — add WALK_IN, FB, YOUTUBE to existing SHOP and LIVE_SELLING
3. **Manual order creation page** — full-page form at `/admin/orders/new` with 4-step flow

---

## 1. Customer Address Book

### New Table: `customer_addresses`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `customer_id` | uuid FK → customers | CASCADE delete |
| `label` | text NOT NULL | e.g. "Home", "Office", "Mom in Manila" |
| `care_of` | text, nullable | Recipient name if different from customer |
| `address` | jsonb NOT NULL | Uses existing ShippingAddress structure (JP/Intl/Legacy) |
| `is_default` | boolean DEFAULT false | Only one default per customer (enforced in app logic) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

- RLS: staff full access
- Index on `customer_id`
- The existing `customers.shipping_address` column remains untouched for backward compatibility
- When loading addresses for a customer, if `customer_addresses` is empty but `customers.shipping_address` is set, show the legacy address as a selectable option labeled "Primary Address"

### Address Structure Updates

Add `care_of` field to the address display and form components. The C/O field is stored on `customer_addresses.care_of` (not inside the JSONB), since it varies per saved address — the same physical address might have different C/O recipients.

---

## 2. Expanded Order Sources

### DB Migration

```sql
ALTER TYPE order_source ADD VALUE 'WALK_IN';
ALTER TYPE order_source ADD VALUE 'FB';
ALTER TYPE order_source ADD VALUE 'YOUTUBE';
```

### Constants Update

Add to `ORDER_SOURCES` in `src/lib/constants.ts`:

```typescript
{ value: 'WALK_IN', label: 'Walk-in' },
{ value: 'FB', label: 'Facebook' },
{ value: 'YOUTUBE', label: 'YouTube' },
```

---

## 3. Order Table Changes

### New columns on `orders`

| Column | Type | Notes |
|--------|------|-------|
| `delivery_date` | date, nullable | Requested delivery date |
| `delivery_time_code` | text, nullable | Yamato time slot code |
| `notes` | text, nullable | Staff notes on the order |

### New column on `order_items`

| Column | Type | Notes |
|--------|------|-------|
| `unit_price` | numeric NOT NULL | Price per item at time of order (staff can override selling_price) |

### Modified columns on `orders`

- `sell_group_id` → nullable (manual orders have no sell group)

### Migration SQL

All changes in a single migration file:

```sql
-- 1. Expand order_source enum
ALTER TYPE order_source ADD VALUE 'WALK_IN';
ALTER TYPE order_source ADD VALUE 'FB';
ALTER TYPE order_source ADD VALUE 'YOUTUBE';

-- 2. New columns on orders
ALTER TABLE orders ADD COLUMN delivery_date date;
ALTER TABLE orders ADD COLUMN delivery_time_code text;
ALTER TABLE orders ADD COLUMN notes text;
ALTER TABLE orders ALTER COLUMN sell_group_id DROP NOT NULL;

-- 3. Per-item price on order_items
ALTER TABLE order_items ADD COLUMN unit_price numeric NOT NULL DEFAULT 0;

-- 4. Customer address book
CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text NOT NULL,
  care_of text,
  address jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);

-- RLS for customer_addresses
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access to customer_addresses"
  ON customer_addresses FOR ALL
  USING (auth.role() = 'authenticated');
```

### Yamato Delivery Time Slots

Stored as constants:

```typescript
YAMATO_TIME_SLOTS = [
  { code: '01', label: '午前中 (9:00–12:00)', label_en: 'Morning (9AM–12PM)' },
  { code: '14', label: '14:00–16:00', label_en: '2PM–4PM' },
  { code: '16', label: '16:00–18:00', label_en: '4PM–6PM' },
  { code: '04', label: '18:00–20:00', label_en: '6PM–8PM' },
]
```

The `code` values match what Yamato expects in their CSV import for printing denpyō (伝票).

### Delivery Date Rules

- **Minimum**: tomorrow (always — even if before 3PM cutoff; remote area lead times are staff knowledge, not enforced)
- **Customer-facing** (shop checkout): max +7 days from today
- **Admin manual orders**: no max limit — staff can set dates weeks out to reserve for customers

---

## 4. Manual Order Creation Page

### Route

`/admin/orders/new` — full page (not a dialog; too much content for a modal)

### Entry Point

"+ Create Order" button on the orders list page (`/admin/orders`)

### Flow: 4 Steps (single page, scrollable sections — not a wizard)

All sections visible at once. Completing a section enables the next. A sticky footer shows the running total and submit button.

---

#### Step 1: Customer

- **Customer picker**: searchable combobox — search by name, customer code, email, or phone
- On select, shows a compact info card: customer code, full name, email, phone
- Required before proceeding

#### Step 2: Shipping & Delivery

Enabled after customer is selected.

**Address selection:**
- List of customer's saved addresses from `customer_addresses` (label, C/O if set, address preview)
- Fallback: if no saved addresses but `customers.shipping_address` exists, show it as "Primary Address"
- Radio select — one address per order
- "Add new address" button → expands inline form using existing `AddressForm` component + C/O field + label field
- New address is saved to `customer_addresses` for future use
- Selected address is serialized and stored on the order's `shipping_address` field (snapshot — not a FK)

**Delivery scheduling:**
- **Delivery Date**: date picker, minimum = tomorrow, no maximum for admin
- **Delivery Time**: select from Yamato time slots (shows Japanese label with time range)
- Both optional — staff may not know yet at order creation time
- For WALK_IN orders, delivery fields are hidden (walk-in customers take items immediately)

#### Step 3: Items

Enabled after shipping address is selected.

**Item browser:**
- Grid of available items (status = AVAILABLE, not already in an active order)
- Each item card shows:
  - Hero photo thumbnail (from product model's photo group, if available) — falls back to placeholder
  - P-code
  - Product model name (brand + model)
  - Condition grade badge
  - Selling price (from `items.selling_price`)
- **Pagination**: 20 items per page with load-more or pagination controls
- **Filters**: text search (P-code or product name), product model dropdown, grade dropdown
- Click item card → adds to order cart (highlighted border, checkmark overlay)
- Click again → removes from cart

**Cart sidebar / section:**
- List of selected items with:
  - P-code, product name, grade
  - Price field (editable — defaults to `selling_price`, staff can override for deals)
  - Remove button
- Running item count and subtotal

#### Step 4: Review & Submit

Always visible at bottom.

- **Order source**: segmented toggle or select — SHOP / LIVE_SELLING / WALK_IN / FB / YOUTUBE
- **Notes**: optional textarea for staff notes
- **Summary card**:
  - Customer name + code
  - Shipping address preview (with C/O if set)
  - Delivery date + time slot
  - Items list with prices
  - Total price
- **Submit button**: "Create Order" → creates order with status PENDING

### On Submit (Atomic)

Order creation must be atomic — if any step fails, nothing is committed. Use a new `createManualOrder` service function that wraps everything in a Supabase RPC or sequential inserts with error handling:

1. Generate order code via `generate_code('ORD', 'ord_code_seq')`
2. Insert into `orders`: customer_id, order_code, order_source, shipping_address (serialized snapshot), quantity (= cart item count), total_price (= sum of cart item prices), delivery_date, delivery_time_code, notes, sell_group_id = null
3. Insert into `order_items`: one row per selected item (order_id, item_id, unit_price)
4. If order_items insert fails (e.g. unique constraint on item_id — item already sold), delete the order row and surface the error: "Item P00XXXX is no longer available"
5. Navigate to `/admin/orders/{id}` (order detail page)
6. Toast: "Order ORD000XXX created"

### Validation

- Customer required
- At least 1 item required
- Shipping address required
- Order source required
- Each item price must be ≥ 0
- Items must still be AVAILABLE at submit time (optimistic — if another staff member sells one in the meantime, the insert will fail on the unique constraint and show an error)

---

## 5. Files to Create/Modify

### New Files

- `src/pages/admin/create-order.tsx` — main page component
- `src/components/orders/customer-picker.tsx` — searchable customer combobox
- `src/components/orders/item-browser.tsx` — item grid with filters and selection (paginated, 20 items per page)
- `src/components/orders/shipping-step.tsx` — address picker + delivery date/time
- `src/components/orders/order-review.tsx` — summary + submit
- `src/services/customer-addresses.ts` — CRUD for customer_addresses table
- `src/hooks/use-customer-addresses.ts` — React Query hooks for addresses
- `src/validators/customer-address.ts` — Zod schema for address book form (label, care_of, address)
- `supabase/migrations/XXXXXX_manual_order_support.sql` — all DB changes (see Section 3 for full SQL)

### Modified Files

- `src/pages/admin/orders.tsx` — add "Create Order" button linking to `/admin/orders/new`
- `src/services/orders.ts` — add `createManualOrder` function that atomically inserts order + order_items with unit_price
- `src/hooks/use-orders.ts` — add `useCreateManualOrder` mutation
- `src/validators/order.ts` — add `manualOrderSchema` (customer_id, items array with unit_price, shipping_address, order_source expanded to include WALK_IN/FB/YOUTUBE, delivery_date, delivery_time_code, notes)
- `src/lib/constants.ts` — add YAMATO_TIME_SLOTS, expand ORDER_SOURCES
- `src/lib/types.ts` — add CustomerAddress, CustomerAddressInsert, CustomerAddressUpdate type aliases
- `src/lib/database.types.ts` — regenerate after migration
- `src/components/shared/address-display.tsx` — add optional `careOf?: string` prop, render "C/O {name}" line above address when provided
- `src/routes.tsx` — add route for `/admin/orders/new` (MUST be placed before `/admin/orders/:id` to avoid "new" being captured as an :id param)

---

## 6. Out of Scope

- Yamato CSV export (future feature — this spec just stores the data)
- Customer-facing checkout updates (delivery date picker for shop — separate spec)
- Item reservation/locking during order creation (rely on unique constraint for now)
- Discount/coupon system
- Shipping fee calculation
