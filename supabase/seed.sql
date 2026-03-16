-- ============================================================
-- Dealz K.K. — Seed Data for Development
-- ============================================================

-- Suppliers
INSERT INTO suppliers (id, supplier_name, supplier_type, contact_info, notes) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Tokyo Auction House', 'auction', 'auction@example.jp', 'Primary auction source'),
  ('a0000000-0000-0000-0000-000000000002', 'Japan Wholesale Co.', 'wholesaler', 'wholesale@example.jp', 'Bulk laptop supplier'),
  ('a0000000-0000-0000-0000-000000000003', 'Osaka Tech Liquidators', 'auction', 'osaka@example.jp', 'Monthly auctions');

-- Product Models
INSERT INTO product_models (id, brand, model_name, chipset, screen_size, ports, model_notes, year) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Apple', 'MacBook Air M1', 'Apple M1', 13.3, '2x Thunderbolt/USB-C, 3.5mm', '2020 model', 2020),
  ('b0000000-0000-0000-0000-000000000002', 'Apple', 'MacBook Pro 14" M3', 'Apple M3', 14.2, '3x Thunderbolt 4, HDMI, SD, MagSafe', '2023 model', 2023),
  ('b0000000-0000-0000-0000-000000000003', 'Lenovo', 'ThinkPad X1 Carbon Gen 11', 'Intel Core i7-1365U', 14.0, '2x Thunderbolt 4, 2x USB-A, HDMI', '2023 model', 2023),
  ('b0000000-0000-0000-0000-000000000004', 'Apple', 'iPhone 13', 'Apple A15', 6.1, 'Lightning', NULL, 2021),
  ('b0000000-0000-0000-0000-000000000005', 'Apple', 'iPad Air M1', 'Apple M1', 10.9, 'USB-C', '5th gen', 2022);

-- Config Groups
INSERT INTO config_groups (id, product_model_id, cpu, ram_gb, storage_gb, os_family, keyboard_layout, has_touchscreen, has_thunderbolt, status) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Apple M1 8-core', 8, 256, 'macOS', 'JP', false, true, 'CONFIRMED'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Apple M1 8-core', 16, 512, 'macOS', 'JP', false, true, 'CONFIRMED'),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'Apple M3 8-core', 18, 512, 'macOS', 'JP', false, true, 'CONFIRMED'),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', 'Intel Core i7-1365U', 16, 512, 'Windows', 'JP', false, true, 'CONFIRMED'),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000004', 'Apple A15', 4, 128, 'iOS', NULL, true, false, 'CONFIRMED'),
  ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000004', 'Apple A15', 4, 256, 'iOS', NULL, true, false, 'CONFIRMED'),
  ('c0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000005', 'Apple M1 8-core', 8, 64, 'iPadOS', NULL, true, false, 'DRAFT');
