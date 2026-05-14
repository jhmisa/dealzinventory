-- Preserve the chōme (丁目) range that Japan Post embeds in parens within town names.
-- The original CSV has rows like "中央本町（１丁目）" → 120-0011 and
-- "中央本町（２〜５丁目）" → 121-0011. The previous import stripped the parens,
-- which collapsed them into a single ambiguous "中央本町" row in the dropdown.

ALTER TABLE public.postal_codes
  ADD COLUMN IF NOT EXISTS chome_ja text,
  ADD COLUMN IF NOT EXISTS chome_en text;

CREATE INDEX IF NOT EXISTS idx_postal_codes_pref_city_town
  ON public.postal_codes (prefecture_ja, city_ja, town_ja);

-- Town RPC now returns one row per unique (town, chōme) so the client gets
-- the canonical postal code with each option and never has to guess.
DROP FUNCTION IF EXISTS public.towns_in_city(text, text);

CREATE OR REPLACE FUNCTION public.towns_in_city(p_prefecture_ja text, p_city_ja text)
RETURNS TABLE (town_ja text, town_en text, chome_ja text, chome_en text, postal_code text)
LANGUAGE sql
STABLE
AS $$
  SELECT
    town_ja,
    MIN(town_en) AS town_en,
    chome_ja,
    MIN(chome_en) AS chome_en,
    MIN(postal_code) AS postal_code
  FROM public.postal_codes
  WHERE prefecture_ja = p_prefecture_ja
    AND city_ja = p_city_ja
    AND town_ja IS NOT NULL
    AND town_ja <> ''
  GROUP BY town_ja, chome_ja
  ORDER BY town_ja, chome_ja NULLS FIRST
$$;

GRANT EXECUTE ON FUNCTION public.towns_in_city(text, text) TO anon, authenticated;
