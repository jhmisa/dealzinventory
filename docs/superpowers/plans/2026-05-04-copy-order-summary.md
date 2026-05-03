# Copy Order Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Copy Invoice" button that copies a plain-text order summary to clipboard, usable in FB Messenger conversations.

**Architecture:** Create a single utility function `formatOrderSummary()` that generates the plain-text summary. Add a copy button in two locations: the Customer Panel sidebar order cards and the Order Detail Dialog header. Both locations call the same utility.

**Tech Stack:** React, TypeScript, Lucide icons, sonner toast, navigator.clipboard API

---

### Task 1: Create `formatOrderSummary` utility

**Files:**
- Create: `src/lib/format-order-summary.ts`

- [ ] **Step 1: Create the utility file**

```typescript
import { formatPrice } from '@/lib/utils'
import { YAMATO_TRACKING_URL, YAMATO_TIME_SLOTS } from '@/lib/constants'
import type { ShippingAddress } from '@/lib/address-types'
import { serializeAddress } from '@/lib/address-types'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function formatTimeSlot(code: string | null | undefined): string {
  if (!code) return ''
  const slot = YAMATO_TIME_SLOTS.find(s => s.code === code)
  return slot ? slot.label_en : code
}

function formatDeliveryLine(date: string | null | undefined, timeCode: string | null | undefined): string {
  if (!date) return 'TBD'
  const d = new Date(date + 'T00:00:00')
  const day = DAY_NAMES[d.getDay()]
  const timeSlot = formatTimeSlot(timeCode)
  return timeSlot ? `${date} (${day} ${timeSlot})` : `${date} (${day})`
}

interface OrderSummaryInput {
  order_code: string
  delivery_date: string | null
  delivery_time_code: string | null
  receiver_first_name: string | null
  receiver_last_name: string | null
  shipping_address: string | null
  shipping_cost: number | null
  total_price: number | null
  tracking_number: string | null
  carrier: string | null
  customers: {
    customer_code: string
    last_name: string
    first_name: string | null
  } | null
  order_items: Array<{
    description: string | null
    quantity: number
    unit_price: number | null
  }>
}

export function formatOrderSummary(order: OrderSummaryInput): string {
  const lines: string[] = []

  // Order code
  lines.push(`📦 Order: ${order.order_code}`)

  // Delivery
  lines.push(`📅 Delivery: ${formatDeliveryLine(order.delivery_date, order.delivery_time_code)}`)

  // Customer
  const customer = order.customers
  if (customer) {
    const name = [order.receiver_first_name, order.receiver_last_name].filter(Boolean).join(' ')
      || [customer.first_name, customer.last_name].filter(Boolean).join(' ')
    lines.push(`👤 ${customer.customer_code} — ${name}`)
  }

  // Address
  if (order.shipping_address) {
    try {
      const addr: ShippingAddress = JSON.parse(order.shipping_address)
      lines.push(`📍 ${serializeAddress(addr).replace(/\n/g, ', ')}`)
    } catch {
      lines.push(`📍 ${order.shipping_address}`)
    }
  }

  // Items
  const items = order.order_items ?? []
  if (items.length > 0) {
    lines.push('')
    lines.push('Items:')
    for (const item of items) {
      const desc = item.description || 'Item'
      const price = item.unit_price != null ? ` — ${formatPrice(item.unit_price)}` : ''
      lines.push(`${item.quantity}x ${desc}${price}`)
    }
  }

  // Delivery fee
  if (order.shipping_cost && order.shipping_cost > 0) {
    lines.push('')
    lines.push(`🚚 Delivery Fee: ${formatPrice(order.shipping_cost)}`)
  }

  // Total
  lines.push(`💰 Total: ${formatPrice(order.total_price)}`)

  // Tracking
  if (order.tracking_number) {
    lines.push('')
    const carrier = (order.carrier ?? 'yamato').toLowerCase()
    lines.push(`🚚 Tracking: ${order.tracking_number}`)
    if (carrier === 'yamato' || carrier === '') {
      lines.push(`${YAMATO_TRACKING_URL}?pno=${order.tracking_number}`)
    }
  }

  return lines.join('\n')
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/format-order-summary.ts 2>&1 | head -20`

