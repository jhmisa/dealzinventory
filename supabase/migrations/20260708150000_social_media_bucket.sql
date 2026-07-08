-- Public bucket for exported marketing videos (Blotato consumes public URLs).
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-media', 'social-media', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (Blotato + browsers).
CREATE POLICY "Public read social-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'social-media');

-- Authenticated staff can upload/update/delete.
CREATE POLICY "Staff write social-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'social-media');
CREATE POLICY "Staff update social-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'social-media');
CREATE POLICY "Staff delete social-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'social-media');
