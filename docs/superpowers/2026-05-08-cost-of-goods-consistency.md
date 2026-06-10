# Cost-of-Goods Consistency Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `total_cost = purchase_price + Σ item_costs.amount` the single source of truth for "what an item cost us" in every UI surface that displays cost or computes profit. Surface drift between intake-snapshot receipt totals and live item totals.

**Architecture:** Augment four existing Supabase service queries to embed `item_costs(amount)`, add one tiny utility (`getItemTotalCost`) used everywhere, and replace four wrong formulas/displays. No new tables, no view, no migrations. Receipt header gets a "Live Total" displayed alongside the original snapshot with a drift indicator. This plan is foundational for the Edit Line Price (Plan C) and Additional Charges (Plan B) features that will follow.

**Tech Stack:** TypeScript (strict), React 19, TanStack Query 5, Supabase JS, shadcn/ui. No test runner is configured in this repo (`package.json` has no `test` script and no vitest/jest dependency), so verification is manual: dev server + spot SQL via Supabase MCP. Each task ends with a concrete observable assertion.

**Pre-flight assumptions verified:**
- `item_costs (id, item_id, description, amount, created_at)` exists with `Staff full access` RLS
- `trg_item_audit` already auto-logs `items` column changes — no extra audit work needed
- `intake_receipts.total_cost` is a stored snapshot, never auto-updated
- Two profit-calc sites in `src/pages/admin/items.tsx`: lines ~1030 (unified column for items+sell-groups+accessories) and ~1333 (items-only column)

**Out of scope (deferred to later plans):**
- Editing `intake_receipt_line_items.unit_price` post-approval → Plan C
- Adding receipt-level landed-cost charges → Plan B
- Inventory snapshot SQL (`generate_inventory_snapshot`) — already correct, sums `item_costs` server-side
- Sell-group cost display — intentionally untouched (sell groups are customer-facing, not internal cost views)
- Supplier-return refund display — labelled "Purchase Price" which is correct for what the supplier owes

---

## File Structure

**Files to modify:**
- `src/lib/utils.ts` — add `getItemTotalCost(item)` helper + type
- `src/services/items.ts` — augment `getItems()` SELECT to embed `item_costs(amount)`
- `src/services/intake-receipts.ts` — augment `getReceiptItems()` SELECT to embed `item_costs(amount)`
- `src/services/inventory-removals.ts` — augment removal-detail query to embed `item_costs(amount)`
- `src/pages/admin/items.tsx` — fix two profit-calc sites
- `src/pages/admin/receiving-report-detail.tsx` — add Live Total + drift banner
- `src/pages/admin/inventory-removal-detail.tsx` — show total cost as the loss
- `package.json` — bump version (one bump for the whole plan, per session memory)

**Files NOT to touch:**
- Sell groups (`sell-group-result-block.tsx`, `services/sell-groups.ts`) — by design
- Supplier returns (`supplier-return-detail.tsx`) — by design
- `inventory-snapshots.ts` and the snapshot SQL — already correct
- Showcase / public shop — does not display cost

---

## Task 1 — Add `getItemTotalCost` utility

**Files:**
- Modify: `src/lib/utils.ts`

The same total-cost formula is needed at four call sites. Putting it in one place prevents drift later.

- [ ] **Step 1: Add the helper to `src/lib/utils.ts`**

Append at the end of the file:

```typescript
// --- Cost calculations ---

/**
 * Minimal shape an object must have for getItemTotalCost.
 * Accepts both the joined query result (item_costs as array of {amount})
 * and an explicit pre-summed shape.
 */
export interface ItemWithCosts {
  purchase_price: number | null
  item_costs?: Array<{ amount: number | string | null }> | null
}

/** Sum of all item_costs.amount rows, coerced to number. Returns 0 when none. */
export function sumItemCosts(item: { item_costs?: Array<{ amount: number | string | null }> | null }): number {
  const rows = item.item_costs ?? []
  return rows.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
}

/** purchase_price + Σ item_costs.amount. Both sides coerced safely. */
export function getItemTotalCost(item: ItemWithCosts): number {
  return (Number(item.purchase_price) || 0) + sumItemCosts(item)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build` (or `tsc --noEmit` if faster)
Expected: clean build, no new errors. If the file already has `// --- Cost calculations ---` or a `sumItemCosts` export, abort and reconcile rather than duplicating.

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: add getItemTotalCost utility for unified cost calc

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — Embed `item_costs` in items list query

