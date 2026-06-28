-- Backorder follow-ups #2 — collapse duplicate ACTIVE lines + add active-SKU unique index.
--
-- Issue: the same supplier listing was added twice (confirmed: B000003 == B000004, same
-- product_id / grade A / 256 / Desert Titanium / iosys URL …/350998) because neither
-- createBackorderLine nor the Add-Backorder dialog had a uniqueness guard. The app now has
-- a pre-submit guard (services/backorders.ts findExistingBackorderLine); this migration adds
-- a DB backstop and cleans the existing dupes first so the index can build.

-- 1) Collapse existing duplicate ACTIVE lines to the OLDEST per SKU identity, closing the
--    rest. No ARCHIVED enum value exists, so use CLOSED (preserves the row + its media).
--    Only closes dupes with NO order_items referencing them (a committed pre-order must not
--    be silently closed — if that ever blocks the index build below it needs human review).
WITH ranked AS (
  SELECT
    bl.id,
    row_number() OVER (
      PARTITION BY bl.product_id, bl.condition_grade,
                   COALESCE(bl.storage_gb, -1), lower(COALESCE(bl.color, ''))
      ORDER BY bl.created_at ASC, bl.backorder_code ASC
    ) AS rn
  FROM public.backorder_lines bl
  WHERE bl.status = 'ACTIVE'
)
UPDATE public.backorder_lines bl
SET status = 'CLOSED'
FROM ranked
WHERE bl.id = ranked.id
  AND ranked.rn > 1
  AND NOT EXISTS (
    SELECT 1 FROM public.order_items oi WHERE oi.backorder_line_id = bl.id
  );

-- 2) Backstop unique index. Scoped to status='ACTIVE' so re-adding after a line is closed
--    still works. Batches of the same SKU are handled via quantity_total, not extra lines,
--    so a single ACTIVE line per SKU identity is the correct invariant.
CREATE UNIQUE INDEX IF NOT EXISTS backorder_lines_active_sku_uniq
  ON public.backorder_lines (
    product_id,
    condition_grade,
    COALESCE(storage_gb, -1),
    lower(COALESCE(color, ''))
  )
  WHERE status = 'ACTIVE';
