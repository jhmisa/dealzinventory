# Unified Returns Page

## Summary

Consolidate the separate Supplier Returns and Inventory Removals pages into a single "Returns" page with two tabs. Reduces sidebar clutter and groups related functionality.

## URL Structure

| Page | URL |
|------|-----|
| Returns list (supplier tab) | `/admin/returns?tab=supplier` |
| Returns list (removals tab) | `/admin/returns?tab=removals` |
| Supplier return detail | `/admin/returns/supplier/:id` |
| Inventory removal detail | `/admin/returns/removals/:id` |

Default tab when no `?tab` param: `supplier`.

## Redirects

Old URLs redirect to new ones (preserves bookmarks):
- `/admin/supplier-returns` → `/admin/returns?tab=supplier`
- `/admin/inventory-removals` → `/admin/returns?tab=removals`
- `/admin/supplier-returns/:id` → `/admin/returns/supplier/:id`
- `/admin/inventory-removals/:id` → `/admin/returns/removals/:id`

## Sidebar

Replace the two separate nav items ("Supplier Returns" and "Removals") with a single "Returns" item using the `Undo2` icon, linking to `/admin/returns`.

## Page Layout

The `/admin/returns` page uses shadcn Tabs component:
- Tab "Supplier Returns" — renders the existing supplier returns list (search, status filter tabs, table)
- Tab "Removals" — renders the existing inventory removals list (search, status filter tabs, table)

Tab selection is controlled by the `?tab` URL search param. Switching tabs updates the URL without a page reload.

## Detail Pages

Existing detail page components are reused unchanged, except:
- Back button / breadcrumb links updated to `/admin/returns?tab=supplier` or `/admin/returns?tab=removals`

## Files

### New
- `src/pages/admin/returns.tsx` — unified page, extracts list content from the two existing pages

### Modified
- `src/routes.tsx` — new routes + redirects
- `src/components/layout/sidebar.tsx` — single "Returns" nav item
- `src/pages/admin/supplier-return-detail.tsx` — update back navigation
- `src/pages/admin/inventory-removal-detail.tsx` — update back navigation

### Deleted
- `src/pages/admin/supplier-returns.tsx`
- `src/pages/admin/inventory-removals.tsx`
