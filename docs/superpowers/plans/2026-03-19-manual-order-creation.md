# Manual Order Creation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admin staff to create orders manually from a full-page form at `/admin/orders/new`, selecting a customer, choosing a shipping address, picking individual items with photos, and submitting with Yamato delivery scheduling.

**Architecture:** Three database changes (customer_addresses table, expanded order_source enum, new columns on orders/order_items) plus a 4-step single-page form. The form follows existing patterns: Zod validation, React Hook Form, TanStack Query mutations, Supabase service functions. Item selection uses a paginated browsable grid with photo thumbnails.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, React Hook Form + Zod, TanStack Query, Supabase (PostgreSQL + JS client)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/XXXXXX_manual_order_support.sql` | All DB changes: enum expansion, new columns, customer_addresses table |
| `src/services/customer-addresses.ts` | CRUD for customer_addresses table |
| `src/hooks/use-customer-addresses.ts` | TanStack Query hooks for address CRUD |
| `src/validators/customer-address.ts` | Zod schema for address book form |
| `src/validators/manual-order.ts` | Zod schema for the full manual order form |
| `src/components/orders/customer-picker.tsx` | Searchable customer combobox |
| `src/components/orders/shipping-step.tsx` | Address picker + delivery date/time |
| `src/components/orders/item-browser.tsx` | Paginated item grid with filters and selection |
| `src/components/orders/order-review.tsx` | Summary card + submit |
| `src/components/orders/index.ts` | Barrel exports for orders components |
| `src/pages/admin/create-order.tsx` | Main page orchestrating the 4-step flow |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/constants.ts` | Add `YAMATO_TIME_SLOTS`, expand `ORDER_SOURCES` with WALK_IN/FB/YOUTUBE |
| `src/lib/types.ts` | Add `CustomerAddress`, `CustomerAddressInsert`, `CustomerAddressUpdate` type aliases |
| `src/lib/query-keys.ts` | Add `customerAddresses` key factory |
| `src/services/orders.ts` | Add `createManualOrder()` function, add `getAvailableItems()` for item browsing |
| `src/hooks/use-orders.ts` | Add `useCreateManualOrder` mutation, `useAvailableItems` query |
| `src/validators/order.ts` | Update `order_source` enum to include WALK_IN/FB/YOUTUBE |
| `src/components/shared/address-display.tsx` | Add optional `careOf` prop |
| `src/pages/admin/orders.tsx` | Add "+ Create Order" button |
| `src/routes.tsx` | Add route for `/admin/orders/new` before `orders/:id` |

---

## Chunk 1: Database Migration + Constants + Types

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260319100000_manual_order_support.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260319100000_manual_order_support.sql`:

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

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`

Expected: Migration applied successfully. Verify with `npx supabase db diff` showing no pending changes.

- [ ] **Step 3: Regenerate TypeScript types**

Run: `npx supabase gen types typescript --local > src/lib/database.types.ts`

Expected: `database.types.ts` updated with `customer_addresses` table and new columns on `orders` / `order_items`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260319100000_manual_order_support.sql src/lib/database.types.ts
git commit -m "feat: add migration for manual order support (customer_addresses, order columns, enum expansion)"
```

---

### Task 2: Constants — Yamato Time Slots + Expanded Order Sources

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Add YAMATO_TIME_SLOTS and expand ORDER_SOURCES**

In `src/lib/constants.ts`, add the Yamato time slots constant after the existing `ORDER_SOURCES`:

```typescript
export const YAMATO_TIME_SLOTS = [
  { code: '01', label: '午前中 (9:00–12:00)', label_en: 'Morning (9AM–12PM)' },
  { code: '14', label: '14:00–16:00', label_en: '2PM–4PM' },
  { code: '16', label: '16:00–18:00', label_en: '4PM–6PM' },
  { code: '04', label: '18:00–20:00', label_en: '6PM–8PM' },
] as const
```

Expand `ORDER_SOURCES` to include the new values (add after existing entries):

```typescript
export const ORDER_SOURCES: { value: OrderSource; label: string }[] = [
  { value: 'SHOP', label: 'Shop' },
  { value: 'LIVE_SELLING', label: 'Live Selling' },
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'FB', label: 'Facebook' },
  { value: 'YOUTUBE', label: 'YouTube' },
]
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: No TypeScript errors. The `OrderSource` type from `database.types.ts` should now include the new enum values.

- [ ] **Step 3: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat: add Yamato time slots and expanded order sources constants"
```

---

### Task 3: Type Aliases for CustomerAddress

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/query-keys.ts`

- [ ] **Step 1: Add CustomerAddress types to types.ts**

In `src/lib/types.ts`, add after the existing `OrderItem` type:

```typescript
export type CustomerAddress = Tables['customer_addresses']['Row']
export type CustomerAddressInsert = Tables['customer_addresses']['Insert']
export type CustomerAddressUpdate = Tables['customer_addresses']['Update']
```

- [ ] **Step 2: Add customerAddresses key factory to query-keys.ts**

In `src/lib/query-keys.ts`, add after the `customers` block:

