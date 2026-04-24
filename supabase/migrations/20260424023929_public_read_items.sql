-- Allow anonymous users to read items (needed for /mine P-code pages)
CREATE POLICY "Public read items" ON items
  FOR SELECT USING (true);
