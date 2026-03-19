# Item Status Lifecycle (RESERVED + SOLD) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RESERVED and SOLD statuses to item_status so items are automatically marked RESERVED when added to orders, reverted to AVAILABLE when removed/cancelled, and marked SOLD when shipped.

**Architecture:** A PostgreSQL migration adds the two new enum values. All status transitions are handled in the application layer (services/orders.ts) alongside the existing order operations — no DB triggers for item status, keeping it explicit and debuggable. The frontend constants and stats function are updated to include the new statuses.

**Tech Stack:** PostgreSQL enum ALTER, Supabase JS client, React/TypeScript

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260319160000_item_status_reserved_sold.sql` | Add RESERVED, SOLD to item_status enum |
| Modify | `src/lib/constants.ts:86-91` | Add RESERVED and SOLD to ITEM_STATUSES array |
| Modify | `src/services/items.ts:115-128` | Add RESERVED and SOLD to getItemStats() |
| Modify | `src/services/orders.ts:223-275` | Update item statuses in createManualOrder |
| Modify | `src/services/orders.ts:294-309` | Update item status in addOrderLineItem |
| Modify | `src/services/orders.ts:311-318` | Revert item status in removeOrderLineItem |
| Modify | `src/services/orders.ts:116-118` | Handle SHIPPED→SOLD and CANCELLED→AVAILABLE in updateOrderStatus |
| Modify | `src/pages/admin/order-detail.tsx:258-266` | Revert item statuses on cancel |
| Modify | `src/pages/admin/items.tsx:19-34` | Add RESERVED/SOLD to ItemRow type hint |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260319160000_item_status_reserved_sold.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Add RESERVED and SOLD values to item_status enum
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'RESERVED';
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'SOLD';
```

- [ ] **Step 2: Push migration to Supabase**

Run: `npx supabase db push`
Expected: Migration applied successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260319160000_item_status_reserved_sold.sql
git commit -m "feat: add RESERVED and SOLD to item_status enum"
```

---

## Task 2: Update Frontend Constants & Stats

**Files:**
- Modify: `src/lib/constants.ts:86-91`
- Modify: `src/services/items.ts:115-128`

- [ ] **Step 1: Add RESERVED and SOLD to ITEM_STATUSES**

In `src/lib/constants.ts`, update the ITEM_STATUSES array (lines 86-91):

```typescript
export const ITEM_STATUSES: { value: ItemStatus; label: string; color: string }[] = [
  { value: 'INTAKE', label: 'Intake', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'AVAILABLE', label: 'Available', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'RESERVED', label: 'Reserved', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'REPAIR', label: 'Repair', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'MISSING', label: 'Missing', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'SOLD', label: 'Sold', color: 'bg-purple-100 text-purple-800 border-purple-300' },
]
```

- [ ] **Step 2: Update getItemStats**

In `src/services/items.ts`, update the stats object (line 122):

```typescript
const stats = { INTAKE: 0, AVAILABLE: 0, RESERVED: 0, REPAIR: 0, MISSING: 0, SOLD: 0, total: 0 }
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: No TypeScript errors (types are generated from Supabase enum, so RESERVED/SOLD should be valid after migration)

- [ ] **Step 4: Commit**

```bash
git add src/lib/constants.ts src/services/items.ts
git commit -m "feat: add RESERVED and SOLD to frontend constants and stats"
```

---

## Task 3: Auto-RESERVED on Order Item Add

**Files:**
- Modify: `src/services/orders.ts`

When an item (with a real `item_id`, not ad-hoc) is added to an order, set its status to RESERVED.

- [ ] **Step 1: Update createManualOrder**

In `src/services/orders.ts`, after the order_items insert succeeds (around line 272, before `return order`), add:

```typescript
  // Mark inventory items as RESERVED
  const inventoryItemIds = input.items
    .map((item) => item.item_id)
    .filter((id): id is string => id !== null)

  if (inventoryItemIds.length > 0) {
    await supabase
      .from('items')
      .update({ item_status: 'RESERVED' as Item['item_status'] })
      .in('id', inventoryItemIds)
  }
```

Note: Add `import type { Item } from '@/lib/types'` if not already imported (check — `Order`, `OrderInsert`, `OrderUpdate` are already imported but `Item` may not be).

- [ ] **Step 2: Update addOrderLineItem**

In `src/services/orders.ts`, in the `addOrderLineItem` function, after the insert succeeds, add item status update:

```typescript
export async function addOrderLineItem(orderId: string, item: {
  item_id: string | null
  description: string
  quantity: number
  unit_price: number
  discount: number
}) {
  const { data, error } = await supabase
    .from('order_items')
    .insert({ order_id: orderId, ...item })
    .select()
    .single()

  if (error) throw error

  // Mark inventory item as RESERVED
  if (item.item_id) {
    await supabase
      .from('items')
      .update({ item_status: 'RESERVED' as Item['item_status'] })
      .eq('id', item.item_id)
  }

  return data
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/services/orders.ts
git commit -m "feat: auto-set items to RESERVED when added to orders"
```

---

## Task 4: Auto-AVAILABLE on Item Remove / Order Cancel

**Files:**
- Modify: `src/services/orders.ts`
- Modify: `src/pages/admin/order-detail.tsx`

- [ ] **Step 1: Update removeOrderLineItem to revert item status**

