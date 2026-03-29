# Yamato Dempyo Batch & Invoice Batch Printing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add batch invoice printing and Yamato dempyo xlsx generation for CONFIRMED orders, with print tracking, multi-box support, and credit card surcharge configuration.

**Architecture:** Client-side xlsx generation using SheetJS to populate the existing Yamato template. Batch invoice printing via a single iframe with all invoices concatenated with page breaks. Two new DB columns on orders (`invoice_printed_at`, `dempyo_printed_at`, `delivery_box_count`) and a new `system_settings` key-value table for configurable surcharge rate.

**Tech Stack:** SheetJS (`xlsx` npm package), existing React/Supabase/TanStack Query patterns, existing invoice HTML generation.

**Spec:** `docs/superpowers/specs/2026-03-30-yamato-dempyo-batch-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260330140000_dempyo_invoice_tracking.sql` | Create | Add columns + system_settings table |
| `public/templates/yamato-template.xlsx` | Create | Copy template with AL/AM/BV formulas added |
| `src/services/settings.ts` | Create | CRUD for system_settings key-value store |
| `src/hooks/use-settings.ts` | Create | TanStack Query hooks for settings |
| `src/lib/yamato.ts` | Create | Yamato xlsx generation logic (data mapping + SheetJS) |
| `src/components/orders/batch-invoice-print.ts` | Create | Batch invoice HTML generation + print |
| `src/services/orders.ts` | Modify | Add getConfirmedForPrinting, stampPrintedAt functions |
| `src/hooks/use-orders.ts` | Modify | Add hooks for print queries + mutations |
| `src/lib/query-keys.ts` | Modify | Add settings query keys |
| `src/pages/admin/orders.tsx` | Modify | Add Print Invoices + Print Dempyo buttons to Confirmed tab |
| `src/pages/admin/order-detail.tsx` | Modify | Add delivery_box_count field + print timestamps |
| `src/pages/admin/general-settings.tsx` | Modify | Add credit card surcharge setting |
| `src/pages/admin/order-detail.tsx` | Modify | Auto-add/remove CC surcharge line item on payment method change |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260330140000_dempyo_invoice_tracking.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add print tracking and box count columns to orders
ALTER TABLE orders
  ADD COLUMN invoice_printed_at timestamptz,
  ADD COLUMN dempyo_printed_at timestamptz,
  ADD COLUMN delivery_box_count integer NOT NULL DEFAULT 1;

-- Create system_settings key-value table
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Staff can read and update settings
CREATE POLICY "Staff can read settings"
  ON system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can update settings"
  ON system_settings FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Staff can insert settings"
  ON system_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Seed default credit card surcharge
INSERT INTO system_settings (key, value, description)
VALUES ('credit_card_surcharge_pct', '4', 'Credit card surcharge percentage added to COD orders paid by credit card')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push` (per project convention — always apply migrations automatically)

- [ ] **Step 3: Regenerate TypeScript types**

Run: `npx supabase gen types typescript --project-id "$(grep -oP 'project_ref=\K[^&"]+' .mcp.json | head -1)" --schema public > src/lib/database.types.ts`

If the project ref extraction doesn't work, check `.mcp.json` or `supabase/config.toml` for the project ref and substitute directly.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260330140000_dempyo_invoice_tracking.sql src/lib/database.types.ts
git commit -m "feat: add dempyo/invoice print tracking columns and system_settings table"
```

---

### Task 2: Install SheetJS & Prepare Template

**Files:**
- Modify: `package.json` (add xlsx dependency)
- Create: `public/templates/yamato-template.xlsx` (copy from Screenshots)

- [ ] **Step 1: Install SheetJS**

Run: `npm install xlsx`

- [ ] **Step 2: Copy template to public directory**

```bash
mkdir -p public/templates
cp Screenshots/yamato-dempyo/yamato-template.xlsx public/templates/yamato-template.xlsx
```

- [ ] **Step 3: Add AL/AM/BV pass-through formulas to the template**

Write a one-time Node script that adds formulas to Sheet 1 for columns AL, AM, BV (rows 2–310) that read from corresponding Sheet 2 cells. Run it once to update the template file.

```javascript
// scripts/patch-yamato-template.mjs
import XLSX from 'xlsx';

const wb = XLSX.readFile('public/templates/yamato-template.xlsx');
const ws1 = wb.Sheets['外部データ取り込み基本レイアウト'];
const ws2 = wb.Sheets['データ貼付'];

// Clear all sample data from Sheet 2
const range2 = XLSX.utils.decode_range(ws2['!ref'] || 'A1:BV1');
for (let r = 0; r <= range2.e.r; r++) {
  for (let c = 0; c <= range2.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    delete ws2[addr];
  }
}
ws2['!ref'] = 'A1:BV1';

// Add pass-through formulas to Sheet 1 for AL, AM, BV
// Sheet 1 row 2 reads from Sheet 2 row 1, etc.
const colMap = { AL: 'AL', AM: 'AM', BV: 'BV' };
for (let row = 2; row <= 310; row++) {
  const s2Row = row - 1; // Sheet 2 is 0-indexed from row 1
  for (const [s1Col, s2Col] of Object.entries(colMap)) {
    const cellAddr = `${s1Col}${row}`;
    ws1[cellAddr] = { t: 's', f: `データ貼付!${s2Col}${s2Row}` };
  }
}

// Update Sheet 1 range to include BV column
const range1 = XLSX.utils.decode_range(ws1['!ref'] || 'A1');
const bvCol = XLSX.utils.decode_col('BV');
if (range1.e.c < bvCol) range1.e.c = bvCol;
if (range1.e.r < 310) range1.e.r = 310;
ws1['!ref'] = XLSX.utils.encode_range(range1);

XLSX.writeFile(wb, 'public/templates/yamato-template.xlsx');
console.log('Template patched: AL/AM/BV formulas added, Sheet 2 cleared');
```

Run: `node scripts/patch-yamato-template.mjs`

After confirming it works, delete the script (it's one-time).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json public/templates/yamato-template.xlsx
git commit -m "feat: add SheetJS dependency and prepared Yamato template"
```

