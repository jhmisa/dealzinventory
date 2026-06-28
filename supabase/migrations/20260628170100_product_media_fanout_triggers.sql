-- Replicate every product_media change to all sibling SKUs sharing color_key.
-- Recursion guard: only the top-level write (depth 1) fans out; the cascaded
-- sibling writes run at depth >= 2 and return early. Matching is by file_url.
CREATE OR REPLACE FUNCTION public.fanout_product_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_color_key text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'INSERT') THEN
    SELECT color_key INTO v_color_key FROM public.product_models WHERE id = NEW.product_id;
    IF v_color_key IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.product_media (product_id, file_url, media_type, role, sort_order)
    SELECT pm.id, NEW.file_url, NEW.media_type, NEW.role, NEW.sort_order
    FROM public.product_models pm
    WHERE pm.color_key = v_color_key
      AND pm.id <> NEW.product_id
      AND NOT EXISTS (
        SELECT 1 FROM public.product_media x
        WHERE x.product_id = pm.id AND x.file_url = NEW.file_url
      );
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    SELECT color_key INTO v_color_key FROM public.product_models WHERE id = NEW.product_id;
    IF v_color_key IS NULL THEN RETURN NEW; END IF;
    UPDATE public.product_media x
      SET sort_order = NEW.sort_order, role = NEW.role
    FROM public.product_models pm
    WHERE x.product_id = pm.id
      AND pm.color_key = v_color_key
      AND x.product_id <> NEW.product_id
      AND x.file_url = OLD.file_url;
    RETURN NEW;

  ELSE -- DELETE
    SELECT color_key INTO v_color_key FROM public.product_models WHERE id = OLD.product_id;
    IF v_color_key IS NULL THEN RETURN OLD; END IF;
    DELETE FROM public.product_media x
    USING public.product_models pm
    WHERE x.product_id = pm.id
      AND pm.color_key = v_color_key
      AND x.product_id <> OLD.product_id
      AND x.file_url = OLD.file_url;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_fanout_product_media ON public.product_media;
CREATE TRIGGER trg_fanout_product_media
AFTER INSERT OR UPDATE OR DELETE ON public.product_media
FOR EACH ROW EXECUTE FUNCTION public.fanout_product_media();