In `src/services/orders.ts`, update `removeOrderLineItem` to first fetch the item_id, then revert status:

```typescript
export async function removeOrderLineItem(orderItemId: string) {
  // Fetch the order_item to get item_id before deleting
  const { data: orderItem } = await supabase
    .from('order_items')
    .select('item_id')
    .eq('id', orderItemId)
    .single()

  const { error } = await supabase
    .from('order_items')
    .delete()
    .eq('id', orderItemId)

  if (error) throw error

  // Revert inventory item to AVAILABLE
  if (orderItem?.item_id) {
    await supabase
      .from('items')
      .update({ item_status: 'AVAILABLE' as Item['item_status'] })
      .eq('id', orderItem.item_id)
  }
}
```

- [ ] **Step 2: Add cancelOrder helper to revert all items**

In `src/services/orders.ts`, add a new function after `updateOrderStatus`:

```typescript
export async function cancelOrder(orderId: string) {
  // Get all inventory items in this order
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('item_id')
    .eq('order_id', orderId)
    .not('item_id', 'is', null)

  // Update order status to CANCELLED
  const order = await updateOrder(orderId, { order_status: 'CANCELLED' as Order['order_status'] })

  // Revert all inventory items to AVAILABLE
  const itemIds = (orderItems ?? []).map((oi) => oi.item_id).filter((id): id is string => !!id)
  if (itemIds.length > 0) {
    await supabase
      .from('items')
      .update({ item_status: 'AVAILABLE' as Item['item_status'] })
      .in('id', itemIds)
  }

  return order
}
```

- [ ] **Step 3: Add useCancelOrder hook**

In `src/hooks/use-orders.ts`, add:

```typescript
export function useCancelOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderId: string) => ordersService.cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}
```

- [ ] **Step 4: Update order-detail.tsx to use useCancelOrder**

In `src/pages/admin/order-detail.tsx`:

1. Import `useCancelOrder` (add to the import from `@/hooks/use-orders`)
2. Initialize: `const cancelMutation = useCancelOrder()`
3. Update `handleCancel` function (lines 258-266):

```typescript
function handleCancel() {
  cancelMutation.mutate(order!.id, {
    onSuccess: () => { toast.success('Order cancelled'); setCancelOpen(false) },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  })
}
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/services/orders.ts src/hooks/use-orders.ts src/pages/admin/order-detail.tsx
git commit -m "feat: revert items to AVAILABLE on remove or order cancel"
```

---

## Task 5: Auto-SOLD on Order Shipped

**Files:**
- Modify: `src/services/orders.ts`
- Modify: `src/pages/admin/order-detail.tsx`

- [ ] **Step 1: Add markOrderItemsSold helper**

In `src/services/orders.ts`, add:

```typescript
export async function markOrderItemsSold(orderId: string) {
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('item_id')
    .eq('order_id', orderId)
    .not('item_id', 'is', null)

  const itemIds = (orderItems ?? []).map((oi) => oi.item_id).filter((id): id is string => !!id)
  if (itemIds.length > 0) {
    await supabase
      .from('items')
      .update({ item_status: 'SOLD' as Item['item_status'] })
      .in('id', itemIds)
  }
}
```

- [ ] **Step 2: Update handleAdvance in order-detail.tsx**

In `src/pages/admin/order-detail.tsx`, update the `handleAdvance` function's onSuccess callback to also mark items as SOLD when shipping:

```typescript
function handleAdvance() {
  if (!nextStatus) return

  const updates: Record<string, unknown> = {}
  if (nextStatus === 'SHIPPED') {
    updates.shipped_date = new Date().toISOString()
  }

  statusMutation.mutate(
    { id: order!.id, status: nextStatus },
    {
      onSuccess: async () => {
        if (Object.keys(updates).length > 0) {
          await updateOrder.mutateAsync({ id: order!.id, updates })
        }
        // Mark items as SOLD when order is shipped
        if (nextStatus === 'SHIPPED') {
          await ordersService.markOrderItemsSold(order!.id)
        }
        toast.success(`Order ${getNextStatusLabel(nextStatus).toLowerCase()}`)
        setAdvanceOpen(false)
      },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    },
  )
}
```

Add import at top of file: `import * as ordersService from '@/services/orders'`

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/services/orders.ts src/pages/admin/order-detail.tsx
git commit -m "feat: auto-mark items as SOLD when order is shipped"
```

---

## Task 6: Update invalidation queries for items

**Files:**
- Modify: `src/hooks/use-orders.ts`

Ensure hooks that modify item statuses also invalidate items queries.

- [ ] **Step 1: Add items invalidation to useUpdateOrderStatus**

In `src/hooks/use-orders.ts`, update `useUpdateOrderStatus` onSuccess:

```typescript
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      ordersService.updateOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-orders.ts
git commit -m "feat: invalidate items cache when order status changes"
```

---

## Verification

1. `npm run build` — no TypeScript errors
2. Create a manual order with inventory items → items show as **RESERVED** on Items page
3. Remove an item from an order → item reverts to **AVAILABLE**
4. Cancel an order → all items revert to **AVAILABLE**
5. Advance order to SHIPPED → items show as **SOLD**
6. Items page tabs show correct counts for RESERVED and SOLD
7. RESERVED items do NOT appear in "available items" search when creating new orders (already filtered by `item_status = 'AVAILABLE'`)