**Files:**
- Modify: `src/services/items.ts:55-67`

The list page can't fix the profit formula until each row carries its `item_costs`. Today the `getItem(id)` (single) query embeds them; `getItems()` (list) does not.

- [ ] **Step 1: Add the embed to the SELECT**

In `src/services/items.ts`, locate the SELECT inside `getItems()` (lines ~55-67). Currently:

```typescript
.select(`
  *,
  suppliers(supplier_name),
  product_models(*, categories(name, description_fields), product_media(file_url, role, sort_order)),
  order_items(
    orders(id, order_code, order_status,
      customers(id, customer_code, first_name, last_name, email, phone)
    )
  )
`)
```

Replace with (one extra line):

```typescript
.select(`
  *,
  suppliers(supplier_name),
  product_models(*, categories(name, description_fields), product_media(file_url, role, sort_order)),
  item_costs(amount),
  order_items(
    orders(id, order_code, order_status,
      customers(id, customer_code, first_name, last_name, email, phone)
    )
  )
`)
```

- [ ] **Step 2: Update the row type used in items.tsx**

`src/pages/admin/items.tsx` near line 51 has an inline row type that lists `purchase_price: number | null`. Add a sibling field so TypeScript knows the embed is present.

Find the type declaration block (search for `purchase_price: number | null` near line 51) and add:

```typescript
  item_costs?: Array<{ amount: number | string | null }> | null
```

immediately after the `purchase_price` line. Don't change indentation style — match the surrounding lines.

- [ ] **Step 3: Verify the embed lands on the wire**

Start the dev server: `npm run dev`
Open `/admin/items` in browser, open DevTools → Network → find the items query response → confirm at least one row has `item_costs: []` (empty if no costs added) or `[{amount: ...}]`.

If you see undefined or the field missing, the SELECT didn't take — re-check the comma placement.

Alternative DB check via Supabase MCP:

```sql
SELECT i.item_code, i.purchase_price,
       COALESCE(SUM(c.amount), 0) AS total_added
FROM items i
LEFT JOIN item_costs c ON c.item_id = i.id
GROUP BY i.id
HAVING COALESCE(SUM(c.amount), 0) > 0
LIMIT 5;
```

This shows you the items that actually have added costs — pick one P-code from the result and confirm it appears with non-empty `item_costs` in the network response.

- [ ] **Step 4: Commit**