---

### Task 3: Settings Service & Hooks

**Files:**
- Create: `src/services/settings.ts`
- Create: `src/hooks/use-settings.ts`
- Modify: `src/lib/query-keys.ts`

- [ ] **Step 1: Add settings query keys**

In `src/lib/query-keys.ts`, add inside the `settings` object (which already exists at line 123):

```typescript
// Replace the existing settings block:
settings: {
  all: ['settings'] as const,
  itemListColumns: () => [...queryKeys.settings.all, 'item-list-columns'] as const,
  system: (key: string) => [...queryKeys.settings.all, 'system', key] as const,
},
```

- [ ] **Step 2: Create settings service**

Create `src/services/settings.ts`:

```typescript
import { supabase } from '@/lib/supabase'

export async function getSystemSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  return data.value
}

export async function updateSystemSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })

  if (error) throw error
}
```

- [ ] **Step 3: Create settings hooks**

Create `src/hooks/use-settings.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as settingsService from '@/services/settings'

export function useSystemSetting(key: string) {
  return useQuery({
    queryKey: queryKeys.settings.system(key),
    queryFn: () => settingsService.getSystemSetting(key),
  })
}

export function useUpdateSystemSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      settingsService.updateSystemSetting(key, value),
    onSuccess: (_data, { key }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.system(key) })
    },
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/query-keys.ts src/services/settings.ts src/hooks/use-settings.ts
git commit -m "feat: add system_settings service and hooks"
```

---

### Task 4: Order Service — Print Tracking Functions

**Files:**
- Modify: `src/services/orders.ts`
- Modify: `src/hooks/use-orders.ts`

- [ ] **Step 1: Add print-related service functions**

Append to `src/services/orders.ts`:

```typescript
// --- Print Tracking ---

export async function getConfirmedOrdersForInvoice() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name, email, phone),
      sell_groups(sell_group_code, condition_grade, base_price,
        product_models(brand, model_name, color, cpu, ram_gb, storage_gb)
      ),
      order_items(
        id, item_id, description, quantity, unit_price, discount,
        items(id, item_code, condition_grade, condition_notes, item_status,
          cpu, ram_gb, storage_gb, screen_size, os_family, color,
          product_models(brand, model_name, color, cpu, ram_gb, storage_gb, screen_size, os_family, short_description,
            categories(description_fields),
            product_media(file_url, role, sort_order)
          )
        )
      )
    `)
    .eq('order_status', 'CONFIRMED')
    .is('invoice_printed_at', null)
    .order('delivery_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return data ?? []
}

export async function getConfirmedOrdersForDempyo() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name, email, phone),
      order_items(
        id, item_id, description, quantity, unit_price, discount,
        items(id, item_code)
      )
    `)
    .eq('order_status', 'CONFIRMED')
    .is('dempyo_printed_at', null)
    .order('delivery_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return data ?? []
}

export async function stampInvoicePrinted(orderIds: string[]) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('orders')
    .update({ invoice_printed_at: now })
    .in('id', orderIds)

  if (error) throw error
}

export async function stampDempyoPrinted(orderIds: string[]) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('orders')
    .update({ dempyo_printed_at: now })
    .in('id', orderIds)

  if (error) throw error
}
```

- [ ] **Step 2: Add hooks for print tracking**

Append to `src/hooks/use-orders.ts`:

```typescript
export function useConfirmedForInvoice() {
  return useQuery({
    queryKey: queryKeys.orders.list({ _type: 'invoice-unprinted' }),
    queryFn: () => ordersService.getConfirmedOrdersForInvoice(),
  })
}

export function useConfirmedForDempyo() {
  return useQuery({
    queryKey: queryKeys.orders.list({ _type: 'dempyo-unprinted' }),
    queryFn: () => ordersService.getConfirmedOrdersForDempyo(),
  })
}

export function useStampInvoicePrinted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderIds: string[]) => ordersService.stampInvoicePrinted(orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useStampDempyoPrinted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderIds: string[]) => ordersService.stampDempyoPrinted(orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/orders.ts src/hooks/use-orders.ts
git commit -m "feat: add print tracking service functions and hooks"
```

---

### Task 5: Batch Invoice Printing

**Files:**
- Create: `src/components/orders/batch-invoice-print.ts`

- [ ] **Step 1: Create batch invoice print module**

This module reuses the existing `buildInvoiceHtml` approach but generates a single HTML document with all invoices concatenated with page breaks.

Create `src/components/orders/batch-invoice-print.ts`:

