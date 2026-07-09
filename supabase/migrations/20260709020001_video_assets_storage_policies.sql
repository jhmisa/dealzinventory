-- Storage RLS for the video-assets bucket: public read (clip playback) + authenticated staff
-- write/update/delete (uploads happen from the browser as the signed-in staff user). Mirrors the
-- social-media bucket policies.
CREATE POLICY "Public read video-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'video-assets');

CREATE POLICY "Staff write video-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'video-assets');

CREATE POLICY "Staff update video-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'video-assets');

CREATE POLICY "Staff delete video-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'video-assets');
