# Product Template Diff Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent product template auto-populate with an interactive diff dialog that shows the product photo, highlights conflicting fields side-by-side, and lets the user checkbox which fields to overwrite — preventing accidental spec corruption.

**Architecture:** Replace the current `ConfirmDialog` in `item-assignment-bar.tsx` with a custom `ProductTemplateDiffDialog` component. This dialog fetches the product model with its hero image, computes field-level diffs between the item's current specs and the template, and renders them in two groups: (1) conflicts (current value differs from template — unchecked by default, user opts in) and (2) empty fills (item has no value — pre-checked). On confirm, only checked fields are written. Remove the `field_sources` tracking system entirely since the user is now the guardrail.

**Tech Stack:** React, TypeScript, shadcn/ui (Dialog, Checkbox, ScrollArea), Supabase query, TanStack Query.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/items/item-detail/product-template-diff-dialog.tsx` | **Create** | The diff dialog component: shows product photo, conflict rows with checkboxes, empty-fill rows, apply button |
| `src/components/items/item-detail/item-assignment-bar.tsx` | **Modify** | Replace `ConfirmDialog` with `ProductTemplateDiffDialog`, simplify `handleConfirmProductChange` to accept checked fields from dialog |
| `src/lib/types.ts` | **Modify** | Remove `FieldSource` and `FieldSources` types (no longer needed) |
| `src/components/items/item-detail/editable-specs-card.tsx` | **Modify** | Remove `field_sources` tracking from `handleSave` |

---

## Task 1: Create ProductTemplateDiffDialog Component

**Files:**
- Create: `src/components/items/item-detail/product-template-diff-dialog.tsx`

This is the core of the feature. The dialog:
1. Receives the current `item` and `pendingProductId`
2. Fetches the product model + hero image when opened
3. Computes three groups of fields:
   - **Conflicts:** Item has a value AND template has a different value → show side-by-side, unchecked
   - **Empty fills:** Item value is null/empty AND template has a value → pre-checked
   - **No change:** Values match or template has no value → not shown
4. Shows the product hero image at the top for visual confirmation
5. Shows supplier description if present (as context)
6. User checks/unchecks fields, then clicks Apply
7. Calls `onConfirm(checkedFieldKeys)` with only the selected fields

- [ ] **Step 1: Create the component file**

```typescript
import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, PackageCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getSpecFieldLabel } from '@/lib/constants'
import type { Item, ProductModel } from '@/lib/types'

interface ProductTemplateDiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Item
  pendingProductId: string | null
  loading: boolean
  onConfirm: (fieldsToApply: string[]) => void
}

// Fields the template can populate on the item
const TEXT_FIELDS = [
  'brand', 'model_name', 'color', 'cpu', 'gpu', 'os_family',
  'carrier', 'keyboard_layout', 'form_factor', 'other_features',
] as const

const NUM_FIELDS = ['ram_gb', 'storage_gb', 'year', 'screen_size'] as const

const BOOL_FIELDS = ['has_touchscreen', 'is_unlocked'] as const

const ALL_FIELDS = [...TEXT_FIELDS, ...NUM_FIELDS, ...BOOL_FIELDS] as const

interface FieldDiff {
  key: string
  label: string
  currentValue: string
  templateValue: string
  type: 'conflict' | 'fill'
}

function formatValue(val: unknown): string {
  if (val == null || val === '') return ''
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return String(val)
}

