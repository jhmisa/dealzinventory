-- Replace the auto-populate trigger on items to only fill BLANK fields
-- when a product_model is assigned (product_id changes).
-- Existing non-null values on the item are preserved.

-- Drop existing trigger and function (created outside migrations)
DROP TRIGGER IF EXISTS trg_auto_populate_from_product ON items;
DROP FUNCTION IF EXISTS auto_populate_item_from_product();

-- Create the replacement function
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
      -- Only fill fields that are currently NULL or empty on the item
      IF NEW.brand IS NULL OR NEW.brand = '' THEN
        NEW.brand := pm.brand;
      END IF;

      IF NEW.model_name IS NULL OR NEW.model_name = '' THEN
        NEW.model_name := pm.model_name;
      END IF;

      IF NEW.color IS NULL OR NEW.color = '' THEN
        NEW.color := pm.color;
      END IF;

      IF NEW.cpu IS NULL OR NEW.cpu = '' THEN
        NEW.cpu := pm.cpu;
      END IF;

      IF NEW.gpu IS NULL OR NEW.gpu = '' THEN
        NEW.gpu := pm.gpu;
      END IF;

      IF NEW.os_family IS NULL OR NEW.os_family = '' THEN
        NEW.os_family := pm.os_family;
      END IF;

      IF NEW.screen_size IS NULL OR NEW.screen_size = '' THEN
        NEW.screen_size := pm.screen_size;
      END IF;

      IF NEW.ram_gb IS NULL THEN
        NEW.ram_gb := pm.ram_gb;
      END IF;

      IF NEW.storage_gb IS NULL THEN
        NEW.storage_gb := pm.storage_gb;
      END IF;

      IF NEW.carrier IS NULL OR NEW.carrier = '' THEN
        NEW.carrier := pm.carrier;
      END IF;

      IF NEW.keyboard_layout IS NULL OR NEW.keyboard_layout = '' THEN
        NEW.keyboard_layout := pm.keyboard_layout;
      END IF;

      IF NEW.chipset IS NULL OR NEW.chipset = '' THEN
        NEW.chipset := pm.chipset;
      END IF;

      IF NEW.ports IS NULL OR NEW.ports = '' THEN
        NEW.ports := pm.ports;
      END IF;

      IF NEW.form_factor IS NULL OR NEW.form_factor = '' THEN
        NEW.form_factor := pm.form_factor;
      END IF;

      IF NEW.year IS NULL THEN
        NEW.year := pm.year;
      END IF;

      IF NEW.other_features IS NULL OR NEW.other_features = '' THEN
        NEW.other_features := pm.other_features;
      END IF;

      IF NEW.has_touchscreen IS NULL THEN
        NEW.has_touchscreen := pm.has_touchscreen;
      END IF;

      IF NEW.has_thunderbolt IS NULL THEN
        NEW.has_thunderbolt := pm.has_thunderbolt;
      END IF;

      IF NEW.supports_stylus IS NULL THEN
        NEW.supports_stylus := pm.supports_stylus;
      END IF;

      IF NEW.has_cellular IS NULL THEN
        NEW.has_cellular := pm.has_cellular;
      END IF;

      IF NEW.is_unlocked IS NULL THEN
        NEW.is_unlocked := pm.is_unlocked;
      END IF;

      IF NEW.imei_slot_count IS NULL THEN
        NEW.imei_slot_count := pm.imei_slot_count;
      END IF;

      -- Always update category_id from product (this is intentional)
      IF pm.category_id IS NOT NULL THEN
        NEW.category_id := pm.category_id;
      END IF;

      -- Always update device_category from product
      IF pm.device_category IS NOT NULL THEN
        NEW.device_category := pm.device_category;
      END IF;

      -- Build short_description from the item's final field values
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

-- Attach trigger to items table
CREATE TRIGGER trg_auto_populate_from_product
  BEFORE INSERT OR UPDATE OF product_id ON items
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_item_from_product();
