-- Fix: /mine/A000018 link fails on mobile (Product Not Found)
-- The old policy required both shop_visible = true AND active = true for anonymous reads.
-- The /mine/ route is for direct sharing — it should work for any active accessory
-- regardless of shop_visible. shop_visible filtering is handled at the application level.

DROP POLICY IF EXISTS "Public read active accessories" ON accessories;

CREATE POLICY "Public read active accessories" ON accessories
  FOR SELECT USING (active = true);
