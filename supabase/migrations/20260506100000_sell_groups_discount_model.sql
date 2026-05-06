-- =====================================================================
-- Sell Groups: convert base_price → discount_amount with item sync
--
-- Replaces sell_groups.base_price with discount_amount and makes the sell
-- group the single writer of items.discount for its members.
--
-- Existing data: discount_amount auto-computed from
--   discount_amount = MAX(0, items[0].selling_price - base_price)
-- when items in the group have a uniform selling_price AND
-- base_price <= selling_price. Otherwise discount_amount = 0.
-- Anomaly groups (mixed selling_price or base_price > selling_price)
-- are kept as-is for manual cleanup post-migration.
--
-- Already applied to remote dev DB on 2026-05-06.
-- =====================================================================

-- Step 1: Add discount_amount column (no CHECK yet — we backfill first, add CHECK after)
ALTER TABLE sell_groups
  ADD COLUMN discount_amount integer NOT NULL DEFAULT 0;

-- Step 2: Auto-compute discount_amount per existing group
WITH per_group AS (
  SELECT
    sg.id AS sg_id,
    sg.base_price,
    count(DISTINCT i.selling_price) = 1 AS is_uniform_sp,
    min(i.selling_price) AS rep_sp
  FROM sell_groups sg
  JOIN sell_group_items sgi ON sgi.sell_group_id = sg.id
  JOIN items i ON i.id = sgi.item_id
  GROUP BY sg.id, sg.base_price
)
UPDATE sell_groups sg
SET discount_amount = CASE
  WHEN pg.is_uniform_sp AND sg.base_price <= pg.rep_sp
    THEN GREATEST(0, (pg.rep_sp - sg.base_price)::integer)
  ELSE 0
END
FROM per_group pg
WHERE pg.sg_id = sg.id;

-- Step 3: Sync items.discount from owning group's discount_amount
-- (clean groups → real discount; anomaly groups → 0; manual per-item discounts overwritten)
UPDATE items i
SET discount = sg.discount_amount
FROM sell_group_items sgi
JOIN sell_groups sg ON sg.id = sgi.sell_group_id
WHERE sgi.item_id = i.id;

-- Step 4: Drop base_price column
ALTER TABLE sell_groups DROP COLUMN base_price;

-- Step 5: Add non-negative CHECK constraint on discount_amount (post-backfill)
ALTER TABLE sell_groups
  ADD CONSTRAINT chk_sell_groups_discount_nonneg CHECK (discount_amount >= 0);

-- =====================================================================
-- Trigger 1: keep items.discount in sync when items join/leave a group
-- =====================================================================
CREATE OR REPLACE FUNCTION sync_item_discount_on_group_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE items i
       SET discount = sg.discount_amount
      FROM sell_groups sg
     WHERE i.id = NEW.item_id AND sg.id = NEW.sell_group_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE items SET discount = 0 WHERE id = OLD.item_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_item_discount_on_sgi
AFTER INSERT OR DELETE ON sell_group_items
FOR EACH ROW EXECUTE FUNCTION sync_item_discount_on_group_change();

-- =====================================================================
-- Trigger 2: re-sync all members when a group's discount_amount changes
-- =====================================================================
CREATE OR REPLACE FUNCTION resync_items_on_group_discount_update()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.discount_amount IS DISTINCT FROM OLD.discount_amount) THEN
    UPDATE items
       SET discount = NEW.discount_amount
     WHERE id IN (SELECT item_id FROM sell_group_items WHERE sell_group_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_resync_items_on_sg_discount
AFTER UPDATE OF discount_amount ON sell_groups
FOR EACH ROW EXECUTE FUNCTION resync_items_on_group_discount_update();

-- =====================================================================
-- Trigger 3: enforce uniformity invariant on insert
-- (selling_price + condition_grade + color + ram_gb + storage_gb must match all existing members)
-- =====================================================================
CREATE OR REPLACE FUNCTION enforce_sell_group_uniformity()
RETURNS TRIGGER AS $$
DECLARE
  new_sp numeric;
  new_grade text;
  new_color text;
  new_ram text;
  new_storage text;
  conflict_field text;
BEGIN
  SELECT i.selling_price,
         i.condition_grade::text,
         COALESCE(i.color, pm.color),
         COALESCE(i.ram_gb, pm.ram_gb),
         COALESCE(i.storage_gb, pm.storage_gb)
    INTO new_sp, new_grade, new_color, new_ram, new_storage
    FROM items i
    LEFT JOIN product_models pm ON pm.id = i.product_id
   WHERE i.id = NEW.item_id;

  SELECT field INTO conflict_field
  FROM (
    SELECT
      CASE
        WHEN i2.selling_price IS DISTINCT FROM new_sp THEN 'selling_price'
        WHEN i2.condition_grade::text IS DISTINCT FROM new_grade THEN 'condition_grade'
        WHEN COALESCE(i2.color, pm2.color) IS DISTINCT FROM new_color THEN 'color'
        WHEN COALESCE(i2.ram_gb, pm2.ram_gb) IS DISTINCT FROM new_ram THEN 'ram_gb'
        WHEN COALESCE(i2.storage_gb, pm2.storage_gb) IS DISTINCT FROM new_storage THEN 'storage_gb'
        ELSE NULL
      END AS field
    FROM sell_group_items sgi2
    JOIN items i2 ON i2.id = sgi2.item_id
    LEFT JOIN product_models pm2 ON pm2.id = i2.product_id
    WHERE sgi2.sell_group_id = NEW.sell_group_id
  ) s
  WHERE field IS NOT NULL
  LIMIT 1;

  IF conflict_field IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add item to sell group: % differs from existing members', conflict_field;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_sell_group_uniformity
BEFORE INSERT ON sell_group_items
FOR EACH ROW EXECUTE FUNCTION enforce_sell_group_uniformity();