If there are import path issues (due to `@/` aliases not resolving with bare tsc), just run the full project build check instead:

Run: `npx tsc --noEmit 2>&1 | grep format-order-summary`

Expected: No errors related to format-order-summary.

- [ ] **Step 3: Commit**

```bash
git add src/lib/format-order-summary.ts
git commit -m "feat: add formatOrderSummary utility for copy-to-clipboard"
```

---

### Task 2: Add copy button to Customer Panel sidebar

**Files:**
- Modify: `src/components/messaging/customer-panel.tsx:158-201`

The customer panel currently only fetches `id, order_code, order_status, total_price, created_at` for orders (via `src/services/customers.ts` line 45). The copy button needs more fields (delivery_date, shipping_address, order_items, etc.), so we need to fetch the full order on-demand when the copy button is clicked.

- [ ] **Step 1: Add imports and copy handler**

Add `Copy, Check` to the lucide-react imports and add the needed imports at the top of `customer-panel.tsx`:

```typescript
// Add to existing lucide imports:
import {
  PanelLeftOpen,
  PanelRightClose,
  ShieldCheck,
  ShieldX,
  ExternalLink,
  User,
  Store,
  Unlink,
  Ticket,
  Plus,
  Copy,
  Check,
} from 'lucide-react'
```

Add new imports after the existing imports:

```typescript
import { toast } from 'sonner'
import * as ordersService from '@/services/orders'
import { formatOrderSummary } from '@/lib/format-order-summary'
```

- [ ] **Step 2: Add copy state and handler inside the component**

Inside the `CustomerPanel` function body (after the existing state declarations like `const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)`), add:

```typescript
const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null)

async function handleCopyOrder(e: React.MouseEvent, orderId: string) {
  e.stopPropagation()
  try {
    const fullOrder = await ordersService.getOrder(orderId)
    const text = formatOrderSummary(fullOrder)
    await navigator.clipboard.writeText(text)
    setCopiedOrderId(orderId)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopiedOrderId(null), 2000)
  } catch {
    toast.error('Failed to copy')
  }
}
```

- [ ] **Step 3: Add the copy icon button to each order card**

In the order card button (around line 176-190), add a copy button between the existing content. Replace the entire order card `<button>` block with:

Find the existing block:
```tsx
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedOrderId(order.id)}
                      className="flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <CodeDisplay code={order.order_code} className="text-[11px] truncate" />
                        <p className="text-muted-foreground truncate">{formatDate(order.created_at)}</p>
                      </div>
                      <div className="shrink-0 text-right space-y-0.5">
                        <StatusBadge status={order.order_status} config={ORDER_STATUSES} />
                        <p className="text-muted-foreground">{formatPrice(order.total_price)}</p>
                      </div>
                    </button>
```

Replace with:
```tsx
                    <div key={order.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className="flex flex-1 min-w-0 items-center justify-between rounded-md border px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <CodeDisplay code={order.order_code} className="text-[11px] truncate" />
                          <p className="text-muted-foreground truncate">{formatDate(order.created_at)}</p>
                        </div>
                        <div className="shrink-0 text-right space-y-0.5">
                          <StatusBadge status={order.order_status} config={ORDER_STATUSES} />
                          <p className="text-muted-foreground">{formatPrice(order.total_price)}</p>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => handleCopyOrder(e, order.id)}
                        title="Copy order summary"
                      >
                        {copiedOrderId === order.id ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i error | head -10`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/messaging/customer-panel.tsx
git commit -m "feat: add copy invoice button to customer panel order cards"
```

---

### Task 3: Add copy button to Order Detail Dialog

**Files:**
- Modify: `src/components/orders/order-detail-content.tsx:715-764`

The order detail component already has the full order object loaded via `useOrder(orderId)`. We add a "Copy Invoice" button next to the existing "Print Invoice" button in the modal header.

- [ ] **Step 1: Add imports**

Add to existing imports in `order-detail-content.tsx`:

Add `Copy` to the lucide-react import (line 2):
```typescript
import { ArrowLeft, Check, Circle, Package, Pencil, X, Plus, History, Truck, Search, Loader2, Printer, RefreshCw, AlertTriangle, ExternalLink, Undo2, RotateCcw, Merge, Ticket, ChevronDown, Copy } from 'lucide-react'
```

Add new import:
```typescript
import { formatOrderSummary } from '@/lib/format-order-summary'
```

- [ ] **Step 2: Add copy handler inside the component**

Inside the `OrderDetailContent` function (after the existing state declarations around line 160-170), add:

```typescript
const [invoiceCopied, setInvoiceCopied] = useState(false)

