-- iosys_catalog gains a generic dedupe identity `sku_key`.
-- Apple rows have a unique part_number; Android rows do NOT (no Apple-style SKU code), so the
-- harvest upsert can no longer conflict on part_number alone. sku_key is:
--   Apple   = part_number
--   Android = brand|model_name|storage|color|carrier
-- The harvester (run-harvest-local / harvest edge fn) now upserts ON CONFLICT (sku_key).

ALTER TABLE public.iosys_catalog
  ADD COLUMN IF NOT EXISTS sku_key text;

-- Backfill existing (all-Apple) rows: sku_key = part_number.
UPDATE public.iosys_catalog
  SET sku_key = part_number
  WHERE sku_key IS NULL AND part_number IS NOT NULL;

-- Any residual NULLs (shouldn't exist today) get a deterministic fallback so the NOT NULL holds.
UPDATE public.iosys_catalog
  SET sku_key = concat_ws('|', brand, model_name, storage_gb::text,
                          coalesce(color_en, color_ja), carrier::text)
  WHERE sku_key IS NULL;

ALTER TABLE public.iosys_catalog
  ALTER COLUMN sku_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS iosys_catalog_sku_key_key
  ON public.iosys_catalog (sku_key);
