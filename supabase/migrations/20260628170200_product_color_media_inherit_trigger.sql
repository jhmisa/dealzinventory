-- When a new SKU is added (e.g. a new storage variant from an import), copy one
-- existing sibling's media set so the new variant inherits the color's photos.
-- The INSERTs here run at trigger depth 2, so the fan-out trigger skips them.
CREATE OR REPLACE FUNCTION public.inherit_color_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_media (product_id, file_url, media_type, role, sort_order)
  SELECT NEW.id, m.file_url, m.media_type, m.role, m.sort_order
  FROM public.product_media m
  WHERE m.product_id = (
    SELECT sib.id FROM public.product_models sib
    WHERE sib.color_key = NEW.color_key AND sib.id <> NEW.id
    ORDER BY sib.id LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.product_media x
    WHERE x.product_id = NEW.id AND x.file_url = m.file_url
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inherit_color_media ON public.product_models;
CREATE TRIGGER trg_inherit_color_media
AFTER INSERT ON public.product_models
FOR EACH ROW EXECUTE FUNCTION public.inherit_color_media();