```typescript
import { formatDate } from '@/lib/utils'
import {
  isJPAddress,
  isLegacyAddress,
  serializeAddress,
  formatPostalCode,
  type ShippingAddress,
} from '@/lib/address-types'
import { ORDER_SOURCES } from '@/lib/constants'
import { buildShortDescription } from '@/lib/utils'

// Re-use the same interfaces from invoice-pdf.ts
interface OrderCustomer {
  customer_code: string
  last_name: string
  first_name: string | null
  email: string | null
  phone: string | null
}

interface OrderItemData {
  id: string
  item_id: string | null
  description: string | null
  quantity: number
  unit_price: number
  discount: number
  items: {
    id: string
    item_code: string
    condition_grade: string
    condition_notes: string | null
    item_status: string
    cpu: string | null
    ram_gb: number | null
    storage_gb: number | null
    screen_size: number | null
    os_family: string | null
    color: string | null
    product_models: {
      brand: string
      model_name: string
      color: string | null
      cpu: string | null
      ram_gb: number | null
      storage_gb: number | null
      screen_size: number | null
      os_family: string | null
      short_description: string | null
      categories: { description_fields: string[] } | null
      product_media: { file_url: string; role: string; sort_order: number }[]
    } | null
  } | null
}

interface BatchInvoiceOrder {
  id: string
  order_code: string
  order_status: string
  order_source: string
  quantity: number
  total_price: number
  shipping_address: string | null
  shipping_cost: number | null
  notes: string | null
  created_at: string
  customers: OrderCustomer | null
  order_items: OrderItemData[]
}

function formatYen(amount: number): string {
  return `&yen;${amount.toLocaleString('ja-JP')}`
}

function parseAddress(raw: string | null): ShippingAddress | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ShippingAddress
  } catch {
    return null
  }
}

function buildRomajiAddress(addr: ShippingAddress): string {
  if (isLegacyAddress(addr)) return addr.freeform_legacy
  if (isJPAddress(addr)) {
    const parts: string[] = []
    if (addr.postal_code) parts.push(formatPostalCode(addr.postal_code))
    const line = [addr.prefecture_en, addr.city_en, addr.town_en].filter(Boolean).join(' ')
    if (line) parts.push(line)
    if (addr.address_line_1) parts.push(addr.address_line_1)
    if (addr.address_line_2) parts.push(addr.address_line_2)
    return parts.join(' ')
  }
  return serializeAddress(addr)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildItemDescription(oi: OrderItemData): string {
  const item = oi.items
  if (!item) return oi.description ?? 'Custom item'
  const pm = item.product_models
  if (!pm) return oi.description ?? item.item_code
  const parts: string[] = []
  parts.push(`RANK ${item.condition_grade}`)
  parts.push(`${pm.brand} ${pm.model_name}`)
  const descFields = pm.categories?.description_fields
  if (descFields && descFields.length > 0) {
    const resolved: Record<string, unknown> = {}
    for (const key of descFields) {
      resolved[key] = (item as Record<string, unknown>)[key] ?? (pm as Record<string, unknown>)[key]
    }
    const desc = buildShortDescription(resolved, descFields)
    if (desc) parts.push(desc)
  } else {
    const specs: string[] = []
    const ram = item.ram_gb ?? pm.ram_gb
    if (ram) specs.push(`${ram}GB`)
    const storage = item.storage_gb ?? pm.storage_gb
    if (storage) specs.push(`${storage}GB`)
    const screen = item.screen_size ?? pm.screen_size
    if (screen) specs.push(`${screen}"`)
    const os = item.os_family ?? pm.os_family
    if (os) specs.push(os)
    const color = item.color ?? pm.color
    if (color) specs.push(color)
    if (specs.length > 0) parts.push(specs.join(' | '))
  }
  return parts.join(' | ')
}

function buildSingleInvoiceHtml(order: BatchInvoiceOrder, salesAgent: string): string {
  const customer = order.customers
  const customerName = customer
    ? [customer.last_name, customer.first_name].filter(Boolean).join(' ')
    : '—'

  const orderItems = order.order_items ?? []

  let addressHtml = ''
  const addr = parseAddress(order.shipping_address)
  if (addr) {
    const romajiLine = escapeHtml(buildRomajiAddress(addr))
    const jaLine = escapeHtml(serializeAddress(addr))
    addressHtml = `
      <div class="address-line"><span class="address-lang">EN</span> ${romajiLine}</div>
      <div class="address-line"><span class="address-lang">JP</span> ${jaLine}</div>`
  } else if (order.shipping_address) {
    addressHtml = `<div>${escapeHtml(order.shipping_address)}</div>`
  }

  const tableRows = orderItems
    .map((oi) => {
      const itemCode = escapeHtml(oi.items?.item_code ?? 'CUSTOM')
      const description = escapeHtml(buildItemDescription(oi))
      const lineTotal = oi.unit_price * oi.quantity - oi.discount
      return `<tr>
        <td>${itemCode}</td>
        <td>${description}</td>
        <td style="text-align:center">${oi.quantity}</td>
        <td style="text-align:right">${formatYen(oi.unit_price)}</td>
        <td style="text-align:right">${formatYen(oi.discount)}</td>
        <td style="text-align:right">${formatYen(lineTotal)}</td>
      </tr>`
    })
    .join('')

  const subtotal = orderItems.reduce((sum, oi) => sum + oi.unit_price * oi.quantity, 0)
  const totalDiscount = orderItems.reduce((sum, oi) => sum + oi.discount, 0)
  const shippingCost = order.shipping_cost ?? 0
  const afterDiscount = subtotal - totalDiscount
  const charges = Math.round((afterDiscount) * 10 / 110)
  const total = afterDiscount + shippingCost

  const sourceCfg = ORDER_SOURCES.find((s) => s.value === order.order_source)
  const sourceLabel = escapeHtml(sourceCfg?.label ?? order.order_source)
  const itemCount = orderItems.reduce((sum, oi) => sum + oi.quantity, 0)
  const remarksHtml = order.notes
    ? `<tr><td class="label">REMARKS</td><td>${escapeHtml(order.notes)}</td></tr>`
    : ''

  return `
<div class="page">
  <div class="header">
    <div><span class="logo">dealz</span><span class="logo-kk">K.K.</span></div>
    <div class="company-info">
      Yehey Japan Co. Ltd. is now Dealz K.K. (株式会社ディールズ)<br>
      121-0011 Tokyo-to Adachi-ku Chuohoncho 3-5-3 TF Biru B1F<br>
      @dealzjp / 03-4550-1409 / hi@dealz.jp / dealz.jp
    </div>
  </div>
  <div class="info-row">
    <div class="customer-section">
      <div class="label" style="font-size:7.5pt">CUSTOMER</div>
      <div class="customer-name">${escapeHtml(customerName)}</div>
      <div class="customer-detail"><span class="label">EMAIL</span><span>${escapeHtml(customer?.email ?? '—')}</span></div>
      <div class="customer-detail"><span class="label">PHONE</span><span>${escapeHtml(customer?.phone ?? '—')}</span></div>
      <div class="address-block"><div class="label">SHIPPING ADDRESS</div>${addressHtml}</div>
    </div>
    <div class="invoice-section">
      <div class="invoice-title">INVOICE</div>
      <div class="order-label">ORDER NUMBER AND ORDER DATE</div>
      <div class="order-code">${escapeHtml(order.order_code)}</div>
      <div class="order-date">${escapeHtml(formatDate(order.created_at))}</div>
    </div>
  </div>
  <table class="items-table">
    <thead><tr>
      <th class="col-item">ITEM</th><th>DESCRIPTION</th><th class="col-qty">QTY</th>
      <th class="col-unit">UNIT</th><th class="col-disc">DISCOUNT</th><th class="col-price">PRICE</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer-section">
    <div class="footer-left">
      <table class="detail-table">
        <tr><td class="label">DETAILS</td><td>Items: ${itemCount}</td></tr>
        <tr><td class="label">TERMS</td><td>${sourceLabel}</td></tr>
        ${remarksHtml}
      </table>
    </div>
    <div class="footer-right">
      <table class="totals-table">
        <tr><td class="label">DISCOUNTS</td><td class="value">${formatYen(totalDiscount)}</td></tr>
        <tr><td class="label">SUB-TOTAL</td><td class="value">${formatYen(subtotal - totalDiscount)}</td></tr>
        <tr><td class="label">SHIPPING</td><td class="value">${formatYen(shippingCost)}</td></tr>
        <tr><td class="label">CHARGES</td><td class="value">${formatYen(charges)}</td></tr>
        <tr class="total-row"><td>TOTAL</td><td class="value">${formatYen(total)}</td></tr>
      </table>
      <div class="payment-method">${sourceLabel}</div>
    </div>
  </div>
  <div class="bottom-section">
    <div class="row"><span class="label">SALES AGENT</span><span>${escapeHtml(salesAgent || '—')}</span></div>
    <div class="row"><span class="label">WARRANTY INFORMATION</span></div>
    <div class="warranty-text">7 days replacement for defective items / Brand New – 3 months / Refurbished – 1 month</div>
    <div class="thank-you">Thank you for choosing Dealz!</div>
  </div>
  <div class="page-footer">Dealz K.K. — ${escapeHtml(order.order_code)}</div>
</div>`
}

