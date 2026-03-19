# Order Line Items Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the photo-grid item browser with a table-based order entry system supporting both inventory items and ad-hoc custom line items.

**Architecture:** New `OrderLineItems` component replaces `ItemBrowser` + `OrderReview`. A search dropdown adds inventory items by P-code/product name; a button adds ad-hoc rows. Line items table with qty, price, discount, subtotal columns. Summary shows subtotal + delivery fee + informational discount + total. DB migration adds `description`, `quantity`, `discount` to `order_items`, makes `item_id` nullable, adds `shipping_cost` to `orders`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zod, Supabase PostgreSQL, sonner (toasts)

**Spec:** `docs/superpowers/specs/2026-03-19-order-line-items-redesign-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260319120000_order_line_items.sql` | Create | DB migration: new columns, nullable item_id, partial unique index, shipping_cost |
| `src/validators/manual-order.ts` | Modify | Update Zod schemas for new OrderLineItem type |
| `src/services/orders.ts` | Modify | Update `createManualOrder` input, update `getAvailableItems` for product name search |
| `src/hooks/use-orders.ts` | Modify | Update `useAvailableItems` for debounced search, update `useCreateManualOrder` |
| `src/components/orders/order-line-items.tsx` | Create | New table-based order entry component |
| `src/components/orders/index.ts` | Modify | Update barrel exports |
| `src/pages/admin/create-order.tsx` | Modify | Simplify from 4 steps to 3 sections |
| `src/components/orders/item-browser.tsx` | Delete | Replaced by OrderLineItems |
| `src/components/orders/order-review.tsx` | Delete | Absorbed into OrderLineItems |

---

## Chunk 1: Database & Service Layer

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260319120000_order_line_items.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260319120000_order_line_items.sql`:

```sql
-- Order line items redesign
-- Depends on: 20260319100000_manual_order_support.sql

-- 1. Add new columns to order_items
ALTER TABLE order_items ADD COLUMN description text;
ALTER TABLE order_items ADD COLUMN quantity integer NOT NULL DEFAULT 1;
ALTER TABLE order_items ADD COLUMN discount integer NOT NULL DEFAULT 0;

-- 2. Make item_id nullable for ad-hoc/custom line items
ALTER TABLE order_items ALTER COLUMN item_id DROP NOT NULL;

-- 3. Replace UNIQUE constraint with partial unique index
-- (allows multiple NULLs for ad-hoc items while keeping inventory items unique)
ALTER TABLE order_items DROP CONSTRAINT order_items_item_id_key;
CREATE UNIQUE INDEX idx_order_items_item_unique ON order_items (item_id) WHERE item_id IS NOT NULL;

-- 4. Add shipping_cost to orders
ALTER TABLE orders ADD COLUMN shipping_cost integer NOT NULL DEFAULT 0;

-- 5. Check constraints
ALTER TABLE order_items ADD CONSTRAINT chk_order_items_quantity CHECK (quantity > 0);
ALTER TABLE order_items ADD CONSTRAINT chk_order_items_discount CHECK (discount >= 0);
ALTER TABLE orders ADD CONSTRAINT chk_orders_shipping_cost CHECK (shipping_cost >= 0);
```

- [ ] **Step 2: Verify the migration file is valid**

Run: `cat supabase/migrations/20260319120000_order_line_items.sql`
Expected: The SQL content above, no syntax issues.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260319120000_order_line_items.sql
git commit -m "feat: add migration for order line items redesign

Add description, quantity, discount to order_items. Make item_id
nullable with partial unique index. Add shipping_cost to orders."
```

---

### Task 2: Update Zod Validators

**Files:**
- Modify: `src/validators/manual-order.ts`

- [ ] **Step 1: Update the schemas**

Replace the entire contents of `src/validators/manual-order.ts` with:

```typescript
import { z } from 'zod'

export const orderLineItemSchema = z.object({
  id: z.string().uuid(),
  item_id: z.string().uuid().nullable(),
  item_code: z.string().nullable(),
  description: z.string().min(1, 'Description is required'),
  condition_grade: z.string().nullable(),
  quantity: z.coerce.number().int().positive('Quantity must be > 0'),
  unit_price: z.coerce.number().nonnegative('Price must be ≥ 0'),
  discount: z.coerce.number().int().nonnegative('Discount must be ≥ 0').default(0),
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
  shipping_cost: z.coerce.number().int().nonnegative('Delivery fee must be ≥ 0').default(0),
  items: z.array(orderLineItemSchema).min(1, 'At least 1 item is required'),
})

export type ManualOrderFormValues = z.infer<typeof manualOrderSchema>
export type OrderLineItemValues = z.infer<typeof orderLineItemSchema>

// Keep backward-compatible alias
export type ManualOrderItemValues = OrderLineItemValues
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `manual-order.ts` (there may be other pre-existing errors).

- [ ] **Step 3: Commit**

```bash
git add src/validators/manual-order.ts
git commit -m "feat: update Zod schemas for order line items

