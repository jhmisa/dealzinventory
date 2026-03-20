# Field Source Tracking for Product Template Assignment

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track whether each item spec field was set by a product template or manually by the user, so that switching product templates correctly overwrites template-sourced values while preserving user edits.

**Architecture:** Add a `field_sources` JSONB column to the `items` table that maps field names to `"template"` or `"user"`. The product template assignment logic reads this map to decide which fields to overwrite. Manual edits in the specs card mark fields as `"user"`.

**Tech Stack:** Supabase (PostgreSQL migration), React/TypeScript frontend changes only.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260320230000_add_field_sources.sql` | Create | Add `field_sources` JSONB column to items |
| `src/lib/database.types.ts` | Modify (lines 545, 597, 652) | Add `field_sources` to Row/Insert/Update types |
| `src/lib/types.ts` | Modify (add after line 67) | Add `FieldSources` type alias |
| `src/components/items/item-detail/item-assignment-bar.tsx` | Modify (lines 81-131) | Rewrite auto-populate to use field_sources |
| `src/components/items/item-detail/editable-specs-card.tsx` | Modify (lines 77-129) | Mark user-edited fields in field_sources on save |

---

## Chunk 1: Database & Types

### Task 1: Add `field_sources` column to items table

**Files:**
- Create: `supabase/migrations/20260320230000_add_field_sources.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add field_sources JSONB to track where each spec field value came from.
-- Values: "template" (set by product template assignment) or "user" (manually edited by staff).
-- Empty/missing keys are treated as overwritable by template (safe default for existing data).
ALTER TABLE items ADD COLUMN IF NOT EXISTS field_sources jsonb DEFAULT '{}';

COMMENT ON COLUMN items.field_sources IS 'Tracks source of each spec field value: "template" or "user". Missing keys treated as template-overwritable.';
```

- [ ] **Step 2: Apply the migration**

Run via Supabase MCP `apply_migration` tool or:
```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260320230000_add_field_sources.sql
git commit -m "feat: add field_sources JSONB column to items table"
```

---

### Task 2: Update TypeScript types

**Files:**
- Modify: `src/lib/database.types.ts` (items Row/Insert/Update sections)
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `field_sources` to `database.types.ts` items Row type**

In the `items.Row` type (around line 561, after `form_factor`), add:

```typescript
field_sources: Record<string, string> | null
```

- [ ] **Step 2: Add `field_sources` to `database.types.ts` items Insert type**

In the `items.Insert` type (around line 615, after `form_factor`), add:

```typescript
field_sources?: Record<string, string> | null
```

- [ ] **Step 3: Add `field_sources` to `database.types.ts` items Update type**

In the `items.Update` type (around line 670, after `form_factor`), add:

```typescript
field_sources?: Record<string, string> | null
```

- [ ] **Step 4: Add `FieldSources` type alias to `src/lib/types.ts`**

After line 67 (after `ParsedSpecs`), add:

```typescript
export type FieldSource = 'template' | 'user'
export type FieldSources = Record<string, FieldSource>
```

- [ ] **Step 5: Verify the app compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/database.types.ts src/lib/types.ts
git commit -m "feat: add FieldSources type for item field provenance tracking"
```

---

## Chunk 2: Product Template Assignment Logic

### Task 3: Rewrite auto-populate in item-assignment-bar.tsx

**Files:**
- Modify: `src/components/items/item-detail/item-assignment-bar.tsx` (lines 70-154)

The key behavior change: instead of "only fill empty fields", the logic becomes:
- **Source is `"template"` or missing** → overwrite with new template value
- **Source is `"user"`** → skip (preserve user edit)
- **Field is empty/null** → fill with template value
- All fields populated by the template get marked as `"template"` in `field_sources`

- [ ] **Step 1: Add FieldSources import**

At the top of `item-assignment-bar.tsx`, update the type import (line 17):

```typescript
import type { Item, ItemUpdate, FieldSources, FieldSource } from '@/lib/types'
```

