-- ============================================================
-- Dealz K.K. — RLS Policies + Storage Buckets
-- ============================================================

-- ========================
-- 1. Enable RLS on all 14 tables
-- ========================

ALTER TABLE product_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_group_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sell_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE sell_group_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kaitori_price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE kaitori_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE kaitori_request_media ENABLE ROW LEVEL SECURITY;


-- ========================
-- 2. Staff full access (authenticated via Supabase Auth)
-- ========================

CREATE POLICY "Staff full access" ON product_models
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON config_groups
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON photo_groups
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON photo_group_media
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON items
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON sell_groups
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON sell_group_items
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON suppliers
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON customers
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON orders
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON order_items
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON kaitori_price_list
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON kaitori_requests
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON kaitori_request_media
  FOR ALL USING (auth.role() = 'authenticated');


-- ========================
-- 3. Public read policies (anon users can browse shop data)
-- ========================

CREATE POLICY "Public read active sell groups" ON sell_groups
  FOR SELECT USING (active = true);

CREATE POLICY "Public read product models" ON product_models
  FOR SELECT USING (true);

CREATE POLICY "Public read confirmed configs" ON config_groups
  FOR SELECT USING (status = 'CONFIRMED');

CREATE POLICY "Public read active photo groups" ON photo_groups
  FOR SELECT USING (status = 'ACTIVE');

CREATE POLICY "Public read photo media" ON photo_group_media
  FOR SELECT USING (true);

CREATE POLICY "Public read sell group items" ON sell_group_items
  FOR SELECT USING (true);

CREATE POLICY "Public read active kaitori prices" ON kaitori_price_list
  FOR SELECT USING (active = true);


-- ========================
-- 4. Storage Buckets
-- ========================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('photo-group-media', 'photo-group-media', true),
  ('kaitori-media', 'kaitori-media', true),
  ('id-documents', 'id-documents', false);

-- photo-group-media: public read, staff write
CREATE POLICY "Public read photo-group-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'photo-group-media');

CREATE POLICY "Staff upload photo-group-media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'photo-group-media' AND auth.role() = 'authenticated');

CREATE POLICY "Staff delete photo-group-media" ON storage.objects
  FOR DELETE USING (bucket_id = 'photo-group-media' AND auth.role() = 'authenticated');

-- kaitori-media: public read, authenticated write (customers upload via edge function)
CREATE POLICY "Public read kaitori-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'kaitori-media');

CREATE POLICY "Authenticated upload kaitori-media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'kaitori-media');

CREATE POLICY "Staff delete kaitori-media" ON storage.objects
  FOR DELETE USING (bucket_id = 'kaitori-media' AND auth.role() = 'authenticated');

-- id-documents: staff only
CREATE POLICY "Staff read id-documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'id-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Staff upload id-documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'id-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Staff delete id-documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'id-documents' AND auth.role() = 'authenticated');
