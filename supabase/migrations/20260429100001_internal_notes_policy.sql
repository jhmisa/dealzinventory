-- Allow staff to insert internal notes directly (bypasses send-message Edge Function)
CREATE POLICY "Staff can insert internal notes"
ON messages FOR INSERT
TO authenticated
WITH CHECK (role = 'internal' AND sent_by = auth.uid());
