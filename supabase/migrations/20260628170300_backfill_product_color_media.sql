-- One-time: make every SKU in a color group share the union of that group's media.
-- Disable the fan-out trigger during the bulk insert (we insert the full set
-- directly), then re-enable.
ALTER TABLE public.product_media DISABLE TRIGGER trg_fanout_product_media;

WITH canonical AS (
  -- one representative row per (color_key, file_url); prefer a hero, then lowest sort_order
  SELECT DISTINCT ON (pm.color_key, m.file_url)
    pm.color_key, m.file_url, m.media_type, m.role, m.sort_order
  FROM public.product_media m
  JOIN public.product_models pm ON pm.id = m.product_id
  ORDER BY pm.color_key, m.file_url, (m.role = 'hero') DESC, m.sort_order
)
INSERT INTO public.product_media (product_id, file_url, media_type, role, sort_order)
SELECT s.id, c.file_url, c.media_type, c.role, c.sort_order
FROM canonical c
JOIN public.product_models s ON s.color_key = c.color_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_media x
  WHERE x.product_id = s.id AND x.file_url = c.file_url
);

ALTER TABLE public.product_media ENABLE TRIGGER trg_fanout_product_media;
