-- get_item_full_specs: structured per-unit/model spec lookup for the messaging AI's
-- get_item_specs tool. Code-first (exact P-code / G-code), else fuzzy model-name match
-- returning a representative AVAILABLE unit. Returns a single row (or none).
--
-- Field sourcing rules (reconciled against the LIVE schema, not just the plan draft):
--   ITEM-ONLY columns (no product_models counterpart) -> use i.<field> directly:
--     battery_health_pct, condition_grade, condition_notes, selling_price, discount
--   PRODUCT_MODELS-ONLY columns (NOT present on items) -> use pm.<field> directly:
--     has_cellular, chipset, supports_stylus, ports
--     (verified: information_schema shows these four do not exist on public.items)
--   Columns present on BOTH -> COALESCE(i.<field>, pm.<field>):
--     brand, model_name, model_number, is_unlocked, carrier, has_touchscreen,
--     cpu, gpu, ram_gb, storage_gb, screen_size, os_family, color, year
--
-- The G-code branch mirrors 20260619000000_sell_groups_rich_description.sql:
--   representative AVAILABLE member via LATERAL (ORDER BY item_code LIMIT 1),
--   effective price = GREATEST(0, COALESCE(MIN(selling_price of AVAILABLE members),0)
--                               - COALESCE(sg.discount_amount, 0)).
-- Fuzzy matching uses public.search_matches (20260629120000_reusable_fuzzy_search.sql).
--
-- See docs/superpowers/plans/2026-07-02-ai-training-memory-backend.md (Task 1.1).

