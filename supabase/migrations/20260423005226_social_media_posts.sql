-- Social Media Post Queue

CREATE TYPE social_post_status AS ENUM ('draft', 'queued', 'processing', 'published', 'failed');
CREATE TYPE social_schedule_type AS ENUM ('now', 'next_slot', 'scheduled');

CREATE TABLE social_media_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id),
  item_code TEXT,
  post_type TEXT NOT NULL DEFAULT 'product',
  platform TEXT NOT NULL DEFAULT 'facebook',
  caption TEXT,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  account_id TEXT DEFAULT '28293',
  page_id TEXT DEFAULT '120712288014827',
  schedule_type social_schedule_type NOT NULL DEFAULT 'next_slot',
  scheduled_at TIMESTAMPTZ,
  status social_post_status NOT NULL DEFAULT 'draft',
  blotato_submission_id TEXT,
  blotato_post_url TEXT,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

ALTER TABLE social_media_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage social media posts"
  ON social_media_posts FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER update_social_media_posts_updated_at
  BEFORE UPDATE ON social_media_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_social_media_posts_status ON social_media_posts(status);
CREATE INDEX idx_social_media_posts_item_id ON social_media_posts(item_id);
