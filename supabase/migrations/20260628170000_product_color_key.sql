-- Group key for sibling SKUs that share visual identity (brand + model + color).
-- color is NOT NULL, so the key is always well-formed.
ALTER TABLE public.product_models
  ADD COLUMN IF NOT EXISTS color_key text
  GENERATED ALWAYS AS (lower(brand) || '|' || lower(model_name) || '|' || lower(color)) STORED;

CREATE INDEX IF NOT EXISTS idx_product_models_color_key
  ON public.product_models (color_key);
