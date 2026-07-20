-- TB→GB normalization fix: 1TB = 1024GB, not 1000. The supplier adapter and the catalog harvest
-- both parse "1TB" as 1024, so the compare-time normalizer disagreed with every 1TB device
-- (surfaced by the Galaxy Tab S11 Ultra 1TB backorder: "listing 1024GB vs model 1000GB").
-- Kept in sync with src/lib/utils.ts normalizeStorageGb and the Deno verifier in
-- supabase/functions/_shared/backorder-match.ts (all three changed together, 2026-07-20).
CREATE OR REPLACE FUNCTION public._backorder_norm_storage_gb(p_raw text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_raw IS NULL THEN NULL
    WHEN (regexp_match(p_raw, '(\d+)'))[1] IS NULL THEN NULL
    WHEN p_raw ~* 't\s*b' THEN ((regexp_match(p_raw, '(\d+)'))[1])::int * 1024
    ELSE ((regexp_match(p_raw, '(\d+)'))[1])::int
  END;
$$;
