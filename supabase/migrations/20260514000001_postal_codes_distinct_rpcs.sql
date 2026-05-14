-- Server-side DISTINCT queries for searchable City / Town comboboxes on
-- the customer checkout (/mine/:code Step 2 → Add New Address).
--
-- Without these, the client would pull every postal_codes row matching a
-- prefecture/city just to dedupe in JS (Hokkaido = 8200 rows for ~200
-- unique cities). Supabase's default 1000-row limit also silently
-- truncates the result.
--
-- We dedupe by the Japanese name only — the imported postal_codes data
-- has rows like 渋谷スクランブルスクエア（１-3Ｆ）, （4-6Ｆ）, ... which
-- after our paren-stripper share a town_ja but have many town_en floor
-- variants. The dropdown should show one row per unique Japanese name.

CREATE OR REPLACE FUNCTION public.cities_in_prefecture(p_prefecture_ja text)
RETURNS TABLE (city_ja text, city_en text)
LANGUAGE sql
STABLE
AS $$
  SELECT city_ja, MIN(city_en) AS city_en
  FROM public.postal_codes
  WHERE prefecture_ja = p_prefecture_ja
  GROUP BY city_ja
  ORDER BY city_ja
$$;

CREATE OR REPLACE FUNCTION public.towns_in_city(p_prefecture_ja text, p_city_ja text)
RETURNS TABLE (town_ja text, town_en text)
LANGUAGE sql
STABLE
AS $$
  SELECT town_ja, MIN(town_en) AS town_en
  FROM public.postal_codes
  WHERE prefecture_ja = p_prefecture_ja
    AND city_ja = p_city_ja
    AND town_ja IS NOT NULL
    AND town_ja <> ''
  GROUP BY town_ja
  ORDER BY town_ja
$$;

GRANT EXECUTE ON FUNCTION public.cities_in_prefecture(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.towns_in_city(text, text) TO anon, authenticated;
