-- Seed structured company facts from confirmed live values (extracted from
-- knowledge_base + messaging_templates, reviewed by Joey 2026-07-02).
-- Volatile facts NOT present in live content — SmartPit number, bank transfer
-- details, support phone — are intentionally left out; staff add them via the
-- Company Facts admin section. ON CONFLICT keeps this idempotent.
INSERT INTO company_facts (key, label, value_en, value_ja, category, sort_order) VALUES
  ('company_legal_name', 'Legal / PayPal name', 'Yehey Japan Kabushiki Kaisha', '株式会社イーエーヘイ・ジャパン', 'Company', 0),
  ('trading_name', 'Trading name (shipping)', 'Dealz K.K.', NULL, 'Company', 1),
  ('warehouse_address', 'Warehouse address', '121-0011 Tokyo-to Adachi-ku Chuohoncho 3-5-3 TF Biru B1F', '121-0011 東京都足立区中央本町3-5-3 TFビル B1F', 'Company', 2),
  ('order_number_format', 'Order number format', 'YJ-XXXXXX', NULL, 'Orders', 0),
  ('accepted_payment_methods', 'Accepted payment methods', 'Cash on Delivery, Credit Card on Delivery (+4% surcharge), Konbini (Lawson/FamilyMart/Ministop), PayPal, SmartPit, Bank Transfer (振込)', NULL, 'Payment', 0),
  ('paypal_fee_ph', 'PayPal fee (PH payers)', '5% if ¥10,000 or more; 10% if below ¥10,000', NULL, 'Payment', 1),
  ('domestic_shipping_fee', 'Domestic (Japan) shipping fee', '¥1,000 (except islands), delivered 1-3 days via Yamato Transport', NULL, 'Shipping', 0),
  ('ph_express_rates', 'Philippines Express shipping rates', 'All-inclusive (receiver pays nothing extra). Mobile phone 1-2 units, no box: ¥1,900; with box: ¥2,800. 1 phone + 1 tablet: ¥4,800. Tablet 1-2 units: ¥4,800. Laptop 10-16" 1 unit: ¥4,800. 2 laptops or 1 gaming laptop: ¥7,800. 1 laptop + 1 phone/tablet: ¥4,800.', NULL, 'Shipping', 1),
  ('ph_max_gadgets', 'Philippines max gadgets per order', '2', NULL, 'Shipping', 2),
  ('ph_lead_time', 'Philippines delivery lead time', 'Metro Manila & Luzon: 3 weeks; Visayas & Mindanao: 4 weeks (after payment confirmed)', NULL, 'Shipping', 3)
ON CONFLICT (key) DO NOTHING;