Add OrderLineItemValues type with id, nullable item_id, description,
quantity, discount. Add shipping_cost to manualOrderSchema."
```

---

### Task 3: Update Service Layer

**Files:**
- Modify: `src/services/orders.ts` (lines 113-208)

- [ ] **Step 1: Update `ManualOrderInput` interface and `createManualOrder` function**

In `src/services/orders.ts`, replace the `ManualOrderInput` interface and `createManualOrder` function (lines 153-208) with:

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
    item_id: string | null
    description: string
    quantity: number
    unit_price: number
    discount: number
  }[]
}

export async function createManualOrder(input: ManualOrderInput) {
  const orderCode = await generateOrderCode()

  const quantity = input.items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice =
    input.items.reduce(
      (sum, item) => sum + item.unit_price * item.quantity - item.discount,
      0
    ) + input.shipping_cost

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
      shipping_cost: input.shipping_cost,
      sell_group_id: null,
    })
    .select()
    .single()

  if (orderError) throw orderError

  const orderItems = input.items.map((item) => ({
    order_id: (order as Order).id,
    item_id: item.item_id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount: item.discount,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    await supabase.from('orders').delete().eq('id', (order as Order).id)
    if (itemsError.message.includes('unique') || itemsError.message.includes('duplicate')) {
      throw new Error('One or more items are no longer available. Please refresh and try again.')
    }
    throw itemsError
  }

  return order as Order
}
```

- [ ] **Step 2: Update `getAvailableItems` to support product name search**

In `src/services/orders.ts`, replace the `getAvailableItems` function (lines 122-150) with:

```typescript
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
    .neq('condition_grade', 'J')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters.search) {
    // PostgREST doesn't support .or() on joined table columns,
    // so we search by item_code only here. Product name matching
    // is handled client-side after fetching results.
    query = query.ilike('item_code', `%${filters.search}%`)
  }
  if (filters.grade) {
    query = query.eq('condition_grade', filters.grade)
  }

  const { data, error, count } = await query
  if (error) throw error

  // If searching and got few results from item_code, also search by product model name
  let items = data ?? []
  if (filters.search && items.length < pageSize) {
    const { data: modelResults, error: modelError } = await supabase
      .from('items')
      .select(`
        id, item_code, condition_grade, selling_price, item_status,
        product_models!inner(id, brand, model_name, color,
          product_media(file_url, role, sort_order)
        )
      `)
      .eq('item_status', 'AVAILABLE')
      .neq('condition_grade', 'J')
      .or(
        `brand.ilike.%${filters.search}%,model_name.ilike.%${filters.search}%`,
        { referencedTable: 'product_models' }
      )
      .order('created_at', { ascending: false })
      .limit(pageSize)

    if (!modelError && modelResults) {
      // Merge results, deduplicating by id
      const existingIds = new Set(items.map((i) => i.id))
      for (const item of modelResults) {
        if (!existingIds.has(item.id)) {
          items.push(item)
        }
      }
    }
  }

  return { items, total: count ?? items.length }
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/orders.ts
git commit -m "feat: update order service for line items redesign

Update createManualOrder to handle nullable item_id, description,
quantity, discount, and shipping_cost. Update getAvailableItems to
search by product model name via separate query with merge."
```

---

### Task 4: Update Hooks

**Files:**
- Modify: `src/hooks/use-orders.ts` (lines 70-92)

- [ ] **Step 1: Update `useAvailableItems` for search dropdown use**

In `src/hooks/use-orders.ts`, replace the `AvailableItemFilters` interface and `useAvailableItems` function (lines 70-81) with:

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
    enabled: !!filters.search && filters.search.length >= 1,
  })
}
```

The key change is `enabled: !!filters.search && filters.search.length >= 1` — the query only fires when the user has typed at least 1 character. This makes it behave as a search dropdown rather than a pre-loaded grid.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-orders.ts
git commit -m "feat: update useAvailableItems for search dropdown

Only fire query when search has >=1 character, not on initial load."
```

---

## Chunk 2: UI Components

### Task 5: Create OrderLineItems Component

**Files:**
- Create: `src/components/orders/order-line-items.tsx`

