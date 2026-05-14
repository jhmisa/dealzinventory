-- Speed up DISTINCT lookups for the searchable City / Town comboboxes
-- on the customer checkout (/mine/:code Step 2 → Add New Address).
-- Cities-in-prefecture and towns-in-city queries previously did a full
-- seq scan (~570ms on ~125k rows). With these indexes the same query
-- runs in ~3-5ms.
CREATE INDEX IF NOT EXISTS idx_postal_codes_pref ON public.postal_codes (prefecture_ja);
CREATE INDEX IF NOT EXISTS idx_postal_codes_pref_city ON public.postal_codes (prefecture_ja, city_ja);