```bash
git add src/services/items.ts src/pages/admin/items.tsx
git commit -m "feat: embed item_costs in items list query for total-cost calc

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Fix unified Amount column profit (items.tsx ~line 1030)

**Files:**
- Modify: `src/pages/admin/items.tsx:1030-1053`

This is the column rendered when the items table is in mixed mode (items + sell-groups + accessories interleaved). The `_kind === 'item'` branch currently computes `profit = sell - disc - buy` ignoring added costs.

- [ ] **Step 1: Replace the formula**

In `src/pages/admin/items.tsx` find the block starting `const buy = r.purchase_price ?? 0` near line 1030.

Current (~lines 1030-1053):

```typescript
        const buy = r.purchase_price ?? 0
        const sell = r.selling_price ?? 0
        const disc = r.discount ?? 0
        const profit = sell - disc - buy
        return (
          <div className="flex flex-col gap-0 text-xs leading-tight" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Buy</span>
              <PriceDisplay amount={r.purchase_price} className="text-xs" />
            </div>
```

Replace with:

```typescript
        const totalCost = getItemTotalCost(r)
        const addedCosts = totalCost - (r.purchase_price ?? 0)
        const sell = r.selling_price ?? 0
        const disc = r.discount ?? 0
        const profit = sell - disc - totalCost
        return (
          <div className="flex flex-col gap-0 text-xs leading-tight" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Cost</span>
              <PriceDisplay amount={totalCost} className="text-xs" />
            </div>
```

Note three deliberate changes:
- Label changes `Buy → Cost` (now reflects total, not raw purchase)
- The `<PriceDisplay amount={...}>` shows `totalCost` not `r.purchase_price`
- `profit` uses `totalCost`

The lines below this snippet (Sell, Disc, Profit rows) remain unchanged structurally — only the Profit value is now correct because `totalCost` flows in.

- [ ] **Step 2: Add `getItemTotalCost` to imports**

Near the top of `items.tsx`, find the line that imports from `@/lib/utils`. Add `getItemTotalCost` to the named imports. If no import from `@/lib/utils` exists yet, add:

```typescript
import { getItemTotalCost } from '@/lib/utils'
```

(Place it near other `@/lib/...` imports.)

- [ ] **Step 3: Verify visually**

Pre-condition: pick an item that has at least one `item_costs` row (use the SQL from Task 2 Step 3 to find one). For that item, calculate expected: `purchase_price + sum(item_costs.amount)`.

Reload `/admin/items`. In the unified mixed view (default), find that P-code's row. Confirm:
- "Cost" line shows your calculated total (not just purchase_price)
- "Profit" reflects sell − disc − total (not sell − disc − purchase)

Spot-check a second item that has NO added costs: profit should be unchanged from before.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/items.tsx
git commit -m "fix: items list unified Amount column uses total cost for profit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Fix items-only Amount column profit (items.tsx ~line 1333)

**Files:**
- Modify: `src/pages/admin/items.tsx:1331-1354`

Same bug, second column definition (the items-only table mode).

- [ ] **Step 1: Replace the formula**

Find the second `const buy = r.purchase_price ?? 0` near line 1333. Apply the identical change as Task 3:

Current:

```typescript
        const buy = r.purchase_price ?? 0
        const sell = r.selling_price ?? 0
        const disc = r.discount ?? 0
        const profit = sell - disc - buy
        return (
          <div className="flex flex-col gap-0 text-xs leading-tight" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Buy</span>
              <PriceDisplay amount={r.purchase_price} className="text-xs" />
            </div>
```

Replace with:

```typescript
        const totalCost = getItemTotalCost(r)
        const sell = r.selling_price ?? 0
        const disc = r.discount ?? 0
        const profit = sell - disc - totalCost
        return (
          <div className="flex flex-col gap-0 text-xs leading-tight" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Cost</span>
              <PriceDisplay amount={totalCost} className="text-xs" />
            </div>
```

Import was already added in Task 3 — no second import needed.

- [ ] **Step 2: Verify visually**

If the items page has a view toggle (e.g., "Items only" vs "All"), switch to the items-only mode and re-run the same spot-check from Task 3 against a P-code with added costs.

If you can't trigger the items-only column path through UI navigation, do a quick grep:

```bash
grep -n "id: 'amount'\|id: 'unified_amount'" src/pages/admin/items.tsx
```

Confirm both column ids exist and their cell renderers no longer reference `r.purchase_price` for profit math.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/items.tsx
git commit -m "fix: items list items-only Amount column uses total cost

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.5 — Align sort with displayed cost

**Files:**
- Modify: `src/pages/admin/items.tsx` (sort labels + comparators)

**Why this exists:** Tasks 3 and 4 changed the column to display `Cost` (purchase + added). The sort options still say "Buy Price" and the comparators still key on `r.purchase_price`. A row showing "Cost ¥10,500" can be sorted as ¥9,000 — exactly the display/sort drift this whole consistency pass exists to eliminate. Reviewer flagged this after Task 3.

- [ ] **Step 1: Update SORT_OPTIONS labels (lines ~143-144)**

Find:

```typescript
  { value: 'buy_price-asc', label: 'Buy Price (Low → High)' },
  { value: 'buy_price-desc', label: 'Buy Price (High → Low)' },
```

Replace with:

```typescript
  { value: 'buy_price-asc', label: 'Cost (Low → High)' },
  { value: 'buy_price-desc', label: 'Cost (High → Low)' },
```

Keep the `value` strings (`buy_price-asc/desc`) unchanged — any persisted user sort preference in localStorage would be invalidated otherwise. The internal key stays as `buy_price`; only what users see changes.

- [ ] **Step 2: Update unified-mode comparator (line ~558)**

Find:

```typescript
        case 'buy_price': {
          const priceA = a._kind === 'item' ? (a.purchase_price ?? 0) : 0
          const priceB = b._kind === 'item' ? (b.purchase_price ?? 0) : 0
```

Replace with:

```typescript
        case 'buy_price': {
          const priceA = a._kind === 'item' ? getItemTotalCost(a) : 0
          const priceB = b._kind === 'item' ? getItemTotalCost(b) : 0
```

- [ ] **Step 3: Update items-only comparator (line ~587)**

Find:

```typescript
        case 'buy_price': return dir * ((a.purchase_price ?? 0) - (b.purchase_price ?? 0))
```

Replace with:

```typescript
        case 'buy_price': return dir * (getItemTotalCost(a) - getItemTotalCost(b))
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: clean.

Spot-check via the SQL from Task 2:

```sql
SELECT i.item_code, i.purchase_price,
       COALESCE(SUM(c.amount), 0) AS total_added,
       i.purchase_price + COALESCE(SUM(c.amount), 0) AS total_cost
FROM items i
LEFT JOIN item_costs c ON c.item_id = i.id
GROUP BY i.id
ORDER BY total_cost DESC
LIMIT 10;
```

Pick the top P-code and one bottom P-code from the result. After Task 4.5 is deployed, on the items list, sort by "Cost (High → Low)" — the top P-code should appear first. Manual verification in browser; subagent should skip and report.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/items.tsx
git commit -m "fix: align items list sort with displayed total cost

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.6 — Extract `<ItemAmountCell>` shared component

**Files:**
- Modify: `src/pages/admin/items.tsx`

**Why this exists:** After Task 4, the cell renderers at ~line 1031 (unified column, `_kind === 'item'` branch) and ~line 1333 (items-only column) are nearly identical (~95% — only difference is the unified version is wrapped by the `_kind` early returns). Future changes to either touching the same content will drift. Extract one component used at both sites.

This file already follows the inline-component pattern (`EditPriceCell` is defined at line ~233 as an inline function inside the same file). Match that pattern — do NOT create a new file.

- [ ] **Step 1: Add `ItemAmountCell` near `EditPriceCell`**

Find the existing `EditPriceCell` declaration (line ~233 — search for `function EditPriceCell(`) and immediately after its closing `}`, add a new component:

```typescript
function ItemAmountCell({ row, updateItem }: { row: ItemRow; updateItem: ReturnType<typeof useUpdateItem> }) {
  const totalCost = getItemTotalCost(row)
  const sell = row.selling_price ?? 0
  const disc = row.discount ?? 0
  const profit = sell - disc - totalCost
  return (
    <div className="flex flex-col gap-0 text-xs leading-tight" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-muted-foreground">Cost</span>
        <PriceDisplay amount={totalCost} className="text-xs" />
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-muted-foreground flex items-center gap-0.5">Sell <EditPriceCell itemId={row.id} itemCode={row.item_code} field="selling_price" value={row.selling_price} updateItem={updateItem} /></span>
        <PriceDisplay amount={row.selling_price} className="text-xs" />
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-muted-foreground flex items-center gap-0.5">Disc <EditPriceCell itemId={row.id} itemCode={row.item_code} field="discount" value={row.discount} updateItem={updateItem} /></span>
        <PriceDisplay amount={row.discount} className="text-xs" />
      </div>
      <div className={cn('flex items-center justify-between gap-1 font-medium', profit >= 0 ? 'text-green-600' : 'text-red-500')}>
        <span>Profit</span>
        <PriceDisplay amount={profit} className="text-xs" />
      </div>
    </div>
  )
}
```

**Notes:**
- The exact `useUpdateItem` import name may differ — check the existing `EditPriceCell` signature for how the file refers to the mutation type. If `EditPriceCell` types it differently, copy that style.
- If `cn` is not already imported in this file, search for `import { cn }` and add to the existing import; do not duplicate.
- The `ItemRow` type is already defined in this file (used at line ~52) and includes `item_costs` (added in Task 2).

- [ ] **Step 2: Replace the unified-column body (line ~1031)**

Find the `_kind === 'item'` fallthrough block in the unified `Amount` column (the body that starts with `const totalCost = getItemTotalCost(r)` after Task 3). Replace the entire body — from `const totalCost` through the closing `</div>` of the cell — with a single line:

```typescript
        return <ItemAmountCell row={r} updateItem={updateItem} />
```

Be careful: only replace inside the `_kind === 'item'` branch. The early returns above (for `_kind === 'accessory'` and `_kind === 'sell-group'`) stay as they are.

- [ ] **Step 3: Replace the items-only column body (line ~1333)**

Find the items-only `Amount` column cell renderer (the body that starts with `const totalCost = getItemTotalCost(r)` after Task 4). Replace the entire body with the same single line:

```typescript
        return <ItemAmountCell row={r} updateItem={updateItem} />
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: clean. If there are type errors about `updateItem`, the prop type in `ItemAmountCell` may need to match how the local mutation is declared — open the existing column definition and copy the type used there.

Confirm both call sites compile and visually render the same content as before (manual reload of `/admin/items`; subagent skip and report).

Confirm via grep that `getItemTotalCost(r)` only appears inside `ItemAmountCell` now (not in the column cell renderers):

```bash
grep -n "getItemTotalCost" src/pages/admin/items.tsx
```

Expected: 1-2 hits (component body + maybe sort comparators from Task 4.5).

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/items.tsx
git commit -m "refactor: extract ItemAmountCell shared component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — Embed `item_costs` in receipt items query

**Files:**
- Modify: `src/services/intake-receipts.ts:53-65`

The receiving report detail page lists items received on a receipt. To compute a live receipt total it needs each item's added costs.

- [ ] **Step 1: Augment `getReceiptItems`**

Current:

```typescript
export async function getReceiptItems(receiptId: string) {
  const { data, error } = await supabase
    .from('items')
    .select(`
      *,
      product_models(brand, model_name, color, cpu, ram_gb, storage_gb, screen_size, os_family, categories(description_fields))
    `)
    .eq('intake_receipt_id', receiptId)
    .order('item_code', { ascending: true })

  if (error) throw error
  return data ?? []
}
```

Replace SELECT with:

```typescript
    .select(`
      *,
      product_models(brand, model_name, color, cpu, ram_gb, storage_gb, screen_size, os_family, categories(description_fields)),
      item_costs(amount)
    `)
```

- [ ] **Step 2: Verify the embed lands**

Open `/admin/receiving-reports/<some-receipt-id>` (pick any receipt from `/admin/receiving-reports`). DevTools → Network → confirm the items array contains `item_costs` per row.

- [ ] **Step 3: Commit**

```bash
git add src/services/intake-receipts.ts
git commit -m "feat: embed item_costs in receipt items query

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — Add "Live Total" with drift indicator to receipt detail

**Files:**
- Modify: `src/pages/admin/receiving-report-detail.tsx:140-160`

The header today shows `receipt.total_cost` only — a snapshot from intake creation. Add a derived "Live Total" beside it; when they diverge, show a visual indicator with explainer.

- [ ] **Step 1: Compute live total in the component**

Open `src/pages/admin/receiving-report-detail.tsx`. Near the top of the component body (after the existing `useReceiptItems` hook call — search for `useReceiptItems` to find it), add:

```typescript
  const liveItemsCost = (items ?? []).reduce(
    (sum, it) => sum + getItemTotalCost(it as unknown as { purchase_price: number | null; item_costs?: Array<{ amount: number | string | null }> | null }),
    0,
  )
  const snapshotCost = Number(receipt?.total_cost ?? 0)
  const drift = liveItemsCost - snapshotCost
  const hasDrift = Math.abs(drift) >= 1 // tolerate rounding
```

Add the import at the top of the file (near other `@/lib/utils` imports — search for `from '@/lib/utils'`):

```typescript
import { getItemTotalCost } from '@/lib/utils'
```

If the import already exists, just add `getItemTotalCost` to the named imports (do not duplicate the line).

- [ ] **Step 2: Replace the Total Cost row in the receipt header**

Find the existing block (line ~153-156):

```tsx
            <div>
              <span className="text-muted-foreground block">Total Cost</span>
              <span className="font-semibold">{formatPrice(receipt.total_cost)}</span>
            </div>
```

Replace with:

```tsx
            <div>
              <span className="text-muted-foreground block">Total Cost (intake)</span>
              <span className="font-semibold">{formatPrice(snapshotCost)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Live Total</span>
              <span className={`font-semibold ${hasDrift ? 'text-amber-600' : ''}`}>
                {formatPrice(liveItemsCost)}
                {hasDrift && (
                  <span className="ml-2 text-xs font-normal">
                    ({drift > 0 ? '+' : ''}{formatPrice(drift)})
                  </span>
                )}
              </span>
            </div>
```

- [ ] **Step 3: Add a drift explainer banner (when applicable)**

Right below the closing `</div>` of the header grid (search for the closing tag of the existing 2-column or 3-column metadata grid in the same Card), add — only render when drift exists:

```tsx
          {hasDrift && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span className="font-medium">Note:</span>{' '}
              The intake total is a snapshot from when this receipt was created.
              The live total reflects current item purchase prices plus any added costs.
              A non-zero difference is expected after price corrections or additional charges.
            </div>
          )}
```

- [ ] **Step 4: Verify two scenarios**

**Scenario A — receipt with no drift:**
Pick a recent receipt where no items have added costs and no purchase_price changes.
Expected: "Total Cost (intake)" and "Live Total" show the same value, no amber styling, no banner.

**Scenario B — receipt with drift:**
Pick the P-code you found earlier with added `item_costs`. From Supabase MCP:

```sql
SELECT intake_receipt_id FROM items WHERE id = '<your-p-code-uuid>';
```

Open that receipt detail. Expected: Live Total > intake total, amber color, +¥X delta shown, banner visible.

If no drifted receipt exists in dev data, manually create drift: open any item from the receipt, add a ¥500 cost via the Financials card, reload the receipt page.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/receiving-report-detail.tsx
git commit -m "feat: surface live total + drift indicator on receipt detail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Embed `item_costs` in inventory removal detail query

**Files:**
- Modify: `src/services/inventory-removals.ts:80` (and the surrounding select)

Inventory removal is a writedown — the loss to the business is total invested, not raw purchase price.

- [ ] **Step 1: Locate and inspect the query**

Run:

```bash
grep -n "purchase_price\|select(" src/services/inventory-removals.ts | head -20
```

Identify the SELECT that fetches removed items (the one referenced from `inventory-removal-detail.tsx`). It will have `purchase_price, item_status,` in its column list around line 80.

- [ ] **Step 2: Add the embed**

In the SELECT for removed items, add `item_costs(amount)` as a sibling embed. Pattern matches Task 5:

If the current SELECT looks like:

```typescript
        purchase_price, serial_number, supplier_description, ...
```

Append at the end of the joined relations (after any existing `product_models(...)` or before the closing backtick), so it becomes:

```typescript
        purchase_price, serial_number, supplier_description, ...,
        item_costs(amount)
```

Verify by running the file through tsc — TypeScript will flag if the placement breaks the SELECT-string parsing.

- [ ] **Step 3: Update the inline row type in `inventory-removal-detail.tsx`**

Find line ~57:

```typescript
    color: string | null; condition_grade: string | null; purchase_price: number | null
```

Append `; item_costs?: Array<{ amount: number | string | null }> | null` to that type literal.

- [ ] **Step 4: Verify**

Open any inventory removal detail page. DevTools → Network → confirm `item_costs` is on each item.

- [ ] **Step 5: Commit**

```bash
git add src/services/inventory-removals.ts src/pages/admin/inventory-removal-detail.tsx
git commit -m "feat: embed item_costs in inventory removal detail query

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 — Show total cost as the loss in inventory removal detail

**Files:**
- Modify: `src/pages/admin/inventory-removal-detail.tsx:155-158`

- [ ] **Step 1: Replace the Purchase Price row**

Current (~line 155):

```tsx
                  <div>
                    <p className="text-xs text-muted-foreground">Purchase Price</p>
                    <p className="text-sm font-medium">{item.purchase_price != null ? formatPrice(item.purchase_price) : '—'}</p>
                  </div>
```

Replace with:

```tsx
                  <div>
                    <p className="text-xs text-muted-foreground">Total Cost (loss)</p>
                    <p className="text-sm font-medium">{formatPrice(getItemTotalCost(item))}</p>
                    {item.purchase_price != null && (item.item_costs?.length ?? 0) > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Purchase {formatPrice(item.purchase_price)} + Added {formatPrice(getItemTotalCost(item) - (item.purchase_price ?? 0))}
                      </p>
                    )}
                  </div>
```

Add the import at the top of the file:

```typescript
import { formatPrice, getItemTotalCost } from '@/lib/utils'
```

(If `formatPrice` is already imported from `@/lib/utils`, just add `getItemTotalCost` to the existing named imports.)

- [ ] **Step 2: Verify**

Pick a removed item that had added costs (or add costs to an item before removing it in dev to create one). Open the removal detail. Confirm:
- Field is now labelled "Total Cost (loss)"
- Value equals purchase + added costs
- Breakdown sub-line appears showing both components
- For an item with no added costs, no breakdown sub-line appears

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/inventory-removal-detail.tsx
git commit -m "fix: inventory removal shows total cost as the loss

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 — Bump version + final smoke test

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump patch version**

Current version is `1.35.4`. Bump to `1.36.0` (this is a feature pass — minor bump, not patch).

In `package.json`:

```json
  "version": "1.36.0",
```

- [ ] **Step 2: Full smoke pass**

Build and start fresh:

```bash
npm run build && npm run dev
```

Walk through the four surfaces with one item that has added costs (call it `P-test`) and one that does not (`P-clean`):

| Surface | P-test expected | P-clean expected |
|---|---|---|
| `/admin/items` (default mixed view) — Cost row | purchase + added | purchase only |
| `/admin/items` (items-only view) — Cost row | purchase + added | purchase only |
| `/admin/receiving-reports/:id` for P-test's receipt | Live Total > intake total, banner shown | Live Total = intake total, no banner |
| `/admin/inventory-removal/:id` (if available) | Total Cost (loss) = purchase + added, breakdown line visible | Total Cost (loss) = purchase, no breakdown line |

Also verify nothing regressed:
- Item Detail Financials card still works (it already used the right formula — should be unchanged)
- Sell groups page still shows per-item purchase price (unchanged by design)
- Supplier return page still shows "Purchase Price" labelled correctly (unchanged by design)

- [ ] **Step 3: Lint pass**

```bash
npm run lint
```

Expected: zero new errors. If there are pre-existing warnings unrelated to these files, leave them.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: bump to 1.36.0 for cost-of-goods consistency pass

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10 — Migrate `FinancialsCard` to `getItemTotalCost`

**Files:**
- Modify: `src/components/items/item-detail/financials-card.tsx`

**Why this exists:** Final reviewer flagged that `FinancialsCard` still inlines the formula instead of calling `getItemTotalCost`. The plan originally called Financials "already correct" — true mathematically, but it bypasses the helper. Result: two implementations of the same formula in production. When Plan B/C tweaks `getItemTotalCost` (e.g., adding receipt-charge allocations), the item detail page would silently drift. Migrating now closes the "single source of truth" goal.

The wrinkle is that `FinancialsCard` receives `costs` as a separate `ItemCost[]` prop (not embedded under `item.item_costs`). The fix wraps the helper with the right shape.

- [ ] **Step 1: Replace the formula at lines 29-30**

Open `src/components/items/item-detail/financials-card.tsx`. Find:

```typescript
  const totalAddedCosts = costs.reduce((sum, c) => sum + Number(c.amount), 0)
  const totalCost = (item.purchase_price ?? 0) + totalAddedCosts
```

Replace with:

```typescript
  const totalCost = getItemTotalCost({ purchase_price: item.purchase_price, item_costs: costs })
  const totalAddedCosts = totalCost - (item.purchase_price ?? 0)
```

`totalAddedCosts` is still used downstream (search the file to verify) for display purposes — keep computing it but derive from `totalCost`.

- [ ] **Step 2: Add the import**

Find the existing import line for `@/lib/utils` (search for `from '@/lib/utils'`) and add `getItemTotalCost` to the named imports. Don't create a duplicate import line.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: clean.

Confirm via grep that the formula is no longer inlined:

```bash
grep -n "purchase_price ?? 0).+totalAddedCosts\|costs.reduce" src/components/items/item-detail/financials-card.tsx
```

The `costs.reduce` pattern should be gone. (`item.purchase_price ?? 0` may still appear in other places in the file — that's fine.)

- [ ] **Step 4: Commit**

```bash
git add src/components/items/item-detail/financials-card.tsx
git commit -m "refactor: FinancialsCard uses getItemTotalCost helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11 — Extract `ItemCostRow` shared type alias

**Files:**
- Modify: `src/lib/utils.ts`
- Modify: `src/pages/admin/items.tsx`
- Modify: `src/pages/admin/receiving-report-detail.tsx`
- Modify: `src/pages/admin/inventory-removal-detail.tsx`

**Why this exists:** The shape `Array<{ amount: number | string | null }>` is duplicated across 5 sites (twice in `utils.ts`, once each in 3 pages). Multiple reviewers flagged it. A future change to the embed shape (e.g., when Plan B adds `description` or `source_type` to allocated costs) would require updating all 5 places. One alias collapses to a single source of truth.

- [ ] **Step 1: Add the alias to `src/lib/utils.ts`**

Find the `// --- Cost calculations ---` section (around line 141). Immediately after the section comment and before the `ItemWithCosts` interface, add:

```typescript
/** A single row from the item_costs embed — shape matches what PostgREST returns. */
export type ItemCostRow = { amount: number | string | null }
```

- [ ] **Step 2: Use the alias inside `utils.ts`**

In `ItemWithCosts`, change:

```typescript
  item_costs?: Array<{ amount: number | string | null }> | null
```

to:

```typescript
  item_costs?: Array<ItemCostRow> | null
```

In `sumItemCosts` parameter, change:

```typescript
export function sumItemCosts(item: { item_costs?: Array<{ amount: number | string | null }> | null }): number {
```

to:

```typescript
export function sumItemCosts(item: { item_costs?: Array<ItemCostRow> | null }): number {
```

- [ ] **Step 3: Update `src/pages/admin/items.tsx`**

Find the existing `@/lib/utils` import line and add `type ItemCostRow` to the named imports.

Find line ~52 (the `ItemRow` type's `item_costs` field):

```typescript
  item_costs?: Array<{ amount: number | string | null }> | null
```

Replace with:

```typescript
  item_costs?: Array<ItemCostRow> | null
```

- [ ] **Step 4: Update `src/pages/admin/receiving-report-detail.tsx`**

Find the existing `@/lib/utils` import line and add `type ItemCostRow` to the named imports.

Find the local type alias `ReceiptItemForCost` (around line 63-66):

```typescript
  type ReceiptItemForCost = {
    purchase_price: number | null
    item_costs?: Array<{ amount: number | string | null }> | null
  }
```

Replace with:

```typescript
  type ReceiptItemForCost = {
    purchase_price: number | null
    item_costs?: Array<ItemCostRow> | null
  }
```

- [ ] **Step 5: Update `src/pages/admin/inventory-removal-detail.tsx`**

Find the existing `@/lib/utils` import line and add `type ItemCostRow` to the named imports.

Find line ~57 (in the inline row type for `removal.items`):

```typescript
    color: string | null; condition_grade: string | null; purchase_price: number | null; item_costs?: Array<{ amount: number | string | null }> | null
```

Replace the `item_costs` portion:

```typescript
    color: string | null; condition_grade: string | null; purchase_price: number | null; item_costs?: Array<ItemCostRow> | null
```

- [ ] **Step 6: Verify**

Run: `npm run build`
Expected: clean. If there are type errors, the most likely cause is a typo in one of the four sites — re-check each by grep:

```bash
grep -n "ItemCostRow\|amount: number | string | null" src/lib/utils.ts src/pages/admin/items.tsx src/pages/admin/receiving-report-detail.tsx src/pages/admin/inventory-removal-detail.tsx
```

Expected:
- `utils.ts`: 1 alias declaration + 2 usages = 3 hits for `ItemCostRow`; 0 hits for the inline shape
- Each page: 1 import + 1 usage = 2 hits for `ItemCostRow`; 0 hits for the inline shape

If any inline `amount: number | string | null` remains in the four files (excluding the alias declaration line itself), one site was missed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/utils.ts src/pages/admin/items.tsx src/pages/admin/receiving-report-detail.tsx src/pages/admin/inventory-removal-detail.tsx
git commit -m "refactor: extract ItemCostRow shared type alias

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Checklist (run after implementation)

- [ ] Every task has an exact file path and line range
- [ ] Every code change shows the full snippet, not "similar to above"
- [ ] No TBD / TODO / placeholder language anywhere in the plan
- [ ] `getItemTotalCost` defined in Task 1 is referenced correctly in Tasks 3, 4, 6, 8
- [ ] Type augmentations in Tasks 2 and 7 match the embed shape from the queries
- [ ] Receipt detail shows BOTH snapshot and live (Task 6) — not replacing the snapshot
- [ ] Sell groups, supplier returns, snapshots, showcase explicitly listed as out-of-scope
- [ ] One version bump for the whole plan (Task 9), not per-task
- [ ] Each task ends with a commit step
- [ ] Manual verification step is concrete (uses real data from dev DB) — no "should look right"

## Risk register

- **`item_costs` embed performance** — `getItems()` already pulls many embeds; one more LEFT JOIN-style aggregation in PostgREST is negligible at current data volume (<10k items). Reassess if list query latency increases noticeably.
- **TypeScript inline row types may fight the augmentation** — `items.tsx` and `inventory-removal-detail.tsx` use ad-hoc inline types instead of generated types. The plan augments those inline types but doesn't refactor them. If a future change regenerates types from the DB, both files will need a real type swap.
- **Drift banner false positives** — rounding from `numeric` columns could produce sub-yen drift. Mitigation: tolerance of `Math.abs(drift) >= 1` in Task 6 (one yen).

## What this plan unlocks

- **Plan B (Additional Charges)** can land safely — the receipt drift indicator will visualize the new per-item allocations
- **Plan C (Edit Line Price)** can land safely — drift indicator shows when receipt header drifts from corrected per-item prices
- **Future profit/margin reports** have one canonical formula via `getItemTotalCost`