This is the main new component. It contains: order source/notes header, item search dropdown, line items table, and summary section with submit button.

- [ ] **Step 1: Create the component file**

Create `src/components/orders/order-line-items.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAvailableItems } from '@/hooks/use-orders'
import { ORDER_SOURCES } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import { Search, Plus, Loader2, X, Package } from 'lucide-react'

export interface OrderLineItem {
  id: string
  item_id: string | null
  item_code: string | null
  description: string
  condition_grade: string | null
  quantity: number
  unit_price: number
  discount: number
}

interface OrderLineItemsProps {
  lineItems: OrderLineItem[]
  onLineItemsChange: (items: OrderLineItem[]) => void
  shippingCost: number
  onShippingCostChange: (cost: number) => void
  orderSource: string
  onOrderSourceChange: (source: string) => void
  notes: string
  onNotesChange: (notes: string) => void
  onSubmit: () => void
  isSubmitting: boolean
  canSubmit: boolean
}

export function OrderLineItems({
  lineItems,
  onLineItemsChange,
  shippingCost,
  onShippingCostChange,
  orderSource,
  onOrderSourceChange,
  notes,
  onNotesChange,
  onSubmit,
  isSubmitting,
  canSubmit,
}: OrderLineItemsProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { data, isLoading } = useAvailableItems({ search: debouncedQuery })
  const searchResults = data?.items ?? []

  const addedItemIds = new Set(
    lineItems.filter((li) => li.item_id).map((li) => li.item_id)
  )

  const handleSelectItem = (item: (typeof searchResults)[number]) => {
    if (addedItemIds.has(item.id)) return

    const pm = item.product_models
    const description = pm ? `${pm.brand} ${pm.model_name}` : item.item_code

    const newLine: OrderLineItem = {
      id: crypto.randomUUID(),
      item_id: item.id,
      item_code: item.item_code,
      description,
      condition_grade: item.condition_grade,
      quantity: 1,
      unit_price: item.selling_price ?? 0,
      discount: 0,
    }

    onLineItemsChange([...lineItems, newLine])
    setSearchQuery('')
    setDebouncedQuery('')
    setShowDropdown(false)
  }

  const handleAddCustomItem = () => {
    const newLine: OrderLineItem = {
      id: crypto.randomUUID(),
      item_id: null,
      item_code: null,
      description: '',
      condition_grade: null,
      quantity: 1,
      unit_price: 0,
      discount: 0,
    }
    onLineItemsChange([...lineItems, newLine])
  }

  const updateLine = (id: string, updates: Partial<OrderLineItem>) => {
    onLineItemsChange(
      lineItems.map((li) => (li.id === id ? { ...li, ...updates } : li))
    )
  }

  const removeLine = (id: string) => {
    onLineItemsChange(lineItems.filter((li) => li.id !== id))
  }

  // Calculations
  const orderSubtotal = lineItems.reduce(
    (sum, li) => sum + li.unit_price * li.quantity - li.discount,
    0
  )
  const totalDiscount = lineItems.reduce((sum, li) => sum + li.discount, 0)
  const orderTotal = orderSubtotal + shippingCost

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Order</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Order Source & Notes */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Order Source *</Label>
            <Select value={orderSource} onValueChange={onOrderSourceChange}>
              <SelectTrigger className="w-full">
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
              rows={1}
              className="min-h-[36px] resize-none"
            />
          </div>
        </div>

        {/* Search + Add Custom */}
        <div className="flex items-center gap-3">
          <div ref={searchRef} className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search P-code or product name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowDropdown(true)
              }}
              onFocus={() => {
                if (searchQuery) setShowDropdown(true)
              }}
              className="pl-9"
            />

            {/* Search Dropdown */}
            {showDropdown && debouncedQuery && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-sm text-muted-foreground">Searching...</span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="flex items-center justify-center py-4">
                    <Package className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">No items found</span>
                  </div>
                ) : (
                  searchResults.map((item) => {
                    const isAdded = addedItemIds.has(item.id)
                    const pm = item.product_models
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={isAdded}
                        onClick={() => handleSelectItem(item)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                          isAdded
                            ? 'opacity-40 cursor-not-allowed bg-muted'
                            : 'hover:bg-accent cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs text-muted-foreground shrink-0">
                            {item.item_code}
                          </span>
                          <span className="truncate">
                            {pm ? `${pm.brand} ${pm.model_name}` : '—'}
                          </span>
                          {item.condition_grade && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {item.condition_grade}
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground shrink-0">
                          {formatPrice(item.selling_price ?? 0)}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCustomItem}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add custom item
          </Button>
        </div>

        {/* Line Items Table */}
        {lineItems.length > 0 ? (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20 text-center">Qty</TableHead>
                  <TableHead className="w-28 text-right">Unit Price</TableHead>
                  <TableHead className="w-24 text-right">Discount</TableHead>
                  <TableHead className="w-28 text-right">Subtotal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((li, idx) => {
                  const isInventory = li.item_id !== null
                  const lineSubtotal = li.unit_price * li.quantity - li.discount

                  return (
                    <TableRow key={li.id}>
                      <TableCell className="text-muted-foreground text-xs">
                        {idx + 1}
                      </TableCell>

                      {/* Description */}
                      <TableCell>
                        {isInventory ? (
                          <div>
                            <span className="font-mono text-xs text-muted-foreground mr-2">
                              {li.item_code}
                            </span>
                            <span className="text-sm font-medium">{li.description}</span>
                            {li.condition_grade && (
                              <Badge variant="outline" className="text-xs ml-2">
                                {li.condition_grade}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <Input
                            placeholder="Item description..."
                            value={li.description}
                            onChange={(e) =>
                              updateLine(li.id, { description: e.target.value })
                            }
                            className="h-8 text-sm"
                          />
                        )}
                      </TableCell>

                      {/* Qty */}
                      <TableCell className="text-center">
                        {isInventory ? (
                          <span className="text-sm">1</span>
                        ) : (
                          <Input
                            type="number"
                            min={1}
                            value={li.quantity}
                            onChange={(e) =>
                              updateLine(li.id, {
                                quantity: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="h-8 text-sm text-center w-16 mx-auto"
                          />
                        )}
                      </TableCell>

                      {/* Unit Price */}
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={li.unit_price}
                          onChange={(e) =>
                            updateLine(li.id, {
                              unit_price: Number(e.target.value) || 0,
                            })
                          }
                          className="h-8 text-sm text-right w-28 ml-auto"
                        />
                      </TableCell>

                      {/* Discount */}
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={li.discount}
                          onChange={(e) =>
                            updateLine(li.id, {
                              discount: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="h-8 text-sm text-right w-24 ml-auto"
                        />
                      </TableCell>

                      {/* Subtotal */}
                      <TableCell className="text-right text-sm font-medium">
                        {formatPrice(lineSubtotal)}
                      </TableCell>

                      {/* Remove */}
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(li.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="border rounded-md py-8 text-center text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No items added yet. Search for inventory items or add a custom item.</p>
          </div>
        )}

        {/* Summary */}
        <div className="flex justify-end">
          <div className="w-72 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatPrice(orderSubtotal)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Delivery Fee</span>
              <Input
                type="number"
                min={0}
                value={shippingCost}
                onChange={(e) =>
                  onShippingCostChange(Math.max(0, Number(e.target.value) || 0))
                }
                className="h-8 text-sm text-right w-28"
              />
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-muted-foreground">({formatPrice(totalDiscount)})</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t">
              <span className="font-semibold">Total</span>
              <span className="font-semibold text-lg">{formatPrice(orderTotal)}</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
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
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to order-line-items.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/order-line-items.tsx
git commit -m "feat: create OrderLineItems table-based component

New order entry component with search dropdown, line items table,
ad-hoc custom items, per-line discount, delivery fee, and summary."
```

