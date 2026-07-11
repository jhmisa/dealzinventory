-- Content Studio Phase 1: social_media_posts becomes the calendar-entry / scheduled-post.
-- One row = one thing that will post at one time. New columns link it back to the
-- content_item it publishes, the rule that materialised it (Phase 2), and its category
-- (denormalised for calendar colour). All additive + nullable — existing behaviour intact.
ALTER TABLE public.social_media_posts
  ADD COLUMN IF NOT EXISTS content_item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rule_id uuid,                 -- FK to content_rules added in Phase 2
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','rule')),
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.content_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_at ON public.social_media_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_origin ON public.social_media_posts(origin);