```typescript
customerAddresses: {
  all: ['customer-addresses'] as const,
  lists: () => [...queryKeys.customerAddresses.all, 'list'] as const,
  list: (customerId: string) => [...queryKeys.customerAddresses.lists(), customerId] as const,
},
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/query-keys.ts
git commit -m "feat: add CustomerAddress type aliases and query keys"
```

---

## Chunk 2: Customer Address Book (Service + Hooks + Validator)

### Task 4: Customer Address Service

**Files:**
- Create: `src/services/customer-addresses.ts`

- [ ] **Step 1: Create the service file**

Create `src/services/customer-addresses.ts`:

```typescript
import { supabase } from '@/lib/supabase'
import type { CustomerAddress, CustomerAddressInsert, CustomerAddressUpdate } from '@/lib/types'

export async function getCustomerAddresses(customerId: string) {
  const { data, error } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data as CustomerAddress[]
}

export async function createCustomerAddress(address: CustomerAddressInsert) {
  // If this is marked as default, unset other defaults first
  if (address.is_default) {
    await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('customer_id', address.customer_id)
  }

  const { data, error } = await supabase
    .from('customer_addresses')
    .insert(address)
    .select()
    .single()

  if (error) throw error
  return data as CustomerAddress
}

export async function updateCustomerAddress(id: string, updates: CustomerAddressUpdate) {
  const { data, error } = await supabase
    .from('customer_addresses')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as CustomerAddress
}

export async function deleteCustomerAddress(id: string) {
  const { error } = await supabase
    .from('customer_addresses')
    .delete()
    .eq('id', id)

  if (error) throw error
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/services/customer-addresses.ts
git commit -m "feat: add customer address book service (CRUD)"
```

---

### Task 5: Customer Address Hooks

**Files:**
- Create: `src/hooks/use-customer-addresses.ts`

- [ ] **Step 1: Create the hooks file**

Create `src/hooks/use-customer-addresses.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as addressService from '@/services/customer-addresses'
import type { CustomerAddressInsert, CustomerAddressUpdate } from '@/lib/types'

export function useCustomerAddresses(customerId: string) {
  return useQuery({
    queryKey: queryKeys.customerAddresses.list(customerId),
    queryFn: () => addressService.getCustomerAddresses(customerId),
    enabled: !!customerId,
  })
}

export function useCreateCustomerAddress() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (address: CustomerAddressInsert) =>
      addressService.createCustomerAddress(address),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customerAddresses.list(variables.customer_id),
      })
    },
  })
}

export function useUpdateCustomerAddress(customerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: CustomerAddressUpdate }) =>
      addressService.updateCustomerAddress(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customerAddresses.list(customerId),
      })
    },
  })
}

export function useDeleteCustomerAddress(customerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => addressService.deleteCustomerAddress(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customerAddresses.list(customerId),
      })
    },
  })
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-customer-addresses.ts
git commit -m "feat: add TanStack Query hooks for customer addresses"
```

---

### Task 6: Customer Address Validator

**Files:**
- Create: `src/validators/customer-address.ts`

- [ ] **Step 1: Create the validator file**

Create `src/validators/customer-address.ts`:

```typescript
import { z } from 'zod'

export const customerAddressSchema = z.object({
  label: z.string().min(1, 'Label is required (e.g. "Home", "Office")'),
  care_of: z.string().nullable().optional(),
  address: z.any().refine((val) => val && typeof val === 'object' && val.country, {
    message: 'A valid address is required',
  }),
  is_default: z.boolean().default(false),
})

export type CustomerAddressFormValues = z.infer<typeof customerAddressSchema>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/validators/customer-address.ts
git commit -m "feat: add Zod validator for customer address form"
```

---

## Chunk 3: Address Display Update + Manual Order Validator + Order Service

### Task 7: Update AddressDisplay with careOf Prop

**Files:**
- Modify: `src/components/shared/address-display.tsx`

- [ ] **Step 1: Add careOf prop to AddressDisplay**

In `src/components/shared/address-display.tsx`:

1. Add `careOf?: string` to the `AddressDisplayProps` interface:

```typescript
interface AddressDisplayProps {
  address: ShippingAddress | string | null
  careOf?: string
  format?: 'jp' | 'en' | 'auto'
  className?: string
}
```

2. Destructure `careOf` from props:

```typescript
export function AddressDisplay({ address: rawAddress, careOf, format = 'auto', className }: AddressDisplayProps) {
```

3. Create a helper element to render the C/O line. Add this right after the address parsing logic (after line 28), before the type guard checks:

```typescript
const careOfLine = careOf ? (
  <p className="text-sm font-medium">C/O {careOf}</p>
) : null
```

4. In each return block that renders an address (JP, Intl, Legacy), add `{careOfLine}` as the first child inside the `<div>`:

For the JP address (Japanese format), add after `<div className={className}>`:
```tsx
{careOfLine}
```

Do the same for JP English format, International format, and Legacy format.

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build. The `careOf` prop is optional so all existing usages remain valid.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/address-display.tsx
git commit -m "feat: add careOf prop to AddressDisplay for C/O recipient line"
```

---

### Task 8: Manual Order Validator

**Files:**
- Create: `src/validators/manual-order.ts`

- [ ] **Step 1: Create the manual order Zod schema**

Create `src/validators/manual-order.ts`:

```typescript
import { z } from 'zod'

