-- Music bed: allow a third kind of video asset — background music tracks the team uploads once and
-- then mixes UNDER the seller's voice on exported marketing videos. Reuses the same video_assets
-- table + public `video-assets` bucket (music files live under a `music/` path prefix); no new
-- table or bucket needed. Widen the kind CHECK constraint from ('intro','outro') to add 'music'.
ALTER TABLE public.video_assets DROP CONSTRAINT IF EXISTS video_assets_kind_check;
ALTER TABLE public.video_assets
  ADD CONSTRAINT video_assets_kind_check CHECK (kind IN ('intro', 'outro', 'music'));
