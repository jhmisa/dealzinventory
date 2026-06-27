-- Backorder feature — Task 1
-- backorder_lines table + B-code sequence + media table + storage bucket
-- Conventions confirmed against initial_schema:
--   * updated_at trigger fn: update_updated_at()
--   * grade enum: condition_grade
--   * code gen: generate_code(prefix text, seq_name text)
--   * storage policies mirror photo-group-media (public read, authenticated write/delete)

-- B-code sequence (mirrors p_code_seq / g_code_seq)
CREATE SEQUENCE IF NOT EXISTS b_code_seq START 1;

DO $$ BEGIN
  CREATE TYPE backorder_line_status AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE public.backorder_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backorder_code text UNIQUE NOT NULL,
  product_id uuid NOT NULL REFERENCES public.product_models(id),
  condition_grade condition_grade NOT NULL,
  color text,
  storage_gb integer,
  ram_gb integer,
  cpu text,
  screen_size numeric,
  condition_notes text,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  supplier_price numeric,
  selling_price numeric,
  supplier_url text,
  supplier_product_code text,
  supplier_stock integer,
  quantity_total integer NOT NULL DEFAULT 0,
  quantity_reserved integer NOT NULL DEFAULT 0,
  quantity_received integer NOT NULL DEFAULT 0,
  available integer GENERATED ALWAYS AS (quantity_total - quantity_reserved - quantity_received) STORED,
  lead_time_days integer NOT NULL DEFAULT 7,
  -- NOTE: original spec had photo_group_id -> public.photo_groups(id), but the live
  -- schema has migrated away from photo_groups (no such table; photos now live in
  -- product_media). Backorder lines carry their own photos via backorder_line_media,
  -- so the photo_group_id FK is omitted intentionally.
  status backorder_line_status NOT NULL DEFAULT 'ACTIVE',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_backorder_lines_status ON public.backorder_lines(status);
CREATE INDEX idx_backorder_lines_product ON public.backorder_lines(product_id);

CREATE TRIGGER set_backorder_lines_updated_at
  BEFORE UPDATE ON public.backorder_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.backorder_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY backorder_lines_auth_all ON public.backorder_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY backorder_lines_anon_read ON public.backorder_lines
  FOR SELECT TO anon USING (status = 'ACTIVE');

GRANT ALL ON public.backorder_lines TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.b_code_seq TO anon, authenticated, service_role;

DO $$ BEGIN
  CREATE TYPE backorder_media_source AS ENUM ('iosys','web','manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE public.backorder_line_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backorder_line_id uuid NOT NULL REFERENCES public.backorder_lines(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  source backorder_media_source NOT NULL DEFAULT 'iosys',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_backorder_line_media_line ON public.backorder_line_media(backorder_line_id, sort_order);

ALTER TABLE public.backorder_line_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY backorder_media_auth_all ON public.backorder_line_media
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY backorder_media_anon_read ON public.backorder_line_media
  FOR SELECT TO anon USING (true);
GRANT ALL ON public.backorder_line_media TO anon, authenticated, service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES ('backorder-media', 'backorder-media', true)
ON CONFLICT (id) DO NOTHING;

-- storage.objects RLS policies for 'backorder-media' (mirrors photo-group-media)
CREATE POLICY "Public read backorder-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'backorder-media');

CREATE POLICY "Staff upload backorder-media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'backorder-media' AND auth.role() = 'authenticated');

CREATE POLICY "Staff delete backorder-media" ON storage.objects
  FOR DELETE USING (bucket_id = 'backorder-media' AND auth.role() = 'authenticated');