export const manualOrderItemSchema = z.object({
  item_id: z.string().uuid(),
  item_code: z.string(),
  product_name: z.string(),
  condition_grade: z.string().nullable(),
  unit_price: z.coerce.number().nonnegative('Price must be ≥ 0'),
})

export const manualOrderSchema = z.object({
  customer_id: z.string().uuid('Customer is required'),
  order_source: z.enum(['SHOP', 'LIVE_SELLING', 'WALK_IN', 'FB', 'YOUTUBE']),
  shipping_address: z.any().refine((val) => val && typeof val === 'object' && val.country, {
    message: 'Shipping address is required',
  }),
  care_of: z.string().nullable().optional(),
  delivery_date: z.string().nullable().optional(),
  delivery_time_code: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(manualOrderItemSchema).min(1, 'At least 1 item is required'),
})

export type ManualOrderFormValues = z.infer<typeof manualOrderSchema>
export type ManualOrderItemValues = z.infer<typeof manualOrderItemSchema>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/validators/manual-order.ts
git commit -m "feat: add Zod validator for manual order creation form"
```

---

### Task 9: Order Service — createManualOrder + getAvailableItems

**Files:**
- Modify: `src/services/orders.ts`

- [ ] **Step 1: Add getAvailableItems function**

Add to `src/services/orders.ts`. Note: PostgREST cannot filter on joined table columns in `.or()` or check "not in another table" via `.is()`. Instead, query AVAILABLE items and filter search only on `item_code` (P-code search). The product name filtering happens client-side or we accept P-code-only server search as sufficient for the admin use case:

```typescript
interface AvailableItemFilters {
  search?: string
  grade?: string
  page?: number
  pageSize?: number
}

export async function getAvailableItems(filters: AvailableItemFilters = {}) {
  const page = filters.page ?? 0
  const pageSize = filters.pageSize ?? 20
  const from = page * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('items')
    .select(`
      id, item_code, condition_grade, selling_price, item_status,
      product_models(id, brand, model_name, color,
        product_media(file_url, role, sort_order)
      )
    `, { count: 'exact' })
    .eq('item_status', 'AVAILABLE')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters.search) {
    // PostgREST only supports filtering on direct columns in .or()
    // Search by P-code on items table directly
    query = query.ilike('item_code', `%${filters.search}%`)
  }
  if (filters.grade) {
    query = query.eq('condition_grade', filters.grade)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { items: data ?? [], total: count ?? 0 }
}
```

**Note on item availability:** Items with status `AVAILABLE` should be safe to select. If an item is already in an active order, the `order_items` insert will fail on the unique constraint for `item_id`, and the atomic `createManualOrder` function handles this with a rollback. This is the optimistic approach described in the spec.

- [ ] **Step 2: Add createManualOrder function**

Add to `src/services/orders.ts`:

```typescript
interface ManualOrderInput {
  customer_id: string
  order_source: string
  shipping_address: string  // JSON-stringified ShippingAddress (orders.shipping_address is text column)
  delivery_date?: string | null
  delivery_time_code?: string | null
  notes?: string | null
  items: { item_id: string; unit_price: number }[]
}

export async function createManualOrder(input: ManualOrderInput) {
  // 1. Generate order code
  const orderCode = await generateOrderCode()

  // 2. Calculate totals
  const quantity = input.items.length
  const totalPrice = input.items.reduce((sum, item) => sum + item.unit_price, 0)

  // 3. Insert order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_code: orderCode,
      customer_id: input.customer_id,
      order_source: input.order_source as Order['order_source'],
      shipping_address: input.shipping_address,
      quantity,
      total_price: totalPrice,
      delivery_date: input.delivery_date ?? null,
      delivery_time_code: input.delivery_time_code ?? null,
      notes: input.notes ?? null,
      sell_group_id: null,
    })
    .select()
    .single()

  if (orderError) throw orderError

  // 4. Insert order items
  const orderItems = input.items.map((item) => ({
    order_id: (order as Order).id,
    item_id: item.item_id,
    unit_price: item.unit_price,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    // Rollback: delete the order if items fail (e.g. item already sold)
    await supabase.from('orders').delete().eq('id', (order as Order).id)
    // Parse which item failed from the error
    if (itemsError.message.includes('unique') || itemsError.message.includes('duplicate')) {
      throw new Error('One or more items are no longer available. Please refresh and try again.')
    }
    throw itemsError
  }

  return order as Order
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/services/orders.ts
git commit -m "feat: add createManualOrder and getAvailableItems service functions"
```

---

### Task 10: Order Hooks — useCreateManualOrder + useAvailableItems

**Files:**
- Modify: `src/hooks/use-orders.ts`

- [ ] **Step 1: Add hooks**

Add to `src/hooks/use-orders.ts`:

```typescript
interface AvailableItemFilters {
  search?: string
  grade?: string
  page?: number
}

export function useAvailableItems(filters: AvailableItemFilters = {}) {
  return useQuery({
    queryKey: queryKeys.orders.list({ _type: 'available-items', ...filters }),
    queryFn: () => ordersService.getAvailableItems(filters),
  })
}

export function useCreateManualOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ordersService.createManualOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}
```

Also add the import for `getAvailableItems` and `createManualOrder` if not already covered by the `* as ordersService` import.

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-orders.ts
git commit -m "feat: add useCreateManualOrder and useAvailableItems hooks"
```

---

### Task 10b: Update Existing Order Validator

**Files:**
- Modify: `src/validators/order.ts`

- [ ] **Step 1: Expand order_source enum in existing schema**

In `src/validators/order.ts`, update the `order_source` enum to include all sources:

```typescript
order_source: z.enum(['SHOP', 'LIVE_SELLING', 'WALK_IN', 'FB', 'YOUTUBE']),
```

This ensures the existing order schema also accepts the new order sources.

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/validators/order.ts
git commit -m "feat: expand order_source enum in existing order validator"
```

---

## Chunk 4: UI Components — Customer Picker + Shipping Step

### Task 11: Customer Picker Component

**Files:**
- Create: `src/components/orders/customer-picker.tsx`

- [ ] **Step 1: Create the customer picker**

Create `src/components/orders/customer-picker.tsx`. This is a searchable combobox that searches customers by name, code, email, or phone. Uses a debounced search value to avoid excessive API calls on every keystroke.

```typescript
import { useState, useEffect, useRef } from 'react'
import { useCustomers } from '@/hooks/use-customers'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, X } from 'lucide-react'
import type { Customer } from '@/lib/types'

