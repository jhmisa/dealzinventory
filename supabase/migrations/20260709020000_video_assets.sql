-- Video intro/outro assets: a small library of branded clips the team uploads once and then
-- stitches onto exported marketing videos (intro prepended, outro appended) from the Video Editor.
-- Each row is one uploaded clip tagged as 'intro' or 'outro'; files live in the public
-- `video-assets` storage bucket.
CREATE TABLE IF NOT EXISTS public.video_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('intro', 'outro')),
  file_url text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_assets_kind ON public.video_assets(kind, created_at DESC);

ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY video_assets_auth_all ON public.video_assets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.video_assets TO anon, authenticated, service_role;

-- Public, read-only bucket for the clip files (staff upload via the app; players fetch publicly).
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-assets', 'video-assets', true)
ON CONFLICT (id) DO UPDATE SET public = excluded.public;