---

### Task 6: Update Barrel Export

**Files:**
- Modify: `src/components/orders/index.ts`

- [ ] **Step 1: Replace barrel exports**

Replace the entire contents of `src/components/orders/index.ts` with:

```typescript
export { CustomerPicker } from './customer-picker'
export { ShippingStep } from './shipping-step'
export { OrderLineItems } from './order-line-items'
export type { OrderLineItem } from './order-line-items'
```

- [ ] **Step 2: Commit**

```bash
git add src/components/orders/index.ts
git commit -m "feat: update barrel exports for order components

Remove ItemBrowser and OrderReview, add OrderLineItems."
```

---

### Task 7: Update Create Order Page

**Files:**
- Modify: `src/pages/admin/create-order.tsx`

- [ ] **Step 1: Rewrite the page to use 3 sections**

Replace the entire contents of `src/pages/admin/create-order.tsx` with:

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared'
import { CustomerPicker } from '@/components/orders/customer-picker'
import { ShippingStep } from '@/components/orders/shipping-step'
import { OrderLineItems } from '@/components/orders/order-line-items'
import type { OrderLineItem } from '@/components/orders/order-line-items'
import { useCreateManualOrder } from '@/hooks/use-orders'
import { toast } from 'sonner'
import type { Customer } from '@/lib/types'
import type { ShippingAddress } from '@/lib/address-types'