interface CustomerPickerProps {
  selectedCustomer: Customer | null
  onSelect: (customer: Customer | null) => void
}

export function CustomerPicker({ selectedCustomer, onSelect }: CustomerPickerProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  // Debounce search to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data: customers, isLoading } = useCustomers(debouncedSearch || undefined)

  // If a customer is selected, show info card
  if (selectedCustomer) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedCustomer.customer_code}
                </Badge>
                <span className="font-medium">
                  {selectedCustomer.last_name} {selectedCustomer.first_name ?? ''}
                </span>
              </div>
              {selectedCustomer.email && (
                <p className="text-sm text-muted-foreground">{selectedCustomer.email}</p>
              )}
              {selectedCustomer.phone && (
                <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, code, email, or phone..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-9"
        />
      </div>

      {isOpen && search.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : !customers?.length ? (
            <p className="p-4 text-sm text-muted-foreground">No customers found</p>
          ) : (
            customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="w-full text-left px-4 py-2 hover:bg-accent transition-colors"
                onClick={() => {
                  onSelect(customer as Customer)
                  setSearch('')
                  setIsOpen(false)
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {customer.customer_code}
                  </span>
                  <span className="font-medium text-sm">
                    {customer.last_name} {customer.first_name ?? ''}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[customer.email, customer.phone].filter(Boolean).join(' · ')}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/customer-picker.tsx
git commit -m "feat: add CustomerPicker searchable combobox component"
```

---

### Task 12: Shipping Step Component

**Files:**
- Create: `src/components/orders/shipping-step.tsx`

- [ ] **Step 1: Create the shipping step component**

Create `src/components/orders/shipping-step.tsx`. This component handles:
- Address selection from saved addresses
- Fallback to legacy `customers.shipping_address`
- Inline "add new address" form
- Delivery date picker (min = tomorrow, no max for admin)
- Yamato time slot selector
- Hide delivery fields for WALK_IN orders

```typescript
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AddressForm } from '@/components/shared/address-form'
import { AddressDisplay } from '@/components/shared/address-display'
import { useCustomerAddresses, useCreateCustomerAddress } from '@/hooks/use-customer-addresses'
import { YAMATO_TIME_SLOTS } from '@/lib/constants'
import { Plus, Loader2 } from 'lucide-react'
import type { ShippingAddress } from '@/lib/address-types'
import type { Customer, CustomerAddress } from '@/lib/types'

interface ShippingStepProps {
  customer: Customer
  orderSource: string
  selectedAddress: { address: ShippingAddress; careOf?: string | null } | null
  onAddressSelect: (address: ShippingAddress, careOf?: string | null) => void
  deliveryDate: string | null
  onDeliveryDateChange: (date: string | null) => void
  deliveryTimeCode: string | null
  onDeliveryTimeCodeChange: (code: string | null) => void
}

export function ShippingStep({
  customer,
  orderSource,
  selectedAddress,
  onAddressSelect,
  deliveryDate,
  onDeliveryDateChange,
  deliveryTimeCode,
  onDeliveryTimeCodeChange,
}: ShippingStepProps) {
  const [showNewForm, setShowNewForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newCareOf, setNewCareOf] = useState('')
  const [newAddress, setNewAddress] = useState<ShippingAddress | null>(null)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)

  const { data: savedAddresses, isLoading } = useCustomerAddresses(customer.id)
  const createAddress = useCreateCustomerAddress()

  const isWalkIn = orderSource === 'WALK_IN'

  // Build address list: saved addresses + legacy fallback
  const addressOptions: { id: string; label: string; careOf?: string | null; address: ShippingAddress }[] = []

  if (savedAddresses) {
    for (const addr of savedAddresses) {
      addressOptions.push({
        id: addr.id,
        label: addr.label,
        careOf: addr.care_of,
        address: addr.address as unknown as ShippingAddress,
      })
    }
  }

  // Legacy fallback
  if (addressOptions.length === 0 && customer.shipping_address) {
    let legacyAddr: ShippingAddress | null = null
    try {
      legacyAddr = typeof customer.shipping_address === 'string'
        ? JSON.parse(customer.shipping_address)
        : customer.shipping_address as unknown as ShippingAddress
    } catch {
      // skip unparseable
    }
    if (legacyAddr) {
      addressOptions.push({
        id: '__legacy__',
        label: 'Primary Address',
        careOf: null,
        address: legacyAddr,
      })
    }
  }

  // Tomorrow's date in YYYY-MM-DD format
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  const handleAddressSelect = (id: string) => {
    setSelectedAddressId(id)
    const option = addressOptions.find((a) => a.id === id)
    if (option) {
      onAddressSelect(option.address, option.careOf)
    }
  }

  const handleSaveNewAddress = async () => {
    if (!newAddress || !newLabel) return

    const saved = await createAddress.mutateAsync({
      customer_id: customer.id,
      label: newLabel,
      care_of: newCareOf || null,
      address: newAddress as unknown as Record<string, unknown>,
      is_default: addressOptions.length === 0,
    })

    onAddressSelect(newAddress, newCareOf || null)
    setSelectedAddressId(saved.id)
    setShowNewForm(false)
    setNewLabel('')
    setNewCareOf('')
    setNewAddress(null)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Address Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipping Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {addressOptions.length > 0 && (
            <RadioGroup value={selectedAddressId ?? ''} onValueChange={handleAddressSelect}>
              {addressOptions.map((option) => (
                <div key={option.id} className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                  <label htmlFor={option.id} className="flex-1 cursor-pointer">
                    <p className="font-medium text-sm">{option.label}</p>
                    {option.careOf && (
                      <p className="text-sm text-muted-foreground">C/O {option.careOf}</p>
                    )}
                    <AddressDisplay address={option.address} className="mt-1" />
                  </label>
                </div>
              ))}
            </RadioGroup>
          )}

          {!showNewForm ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowNewForm(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add new address
            </Button>
          ) : (
            <div className="border rounded-md p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Label *</Label>
                  <Input
                    placeholder='e.g. "Home", "Office"'
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">C/O (Care of)</Label>
                  <Input
                    placeholder="Recipient name if different"
                    value={newCareOf}
                    onChange={(e) => setNewCareOf(e.target.value)}
                  />
                </div>
              </div>

              <AddressForm
                value={newAddress}
                onChange={setNewAddress}
              />

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveNewAddress}
                  disabled={!newLabel || !newAddress || createAddress.isPending}
                >
                  {createAddress.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  Save Address
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery Scheduling — hidden for WALK_IN */}
      {!isWalkIn && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Scheduling</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Delivery Date</Label>
                <Input
                  type="date"
                  min={minDate}
                  value={deliveryDate ?? ''}
                  onChange={(e) => onDeliveryDateChange(e.target.value || null)}
                />
                <p className="text-xs text-muted-foreground">Optional — earliest is tomorrow</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Delivery Time</Label>
                <Select
                  value={deliveryTimeCode ?? 'none'}
                  onValueChange={(v) => onDeliveryTimeCodeChange(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No preference</SelectItem>
                    {YAMATO_TIME_SLOTS.map((slot) => (
                      <SelectItem key={slot.code} value={slot.code}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Yamato delivery time slot</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build. The component uses existing `AddressForm` and `AddressDisplay` components.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/shipping-step.tsx
git commit -m "feat: add ShippingStep component with address picker and Yamato delivery scheduling"
```

---

## Chunk 5: UI Components — Item Browser + Order Review

### Task 13: Item Browser Component

**Files:**
- Create: `src/components/orders/item-browser.tsx`

- [ ] **Step 1: Create the item browser component**

Create `src/components/orders/item-browser.tsx`. This is a paginated grid of AVAILABLE items with photo thumbnails, filters, and click-to-select behavior.

```typescript
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAvailableItems } from '@/hooks/use-orders'
import { CONDITION_GRADES } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import { Search, Check, Loader2, Package, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ManualOrderItemValues } from '@/validators/manual-order'

interface ItemBrowserProps {
  selectedItems: ManualOrderItemValues[]
  onToggleItem: (item: ManualOrderItemValues) => void
  onPriceChange: (itemId: string, price: number) => void
  onRemoveItem: (itemId: string) => void
}

export function ItemBrowser({
  selectedItems,
  onToggleItem,
  onPriceChange,
  onRemoveItem,
}: ItemBrowserProps) {
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState<string>('all')
  const [page, setPage] = useState(0)

  const { data, isLoading } = useAvailableItems({
    search: search || undefined,
    grade: gradeFilter === 'all' ? undefined : gradeFilter,
    page,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  const selectedItemIds = new Set(selectedItems.map((i) => i.item_id))

  const handleItemClick = (item: (typeof items)[number]) => {
    const pm = item.product_models
    const productName = pm ? `${pm.brand} ${pm.model_name}` : item.item_code

    if (selectedItemIds.has(item.id)) {
      onRemoveItem(item.id)
    } else {
      onToggleItem({
        item_id: item.id,
        item_code: item.item_code,
        product_name: productName,
        condition_grade: item.condition_grade,
        unit_price: item.selling_price ?? 0,
      })
    }
  }

  // Get hero image URL for an item (first product media with role 'hero' or first by sort_order)
  const getHeroUrl = (item: (typeof items)[number]) => {
    const media = item.product_models?.product_media
    if (!media || media.length === 0) return null
    const hero = media.find((m) => m.role === 'hero') ?? media.sort((a, b) => a.sort_order - b.sort_order)[0]
    return hero?.file_url ?? null
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search P-code or product name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={gradeFilter}
          onValueChange={(v) => {
            setGradeFilter(v)
            setPage(0)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            {CONDITION_GRADES.filter((g) => g.value !== 'J').map((g) => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Item Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2" />
          <p>No available items found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {items.map((item) => {
              const isSelected = selectedItemIds.has(item.id)
              const heroUrl = getHeroUrl(item)
              const pm = item.product_models

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`relative text-left rounded-lg border-2 p-0 overflow-hidden transition-all hover:shadow-md ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  {/* Checkmark overlay */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="h-3 w-3" />
                    </div>
                  )}

                  {/* Photo */}
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    {heroUrl ? (
                      <img
                        src={heroUrl}
                        alt={item.item_code}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="h-8 w-8 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2 space-y-1">
                    <p className="font-mono text-xs text-muted-foreground">{item.item_code}</p>
                    {pm && (
                      <p className="text-sm font-medium leading-tight truncate">
                        {pm.brand} {pm.model_name}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      {item.condition_grade && (
                        <Badge variant="outline" className="text-xs">
                          {item.condition_grade}
                        </Badge>
                      )}
                      <span className="text-sm font-medium">
                        {formatPrice(item.selling_price ?? 0)}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Selected Items Cart */}
      {selectedItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Selected Items ({selectedItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectedItems.map((item) => (
                <div
                  key={item.item_id}
                  className="flex items-center gap-3 p-2 rounded-md border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{item.item_code}</p>
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    {item.condition_grade && (
                      <Badge variant="outline" className="text-xs mt-0.5">
                        {item.condition_grade}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-28">
                      <Input
                        type="number"
                        min={0}
                        value={item.unit_price}
                        onChange={(e) =>
                          onPriceChange(item.item_id, Number(e.target.value) || 0)
                        }
                        className="text-right text-sm h-8"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveItem(item.item_id)}
                      className="text-destructive hover:text-destructive"
                    >
                      &times;
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t font-medium">
                <span>Subtotal</span>
                <span>{formatPrice(selectedItems.reduce((sum, i) => sum + i.unit_price, 0))}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build. Check that imports from shared components (`GradeBadge`, `PriceDisplay`) resolve correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/item-browser.tsx
git commit -m "feat: add ItemBrowser component with paginated grid, filters, and cart"
```

---

### Task 14: Order Review Component

**Files:**
- Create: `src/components/orders/order-review.tsx`

- [ ] **Step 1: Create the review/submit component**

Create `src/components/orders/order-review.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AddressDisplay } from '@/components/shared/address-display'
import { ORDER_SOURCES, YAMATO_TIME_SLOTS } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import type { Customer } from '@/lib/types'
import type { ShippingAddress } from '@/lib/address-types'
import type { ManualOrderItemValues } from '@/validators/manual-order'

interface OrderReviewProps {
  customer: Customer | null
  orderSource: string
  onOrderSourceChange: (source: string) => void
  shippingAddress: ShippingAddress | null
  careOf: string | null
  deliveryDate: string | null
  deliveryTimeCode: string | null
  items: ManualOrderItemValues[]
  notes: string
  onNotesChange: (notes: string) => void
  onSubmit: () => void
  isSubmitting: boolean
}

export function OrderReview({
  customer,
  orderSource,
  onOrderSourceChange,
  shippingAddress,
  careOf,
  deliveryDate,
  deliveryTimeCode,
  items,
  notes,
  onNotesChange,
  onSubmit,
  isSubmitting,
}: OrderReviewProps) {
  const totalPrice = items.reduce((sum, i) => sum + i.unit_price, 0)
  const timeSlot = YAMATO_TIME_SLOTS.find((s) => s.code === deliveryTimeCode)

  const canSubmit = customer && shippingAddress && items.length > 0 && orderSource

  return (
    <div className="space-y-4">
      {/* Order Source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Order Source *</Label>
            <Select value={orderSource} onValueChange={onOrderSourceChange}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {ORDER_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Staff Notes</Label>
            <Textarea
              placeholder="Optional notes about this order..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Customer */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Customer</p>
            {customer ? (
              <p className="text-sm font-medium">
                {customer.customer_code} — {customer.last_name} {customer.first_name ?? ''}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Not selected</p>
            )}
          </div>

          {/* Shipping */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Shipping Address</p>
            {shippingAddress ? (
              <AddressDisplay address={shippingAddress} careOf={careOf ?? undefined} className="mt-0.5" />
            ) : (
              <p className="text-sm text-muted-foreground">Not selected</p>
            )}
          </div>

          {/* Delivery */}
          {(deliveryDate || deliveryTimeCode) && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Delivery</p>
              <p className="text-sm">
                {deliveryDate ?? 'No date'} {timeSlot ? `· ${timeSlot.label}` : ''}
              </p>
            </div>
          )}

          {/* Items */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Items ({items.length})
            </p>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items selected</p>
            ) : (
              <div className="space-y-1">
                {items.map((item) => (
                  <div key={item.item_id} className="flex justify-between text-sm">
                    <span>
                      {item.item_code} — {item.product_name}
                      {item.condition_grade ? ` (${item.condition_grade})` : ''}
                    </span>
                    <span className="font-medium">{formatPrice(item.unit_price)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t font-medium">
                  <span>Total</span>
                  <span>{formatPrice(totalPrice)}</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="sticky bottom-0 bg-background border-t p-4 -mx-6 -mb-6 flex items-center justify-between">
        <div>
          <p className="text-lg font-bold">{formatPrice(totalPrice)}</p>
          <p className="text-sm text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!canSubmit || isSubmitting}
          onClick={onSubmit}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Create Order
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/order-review.tsx
git commit -m "feat: add OrderReview component with summary and submit"
```

---

### Task 14b: Barrel Export for Orders Components

**Files:**
- Create: `src/components/orders/index.ts`

- [ ] **Step 1: Create barrel export**

Create `src/components/orders/index.ts`:

```typescript
export { CustomerPicker } from './customer-picker'
export { ShippingStep } from './shipping-step'
export { ItemBrowser } from './item-browser'
export { OrderReview } from './order-review'
```

- [ ] **Step 2: Commit**

```bash
git add src/components/orders/index.ts
git commit -m "feat: add barrel export for orders components"
```

---

## Chunk 6: Main Page + Routes + Entry Point

### Task 15: Create Order Page

**Files:**
- Create: `src/pages/admin/create-order.tsx`

- [ ] **Step 1: Create the main page component**

Create `src/pages/admin/create-order.tsx`. This orchestrates all 4 steps in a single scrollable page:

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/shared'
import { CustomerPicker } from '@/components/orders/customer-picker'
import { ShippingStep } from '@/components/orders/shipping-step'
import { ItemBrowser } from '@/components/orders/item-browser'
import { OrderReview } from '@/components/orders/order-review'
import { useCreateManualOrder } from '@/hooks/use-orders'
import { useToast } from '@/hooks/use-toast'
import type { Customer } from '@/lib/types'
import type { ShippingAddress } from '@/lib/address-types'
import type { ManualOrderItemValues } from '@/validators/manual-order'

export default function CreateOrderPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const createOrder = useCreateManualOrder()

  // Step 1: Customer
  const [customer, setCustomer] = useState<Customer | null>(null)

  // Step 2: Shipping
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)
  const [careOf, setCareOf] = useState<string | null>(null)
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null)
  const [deliveryTimeCode, setDeliveryTimeCode] = useState<string | null>(null)

  // Step 3: Items
  const [selectedItems, setSelectedItems] = useState<ManualOrderItemValues[]>([])

  // Step 4: Review
  const [orderSource, setOrderSource] = useState<string>('SHOP')
  const [notes, setNotes] = useState('')

  const handleAddressSelect = (address: ShippingAddress, co?: string | null) => {
    setShippingAddress(address)
    setCareOf(co ?? null)
  }

  const handleToggleItem = (item: ManualOrderItemValues) => {
    setSelectedItems((prev) => {
      const exists = prev.find((i) => i.item_id === item.item_id)
      if (exists) {
        return prev.filter((i) => i.item_id !== item.item_id)
      }
      return [...prev, item]
    })
  }

  const handlePriceChange = (itemId: string, price: number) => {
    setSelectedItems((prev) =>
      prev.map((i) => (i.item_id === itemId ? { ...i, unit_price: price } : i))
    )
  }

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems((prev) => prev.filter((i) => i.item_id !== itemId))
  }

  const handleSubmit = async () => {
    if (!customer || !shippingAddress || selectedItems.length === 0) return

    try {
      const order = await createOrder.mutateAsync({
        customer_id: customer.id,
        order_source: orderSource,
        shipping_address: JSON.stringify(shippingAddress),
        delivery_date: deliveryDate,
        delivery_time_code: deliveryTimeCode,
        notes: notes || null,
        items: selectedItems.map((i) => ({
          item_id: i.item_id,
          unit_price: i.unit_price,
        })),
      })

      toast({
        title: 'Order created',
        description: `Order ${order.order_code} has been created.`,
      })

      navigate(`/admin/orders/${order.id}`)
    } catch (error) {
      toast({
        title: 'Failed to create order',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-8 pb-24">
      <PageHeader
        title="Create Order"
        description="Manually create an order for a customer."
      />

      {/* Step 1: Customer */}
      <section>
        <h2 className="text-lg font-semibold mb-3">1. Customer</h2>
        <CustomerPicker
          selectedCustomer={customer}
          onSelect={(c) => {
            setCustomer(c)
            // Reset downstream when customer changes
            if (!c) {
              setShippingAddress(null)
              setCareOf(null)
            }
          }}
        />
      </section>

      {/* Step 2: Shipping & Delivery */}
      <section className={!customer ? 'opacity-50 pointer-events-none' : ''}>
        <h2 className="text-lg font-semibold mb-3">2. Shipping & Delivery</h2>
        {customer ? (
          <ShippingStep
            customer={customer}
            orderSource={orderSource}
            selectedAddress={shippingAddress ? { address: shippingAddress, careOf } : null}
            onAddressSelect={handleAddressSelect}
            deliveryDate={deliveryDate}
            onDeliveryDateChange={setDeliveryDate}
            deliveryTimeCode={deliveryTimeCode}
            onDeliveryTimeCodeChange={setDeliveryTimeCode}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Select a customer first
            </CardContent>
          </Card>
        )}
      </section>

      {/* Step 3: Items */}
      <section className={!shippingAddress ? 'opacity-50 pointer-events-none' : ''}>
        <h2 className="text-lg font-semibold mb-3">3. Items</h2>
        {shippingAddress ? (
          <ItemBrowser
            selectedItems={selectedItems}
            onToggleItem={handleToggleItem}
            onPriceChange={handlePriceChange}
            onRemoveItem={handleRemoveItem}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Select a shipping address first
            </CardContent>
          </Card>
        )}
      </section>

      {/* Step 4: Review & Submit */}
      <section>
        <h2 className="text-lg font-semibold mb-3">4. Review & Submit</h2>
        <OrderReview
          customer={customer}
          orderSource={orderSource}
          onOrderSourceChange={setOrderSource}
          shippingAddress={shippingAddress}
          careOf={careOf}
          deliveryDate={deliveryDate}
          deliveryTimeCode={deliveryTimeCode}
          items={selectedItems}
          notes={notes}
          onNotesChange={setNotes}
          onSubmit={handleSubmit}
          isSubmitting={createOrder.isPending}
        />
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/create-order.tsx
git commit -m "feat: add CreateOrderPage with 4-step manual order flow"
```

---

### Task 16: Add Route + Entry Point Button

**Files:**
- Modify: `src/routes.tsx`
- Modify: `src/pages/admin/orders.tsx`

- [ ] **Step 1: Add route for create-order page**

In `src/routes.tsx`:

1. Add the lazy import at the top with other admin page imports:

```typescript
const CreateOrderPage = lazy(() => import('@/pages/admin/create-order'))
```

2. Add the route BEFORE the `orders/:id` route (important — "new" must not be captured as an `:id` param):

```typescript
{ path: 'orders/new', element: lazyElement(CreateOrderPage) },
{ path: 'orders/:id', element: lazyElement(OrderDetailPage) },
```

The existing `{ path: 'orders', element: lazyElement(OrderListPage) }` line stays as-is.

- [ ] **Step 2: Add "+ Create Order" button to orders list page**

In `src/pages/admin/orders.tsx`:

1. Add import for `Link` and `Button`:

```typescript
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
```

2. Add the button via `PageHeader`'s existing `actions` prop. Replace the existing `<PageHeader ... />` with:

```tsx
<PageHeader
  title="Orders"
  description="Manage customer orders."
  actions={
    <Button asChild>
      <Link to="/admin/orders/new">
        <Plus className="h-4 w-4 mr-1" />
        Create Order
      </Link>
    </Button>
  }
/>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Clean build. No TypeScript errors.

- [ ] **Step 4: Manual verification**

1. Navigate to `/admin/orders` — should see the "+ Create Order" button
2. Click it — should navigate to `/admin/orders/new`
3. The 4-step form should be visible
4. Selecting a customer enables the shipping step
5. Selecting an address enables the items step
6. Browse items, select them, adjust prices
7. Fill in order source, submit — should create the order and navigate to its detail page

- [ ] **Step 5: Commit**

```bash
git add src/routes.tsx src/pages/admin/orders.tsx
git commit -m "feat: add route and entry point for manual order creation"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `npm run build` — clean TypeScript build, no errors
- [ ] Database migration applied — `customer_addresses` table exists, `orders` has new columns, `order_source` enum expanded
- [ ] `/admin/orders` shows "+ Create Order" button
- [ ] `/admin/orders/new` loads the 4-step form
- [ ] Customer search works (by name, code, email, phone)
- [ ] Address book shows saved addresses or legacy fallback
- [ ] New address can be added inline and is saved to `customer_addresses`
- [ ] C/O field works on saved addresses
- [ ] Delivery date/time selection works (Yamato time slots)
- [ ] Delivery fields hidden for WALK_IN orders
- [ ] Item grid shows AVAILABLE items with photos
- [ ] Items can be selected/deselected, prices can be overridden
- [ ] Order summary shows all selections
- [ ] Submit creates order atomically (order + order_items with unit_price)
- [ ] After submit, navigates to order detail page with success toast
- [ ] If item is no longer available at submit time, shows an error