- [ ] **Step 2: Rewrite `handleConfirmProductChange` function**

Replace the body of `handleConfirmProductChange` (lines 70-154) with:

```typescript
async function handleConfirmProductChange() {
  if (!pendingProductId) return

  try {
    const { data: pm } = await supabase
      .from('product_models')
      .select('*')
      .eq('id', pendingProductId)
      .single()

    const updates: ItemUpdate = { product_id: pendingProductId }
    const currentSources: FieldSources = (item.field_sources as FieldSources) ?? {}
    const newSources: FieldSources = { ...currentSources }

    if (pm) {
      // Always set category and device_category from product
      if (pm.category_id) updates.category_id = pm.category_id
      if (pm.device_category) updates.device_category = pm.device_category

      // Helper: should we write this field?
      // Yes if: source is "template" or missing (not "user"), OR field is empty
      const canOverwrite = (key: string, itemVal: unknown): boolean => {
        const source = currentSources[key] as FieldSource | undefined
        if (source === 'user') return false
        // source is "template" or missing — overwritable
        return true
      }

      // Text fields
      const textFields: (keyof ItemUpdate)[] = [
        'brand', 'model_name', 'color', 'cpu', 'gpu', 'os_family',
        'carrier', 'keyboard_layout', 'form_factor', 'other_features',
      ]
      for (const key of textFields) {
        const itemVal = item[key as keyof Item]
        const pmVal = pm[key as keyof typeof pm]
        if (pmVal && typeof pmVal === 'string' && pmVal.trim()) {
          if (canOverwrite(key, itemVal)) {
            (updates as Record<string, unknown>)[key] = pmVal.trim()
            newSources[key] = 'template'
          }
        }
      }

      // Numeric fields
      const numFields: (keyof ItemUpdate)[] = ['ram_gb', 'storage_gb', 'year', 'screen_size']
      for (const key of numFields) {
        const itemVal = item[key as keyof Item]
        const pmVal = pm[key as keyof typeof pm]
        if (pmVal != null) {
          const num = Number(pmVal)
          if (!isNaN(num) && canOverwrite(key, itemVal)) {
            (updates as Record<string, unknown>)[key] = num
            newSources[key] = 'template'
          }
        }
      }

      // Boolean fields
      const boolFields: (keyof ItemUpdate)[] = ['has_touchscreen', 'is_unlocked']
      for (const key of boolFields) {
        const itemVal = item[key as keyof Item]
        const pmVal = pm[key as keyof typeof pm]
        if (pmVal != null && typeof pmVal === 'boolean') {
          if (canOverwrite(key, itemVal)) {
            (updates as Record<string, unknown>)[key] = pmVal
            newSources[key] = 'template'
          }
        }
      }

      // Persist updated field_sources
      updates.field_sources = newSources
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

- [ ] **Step 3: Verify the app compiles and test manually**

```bash
npx tsc --noEmit
```

Manual test:
1. Open an item with no product assigned
2. Assign a product template → fields populate, check DB that `field_sources` has entries like `{"color": "template", "brand": "template", ...}`
3. Switch to a different product template → template-sourced fields overwrite correctly
4. Verify empty fields still get filled

- [ ] **Step 4: Commit**

```bash
git add src/components/items/item-detail/item-assignment-bar.tsx
git commit -m "feat: template assignment overwrites template-sourced fields, preserves user edits"
```

---

## Chunk 3: Mark User Edits

### Task 4: Update field_sources on manual spec edits

**Files:**
- Modify: `src/components/items/item-detail/editable-specs-card.tsx` (lines 77-129)

When a user saves changes via the specs edit form, any field they changed should be marked as `"user"` in `field_sources`.

- [ ] **Step 1: Add FieldSources import**

Update imports at line 14:

```typescript
import type { Item, ProductModel, ItemUpdate, FieldSources, FieldSource } from '@/lib/types'
```

- [ ] **Step 2: Update `handleSave` to track user-edited fields**

Modify the `handleSave` function (lines 77-130) to build up `field_sources` updates for any changed field:

```typescript
function handleSave(values: ItemSpecsFormValues) {
  const updates: ItemUpdate = {}
  const currentSources: FieldSources = (item.field_sources as FieldSources) ?? {}
  const newSources: FieldSources = { ...currentSources }
  let hasChanges = false

  for (const key of TEXT_FIELDS) {
    const newVal = values[key] || null
    if (newVal !== (item[key as keyof Item] ?? null)) {
      ;(updates as Record<string, unknown>)[key] = newVal
      newSources[key] = 'user'
      hasChanges = true
    }
  }

  for (const { key } of NUMBER_FIELDS) {
    const newVal = values[key as keyof ItemSpecsFormValues] as number | null | undefined
    const parsed = newVal != null && newVal !== (undefined as unknown) ? newVal : null
    if (parsed !== (item[key as keyof Item] ?? null)) {
      ;(updates as Record<string, unknown>)[key] = parsed
      newSources[key] = 'user'
      hasChanges = true
    }
  }

  for (const key of BOOLEAN_FIELDS) {
    const newVal = values[key] ?? null
    if (newVal !== (item[key as keyof Item] ?? null)) {
      ;(updates as Record<string, unknown>)[key] = newVal
      newSources[key] = 'user'
      hasChanges = true
    }
  }

  // IMEI fields
  for (const key of ['imei', 'imei2'] as const) {
    const newVal = values[key] || null
    if (newVal !== (item[key] ?? null)) {
      ;(updates as Record<string, unknown>)[key] = newVal
      newSources[key] = 'user'
      hasChanges = true
    }
  }

  if (!hasChanges) {
    setEditing(false)
    return
  }

  // Include updated field_sources in the save
  updates.field_sources = newSources

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

- [ ] **Step 3: Verify the app compiles and test manually**

```bash
npx tsc --noEmit
```

Manual test:
1. Open an item that has a product template assigned (with `field_sources` showing `"template"` entries)
2. Click Edit on Specs, change the color manually, Save
3. Check DB — `field_sources.color` should now be `"user"`
4. Reassign a different product template → color should NOT be overwritten
5. Other template-sourced fields SHOULD be overwritten

- [ ] **Step 4: Commit**

```bash
git add src/components/items/item-detail/editable-specs-card.tsx
git commit -m "feat: mark manually edited spec fields as user-sourced in field_sources"
```

---

## Chunk 4: Update audit trigger (if needed)

### Task 5: Add field_sources to audit trigger tracked columns

**Files:**
- Modify: `supabase/migrations/20260320220000_fix_item_audit_columns.sql` (or create new migration)

The existing audit trigger tracks changes to spec fields. We should also track changes to `field_sources` so there's a record of when source attribution changes.

- [ ] **Step 1: Check if the audit trigger needs updating**

The current trigger (`log_item_changes`) tracks specific columns. `field_sources` is a metadata column, not a user-visible spec — **skip adding it to the audit trigger**. It would create noisy logs every time a template is assigned or a field is edited. The audit already captures the actual field value changes, which is what matters.

**Decision: No migration needed for this task. Skip.**

- [ ] **Step 2: Final end-to-end manual test**

Full scenario test:
1. Create or find an item with no product assigned, no specs filled
2. Assign "HP ELITEBOOK830G6 (SILVER)" → specs auto-populate (color=Silver, brand=HP, etc.), `field_sources` shows all as `"template"`
3. Manually edit RAM to 16 GB → `field_sources.ram_gb` becomes `"user"`
4. Reassign to "HP ELITEBOOK830G6 (BLACK)" → color changes to Black (was template-sourced), RAM stays 16 GB (user-sourced)
5. Confirm the behavior matches the requirement

- [ ] **Step 3: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "feat: field source tracking for product template assignment"
```
