-- Fix: the auto-populate trigger was assigning empty strings to numeric columns,
-- causing "invalid input syntax for type numeric" errors.
-- Use NULLIF to safely handle empty strings for all field types.

CREATE OR REPLACE FUNCTION auto_populate_item_from_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pm RECORD;
BEGIN
  -- Only run when product_id is set or changed to a non-null value
  IF NEW.product_id IS NOT NULL AND (OLD.product_id IS DISTINCT FROM NEW.product_id) THEN
    SELECT * INTO pm FROM product_models WHERE id = NEW.product_id;

    IF FOUND THEN
      -- Text fields: only fill if item field is NULL or empty
      IF COALESCE(NEW.brand, '') = '' THEN
        NEW.brand := NULLIF(pm.brand, '');
      END IF;

      IF COALESCE(NEW.model_name, '') = '' THEN
        NEW.model_name := NULLIF(pm.model_name, '');
      END IF;

      IF COALESCE(NEW.color, '') = '' THEN
        NEW.color := NULLIF(pm.color, '');
      END IF;

      IF COALESCE(NEW.cpu, '') = '' THEN
        NEW.cpu := NULLIF(pm.cpu, '');
      END IF;

      IF COALESCE(NEW.gpu, '') = '' THEN
        NEW.gpu := NULLIF(pm.gpu, '');
      END IF;

      IF COALESCE(NEW.os_family, '') = '' THEN
        NEW.os_family := NULLIF(pm.os_family, '');
      END IF;

      IF COALESCE(NEW.screen_size, '') = '' THEN
        NEW.screen_size := NULLIF(pm.screen_size, '');
      END IF;

      IF COALESCE(NEW.carrier, '') = '' THEN
        NEW.carrier := NULLIF(pm.carrier, '');
      END IF;

      IF COALESCE(NEW.keyboard_layout, '') = '' THEN
        NEW.keyboard_layout := NULLIF(pm.keyboard_layout, '');
      END IF;

      IF COALESCE(NEW.chipset, '') = '' THEN
        NEW.chipset := NULLIF(pm.chipset, '');
      END IF;

      IF COALESCE(NEW.ports, '') = '' THEN
        NEW.ports := NULLIF(pm.ports, '');
      END IF;

      IF COALESCE(NEW.form_factor, '') = '' THEN
        NEW.form_factor := NULLIF(pm.form_factor, '');
      END IF;

      IF COALESCE(NEW.other_features, '') = '' THEN
        NEW.other_features := NULLIF(pm.other_features, '');
      END IF;

      -- Numeric fields: only fill if item field is NULL
      IF NEW.ram_gb IS NULL AND pm.ram_gb IS NOT NULL THEN
        NEW.ram_gb := pm.ram_gb;
      END IF;

      IF NEW.storage_gb IS NULL AND pm.storage_gb IS NOT NULL THEN
        NEW.storage_gb := pm.storage_gb;
      END IF;

      IF NEW.year IS NULL AND pm.year IS NOT NULL THEN
        NEW.year := pm.year;
      END IF;

      IF NEW.imei_slot_count IS NULL AND pm.imei_slot_count IS NOT NULL THEN
        NEW.imei_slot_count := pm.imei_slot_count;
      END IF;

      -- Boolean fields: only fill if item field is NULL
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

      -- Always update category and device_category from product
      IF pm.category_id IS NOT NULL THEN
        NEW.category_id := pm.category_id;
      END IF;

      IF pm.device_category IS NOT NULL THEN
        NEW.device_category := pm.device_category;
      END IF;

      -- Rebuild short_description from final values
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
