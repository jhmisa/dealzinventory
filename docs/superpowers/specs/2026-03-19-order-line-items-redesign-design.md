# Order Line Items Redesign

**Date:** 2026-03-19
**Status:** Approved

## Problem

The manual order creation flow uses a photo-grid item browser that doesn't match how staff actually create orders. Staff need a table-based order entry system where they search for items by code/name, add them as line items with editable prices and quantities, and can also add ad-hoc items (e.g., "LAN Cable ¥1,000") that aren't tracked in inventory.

## Data Model Changes

### `order_items` table — new columns

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `description` | `text` | — | Line item description. Auto-filled for inventory items, manual for ad-hoc |
| `quantity` | `integer` | `1` | Always 1 for P-code inventory items, variable for ad-hoc |
| `discount` | `integer` | `0` | Per-line discount in yen |

### `order_items` table — modified columns

| Column | Change | Reason |
|--------|--------|--------|
| `item_id` | Becomes **nullable** | NULL for ad-hoc/custom line items |

### `orders` table — new columns

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `shipping_cost` | `integer` | `0` | Delivery fee |

### Calculations

- **Line subtotal** = `(unit_price × quantity) - discount`
- **Order subtotal** = sum of all line subtotals
- **Total discount** = sum of all per-line `discount` values (informational only in summary)
- **Total** = Order subtotal + `shipping_cost`
- The existing `total_price` column on `orders` stores the final total, recalculated on submit

## UI Design

### Page structure

The create order page simplifies from 4 steps to 3 sections on one scrollable page:

1. **Customer** — `CustomerPicker` (unchanged)
2. **Shipping & Delivery** — `ShippingStep` (unchanged, already has JP+EN address and date fixes)
3. **Order** — New `OrderLineItems` component containing:
   - Order source selector + staff notes (moved from old `OrderReview`)
   - Item search bar + "Add custom item" button
   - Line items table
   - Summary totals
   - Create Order button

### Search bar

- Debounced input (300ms) querying the `items` table by `item_code` or product model name
- Results appear in a dropdown showing: P-code, product name, grade, selling price
- Clicking a result adds it as a line item with qty=1, price pre-filled from `selling_price`
- Only AVAILABLE items with grade != J are searchable

### "Add custom item" button

- Adds a blank row to the table with editable description and price fields
- No `item_id` linked — these are ad-hoc charges

### Line items table columns

| Column | Inventory items | Custom items |
|--------|----------------|--------------|
| **#** | Row number | Row number |
| **Description** | P-code + product name + grade badge (read-only) | Editable text input |
| **Qty** | Locked to 1 (each P-code is unique) | Editable number input |
| **Unit Price** | Editable, pre-filled from selling_price | Editable, starts blank |
| **Discount** | Editable number input, default 0 | Editable number input, default 0 |
| **Subtotal** | Computed: `(qty × price) - discount` (read-only) | Same formula |
| **×** | Remove button | Remove button |

### Summary section (right-aligned below table)

```
Subtotal       ¥122,000    (sum of all line subtotals)
Delivery Fee    [1,000]    (editable input)
Discount        (¥500)     (informational: sum of per-line discounts, hidden if 0)
────────────────────────
Total          ¥122,500    (subtotal + delivery fee)
```

Note: Discount is NOT subtracted again in the total — it's already reflected in each line's subtotal. It's shown for staff visibility only.

### Submit

- Button at bottom of section 3 (no sticky footer)
- Requires: customer selected, shipping address selected, at least 1 line item, order source set
- On submit: creates order with `shipping_cost`, then inserts all `order_items` rows (with nullable `item_id` for custom items)

## Components

| Component | Action | Notes |
|-----------|--------|-------|
| `CustomerPicker` | Keep | No changes |
| `ShippingStep` | Keep | Already updated with JP+EN, date/time fixes |
| `OrderLineItems` | **Create** | New table-based component replacing ItemBrowser + OrderReview |
| `ItemBrowser` | **Delete** | Replaced by OrderLineItems |
| `OrderReview` | **Delete** | Absorbed into OrderLineItems + page-level layout |

## State in `create-order.tsx`

### Line item type (replaces `ManualOrderItemValues`)

```typescript
type OrderLineItem = {
  id: string              // client-side UUID for React key
  item_id: string | null  // null for custom items
  item_code: string | null
  description: string     // "MacBook Pro 14"" or "LAN Cable"
  condition_grade: string | null
  quantity: number
  unit_price: number
  discount: number
}
```

### Order-level state additions

- `shippingCost: number` — delivery fee (default 0)
- Order source and notes remain as existing state

## Service layer changes

### `createManualOrder` in `src/services/orders.ts`

Updated input type:

```typescript
interface ManualOrderInput {
  customer_id: string
  order_source: string
  shipping_address: string
  delivery_date?: string | null
  delivery_time_code?: string | null
  notes?: string | null
  shipping_cost: number
  items: {
    item_id: string | null   // nullable for custom items
    description: string
    quantity: number
    unit_price: number
    discount: number
  }[]
}
```

Total calculation: `sum((qty × price) - discount) + shipping_cost`

### `getAvailableItems` in `src/services/orders.ts`

Keep as-is but used for search dropdown instead of paginated grid.

## Migration

Single SQL migration adding:
- `description text` to `order_items`
- `quantity integer NOT NULL DEFAULT 1` to `order_items`
- `discount integer NOT NULL DEFAULT 0` to `order_items`
- `ALTER TABLE order_items ALTER COLUMN item_id DROP NOT NULL`
- `shipping_cost integer NOT NULL DEFAULT 0` to `orders`
- `CHECK (quantity > 0)` constraint
- `CHECK (discount >= 0)` constraint
- `CHECK (shipping_cost >= 0)` constraint

## Validation (Zod)

Update `manualOrderItemSchema` to match new `OrderLineItem` type with nullable `item_id`, required `description`, `quantity`, and `discount` fields.

## Files affected

- `supabase/migrations/XXXXXXXX_order_line_items.sql` — new migration
- `src/validators/manual-order.ts` — update schemas
- `src/services/orders.ts` — update `createManualOrder`, keep `getAvailableItems`
- `src/hooks/use-orders.ts` — update mutation hook
- `src/components/orders/order-line-items.tsx` — new component
- `src/components/orders/index.ts` — update barrel export
- `src/pages/admin/create-order.tsx` — simplify to 3 sections
- `src/components/orders/item-browser.tsx` — delete
- `src/components/orders/order-review.tsx` — delete
