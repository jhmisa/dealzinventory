-- Content Studio Phase 1: content_items — the Library unit (a reusable piece of content).
-- One row per video / carousel / review_card / quote / photo. A scheduled post
-- (social_media_posts) references the content_item it will publish.
CREATE TABLE IF NOT EXISTS public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('video','carousel','review_card','quote','photo')),
  title text NOT NULL,
  category_id uuid REFERENCES public.content_categories(id) ON DELETE SET NULL,
  media_urls text[] NOT NULL DEFAULT '{}',
  thumbnail_url text,
  item_codes text[],                 -- nullable: quotes/reviews aren't product-bound
  orientation text CHECK (orientation IN ('portrait','landscape','square')),
  duration_sec numeric,
  source text NOT NULL CHECK (source IN ('recorder','editor','carousel','review','import')),
  is_evergreen boolean NOT NULL DEFAULT false,
  active_from date,
  active_to date,
  cooldown_days int NOT NULL DEFAULT 0,
  times_posted int NOT NULL DEFAULT 0,
  last_posted_at timestamptz,
  retired_at timestamptz,            -- excluded from rotation when set (soft-retire, not deleted)
  shoot_id uuid REFERENCES public.shoots(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_items_category ON public.content_items(category_id);
CREATE INDEX IF NOT EXISTS idx_content_items_kind ON public.content_items(kind);
CREATE INDEX IF NOT EXISTS idx_content_items_rotation ON public.content_items(retired_at, last_posted_at);

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_items_auth_all ON public.content_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.content_items TO anon, authenticated, service_role;

-- Reuse the app's shared updated_at trigger function (used across the schema).
CREATE TRIGGER update_content_items_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