CREATE OR REPLACE FUNCTION get_item_full_specs(
  p_code text DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS TABLE (
  resolved_by text,
  code text,
  brand text,
  model_name text,
  model_number text,
  condition_grade text,
  battery_health_pct integer,
  has_cellular boolean,
  is_unlocked boolean,
  carrier text,
  has_touchscreen boolean,
  supports_stylus boolean,
  cpu text,
  gpu text,
  chipset text,
  ram_gb text,
  storage_gb text,
  screen_size numeric,
  os_family text,
  ports text,
  color text,
  year integer,
  condition_notes text,
  price numeric,
  units_may_vary boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_match_count int;
BEGIN
  -- 1. Exact P-code — a specific physical unit (any status; the customer may ask about a
  --    reserved/held listing they saw in an ad).
  IF v_code ~ '^P\d+$' THEN
    RETURN QUERY
    SELECT
      'code'::text, i.item_code,
      COALESCE(i.brand, pm.brand), COALESCE(i.model_name, pm.model_name),
      COALESCE(i.model_number, pm.model_number), i.condition_grade::text,
      i.battery_health_pct,
      pm.has_cellular, COALESCE(i.is_unlocked, pm.is_unlocked),
      COALESCE(i.carrier, pm.carrier), COALESCE(i.has_touchscreen, pm.has_touchscreen),
      pm.supports_stylus,
      COALESCE(i.cpu, pm.cpu), COALESCE(i.gpu, pm.gpu), pm.chipset,
      COALESCE(i.ram_gb, pm.ram_gb), COALESCE(i.storage_gb, pm.storage_gb),
      COALESCE(i.screen_size, pm.screen_size), COALESCE(i.os_family, pm.os_family),
      pm.ports, COALESCE(i.color, pm.color), COALESCE(i.year, pm.year),
      i.condition_notes,
      GREATEST(0, COALESCE(i.selling_price, 0) - COALESCE(i.discount, 0)),
      false
    FROM items i
    LEFT JOIN product_models pm ON pm.id = i.product_id
    WHERE i.item_code = v_code
    LIMIT 1;
    RETURN;
  END IF;

  -- 2. Exact G-code — sell group; report a representative AVAILABLE member's specs.
  IF v_code ~ '^G\d+$' THEN
    RETURN QUERY
    SELECT
      'code'::text, sg.sell_group_code,
      COALESCE(rep.brand, pm.brand), COALESCE(rep.model_name, pm.model_name),
      COALESCE(rep.model_number, pm.model_number), rep.condition_grade::text,
      rep.battery_health_pct,
      pm.has_cellular, COALESCE(rep.is_unlocked, pm.is_unlocked),
      COALESCE(rep.carrier, pm.carrier), COALESCE(rep.has_touchscreen, pm.has_touchscreen),
      pm.supports_stylus,
      COALESCE(rep.cpu, pm.cpu), COALESCE(rep.gpu, pm.gpu), pm.chipset,
      COALESCE(rep.ram_gb, pm.ram_gb), COALESCE(rep.storage_gb, pm.storage_gb),
      COALESCE(rep.screen_size, pm.screen_size), COALESCE(rep.os_family, pm.os_family),
      pm.ports, COALESCE(rep.color, pm.color), COALESCE(rep.year, pm.year),
      rep.condition_notes,
      GREATEST(0, COALESCE((
        SELECT MIN(i2.selling_price) FROM sell_group_items sgi2
        JOIN items i2 ON i2.id = sgi2.item_id
        WHERE sgi2.sell_group_id = sg.id AND i2.item_status = 'AVAILABLE'
      ), 0) - COALESCE(sg.discount_amount, 0)),
      (SELECT count(*) FROM sell_group_items sgi3
       JOIN items i3 ON i3.id = sgi3.item_id
       WHERE sgi3.sell_group_id = sg.id AND i3.item_status = 'AVAILABLE') > 1
    FROM sell_groups sg
    LEFT JOIN product_models pm ON pm.id = sg.product_id
    LEFT JOIN LATERAL (
      SELECT i.* FROM sell_group_items sgi
      JOIN items i ON i.id = sgi.item_id
      WHERE sgi.sell_group_id = sg.id AND i.item_status = 'AVAILABLE'
      ORDER BY i.item_code
      LIMIT 1
    ) rep ON true
    WHERE sg.sell_group_code = v_code
      AND rep.id IS NOT NULL  -- guard: no row if group has zero AVAILABLE members
    LIMIT 1;
    RETURN;
  END IF;

  -- 3. Fuzzy model-name match → representative AVAILABLE unit; flag if more than one matches.
  --    Haystack is intentionally narrower than search_available_inventory (spec lookup, not shop search).
  IF coalesce(btrim(p_query), '') <> '' THEN
    SELECT count(*) INTO v_match_count
    FROM items i
    LEFT JOIN product_models pm ON pm.id = i.product_id
    WHERE i.item_status = 'AVAILABLE'
      AND public.search_matches(
            concat_ws(' ', i.item_code, COALESCE(i.brand, pm.brand), COALESCE(i.model_name, pm.model_name),
                      COALESCE(i.model_number, pm.model_number), COALESCE(i.color, pm.color)),
            p_query);

    RETURN QUERY
    SELECT
      'model'::text, i.item_code,
      COALESCE(i.brand, pm.brand), COALESCE(i.model_name, pm.model_name),
      COALESCE(i.model_number, pm.model_number), i.condition_grade::text,
      i.battery_health_pct,
      pm.has_cellular, COALESCE(i.is_unlocked, pm.is_unlocked),
      COALESCE(i.carrier, pm.carrier), COALESCE(i.has_touchscreen, pm.has_touchscreen),
      pm.supports_stylus,
      COALESCE(i.cpu, pm.cpu), COALESCE(i.gpu, pm.gpu), pm.chipset,
      COALESCE(i.ram_gb, pm.ram_gb), COALESCE(i.storage_gb, pm.storage_gb),
      COALESCE(i.screen_size, pm.screen_size), COALESCE(i.os_family, pm.os_family),
      pm.ports, COALESCE(i.color, pm.color), COALESCE(i.year, pm.year),
      i.condition_notes,
      GREATEST(0, COALESCE(i.selling_price, 0) - COALESCE(i.discount, 0)),
      v_match_count > 1
    FROM items i
    LEFT JOIN product_models pm ON pm.id = i.product_id
    WHERE i.item_status = 'AVAILABLE'
      AND public.search_matches(
            concat_ws(' ', i.item_code, COALESCE(i.brand, pm.brand), COALESCE(i.model_name, pm.model_name),
                      COALESCE(i.model_number, pm.model_number), COALESCE(i.color, pm.color)),
            p_query)
    ORDER BY i.item_code
    LIMIT 1;
    RETURN;
  END IF;

  RETURN; -- nothing to resolve
END;
$$;

GRANT EXECUTE ON FUNCTION get_item_full_specs(text, text) TO anon, authenticated, service_role;