async function handleCopyInvoice() {
  try {
    const text = formatOrderSummary(order)
    await navigator.clipboard.writeText(text)
    setInvoiceCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setInvoiceCopied(false), 2000)
  } catch {
    toast.error('Failed to copy')
  }
}
```

- [ ] **Step 3: Add button in modal header**

Find the "Print Invoice" button in the `isModal` section (around line 744-764). Add the Copy Invoice button right before the Print Invoice button.

Find this block (inside the `{!isEditing && (` section around line 744):
```tsx
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  printInvoice({
```

Insert before that block:
```tsx
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyInvoice}
              >
                {invoiceCopied ? (
                  <Check className="h-4 w-4 mr-1 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 mr-1" />
                )}
                Copy Invoice
              </Button>
            )}
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  printInvoice({
```

Wait — that duplicates the `{!isEditing && (` wrapper. Instead, find the exact block and add the button INSIDE the existing conditional, before the Print Invoice button.

The actual approach: find the Print Invoice `<Button>` (line ~745-764) and add the Copy Invoice button right before it, inside the same `{!isEditing && (` fragment:

Find:
```tsx
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  printInvoice({
                    order: order as Parameters<typeof printInvoice>[0]['order'],
                    salesAgent: displayName ?? '',
                    paymentMethod: order.payment_method,
                    paymentConfirmations: paymentConfirmations.map(c => ({
                      confirmedBy: (c.staff_profiles as { display_name: string } | null)?.display_name ?? 'Unknown',
                      confirmedAt: c.created_at,
                      amount: c.amount,
                    })),
                  })
                  stampInvoice.mutate([order.id])
                }}
              >
                <Printer className="h-4 w-4 mr-1" />
                Print Invoice
              </Button>
```

Replace with:
```tsx
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyInvoice}
              >
                {invoiceCopied ? (
                  <Check className="h-4 w-4 mr-1 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 mr-1" />
                )}
                Copy Invoice
              </Button>
            )}
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  printInvoice({
                    order: order as Parameters<typeof printInvoice>[0]['order'],
                    salesAgent: displayName ?? '',
                    paymentMethod: order.payment_method,
                    paymentConfirmations: paymentConfirmations.map(c => ({
                      confirmedBy: (c.staff_profiles as { display_name: string } | null)?.display_name ?? 'Unknown',
                      confirmedAt: c.created_at,
                      amount: c.amount,
                    })),
                  })
                  stampInvoice.mutate([order.id])
                }}
              >
                <Printer className="h-4 w-4 mr-1" />
                Print Invoice
              </Button>
```

- [ ] **Step 4: Also add the button in the non-modal (full page) header**

Find the non-modal header section (around line 610-625). There should be a similar actions area. Look for the Print Invoice button in the non-modal section and add the Copy Invoice button before it in the same way.

Search for the non-modal Print Invoice button and add the same Copy Invoice button before it following the same pattern as Step 3.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i error | head -10`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/orders/order-detail-content.tsx
git commit -m "feat: add copy invoice button to order detail view"
```

---

### Task 4: Manual testing

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test in Customer Panel**

1. Navigate to Admin > Messages
2. Select a conversation with a linked customer who has orders
3. In the right sidebar, find an order card
4. Click the clipboard icon — verify text is copied
5. Paste into a text editor and verify format matches the spec:
   - Order code, delivery date with day name, customer info, address, items, delivery fee, total, tracking (if present)

- [ ] **Step 3: Test in Order Detail Dialog**

1. Click on an order card to open the Order Detail Dialog
2. Click "Copy Invoice" button
3. Paste and verify same format

- [ ] **Step 4: Test edge cases**

- Order with no delivery date set → should show "TBD"
- Order with no tracking number → tracking section should be absent
- Order with shipping_cost = 0 → delivery fee line should be absent
- Order with non-Yamato carrier → tracking number shown but no URL

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: copy invoice adjustments from testing"
```
