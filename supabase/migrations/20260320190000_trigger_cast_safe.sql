-- Final fix: cast all product_model values through text->type conversion
-- to prevent "invalid input syntax for type numeric" errors.
-- The root cause is product_models columns that store empty strings
-- instead of NULL for numeric-typed columns.

CREATE OR REPLACE FUNCTION auto_populate_item_from_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pm RECORD;
  v_text text;
BEGIN
  IF NEW.product_id IS NOT NULL AND (OLD.product_id IS DISTINCT FROM NEW.product_id) THEN
    SELECT * INTO pm FROM product_models WHERE id = NEW.product_id;

    IF FOUND THEN
      -- Text fields: only fill if item field is NULL or empty
      IF COALESCE(NEW.brand, '') = '' THEN
        NEW.brand := NULLIF(TRIM(COALESCE(pm.brand::text, '')), '');
      END IF;

      IF COALESCE(NEW.model_name, '') = '' THEN
        NEW.model_name := NULLIF(TRIM(COALESCE(pm.model_name::text, '')), '');
      END IF;

      IF COALESCE(NEW.color, '') = '' THEN
        NEW.color := NULLIF(TRIM(COALESCE(pm.color::text, '')), '');
      END IF;

      IF COALESCE(NEW.cpu, '') = '' THEN
        NEW.cpu := NULLIF(TRIM(COALESCE(pm.cpu::text, '')), '');
      END IF;

      IF COALESCE(NEW.gpu, '') = '' THEN
        NEW.gpu := NULLIF(TRIM(COALESCE(pm.gpu::text, '')), '');
      END IF;

      IF COALESCE(NEW.os_family, '') = '' THEN
        NEW.os_family := NULLIF(TRIM(COALESCE(pm.os_family::text, '')), '');
      END IF;

      IF COALESCE(NEW.screen_size, '') = '' THEN
        NEW.screen_size := NULLIF(TRIM(COALESCE(pm.screen_size::text, '')), '');
      END IF;

      IF COALESCE(NEW.carrier, '') = '' THEN
        NEW.carrier := NULLIF(TRIM(COALESCE(pm.carrier::text, '')), '');
      END IF;

      IF COALESCE(NEW.keyboard_layout, '') = '' THEN
        NEW.keyboard_layout := NULLIF(TRIM(COALESCE(pm.keyboard_layout::text, '')), '');
      END IF;

      IF COALESCE(NEW.chipset, '') = '' THEN
        NEW.chipset := NULLIF(TRIM(COALESCE(pm.chipset::text, '')), '');
      END IF;

      IF COALESCE(NEW.ports, '') = '' THEN
        NEW.ports := NULLIF(TRIM(COALESCE(pm.ports::text, '')), '');
      END IF;

      IF COALESCE(NEW.form_factor, '') = '' THEN
        NEW.form_factor := NULLIF(TRIM(COALESCE(pm.form_factor::text, '')), '');
      END IF;

      IF COALESCE(NEW.other_features, '') = '' THEN
        NEW.other_features := NULLIF(TRIM(COALESCE(pm.other_features::text, '')), '');
      END IF;

      -- Numeric fields: convert to text first, check for empty/non-numeric, then assign
      IF NEW.ram_gb IS NULL THEN
        v_text := NULLIF(TRIM(COALESCE(pm.ram_gb::text, '')), '');
        IF v_text IS NOT NULL AND v_text ~ '^\d+(\.\d+)?$' THEN
          NEW.ram_gb := v_text::numeric;
        END IF;
      END IF;

      IF NEW.storage_gb IS NULL THEN
        v_text := NULLIF(TRIM(COALESCE(pm.storage_gb::text, '')), '');
        IF v_text IS NOT NULL AND v_text ~ '^\d+(\.\d+)?$' THEN
          NEW.storage_gb := v_text::numeric;
        END IF;
      END IF;

      IF NEW.year IS NULL THEN
        v_text := NULLIF(TRIM(COALESCE(pm.year::text, '')), '');
        IF v_text IS NOT NULL AND v_text ~ '^\d+$' THEN
          NEW.year := v_text::integer;
        END IF;
      END IF;

      IF NEW.imei_slot_count IS NULL THEN
        v_text := NULLIF(TRIM(COALESCE(pm.imei_slot_count::text, '')), '');
        IF v_text IS NOT NULL AND v_text ~ '^\d+$' THEN
          NEW.imei_slot_count := v_text::integer;
        END IF;
      END IF;

      -- Boolean fields
      IF NEW.has_touchscreen IS NULL AND pm.has_touchscreen IS NOT NULL THEN
        NEW.has_touchscreen := pm.has_touchscreen;
      END IF;

      IF NEW.has_thunderbolt IS NULL AND pm.has_thunderbolt IS NOT NULL THEN
        NEW.has_thunderbolt := pm.has_thunderbolt;
      END IF;

      IF NEW.supports_stylus IS NULL AND pm.supports_stylus IS NOT NULL THEN
        NEW.supports_stylus := pm.supports_stylus;
      END IF;

      IF NEW.has_cellular IS NULL AND pm.has_cellular IS NOT NULL THEN
        NEW.has_cellular := pm.has_cellular;
      END IF;

      IF NEW.is_unlocked IS NULL AND pm.is_unlocked IS NOT NULL THEN
        NEW.is_unlocked := pm.is_unlocked;
      END IF;

      -- Always update category and device_category
      IF pm.category_id IS NOT NULL THEN
        NEW.category_id := pm.category_id;
      END IF;

      IF pm.device_category IS NOT NULL THEN
        NEW.device_category := pm.device_category;
      END IF;

      -- Rebuild short_description
      NEW.short_description := CONCAT_WS(' ',
        NULLIF(NEW.brand, ''),
        NULLIF(NEW.model_name, ''),
        NULLIF(NEW.color, '')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
