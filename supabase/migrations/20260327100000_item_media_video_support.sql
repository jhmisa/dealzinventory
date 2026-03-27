-- Add video support columns to item_media
ALTER TABLE item_media
  ADD COLUMN media_type media_type NOT NULL DEFAULT 'image',
  ADD COLUMN thumbnail_url text;

-- Backfill existing video records
UPDATE item_media
SET media_type = 'video'
WHERE file_url LIKE '%.webm' OR file_url LIKE '%.mp4';

-- Backfill thumbnail_url for existing videos by deriving from file_url pattern
-- Pattern: items/{item_id}/{uuid}.webm → items/{item_id}/{uuid}_thumb.webp
UPDATE item_media
SET thumbnail_url = regexp_replace(file_url, '\.webm$', '_thumb.webp')
WHERE media_type = 'video' AND file_url LIKE '%.webm' AND thumbnail_url IS NULL;

UPDATE item_media
SET thumbnail_url = regexp_replace(file_url, '\.mp4$', '_thumb.webp')
WHERE media_type = 'video' AND file_url LIKE '%.mp4' AND thumbnail_url IS NULL;
