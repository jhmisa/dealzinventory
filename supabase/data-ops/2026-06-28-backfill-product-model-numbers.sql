-- Backfill product_models.model_number (A-number) from iosys_catalog — APPLIED to remote 2026-06-28.
-- Idempotent (only fills NULLs), additive only, fully reversible by setting model_number NULL.
--
-- Why: the Add-Backorder ProductPicker should DISPLAY + be SEARCHABLE by the human-readable
-- identifiers a supplier listing carries (A-number + part-number), e.g.
--   "Apple iPhone 16 Pro Max · A3295 (MYWJ3J/A) · Desert Titanium · 256GB".
-- The part_number (MYWJ3J/A) is already stored on product_models, but the A-number
-- (model_number, e.g. A3295) is NOT — it lives in iosys_catalog keyed by part_number.
-- The A-number is model-level (same across every storage/color of a model), so matching on
-- the (carrier-agnostic, SKU-precise) part_number is safe and exact.

BEGIN;

UPDATE public.product_models pm
SET model_number = ic.model_number
FROM public.iosys_catalog ic
WHERE pm.part_number = ic.part_number
  AND pm.model_number IS NULL
  AND ic.model_number IS NOT NULL;

COMMIT;