export function ProductTemplateDiffDialog({
  open,
  onOpenChange,
  item,
  pendingProductId,
  loading,
  onConfirm,
}: ProductTemplateDiffDialogProps) {
  const [product, setProduct] = useState<ProductModel | null>(null)
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [checkedFields, setCheckedFields] = useState<Set<string>>(new Set())

  // Fetch product model + hero image when dialog opens
  useEffect(() => {
    if (!open || !pendingProductId) return

    let cancelled = false
    setFetching(true)

    async function fetchProduct() {
      const { data } = await supabase
        .from('product_models')
        .select('*, product_media(file_url, role, sort_order)')
        .eq('id', pendingProductId!)
        .single()

      if (cancelled) return

      if (data) {
        const media = (data.product_media as Array<{
          file_url: string
          role: string
          sort_order: number
        }>) ?? []
        const hero = media.find((m) => m.role === 'hero') ?? media[0] ?? null
        setHeroImageUrl(hero?.file_url ?? null)

        // Strip product_media from the product model object
        const { product_media: _, ...pm } = data
        setProduct(pm as unknown as ProductModel)
      }

      setFetching(false)
    }

    fetchProduct()
    return () => { cancelled = true }
  }, [open, pendingProductId])

  // Compute diffs whenever product changes
  const diffs: FieldDiff[] = []
  if (product) {
    for (const key of ALL_FIELDS) {
      const templateRaw = product[key as keyof ProductModel]
      const templateStr = formatValue(templateRaw)
      if (!templateStr) continue // Template has no value for this field — skip

      const currentRaw = item[key as keyof Item]
      const currentStr = formatValue(currentRaw)

      if (!currentStr) {
        // Item is empty, template has value → fill
        diffs.push({
          key,
          label: getSpecFieldLabel(key),
          currentValue: '—',
          templateValue: templateStr,
          type: 'fill',
        })
      } else if (currentStr !== templateStr) {
        // Both have values but they differ → conflict
        diffs.push({
          key,
          label: getSpecFieldLabel(key),
          currentValue: currentStr,
          templateValue: templateStr,
          type: 'conflict',
        })
      }
      // If equal → no diff, not shown
    }
  }

  const conflicts = diffs.filter((d) => d.type === 'conflict')
  const fills = diffs.filter((d) => d.type === 'fill')

  // Reset checked state when diffs change
  useEffect(() => {
    // Pre-check all fills, uncheck all conflicts
    const initialChecked = new Set<string>()
    for (const d of diffs) {
      if (d.type === 'fill') initialChecked.add(d.key)
    }
    setCheckedFields(initialChecked)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id])

  function toggleField(key: string) {
    setCheckedFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleApply() {
    onConfirm(Array.from(checkedFields))
  }

  const productLabel = product
    ? `${product.brand ?? ''} ${product.model_name ?? ''} ${product.color ? `(${product.color})` : ''}`.trim()
    : 'Loading...'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply Product Template</DialogTitle>
        </DialogHeader>

        {fetching ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading template...</div>
        ) : (
          <div className="space-y-4">
            {/* Product hero image + name */}
            <div className="flex items-start gap-4">
              {heroImageUrl ? (
                <img
                  src={heroImageUrl}
                  alt={productLabel}
                  className="w-24 h-24 rounded-lg object-cover border bg-muted shrink-0"
                />
              ) : (
                <div className="w-24 h-24 rounded-lg border bg-muted flex items-center justify-center shrink-0">
                  <PackageCheck className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium text-sm">{productLabel}</p>
                {item.supplier_description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                    Supplier: "{item.supplier_description}"
                  </p>
                )}
              </div>
            </div>

            <ScrollArea className="max-h-[350px]">
              <div className="space-y-4 pr-3">
                {/* Conflicts section */}
                {conflicts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs font-medium uppercase tracking-wide">
                        Different values — check to overwrite
                      </span>
                    </div>
                    {conflicts.map((d) => (
                      <label
                        key={d.key}
                        className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={checkedFields.has(d.key)}
                          onCheckedChange={() => toggleField(d.key)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 text-sm">
                          <span className="font-medium">{d.label}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-muted-foreground line-through">{d.currentValue}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium">{d.templateValue}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {/* Fills section */}
                {fills.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Empty fields — will be filled
                    </span>
                    {fills.map((d) => (
                      <label
                        key={d.key}
                        className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={checkedFields.has(d.key)}
                          onCheckedChange={() => toggleField(d.key)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 text-sm">
                          <span className="font-medium">{d.label}</span>
                          <div className="mt-1">
                            <span className="font-medium">{d.templateValue}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {/* No diffs */}
                {diffs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No spec changes — the template matches current values.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={loading || fetching}>
            {loading ? 'Applying...' : 'Apply Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/items/item-detail/product-template-diff-dialog.tsx
git commit -m "feat: add ProductTemplateDiffDialog component for interactive template application"
```

---

## Task 2: Rewire item-assignment-bar.tsx to Use the Diff Dialog

**Files:**
- Modify: `src/components/items/item-detail/item-assignment-bar.tsx`

Replace the old `ConfirmDialog` and the `field_sources`-based auto-populate logic with the new diff dialog. The `handleConfirmProductChange` function now receives a list of field keys the user checked, and only writes those fields.

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { ConfirmDialog } from '@/components/shared'
import type { Item, ItemUpdate, FieldSources, FieldSource } from '@/lib/types'
```

With:
```typescript
import { ProductTemplateDiffDialog } from './product-template-diff-dialog'
import type { Item, ItemUpdate } from '@/lib/types'
```

- [ ] **Step 2: Replace `handleConfirmProductChange` with new logic**

Replace the entire `handleConfirmProductChange` function (lines 70-161) with:

```typescript
async function handleConfirmProductChange(fieldsToApply: string[]) {
  if (!pendingProductId) return

  try {
    const { data: pm } = await supabase
      .from('product_models')
      .select('*')
      .eq('id', pendingProductId)
      .single()

    const updates: ItemUpdate = { product_id: pendingProductId }

    if (pm) {
      // Always set category and device_category from the product (not user-selectable —
      // these are inherent to the product template, not debatable specs)
      if (pm.category_id) updates.category_id = pm.category_id
      if (pm.device_category) updates.device_category = pm.device_category

      // Only apply fields the user checked in the diff dialog
      for (const key of fieldsToApply) {
        const pmVal = pm[key as keyof typeof pm]
        if (pmVal != null) {
          ;(updates as Record<string, unknown>)[key] =
            typeof pmVal === 'string' ? pmVal.trim() : pmVal
        }
      }
    }

    updateItem.mutate(
      { id: item.id, updates },
      {
        onSuccess: () => {
          toast.success('Product updated')
          setPendingProductId(null)
          setConfirmOpen(false)
        },
        onError: (err) => {
          toast.error(`Failed to update product: ${err.message}`)
          setPendingProductId(null)
          setConfirmOpen(false)
        },
      },
    )
  } catch (err) {
    toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    setPendingProductId(null)
    setConfirmOpen(false)
  }
}
```

- [ ] **Step 3: Replace the ConfirmDialog JSX with ProductTemplateDiffDialog**

Replace the `<ConfirmDialog ... />` block (lines 247-259) with:

```tsx
<ProductTemplateDiffDialog
  open={confirmOpen}
  onOpenChange={(open) => { if (!open) handleCancelProductChange() }}
  item={item}
  pendingProductId={pendingProductId}
  loading={updateItem.isPending}
  onConfirm={handleConfirmProductChange}
/>
```

- [ ] **Step 4: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/items/item-detail/item-assignment-bar.tsx
git commit -m "feat: wire up ProductTemplateDiffDialog in assignment bar"
```

---

## Task 3: Remove field_sources Tracking from Editable Specs Card

**Files:**
- Modify: `src/components/items/item-detail/editable-specs-card.tsx`

Since the user is now the guardrail (via the diff dialog), we no longer need to track `field_sources` on manual edits. Remove all `field_sources` logic from `handleSave`.

- [ ] **Step 1: Remove FieldSources from import**

Change:
```typescript
import type { Item, ProductModel, ItemUpdate, FieldSources } from '@/lib/types'
```
To:
```typescript
import type { Item, ProductModel, ItemUpdate } from '@/lib/types'
```

- [ ] **Step 2: Simplify handleSave — remove field_sources tracking**

Remove the `currentSources`, `newSources`, and all `newSources[key] = 'user'` lines. Remove the `updates.field_sources = newSources` line at the end. The function should just build `updates` from changed fields and call `updateItem.mutate`.

Updated `handleSave`:
```typescript
function handleSave(values: ItemSpecsFormValues) {
  const updates: ItemUpdate = {}
  let hasChanges = false

  for (const key of TEXT_FIELDS) {
    const newVal = values[key] || null
    if (newVal !== (item[key as keyof Item] ?? null)) {
      ;(updates as Record<string, unknown>)[key] = newVal
      hasChanges = true
    }
  }

  for (const { key } of NUMBER_FIELDS) {
    const newVal = values[key as keyof ItemSpecsFormValues] as number | null | undefined
    const parsed = newVal != null && newVal !== (undefined as unknown) ? newVal : null
    if (parsed !== (item[key as keyof Item] ?? null)) {
      ;(updates as Record<string, unknown>)[key] = parsed
      hasChanges = true
    }
  }

  for (const key of BOOLEAN_FIELDS) {
    const newVal = values[key] ?? null
    if (newVal !== (item[key as keyof Item] ?? null)) {
      ;(updates as Record<string, unknown>)[key] = newVal
      hasChanges = true
    }
  }

  // IMEI fields
  for (const key of ['imei', 'imei2'] as const) {
    const newVal = values[key] || null
    if (newVal !== (item[key] ?? null)) {
      ;(updates as Record<string, unknown>)[key] = newVal
      hasChanges = true
    }
  }

  if (!hasChanges) {
    setEditing(false)
    return
  }

  updateItem.mutate(
    { id: item.id, updates },
    {
      onSuccess: () => {
        toast.success('Specs updated')
        setEditing(false)
      },
      onError: () => toast.error('Failed to update specs'),
    },
  )
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/items/item-detail/editable-specs-card.tsx
git commit -m "refactor: remove field_sources tracking from specs card (replaced by diff dialog)"
```

---

## Task 4: Clean Up field_sources Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Remove FieldSource and FieldSources types**

Remove these two lines from `src/lib/types.ts` (lines 68-69):
```typescript
export type FieldSource = 'template' | 'user'
export type FieldSources = Record<string, FieldSource>
```

- [ ] **Step 2: Search for any remaining references to FieldSource/FieldSources/field_sources in frontend code**

Run: `grep -r "FieldSource\|field_sources" src/`

If any hits remain, remove or update them.

- [ ] **Step 3: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "refactor: remove FieldSource types (no longer needed with diff dialog approach)"
```

---

## Task 5: Manual End-to-End Test

No code changes — just verification.

- [ ] **Step 1: Test conflict detection**

1. Open an item that already has specs (e.g., screen_size = 13.3, color = Silver)
2. Change the product template to one with different values (e.g., screen_size = 15.6, color = Space Gray)
3. Verify the diff dialog shows:
   - Product photo at top
   - Conflict rows for screen_size (13.3" → 15.6") and color (Silver → Space Gray) — **unchecked**
   - Any empty fields that would be filled — **pre-checked**

- [ ] **Step 2: Test selective overwrite**

1. Check only the color conflict checkbox, leave screen_size unchecked
2. Click Apply
3. Verify: color changed to Space Gray, screen_size stayed 13.3"

- [ ] **Step 3: Test empty fill**

1. Open an item with no specs at all
2. Assign a product template
3. Verify: all fields show in the "will be filled" section, pre-checked
4. Apply → all specs populate from template

- [ ] **Step 4: Test no-diff scenario**

1. Re-assign the same product template that's already assigned
2. Verify: dialog shows "No spec changes" message

- [ ] **Step 5: Test supplier description display**

1. Open an item with a `supplier_description` value
2. Assign a product template
3. Verify: supplier description text appears in the dialog for context
