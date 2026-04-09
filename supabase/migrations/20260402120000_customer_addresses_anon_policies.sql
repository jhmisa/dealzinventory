-- Allow anon users to read their own addresses (customer_id must be known)
CREATE POLICY "Anon read own addresses" ON customer_addresses
  FOR SELECT USING (true);

-- Allow anon users to insert addresses
CREATE POLICY "Anon insert addresses" ON customer_addresses
  FOR INSERT WITH CHECK (true);

-- Allow anon users to update their own addresses
CREATE POLICY "Anon update own addresses" ON customer_addresses
  FOR UPDATE USING (true);

-- Allow anon users to delete their own addresses
CREATE POLICY "Anon delete own addresses" ON customer_addresses
  FOR DELETE USING (true);