export default function CreateOrderPage() {
  const navigate = useNavigate()
  const createOrder = useCreateManualOrder()

  // Section 1: Customer
  const [customer, setCustomer] = useState<Customer | null>(null)

  // Section 2: Shipping
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)
  const [careOf, setCareOf] = useState<string | null>(null)
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null)
  const [deliveryTimeCode, setDeliveryTimeCode] = useState<string | null>(null)

  // Section 3: Order
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([])
  const [shippingCost, setShippingCost] = useState(0)
  const [orderSource, setOrderSource] = useState<string>('SHOP')
  const [notes, setNotes] = useState('')

  const handleAddressSelect = (address: ShippingAddress, co?: string | null) => {
    setShippingAddress(address)
    setCareOf(co ?? null)
  }

  const canSubmit =
    !!customer &&
    !!shippingAddress &&
    lineItems.length > 0 &&
    !!orderSource &&
    lineItems.every((li) => li.description.trim().length > 0)

  const handleSubmit = async () => {
    if (!customer || !shippingAddress || lineItems.length === 0) return

    try {
      const order = await createOrder.mutateAsync({
        customer_id: customer.id,
        order_source: orderSource,
        shipping_address: JSON.stringify(shippingAddress),
        delivery_date: deliveryDate,
        delivery_time_code: deliveryTimeCode,
        notes: notes || null,
        shipping_cost: shippingCost,
        items: lineItems.map((li) => ({
          item_id: li.item_id,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          discount: li.discount,
        })),
      })

      toast.success(`Order ${order.order_code} created`)
      navigate(`/admin/orders/${order.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create order')
    }
  }

  return (
    <div className="space-y-8 pb-24">
      <PageHeader
        title="Create Order"
        description="Manually create an order for a customer."
      />

      {/* Section 1: Customer */}
      <section>
        <h2 className="text-lg font-semibold mb-3">1. Customer</h2>
        <CustomerPicker
          selectedCustomer={customer}
          onSelect={(c) => {
            setCustomer(c)
            if (!c) {
              setShippingAddress(null)
              setCareOf(null)
            }
          }}
        />
      </section>

      {/* Section 2: Shipping & Delivery */}
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

      {/* Section 3: Order */}
      <section className={!shippingAddress ? 'opacity-50 pointer-events-none' : ''}>
        <h2 className="text-lg font-semibold mb-3">3. Order</h2>
        {shippingAddress ? (
          <OrderLineItems
            lineItems={lineItems}
            onLineItemsChange={setLineItems}
            shippingCost={shippingCost}
            onShippingCostChange={setShippingCost}
            orderSource={orderSource}
            onOrderSourceChange={setOrderSource}
            notes={notes}
            onNotesChange={setNotes}
            onSubmit={handleSubmit}
            isSubmitting={createOrder.isPending}
            canSubmit={canSubmit}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Select a shipping address first
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Delete old components**

```bash
rm src/components/orders/item-browser.tsx
rm src/components/orders/order-review.tsx
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds with `✓ built in` message.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire up OrderLineItems and simplify create order page

Replace 4-step flow with 3 sections. Delete ItemBrowser and
OrderReview components. Order source, notes, line items table,
summary, and submit button all in section 3."
```

---

## Chunk 3: Verification & Cleanup

### Task 8: Full Build Verification

- [ ] **Step 1: Run full build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds. No TypeScript errors.

- [ ] **Step 2: Check for any leftover imports of deleted components**

Run: `grep -r "ItemBrowser\|OrderReview\|item-browser\|order-review" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: No results (all references to deleted components are gone).

- [ ] **Step 3: Verify routes still work**

Run: `grep -n "orders/new" src/routes.tsx`
Expected: Route exists, pointing to `create-order.tsx`.

- [ ] **Step 4: Final commit if any fixes needed**

Only commit if there were issues to fix in steps 1-3.

---

### Task 9: Verify the Migration is Ready

- [ ] **Step 1: Verify migration file exists and is valid SQL**

Run: `cat supabase/migrations/20260319120000_order_line_items.sql`
Expected: Valid SQL with all 8 statements (3 ADD COLUMN, 1 ALTER COLUMN, 1 DROP CONSTRAINT, 1 CREATE INDEX, 1 ADD COLUMN on orders, 3 ADD CONSTRAINT).

- [ ] **Step 2: Note for deployment**

The migration needs to be applied with `npx supabase db push` and types regenerated with `npx supabase gen types typescript` before testing against a live database. This is a deployment step, not a build step.
