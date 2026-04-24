-- Add public read RLS policies for item_media and product_media tables
-- Required for /mine claim page to display photos/videos to anonymous users

-- Ensure RLS is enabled (idempotent)
ALTER TABLE item_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;

-- Staff full access (match pattern from initial RLS migration)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'item_media' AND policyname = 'Staff full access'
  ) THEN
    CREATE POLICY "Staff full access" ON item_media FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_media' AND policyname = 'Staff full access'
  ) THEN
    CREATE POLICY "Staff full access" ON product_media FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Public read access for anonymous users (shop & /mine pages)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'item_media' AND policyname = 'Public read item media'
  ) THEN
    CREATE POLICY "Public read item media" ON item_media FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_media' AND policyname = 'Public read product media'
  ) THEN
    CREATE POLICY "Public read product media" ON product_media FOR SELECT USING (true);
  END IF;
END $$;
