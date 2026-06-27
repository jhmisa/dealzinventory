-- Product-model accuracy Phase 4 (iPad): iosys_catalog gains a connectivity dimension.
-- iPads split into Wi-Fi vs Wi-Fi + Cellular at the SKU level (different part numbers,
-- different value). Phones leave this null. Staging-table only; product_models folds
-- connectivity into model_name (per the §3b 4-tuple granularity decision).

ALTER TABLE public.iosys_catalog
  ADD COLUMN IF NOT EXISTS connectivity text;

COMMENT ON COLUMN public.iosys_catalog.connectivity IS
  'Tablet connectivity: "Wi-Fi" or "Wi-Fi + Cellular". NULL for phones.';