export function printBatchInvoices(orders: BatchInvoiceOrder[], salesAgent: string): void {
  if (orders.length === 0) return

  const invoicePages = orders.map((order) => buildSingleInvoiceHtml(order, salesAgent)).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Batch Invoice — ${orders.length} orders</title>
<style>
  @page { size: A4; margin: 12mm 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; line-height: 1.4; }
  .page { width: 100%; max-width: 210mm; margin: 0 auto; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 1.5px solid #000; }
  .logo { font-size: 28pt; font-weight: bold; line-height: 1; }
  .logo-kk { font-size: 8pt; font-weight: bold; vertical-align: super; margin-left: 2px; }
  .company-info { text-align: right; font-size: 7.5pt; color: #555; line-height: 1.6; }
  .info-row { display: flex; justify-content: space-between; margin-top: 14px; }
  .customer-section { max-width: 55%; }
  .invoice-section { text-align: right; }
  .invoice-title { font-size: 28pt; font-weight: bold; letter-spacing: 6px; }
  .customer-name { font-size: 16pt; font-weight: bold; margin: 4px 0 8px; }
  .customer-detail { display: flex; gap: 8px; margin-bottom: 3px; }
  .label { font-weight: bold; color: #666; white-space: nowrap; min-width: 100px; }
  .order-label { font-size: 7.5pt; color: #666; margin-top: 4px; }
  .order-code { font-size: 16pt; font-weight: bold; margin: 4px 0 2px; }
  .order-date { font-size: 10pt; }
  .address-block { margin-top: 6px; }
  .address-block .label { margin-bottom: 4px; }
  .address-line { margin-bottom: 2px; line-height: 1.5; }
  .address-lang { display: inline-block; width: 20px; font-size: 6.5pt; font-weight: bold; color: #999; letter-spacing: 0.5px; }
  .items-table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 8pt; }
  .items-table th { background: #f0f0f0; font-weight: bold; text-align: left; padding: 6px 8px; border-bottom: 1px solid #ccc; }
  .items-table td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .items-table th:nth-child(3), .items-table th:nth-child(4), .items-table th:nth-child(5), .items-table th:nth-child(6) { text-align: right; }
  .items-table th:nth-child(3) { text-align: center; }
  .col-item { width: 60px; } .col-qty { width: 40px; } .col-unit, .col-disc, .col-price { width: 70px; }
  .footer-section { display: flex; justify-content: space-between; margin-top: 16px; gap: 20px; }
  .footer-left { flex: 1; } .footer-right { min-width: 220px; }
  .detail-table { font-size: 8pt; border-collapse: collapse; }
  .detail-table td { padding: 3px 0; vertical-align: top; }
  .detail-table .label { padding-right: 12px; }
  .totals-table { font-size: 8pt; border-collapse: collapse; width: 100%; }
  .totals-table td { padding: 3px 0; }
  .totals-table .value { text-align: right; }
  .totals-table .total-row td { padding-top: 8px; border-top: 1px solid #000; font-weight: bold; }
  .totals-table .total-row .value { font-size: 16pt; }
  .payment-method { text-align: right; font-size: 8pt; color: #666; margin-top: 4px; }
  .bottom-section { margin-top: 18px; font-size: 8pt; }
  .bottom-section .row { display: flex; gap: 8px; margin-bottom: 4px; }
  .warranty-text { font-size: 7pt; margin-top: 4px; }
  .thank-you { text-align: right; font-size: 10pt; font-weight: bold; margin-top: 14px; }
  .page-footer { margin-top: 24px; font-size: 7.5pt; color: #999; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
${invoicePages}
</body>
</html>`

  const existing = document.getElementById('batch-invoice-print-frame')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'batch-invoice-print-frame'
  iframe.style.position = 'fixed'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.style.left = '-9999px'
  document.body.appendChild(iframe)

  const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document
  if (!iframeDoc) return
  iframeDoc.open()
  iframeDoc.write(html)
  iframeDoc.close()

  setTimeout(() => {
    iframe.contentWindow?.print()
    setTimeout(() => iframe.remove(), 1000)
  }, 250)
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/batch-invoice-print.ts
git commit -m "feat: add batch invoice printing with page breaks"
```

---

### Task 6: Yamato XLSX Generation

**Files:**
- Create: `src/lib/yamato.ts`

- [ ] **Step 1: Create the Yamato generation module**

Create `src/lib/yamato.ts`:

```typescript
import * as XLSX from 'xlsx'
import {
  isJPAddress,
  isLegacyAddress,
  type ShippingAddress,
  type ShippingAddressJP,
} from '@/lib/address-types'

// --- Types ---

interface DempyoCustomer {
  last_name: string
  first_name: string | null
  phone: string | null
}

interface DempyoOrderItem {
  item_id: string | null
  description: string | null
  items: { item_code: string } | null
}

interface DempyoOrder {
  id: string
  order_code: string
  total_price: number
  shipping_address: string | null
  payment_method: string | null
  delivery_date: string | null
  delivery_time_code: string | null
  delivery_box_count: number
  customers: DempyoCustomer | null
  order_items: DempyoOrderItem[]
}

export interface DempyoValidationResult {
  valid: DempyoOrder[]
  skipped: { order: DempyoOrder; reason: string }[]
  warnings: { order: DempyoOrder; message: string }[]
}

// --- Helpers ---

function parseAddress(raw: string | null): ShippingAddress | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ShippingAddress
  } catch {
    return null
  }
}

function buildRecipientName(customer: DempyoCustomer | null): string {
  if (!customer) return ''
  return [customer.first_name, customer.last_name].filter(Boolean).join(' ')
}

function buildJPAddressString(addr: ShippingAddressJP): string {
  return [addr.prefecture_ja, addr.city_ja, addr.town_ja, addr.address_line_1, addr.address_line_2]
    .filter(Boolean)
    .join(' ')
}

function buildEnglishAddress(addr: ShippingAddressJP): string {
  return [addr.prefecture_en, addr.city_en, addr.town_en, addr.address_line_1]
    .filter(Boolean)
    .join(' ')
}

function timeCodeToNumber(code: string | null): number | '' {
  if (!code) return ''
  // '01' → 1, '04' → 4, '14' → 14, '16' → 16
  const num = parseInt(code, 10)
  return isNaN(num) ? '' : num
}

function deliveryDateToYYYYMMDD(dateStr: string | null): string {
  if (!dateStr) return ''
  // dateStr is ISO format like '2026-03-28'
  return dateStr.replace(/-/g, '')
}

function buildItemDescription(orderItems: DempyoOrderItem[]): string {
  return orderItems
    .map((oi) => {
      if (oi.items?.item_code) return oi.items.item_code
      return oi.description ?? ''
    })
    .filter(Boolean)
    .join(' / ')
}

function paymentMethodToAN(method: string | null): string {
  switch (method) {
    case 'COD':
    case 'CREDIT_CARD':
      return 'Cash on Delivery'
    case 'BANK':
      return 'Bank'
    case 'KONBINI':
      return 'Konbini'
    case 'CASH':
      return 'Cash'
    default:
      return ''
  }
}

function isCODPayment(method: string | null): boolean {
  return method === 'COD' || method === 'CREDIT_CARD'
}

// --- Validation ---

export function validateOrders(orders: DempyoOrder[]): DempyoValidationResult {
  const valid: DempyoOrder[] = []
  const skipped: { order: DempyoOrder; reason: string }[] = []
  const warnings: { order: DempyoOrder; message: string }[] = []

  for (const order of orders) {
    const addr = parseAddress(order.shipping_address)

    // Skip non-JP addresses silently
    if (!addr || isLegacyAddress(addr) || !isJPAddress(addr)) {
      continue
    }

    // Validate required fields
    const name = buildRecipientName(order.customers)
    if (!name) {
      skipped.push({ order, reason: 'Missing recipient name' })
      continue
    }
    if (!addr.postal_code) {
      skipped.push({ order, reason: 'Missing postal code' })
      continue
    }
    if (!order.payment_method) {
      skipped.push({ order, reason: 'Missing payment method' })
      continue
    }

    // Warn on long addresses
    const fullAddr = buildJPAddressString(addr)
    const noSpaces = fullAddr.replace(/ /g, '')
    if (noSpaces.length > 48) {
      warnings.push({ order, message: `Address is ${noSpaces.length} chars (max 48) — may be truncated on waybill` })
    }

    valid.push(order)
  }

  return { valid, skipped, warnings }
}

// --- Sheet 2 Row Building ---

interface Sheet2Row {
  [col: string]: string | number | ''
}

function buildSheet2Row(order: DempyoOrder, addr: ShippingAddressJP): Sheet2Row {
  const name = buildRecipientName(order.customers)
  const phone = order.customers?.phone ?? ''
  const postalCode = addr.postal_code
  const jpAddress = buildJPAddressString(addr)
  const enAddress = buildEnglishAddress(addr)
  const anText = paymentMethodToAN(order.payment_method)
  const codAmount = isCODPayment(order.payment_method) ? order.total_price : ''
  const timeSlot = timeCodeToNumber(order.delivery_time_code)
  const deliveryDate = deliveryDateToYYYYMMDD(order.delivery_date)
  const itemDesc = buildItemDescription(order.order_items)

  return {
    D: name,
    F: phone,
    H: enAddress,
    M: postalCode,
    P: jpAddress,
    U: postalCode,
    AF: codAmount,
    AN: anText,
    AV: timeSlot,
    AW: deliveryDate,
    AZ: itemDesc,
    BC: order.order_code,
  }
}

function buildSheet2Rows(order: DempyoOrder): Sheet2Row[] {
  const addr = parseAddress(order.shipping_address) as ShippingAddressJP
  const boxCount = order.delivery_box_count ?? 1
  const cod = isCODPayment(order.payment_method)

  if (boxCount <= 1) {
    return [buildSheet2Row(order, addr)]
  }

  // Multi-box
  if (!cod) {
    // Prepaid: single row with AL, AM, BV
    const row = buildSheet2Row(order, addr)
    row.AL = boxCount
    row.AM = 3
    row.BV = order.order_code
    return [row]
  }

  // COD: one row per box
  const rows: Sheet2Row[] = []
  for (let i = 0; i < boxCount; i++) {
    const row = buildSheet2Row(order, addr)
    row.AM = 3
    row.BV = order.order_code
    if (i === 0) {
      // COD amount only on first box
      row.AF = order.total_price
    } else {
      row.AF = ''
    }
    // AL must be blank for COD
    rows.push(row)
  }
  return rows
}

// --- XLSX Generation ---

// Map column letters to 0-based column indices
function colToIndex(col: string): number {
  let idx = 0
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64)
  }
  return idx - 1
}

export async function generateDempyoXlsx(orders: DempyoOrder[]): Promise<Blob> {
  // Fetch template
  const response = await fetch('/templates/yamato-template.xlsx')
  const arrayBuffer = await response.arrayBuffer()
  const wb = XLSX.read(arrayBuffer, { type: 'array' })

  const ws = wb.Sheets['データ貼付']
  if (!ws) throw new Error('Sheet "データ貼付" not found in template')

  // Clear existing data in Sheet 2
  const existingRange = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null
  if (existingRange) {
    for (let r = existingRange.s.r; r <= existingRange.e.r; r++) {
      for (let c = existingRange.s.c; c <= existingRange.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        delete ws[addr]
      }
    }
  }

  // Build all rows
  const allRows: Sheet2Row[] = []
  for (const order of orders) {
    allRows.push(...buildSheet2Rows(order))
  }

  // Write rows to Sheet 2 (starting at row 1, 0-indexed as r=0)
  const columns = ['D', 'F', 'H', 'M', 'P', 'U', 'AF', 'AL', 'AM', 'AN', 'AV', 'AW', 'AZ', 'BC', 'BV']
  let maxCol = 0
  for (let rowIdx = 0; rowIdx < allRows.length; rowIdx++) {
    const rowData = allRows[rowIdx]
    for (const col of columns) {
      const value = rowData[col]
      if (value === undefined || value === '') continue
      const colIdx = colToIndex(col)
      if (colIdx > maxCol) maxCol = colIdx
      const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
      if (typeof value === 'number') {
        ws[cellAddr] = { t: 'n', v: value }
      } else {
        ws[cellAddr] = { t: 's', v: value }
      }
    }
  }

  // Update sheet range
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(0, allRows.length - 1), c: maxCol },
  })

  // Generate file
  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function generateDempyoFilename(): string {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-yamato.xlsx`
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/yamato.ts
git commit -m "feat: add Yamato dempyo xlsx generation module"
```

---

### Task 7: Orders Page — Print Buttons

**Files:**
- Modify: `src/pages/admin/orders.tsx`

- [ ] **Step 1: Add imports and hooks**

At the top of `src/pages/admin/orders.tsx`, add to existing imports:

```typescript
import { Printer, FileSpreadsheet } from 'lucide-react'
```

Add new hook imports:

```typescript
import { useConfirmedForInvoice, useConfirmedForDempyo, useStampInvoicePrinted, useStampDempyoPrinted } from '@/hooks/use-orders'
```

Add these imports:

```typescript
import { printBatchInvoices } from '@/components/orders/batch-invoice-print'
import { validateOrders, generateDempyoXlsx, downloadBlob, generateDempyoFilename } from '@/lib/yamato'
```

- [ ] **Step 2: Add hooks and handlers inside the component**

Inside `OrderListPage()`, after the existing `cancelOffer` line, add:

```typescript
// Batch printing queries
const { data: invoiceOrders } = useConfirmedForInvoice()
const { data: dempyoOrders } = useConfirmedForDempyo()
const stampInvoice = useStampInvoicePrinted()
const stampDempyo = useStampDempyoPrinted()

const invoiceCount = invoiceOrders?.length ?? 0
const dempyoCount = dempyoOrders?.length ?? 0

const handleBatchInvoice = () => {
  if (!invoiceOrders || invoiceOrders.length === 0) return
  printBatchInvoices(invoiceOrders, '')
  const ids = invoiceOrders.map((o) => o.id)
  stampInvoice.mutate(ids, {
    onSuccess: () => toast.success(`Marked ${ids.length} invoices as printed`),
    onError: (err) => toast.error(err.message),
  })
}

const handleBatchDempyo = async () => {
  if (!dempyoOrders || dempyoOrders.length === 0) return

  const { valid, skipped, warnings } = validateOrders(dempyoOrders)

  if (skipped.length > 0) {
    for (const s of skipped) {
      toast.warning(`${s.order.order_code}: ${s.reason}`)
    }
  }
  for (const w of warnings) {
    toast.warning(`${w.order.order_code}: ${w.message}`)
  }

  if (valid.length === 0) {
    toast.error('No valid orders for dempyo generation')
    return
  }

  try {
    const blob = await generateDempyoXlsx(valid)
    downloadBlob(blob, generateDempyoFilename())

    const ids = valid.map((o) => o.id)
    stampDempyo.mutate(ids, {
      onSuccess: () => toast.success(`Dempyo generated for ${ids.length} orders`),
      onError: (err) => toast.error(err.message),
    })
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to generate dempyo')
  }
}
```

- [ ] **Step 3: Add buttons to the search/filter bar**

In the orders tab section, find the search & source filter `<div>` (the one with `className="flex items-center gap-4 flex-wrap"`). Add the print buttons inside it, after the `Select` component:

```typescript
{statusTab === 'CONFIRMED' && (
  <div className="flex items-center gap-2">
    <Button
      variant="outline"
      size="sm"
      disabled={invoiceCount === 0}
      onClick={handleBatchInvoice}
    >
      <Printer className="h-4 w-4 mr-1" />
      Print Invoices ({invoiceCount})
    </Button>
    <Button
      variant="outline"
      size="sm"
      disabled={dempyoCount === 0}
      onClick={handleBatchDempyo}
    >
      <FileSpreadsheet className="h-4 w-4 mr-1" />
      Print Dempyo ({dempyoCount})
    </Button>
  </div>
)}
```

- [ ] **Step 4: Add print status indicators to the table columns**

Add two new columns to the `columns` array, before the `created_at` column. Find the `created_at` column definition and add before it:

```typescript
{
  id: 'print_status',
  header: 'Printed',
  cell: ({ row }) => {
    const order = row.original as OrderRow & { invoice_printed_at?: string | null; dempyo_printed_at?: string | null }
    return (
      <div className="flex items-center gap-2 text-xs">
        <span title="Invoice" className={order.invoice_printed_at ? 'text-green-600' : 'text-muted-foreground'}>
          {order.invoice_printed_at ? '✓ Inv' : '— Inv'}
        </span>
        <span title="Dempyo" className={order.dempyo_printed_at ? 'text-green-600' : 'text-muted-foreground'}>
          {order.dempyo_printed_at ? '✓ 伝票' : '— 伝票'}
        </span>
      </div>
    )
  },
},
```

Also update the `OrderRow` type to include the new fields:

```typescript
// Add to OrderRow type definition:
invoice_printed_at: string | null
dempyo_printed_at: string | null
delivery_box_count: number
```

- [ ] **Step 5: Verify the build compiles and the page loads**

Run: `npx tsc --noEmit`
Run: `npm run dev` — navigate to /admin/orders, click the Confirmed tab, verify buttons appear.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/orders.tsx
git commit -m "feat: add batch invoice and dempyo print buttons to orders page"
```

---

### Task 8: Order Detail Page — Box Count & Print Timestamps

**Files:**
- Modify: `src/pages/admin/order-detail.tsx`

- [ ] **Step 1: Add delivery_box_count to the editable fields**

In the "Shipping & Delivery" card section of the order detail page, add a "Delivery Boxes" field. Find the shipping/delivery card and add after the delivery time slot section:

```typescript
<div className="flex justify-between items-center">
  <span className="text-muted-foreground">Delivery Boxes</span>
  {isEditing ? (
    <input
      type="number"
      min={1}
      max={10}
      className="w-20 text-right border rounded px-2 py-1 text-sm"
      value={editForm.delivery_box_count ?? order.delivery_box_count ?? 1}
      onChange={(e) => setEditForm({ ...editForm, delivery_box_count: parseInt(e.target.value) || 1 })}
    />
  ) : (
    <span>{order.delivery_box_count ?? 1}</span>
  )}
</div>
```

Make sure `delivery_box_count` is included in the edit form's save handler (the existing `updateOrder` call).

- [ ] **Step 2: Display print timestamps**

In the order metadata section (Order Details card), add after the "Created" field:

```typescript
{order.invoice_printed_at && (
  <div className="flex justify-between">
    <span className="text-muted-foreground">Invoice Printed</span>
    <span className="text-sm">{formatDateTime(order.invoice_printed_at)}</span>
  </div>
)}
{order.dempyo_printed_at && (
  <div className="flex justify-between">
    <span className="text-muted-foreground">Dempyo Printed</span>
    <span className="text-sm">{formatDateTime(order.dempyo_printed_at)}</span>
  </div>
)}
```

- [ ] **Step 3: Update the single Print Invoice button to also stamp invoice_printed_at**

Modify the existing Print Invoice button's `onClick` to also call `stampInvoicePrinted`:

```typescript
import { useStampInvoicePrinted } from '@/hooks/use-orders'

// Inside the component:
const stampInvoice = useStampInvoicePrinted()

// Update the button onClick:
onClick={() => {
  printInvoice({ order: order as Parameters<typeof printInvoice>[0]['order'], salesAgent: displayName ?? '' })
  stampInvoice.mutate([order.id])
}}
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/order-detail.tsx
git commit -m "feat: add delivery box count and print timestamps to order detail"
```

---

### Task 9: General Settings — Credit Card Surcharge

**Files:**
- Modify: `src/pages/admin/general-settings.tsx`

- [ ] **Step 1: Add credit card surcharge setting card**

Add the surcharge configuration below the existing JOA tax rate card. The settings page currently has only a static info card. We'll add an interactive card that reads/writes from `system_settings`.

```typescript
import { useState, useEffect } from 'react'
import { Info, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/shared'
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/use-settings'

export default function GeneralSettingsPage() {
  const { data: surchargeValue, isLoading } = useSystemSetting('credit_card_surcharge_pct')
  const updateSetting = useUpdateSystemSetting()
  const [surcharge, setSurcharge] = useState('')

  useEffect(() => {
    if (surchargeValue !== undefined && surchargeValue !== null) {
      setSurcharge(surchargeValue)
    }
  }, [surchargeValue])

  const handleSaveSurcharge = () => {
    const num = parseFloat(surcharge)
    if (isNaN(num) || num < 0 || num > 100) {
      toast.error('Surcharge must be between 0 and 100')
      return
    }
    updateSetting.mutate(
      { key: 'credit_card_surcharge_pct', value: surcharge },
      {
        onSuccess: () => toast.success('Surcharge updated'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="General Settings" />

      {/* Existing JOA card stays as-is */}
      <Card>
        {/* ... existing JOA card content unchanged ... */}
      </Card>

      {/* Credit Card Surcharge */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Credit Card Surcharge</CardTitle>
          </div>
          <CardDescription>
            Percentage added as a line item to orders paid by credit card via Cash on Delivery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              className="w-24"
              value={surcharge}
              onChange={(e) => setSurcharge(e.target.value)}
              disabled={isLoading}
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Button
              size="sm"
              onClick={handleSaveSurcharge}
              disabled={updateSetting.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Currently: {surchargeValue ?? '4'}%. Applied when payment method is Credit Card.
            This adds a visible "Credit Card Fee" line item to the order.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

Note: Keep the existing JOA tax rate card content exactly as-is. Only add the new card below it. The full replacement above is just to show the complete structure — when implementing, add the new `Card` block after the existing one, and add the new imports/state at the top.

- [ ] **Step 2: Verify the build compiles and settings page loads**

Run: `npx tsc --noEmit`
Run: `npm run dev` — navigate to /admin/settings/general, verify the surcharge input appears with the default value of 4.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/general-settings.tsx
git commit -m "feat: add credit card surcharge setting to general settings"
```

---

### Task 10: Credit Card Surcharge Line Item Logic

**Files:**
- Modify: `src/pages/admin/order-detail.tsx`
- Modify: `src/services/orders.ts`

When the payment method on an order is changed to CREDIT_CARD, a visible "Credit Card Fee" line item should be auto-added. When changed away from CREDIT_CARD, the fee line item should be auto-removed.

- [ ] **Step 1: Add surcharge helper to orders service**

Append to `src/services/orders.ts`:

```typescript
// --- Credit Card Surcharge ---

const CC_FEE_DESCRIPTION = 'Credit Card Fee'

export async function addCreditCardSurcharge(orderId: string, surchargePercent: number) {
  // First check if surcharge line item already exists
  const { data: existing } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', orderId)
    .eq('description', CC_FEE_DESCRIPTION)
    .is('item_id', null)

  if (existing && existing.length > 0) return // Already has surcharge

  // Calculate surcharge from current line items (excluding existing fee if any)
  const { data: items } = await supabase
    .from('order_items')
    .select('unit_price, quantity, discount, description')
    .eq('order_id', orderId)

  if (!items) return

  const subtotal = items
    .filter((i) => i.description !== CC_FEE_DESCRIPTION)
    .reduce((sum, i) => sum + i.unit_price * i.quantity - i.discount, 0)

  const feeAmount = Math.round(subtotal * surchargePercent / 100)
  if (feeAmount <= 0) return

  await supabase
    .from('order_items')
    .insert({
      order_id: orderId,
      item_id: null,
      description: CC_FEE_DESCRIPTION,
      quantity: 1,
      unit_price: feeAmount,
      discount: 0,
    })

  await recalculateOrderTotal(orderId)
}

export async function removeCreditCardSurcharge(orderId: string) {
  const { data: feeItems } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', orderId)
    .eq('description', CC_FEE_DESCRIPTION)
    .is('item_id', null)

  if (!feeItems || feeItems.length === 0) return

  for (const fee of feeItems) {
    await supabase.from('order_items').delete().eq('id', fee.id)
  }

  await recalculateOrderTotal(orderId)
}
```

- [ ] **Step 2: Hook into payment method changes on order detail**

In `src/pages/admin/order-detail.tsx`, when the payment method field is saved and the value changes to/from CREDIT_CARD, call the appropriate function.

Find the save handler where `updateOrder` is called with the edited fields. After the update succeeds, add:

```typescript
import { useSystemSetting } from '@/hooks/use-settings'
import * as ordersService from '@/services/orders'

// Inside the component, add:
const { data: surchargeRate } = useSystemSetting('credit_card_surcharge_pct')

// In the save handler, after updateOrder succeeds:
const oldMethod = order.payment_method
const newMethod = editForm.payment_method ?? order.payment_method

if (newMethod === 'CREDIT_CARD' && oldMethod !== 'CREDIT_CARD') {
  const rate = parseFloat(surchargeRate ?? '4')
  await ordersService.addCreditCardSurcharge(order.id, rate)
  queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(order.id) })
} else if (oldMethod === 'CREDIT_CARD' && newMethod !== 'CREDIT_CARD') {
  await ordersService.removeCreditCardSurcharge(order.id)
  queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(order.id) })
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Test the surcharge flow**

1. Open an order detail page
2. Change payment method to Credit Card, save
3. Verify a "Credit Card Fee" line item appears with correct amount (4% of subtotal)
4. Change payment method to Bank, save
5. Verify the "Credit Card Fee" line item is removed
6. Verify total_price recalculates correctly in both cases

- [ ] **Step 5: Commit**

```bash
git add src/services/orders.ts src/pages/admin/order-detail.tsx
git commit -m "feat: auto-add/remove credit card surcharge line item on payment method change"
```

---

### Task 11: Manual Verification & Final Commit

- [ ] **Step 1: Full build check**

Run: `npx tsc --noEmit && npm run build`

Fix any type errors.

- [ ] **Step 2: Test batch invoice printing**

1. Navigate to /admin/orders
2. Click the "Confirmed" tab
3. Verify "Print Invoices (N)" button shows correct count
4. Click it — browser print dialog should open with all invoices
5. Close print dialog — check that orders now show `✓ Inv` in the Printed column
6. Click button again — count should be 0

- [ ] **Step 3: Test dempyo generation**

1. Click "Print Dempyo (N)" on the Confirmed tab
2. Verify xlsx file downloads with correct filename format
3. Open the file — verify Sheet 2 has data, Sheet 1 formulas auto-populate
4. Check that recipient names, addresses, postal codes, COD amounts are correct
5. Verify orders now show `✓ 伝票` in the Printed column

- [ ] **Step 4: Test multi-box**

1. Go to an order detail page, set Delivery Boxes = 2
2. If COD: verify the dempyo has 2 rows for that order (AF only on row 1)
3. If prepaid: verify 1 row with AL=2, AM=3

- [ ] **Step 5: Test settings**

1. Navigate to /admin/settings/general
2. Change surcharge to 5, save
3. Verify toast success
4. Refresh — value persists

- [ ] **Step 6: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: complete Yamato dempyo batch and invoice batch printing"
```
