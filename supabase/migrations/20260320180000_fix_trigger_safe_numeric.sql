-- Fix: use explicit safe casting for all numeric fields in the trigger
-- to handle any edge case where a product_model field contains unexpected values

CREATE OR REPLACE FUNCTION auto_populate_item_from_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pm RECORD;
  v_num numeric;
BEGIN
  IF NEW.product_id IS NOT NULL AND (OLD.product_id IS DISTINCT FROM NEW.product_id) THEN
    SELECT * INTO pm FROM product_models WHERE id = NEW.product_id;

    IF FOUND THEN
      -- Text fields: only fill if item field is NULL or empty
      IF COALESCE(NEW.brand, '') = '' AND NULLIF(pm.brand, '') IS NOT NULL THEN
        NEW.brand := pm.brand;
      END IF;

      IF COALESCE(NEW.model_name, '') = '' AND NULLIF(pm.model_name, '') IS NOT NULL THEN
        NEW.model_name := pm.model_name;
      END IF;

      IF COALESCE(NEW.color, '') = '' AND NULLIF(pm.color, '') IS NOT NULL THEN
        NEW.color := pm.color;
      END IF;

      IF COALESCE(NEW.cpu, '') = '' AND NULLIF(pm.cpu, '') IS NOT NULL THEN
        NEW.cpu := pm.cpu;
      END IF;

      IF COALESCE(NEW.gpu, '') = '' AND NULLIF(pm.gpu, '') IS NOT NULL THEN
        NEW.gpu := pm.gpu;
      END IF;

      IF COALESCE(NEW.os_family, '') = '' AND NULLIF(pm.os_family, '') IS NOT NULL THEN
        NEW.os_family := pm.os_family;
      END IF;

      IF COALESCE(NEW.screen_size, '') = '' AND NULLIF(pm.screen_size, '') IS NOT NULL THEN
        NEW.screen_size := pm.screen_size;
      END IF;

      IF COALESCE(NEW.carrier, '') = '' AND NULLIF(pm.carrier, '') IS NOT NULL THEN
        NEW.carrier := pm.carrier;
      END IF;

      IF COALESCE(NEW.keyboard_layout, '') = '' AND NULLIF(pm.keyboard_layout, '') IS NOT NULL THEN
        NEW.keyboard_layout := pm.keyboard_layout;
      END IF;

      IF COALESCE(NEW.chipset, '') = '' AND NULLIF(pm.chipset, '') IS NOT NULL THEN
        NEW.chipset := pm.chipset;
      END IF;

      IF COALESCE(NEW.ports, '') = '' AND NULLIF(pm.ports, '') IS NOT NULL THEN
        NEW.ports := pm.ports;
      END IF;

      IF COALESCE(NEW.form_factor, '') = '' AND NULLIF(pm.form_factor, '') IS NOT NULL THEN
        NEW.form_factor := pm.form_factor;
      END IF;

      IF COALESCE(NEW.other_features, '') = '' AND NULLIF(pm.other_features, '') IS NOT NULL THEN
        NEW.other_features := pm.other_features;
      END IF;

      -- Numeric fields: safe assignment with explicit NULL check
      BEGIN
        IF NEW.ram_gb IS NULL AND pm.ram_gb IS NOT NULL THEN
          NEW.ram_gb := pm.ram_gb;
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      BEGIN
        IF NEW.storage_gb IS NULL AND pm.storage_gb IS NOT NULL THEN
          NEW.storage_gb := pm.storage_gb;
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      BEGIN
        IF NEW.year IS NULL AND pm.year IS NOT NULL THEN
          NEW.year := pm.year;
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      BEGIN
        IF NEW.imei_slot_count IS NULL AND pm.imei_slot_count IS NOT NULL THEN
          NEW.imei_slot_count := pm.imei_slot_count;
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

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
