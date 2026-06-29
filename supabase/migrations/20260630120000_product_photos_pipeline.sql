-- Product catalog photos pipeline: a public-read bucket for square-cropped product images,
-- and a staging column to carry the iosys listing image URL through the catalog harvest.

-- 1. Storage bucket for product hero/gallery images (public read; authenticated write).
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-media', 'product-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product-media public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'product-media');
CREATE POLICY "product-media authenticated insert"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-media' AND auth.role() = 'authenticated');
CREATE POLICY "product-media service insert"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-media' AND auth.role() = 'service_role');
CREATE POLICY "product-media authenticated delete"
  ON storage.objects FOR DELETE USING (bucket_id = 'product-media' AND auth.role() = 'authenticated');

-- 2. Staging column: the representative iosys listing image URL for a catalog SKU.
ALTER TABLE public.iosys_catalog ADD COLUMN IF NOT EXISTS image_url text;
